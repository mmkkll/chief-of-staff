# WhatsApp async automation (Baileys)

Send scheduled WhatsApp messages from your Chief of Staff stack and receive a
daily digest of important inbound DMs — all using your personal WhatsApp number.

> **Risk note**: Baileys is a reverse-engineered library that rides the WhatsApp
> Web protocol. Your linked-device session can be invalidated by WhatsApp at any
> time. For low-volume personal use the ban risk is low but non-zero. Don't use
> this for cold outreach or marketing automation.

## What you get

- **Scheduled outbound**: tell the CLI/Telegram "send Marco a message tomorrow at
  9am with this text" → the message arrives at 9am.
- **Daily inbound digest**: every day at 18:30 a Telegram recap of unanswered/
  important DMs (filtered by question marks + urgency keywords).
- **Dashboard widget**: pending queue, recent sends, errors, contacts count.

## Architecture

```
Telegram or CLI input
        ↓
   wa-enqueue.sh
        ↓
.state/wa-queue.json
        ↓ (every 60s)
   wa-scheduler.mjs
        ↓ POST /send
services/whatsapp/server.mjs (Baileys, port 3850)
        ↓ WhatsApp Web protocol
   Recipient phone

Inbound (parallel):
WhatsApp DMs → server.mjs → .state/wa-inbound-log.jsonl
                                    ↓ (daily 18:30)
                                wa-digest.mjs
                                    ↓ Telegram
                                  You
```

## Setup

### 1. Install Baileys server

```bash
cd services/whatsapp
npm install
```

### 2. Pair the device (interactive, once)

```bash
node server.mjs
```

A QR code prints. On your phone: WhatsApp → Settings → Linked Devices → Link a
Device → scan the QR. After "[whatsapp] connected as ..." appears, Ctrl-C.

The session credentials are saved to `services/whatsapp/auth/` (gitignored).
**Do not share or commit this directory** — it's your linked-device key.

### 3. Load the LaunchAgent (KeepAlive)

Copy `launchagents-template/com.example.whatsapp-server.plist` to
`~/Library/LaunchAgents/`, replace `YOU` with your username, then:

```bash
launchctl bootstrap "gui/$(id -u)" ~/Library/LaunchAgents/com.example.whatsapp-server.plist
```

### 4. Load the scheduler + digest LaunchAgents

Same procedure for `com.example.wa-scheduler.plist` (every 60s) and
`com.example.wa-digest.plist` (daily 18:30). Set the env vars
`PROJECT_ROOT`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` inside each plist.

### 5. (Optional) Verify dashboard widget

If you have the dashboard running (port 3848), the Comms tab gains a "WhatsApp
— scheduler & inbound" card. The data source is `/api/whatsapp-status`, which
reads `.state/wa-queue.json` + `.state/wa-history.json` + pings the server.

## Usage

### Schedule a message

```bash
# from CLI:
scripts/wa-enqueue.sh \
  --to "+393331234567" \
  --name "Marco" \
  --at "2026-05-03T09:00:00Z" \
  --text "Ci vediamo alle 10"
```

The scheduler picks it up within 60s of the scheduled time. You'll get a
Telegram confirmation:

```
✅ WhatsApp sent to Marco (scheduled 2026-05-03 09:00:00): Ci vediamo alle 10
```

### Resolve a contact name to phone

```bash
curl http://localhost:3850/resolve?name=Marco
```

Returns matches from the synced WhatsApp address book.

### Inspect the queue

```bash
cat .state/wa-queue.json | jq .
```

## Failure modes & recovery

- **Server reports `wa_connection: disconnected`**: re-pair (delete
  `services/whatsapp/auth/`, run `node server.mjs`, scan QR).
- **Scheduler errors recur**: check `logs/wa-scheduler-stderr.log`. Most likely
  the local Baileys server is down or returns 503.
- **Digest sends nothing despite traffic**: tune the keyword list in
  `wa-digest.mjs` for your conversational style. Default keywords are biased
  toward Italian + English question phrases.

## Privacy

- Inbound message text is stored locally in `.state/wa-inbound-log.jsonl` (in
  your project tree, not synced anywhere).
- Contact names are cached in `.state/wa-contacts.json`.
- Linked-device credentials are in `services/whatsapp/auth/` — `.gitignore`d.
- The Baileys server is bound to `localhost` only.
