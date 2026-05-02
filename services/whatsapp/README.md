# WhatsApp service (Baileys-based)

Local Node service that bridges WhatsApp ↔ your async automation flow.

- HTTP server on `WA_PORT` (default 3850)
- Baileys (`@whiskeysockets/baileys`) for the WhatsApp Web protocol
- Session persisted in `auth/` (gitignored — your linked-device credentials)

## First run (pairing)

```bash
cd services/whatsapp
npm install
node server.mjs
```

A QR code prints to stdout. Open WhatsApp on your phone → Settings → Linked Devices → Link a Device → scan the QR. After "[whatsapp] connected as ..." appears, Ctrl-C and start it as a LaunchAgent (KeepAlive).

## Endpoints

- `GET  /health` — connection status, contacts count, qr_pending
- `GET  /contacts` — full contact map (jid → {name, jid})
- `GET  /resolve?name=<query>` — fuzzy match on contact names
- `POST /send {to, text, quoted_id?}` — send text message
- `GET  /unread` — placeholder; inbound messages are appended to `.state/wa-inbound-log.jsonl`

## State files

`PROJECT_ROOT/.state/`:
- `wa-contacts.json` — contact cache built from `contacts.upsert` + history sync
- `wa-inbound-log.jsonl` — append-only log of inbound DMs (used by digest cron)

## Caveat

Baileys is a reverse-engineered library. WhatsApp can invalidate the linked
device session at any time, requiring a re-pair. For low-volume personal use
the ban risk is low but non-zero.
