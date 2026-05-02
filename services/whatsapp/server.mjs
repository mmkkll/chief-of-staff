import { makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } from '@whiskeysockets/baileys';
import qrcode from 'qrcode-terminal';
import pino from 'pino';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AUTH_DIR = path.join(__dirname, 'auth');
const STATE_DIR = path.join(__dirname, '..', '..', '.state');
const CONTACTS_FILE = path.join(STATE_DIR, 'wa-contacts.json');
const PORT = Number(process.env.WA_PORT || 3850);
const LOGGER = pino({ level: 'warn' });

let sock = null;
let connState = 'disconnected';
let lastQR = null;
let contacts = {};

if (fs.existsSync(CONTACTS_FILE)) {
  try { contacts = JSON.parse(fs.readFileSync(CONTACTS_FILE, 'utf8')); } catch {}
}

function saveContacts() {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  fs.writeFileSync(CONTACTS_FILE, JSON.stringify(contacts, null, 2));
}

function normalizeJid(input) {
  if (!input) return null;
  if (input.includes('@')) return input;
  const digits = input.replace(/[^\d]/g, '');
  if (!digits) return null;
  return `${digits}@s.whatsapp.net`;
}

async function startSocket() {
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version } = await fetchLatestBaileysVersion();
  sock = makeWASocket({
    version,
    auth: state,
    logger: LOGGER,
    printQRInTerminal: false,
    syncFullHistory: true,
    markOnlineOnConnect: true,
  });

  sock.ev.on('messages.upsert', ({ messages, type }) => {
    console.log(`[whatsapp] messages.upsert type=${type} count=${messages?.length || 0}`);
    for (const m of messages || []) {
      try {
        if (!m.key || m.key.fromMe) continue;
        const remote = m.key.remoteJid;
        if (!remote || !remote.endsWith('@s.whatsapp.net')) continue;
        const phone = remote.split('@')[0];
        const text = m.message?.conversation || m.message?.extendedTextMessage?.text || '';
        if (!text) continue;
        const entry = {
          ts: new Date().toISOString(),
          message_id: m.key.id,
          from_phone: phone,
          from_name: contacts[phone]?.name || m.pushName || phone,
          text: text.slice(0, 500),
          push_name: m.pushName || null,
        };
        fs.mkdirSync(STATE_DIR, { recursive: true });
        fs.appendFileSync(INBOUND_LOG, JSON.stringify(entry) + '\n');
        console.log(`[whatsapp] inbound from ${phone}: ${text.slice(0, 60)}`);
      } catch (e) {
        console.log('[whatsapp] inbound error:', e.message);
      }
    }
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (u) => {
    const { connection, lastDisconnect, qr } = u;
    if (qr) {
      lastQR = qr;
      console.log('\n[whatsapp] scan this QR with WhatsApp on phone:\n');
      qrcode.generate(qr, { small: true });
    }
    if (connection === 'open') {
      connState = 'connected';
      lastQR = null;
      console.log('[whatsapp] connected as', sock.user?.id);
    }
    if (connection === 'close') {
      connState = 'disconnected';
      const code = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = code !== DisconnectReason.loggedOut;
      console.log('[whatsapp] disconnected, code=', code, 'reconnect=', shouldReconnect);
      if (shouldReconnect) setTimeout(startSocket, 3000);
    }
  });

  sock.ev.on('contacts.upsert', (list) => {
    for (const c of list) {
      if (c.id && c.id.endsWith('@s.whatsapp.net')) {
        const phone = c.id.split('@')[0];
        contacts[phone] = { name: c.name || c.notify || c.verifiedName || phone, jid: c.id };
      }
    }
    saveContacts();
  });

  sock.ev.on('contacts.update', (list) => {
    for (const c of list) {
      if (c.id?.endsWith('@s.whatsapp.net')) {
        const phone = c.id.split('@')[0];
        const existing = contacts[phone] || {};
        contacts[phone] = { ...existing, name: c.name || existing.name || phone, jid: c.id };
      }
    }
    saveContacts();
  });

  sock.ev.on('messaging-history.set', ({ contacts: ctx }) => {
    if (Array.isArray(ctx)) {
      for (const c of ctx) {
        if (c.id?.endsWith('@s.whatsapp.net')) {
          const phone = c.id.split('@')[0];
          contacts[phone] = { name: c.name || c.notify || c.verifiedName || phone, jid: c.id };
        }
      }
      saveContacts();
    }
  });
}

async function sendBody(req) {
  return new Promise((resolve, reject) => {
    let chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8');
        resolve(raw ? JSON.parse(raw) : {});
      } catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const send = (code, body) => {
    res.writeHead(code, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(body));
  };

  try {
    if (url.pathname === '/health') {
      return send(200, { status: 'ok', wa_connection: connState, contacts_count: Object.keys(contacts).length, qr_pending: !!lastQR });
    }

    if (url.pathname === '/contacts') {
      return send(200, { contacts });
    }

    if (url.pathname === '/resolve') {
      const name = (url.searchParams.get('name') || '').toLowerCase().trim();
      if (!name) return send(400, { error: 'missing name param' });
      const matches = Object.entries(contacts)
        .filter(([_, c]) => (c.name || '').toLowerCase().includes(name))
        .map(([phone, c]) => ({ phone, name: c.name, jid: c.jid }));
      return send(200, { matches });
    }

    if (url.pathname === '/send' && req.method === 'POST') {
      if (connState !== 'connected') return send(503, { error: 'whatsapp not connected', conn: connState });
      const body = await sendBody(req);
      const jid = normalizeJid(body.to);
      if (!jid) return send(400, { error: 'invalid to (need phone digits or JID)' });
      if (!body.text || typeof body.text !== 'string') return send(400, { error: 'missing text' });
      const opts = {};
      if (body.quoted_id) {
        opts.quoted = { key: { id: body.quoted_id, remoteJid: jid, fromMe: false }, message: { conversation: '' } };
      }
      const result = await sock.sendMessage(jid, { text: body.text }, opts);
      return send(200, { message_id: result?.key?.id, jid, sent_at: new Date().toISOString() });
    }

    if (url.pathname === '/unread') {
      if (connState !== 'connected') return send(503, { error: 'whatsapp not connected' });
      // Note: Baileys store API would maintain unread state. For MVP we return contacts only;
      // /unread is hooked up but returns empty until a store layer is added.
      // The daily digest uses message events tracked elsewhere.
      return send(200, { messages: [], note: 'unread tracking via separate event log (wa-inbound-log.json)' });
    }

    return send(404, { error: 'not found' });
  } catch (e) {
    return send(500, { error: e.message });
  }
});

const INBOUND_LOG = path.join(STATE_DIR, 'wa-inbound-log.jsonl');

server.listen(PORT, () => {
  console.log(`[whatsapp] http server listening on ${PORT}`);
});

startSocket().catch((e) => {
  console.error('[whatsapp] start error:', e);
  process.exit(1);
});

process.on('beforeExit', () => server.close());
