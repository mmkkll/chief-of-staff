#!/usr/bin/env node
// wa-scheduler.mjs — drains the WhatsApp send queue.
// Fires every 60s via a LaunchAgent (StartInterval=60). Reads `.state/wa-queue.json`,
// sends jobs whose `scheduled_at <= now` via the local Baileys server, moves them to
// `.state/wa-history.json`, and notifies Telegram on success or error.
//
// Setup (env vars):
//   PROJECT_ROOT          — defaults to $HOME/chief-of-staff
//   WA_PORT               — Baileys HTTP port (default 3850)
//   TELEGRAM_BOT_TOKEN    — for status notifications
//   TELEGRAM_CHAT_ID      — destination chat for notifications

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const HOME = os.homedir();
const PROJECT_ROOT = process.env.PROJECT_ROOT || path.join(HOME, 'chief-of-staff');
const STATE_DIR = path.join(PROJECT_ROOT, '.state');
const QUEUE_FILE = path.join(STATE_DIR, 'wa-queue.json');
const HISTORY_FILE = path.join(STATE_DIR, 'wa-history.json');
const WA_PORT = Number(process.env.WA_PORT || 3850);
const TG_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const TG_CHAT = process.env.TELEGRAM_CHAT_ID || '';

function loadJSON(file, fallback) {
  if (!fs.existsSync(file)) return fallback;
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}
function saveJSON(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}
async function notifyTelegram(text) {
  if (!TG_TOKEN || !TG_CHAT) return;
  try {
    const params = new URLSearchParams({ chat_id: TG_CHAT, text });
    await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, { method: 'POST', body: params });
  } catch {}
}
async function waSend(to, text, quoted_id) {
  const r = await fetch(`http://localhost:${WA_PORT}/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ to, text, quoted_id }),
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(body.error || `HTTP ${r.status}`);
  return body;
}

const queue = loadJSON(QUEUE_FILE, []);
const history = loadJSON(HISTORY_FILE, []);
const now = Date.now();
let mutated = false;

const stillPending = [];
for (const job of queue) {
  if (job.status !== 'pending') {
    stillPending.push(job);
    continue;
  }
  const scheduled = new Date(job.scheduled_at).getTime();
  if (scheduled > now) {
    stillPending.push(job);
    continue;
  }
  try {
    const result = await waSend(job.to, job.text, job.quoted_id);
    job.status = 'sent';
    job.sent_at = result.sent_at || new Date().toISOString();
    job.message_id = result.message_id;
    history.unshift(job);
    mutated = true;
    const who = job.name || job.to;
    await notifyTelegram(`✅ WhatsApp sent to ${who} (scheduled ${new Date(job.scheduled_at).toLocaleString()}): ${(job.text || '').slice(0, 80)}${(job.text || '').length > 80 ? '…' : ''}`);
  } catch (e) {
    job.status = 'error';
    job.error = e.message;
    job.errored_at = new Date().toISOString();
    history.unshift(job);
    mutated = true;
    const who = job.name || job.to;
    await notifyTelegram(`❌ WhatsApp send FAILED to ${who}: ${e.message}. Job id ${job.id}.`);
  }
}

if (mutated) {
  saveJSON(QUEUE_FILE, stillPending);
  saveJSON(HISTORY_FILE, history.slice(0, 100));
}
