#!/usr/bin/env node
// wa-digest.mjs — daily WhatsApp inbound digest.
// Reads `.state/wa-inbound-log.jsonl`, filters DMs that look important in the
// last 24h (question marks or trigger keywords like "urgente", "tomorrow", ...),
// groups by contact, sends a Telegram recap. Skips silently if nothing notable.
//
// Setup (env vars):
//   PROJECT_ROOT          — defaults to $HOME/chief-of-staff
//   TELEGRAM_BOT_TOKEN
//   TELEGRAM_CHAT_ID

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const HOME = os.homedir();
const PROJECT_ROOT = process.env.PROJECT_ROOT || path.join(HOME, 'chief-of-staff');
const STATE_DIR = path.join(PROJECT_ROOT, '.state');
const LOG_FILE = path.join(STATE_DIR, 'wa-inbound-log.jsonl');
const TG_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const TG_CHAT = process.env.TELEGRAM_CHAT_ID || '';

if (!TG_TOKEN || !TG_CHAT) process.exit(0);

const KEYWORDS = ['?', 'urgente', 'urgent', 'conferma', 'confirm', 'stasera', 'domani', 'tonight', 'tomorrow', 'oggi', 'today', 'asap', 'rispondi', 'reply', 'aspetto', 'awaiting'];

function parseLog() {
  if (!fs.existsSync(LOG_FILE)) return [];
  const lines = fs.readFileSync(LOG_FILE, 'utf8').split('\n').filter(Boolean);
  const since = Date.now() - 24 * 3600 * 1000;
  const out = [];
  for (const l of lines) {
    try {
      const e = JSON.parse(l);
      if (new Date(e.ts).getTime() < since) continue;
      out.push(e);
    } catch {}
  }
  return out;
}

function isImportant(entry) {
  const t = (entry.text || '').toLowerCase();
  if (!t || t.length < 3) return false;
  return KEYWORDS.some((k) => t.includes(k));
}

function groupByContact(entries) {
  const map = new Map();
  for (const e of entries) {
    const key = e.from_phone;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(e);
  }
  return map;
}

async function notifyTelegram(text) {
  const params = new URLSearchParams({ chat_id: TG_CHAT, text });
  await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, { method: 'POST', body: params });
}

const all = parseLog();
const important = all.filter(isImportant);
if (important.length === 0) process.exit(0);

const grouped = groupByContact(important);
const lines = ['📲 WhatsApp recap (24h)'];
for (const [phone, entries] of grouped.entries()) {
  const last = entries[entries.length - 1];
  const name = last.from_name || last.push_name || phone;
  const txt = (last.text || '').slice(0, 120);
  const when = new Date(last.ts).toLocaleString(undefined, { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });
  lines.push(`• ${name} (${when}): ${txt}${last.text.length > 120 ? '…' : ''}`);
}
const total = all.length;
const minor = total - important.length;
if (minor > 0) lines.push(`+${minor} more messages not in recap`);

await notifyTelegram(lines.join('\n'));
