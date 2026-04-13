#!/usr/bin/env node
/**
 * iCloud Mail Search via IMAP
 *
 * Usage:
 *   node icloud-mail-search.mjs --query "booking confirmation" [--from "hotels.com"] [--since "2026-01-01"] [--limit 20]
 *
 * Returns JSON array of matching emails with envelope + text preview.
 *
 * Credentials: set ICLOUD_USER and ICLOUD_APP_PASSWORD as environment variables,
 * or store them in ~/mission-control/.secrets/icloud.env:
 *   ICLOUD_USER=yourname@icloud.com
 *   ICLOUD_APP_PASSWORD=xxxx-xxxx-xxxx-xxxx
 */

import { ImapFlow } from 'imapflow';
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

async function loadCredentials() {
  if (process.env.ICLOUD_USER && process.env.ICLOUD_APP_PASSWORD) {
    return { user: process.env.ICLOUD_USER, pass: process.env.ICLOUD_APP_PASSWORD };
  }
  const envFile = join(homedir(), 'mission-control', '.secrets', 'icloud.env');
  const raw = await readFile(envFile, 'utf-8');
  const userMatch = raw.match(/ICLOUD_USER=(.+)/);
  const passMatch = raw.match(/ICLOUD_APP_PASSWORD=(.+)/);
  if (!userMatch || !passMatch) throw new Error('ICLOUD_USER or ICLOUD_APP_PASSWORD missing from .secrets/icloud.env');
  return { user: userMatch[1].trim(), pass: passMatch[1].trim() };
}

function parseArgs() {
  const args = process.argv.slice(2);
  const params = {};
  for (let i = 0; i < args.length; i += 2) {
    params[args[i].replace('--', '')] = args[i + 1];
  }
  return params;
}

function decodeQuotedPrintable(str) {
  return str
    .replace(/=\r?\n/g, '')
    .replace(/=([0-9A-Fa-f]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

function extractTextFromSource(source) {
  const text = source.toString('utf8');
  const lines = text.split('\n');
  const readable = [];
  let inBody = false;

  for (const line of lines) {
    if (line.trim() === '') inBody = true;
    if (inBody) {
      const clean = decodeQuotedPrintable(line).trim();
      if (clean && clean.length < 300 && !clean.startsWith('Content-') &&
          !clean.startsWith('MIME-') && !clean.startsWith('--') &&
          !clean.includes('base64') && !clean.includes('<html') &&
          !clean.includes('<head') && !clean.includes('<style') &&
          !clean.includes('{') && !clean.includes('}') &&
          !clean.match(/^[a-zA-Z-]+:\s/)) {
        const stripped = clean.replace(/<[^>]+>/g, '').trim();
        if (stripped && stripped.length > 2) {
          readable.push(stripped);
        }
      }
    }
  }
  return readable.slice(0, 50).join('\n');
}

async function searchICloudMail({ query, from, since, limit = 20, mailbox = 'INBOX' }) {
  const creds = await loadCredentials();
  const client = new ImapFlow({
    host: 'imap.mail.me.com',
    port: 993,
    secure: true,
    auth: creds,
    logger: false
  });
  await client.connect();

  const lock = await client.getMailboxLock(mailbox);
  const results = [];

  try {
    const searchCriteria = { or: [] };

    if (query) {
      const keywords = query.split(/\s+OR\s+|\s*,\s*/i);
      for (const kw of keywords) {
        searchCriteria.or.push({ subject: kw.trim() });
      }
    }

    if (from) {
      searchCriteria.from = from;
    }

    if (since) {
      searchCriteria.since = new Date(since);
    }

    let criteria;
    if (searchCriteria.or.length === 0 && from) {
      criteria = since ? { from, since: new Date(since) } : { from };
    } else if (searchCriteria.or.length > 0 && from) {
      criteria = {
        and: [
          { from },
          { or: searchCriteria.or }
        ]
      };
      if (since) criteria.and.push({ since: new Date(since) });
    } else if (searchCriteria.or.length > 0) {
      criteria = since ? { and: [{ or: searchCriteria.or }, { since: new Date(since) }] } : { or: searchCriteria.or };
    } else {
      criteria = { since: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) };
    }

    const messages = await client.search(criteria);
    const msgArray = Array.isArray(messages) ? messages : Array.from(messages || []);
    const selected = msgArray.slice(-parseInt(limit));

    for (const uid of selected) {
      try {
        const msg = await client.fetchOne(uid, { envelope: true, source: true });
        const envelope = msg.envelope;
        const textPreview = extractTextFromSource(msg.source);

        results.push({
          uid,
          date: envelope.date ? envelope.date.toISOString() : null,
          from: envelope.from?.[0]?.address || null,
          fromName: envelope.from?.[0]?.name || null,
          to: envelope.to?.[0]?.address || null,
          subject: envelope.subject || null,
          preview: textPreview.substring(0, 500)
        });
      } catch (e) {
        // Skip unreadable messages
      }
    }
  } finally {
    lock.release();
  }

  await client.logout();
  return { success: true, mailbox, count: results.length, messages: results };
}

// CLI mode
const params = parseArgs();
const result = await searchICloudMail({
  query: params.query || '',
  from: params.from || '',
  since: params.since || '',
  limit: params.limit || 20,
  mailbox: params.mailbox || 'INBOX'
});
console.log(JSON.stringify(result, null, 2));
