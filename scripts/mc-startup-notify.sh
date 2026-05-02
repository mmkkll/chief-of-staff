#!/bin/bash
# mc-startup-notify.sh — Telegram boot notification with health summary + stale-cache warning.
# Trigger: LaunchAgent with RunAtLoad=true.
#
# Setup:
#   PROJECT_ROOT — path to your project (default $HOME/chief-of-staff)
#   TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID — for Telegram delivery
#   TOOLS_PORT (default 3847), N8N_PORT (default 5678), DASHBOARD_PORT (default 3848) — local services to ping

set -e

PROJECT_ROOT="${PROJECT_ROOT:-$HOME/chief-of-staff}"
TG_TOKEN="${TELEGRAM_BOT_TOKEN:-}"
CHAT_ID="${TELEGRAM_CHAT_ID:-}"
TOOLS_PORT="${TOOLS_PORT:-3847}"
N8N_PORT="${N8N_PORT:-5678}"
DASHBOARD_PORT="${DASHBOARD_PORT:-3848}"

LOGFILE="$PROJECT_ROOT/logs/mc-startup-notify.log"
GMAIL_CACHE="$PROJECT_ROOT/dashboard/cache/gmail.json"
INBOX_DIR="$PROJECT_ROOT/inbox/journal"

mkdir -p "$(dirname "$LOGFILE")" "$INBOX_DIR"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" >> "$LOGFILE"; }

[ -z "$TG_TOKEN" ] || [ -z "$CHAT_ID" ] && { log "missing TELEGRAM_BOT_TOKEN/CHAT_ID, exiting"; exit 0; }

# wait for networking + the channels session LaunchAgent to come up
sleep 30

UPTIME_STR=$(uptime | sed -E 's/.*up ([^,]+),.*/\1/')

if [ -f "$GMAIL_CACHE" ]; then
  CACHE_MTIME=$(stat -f "%m" "$GMAIL_CACHE")
  NOW_SEC=$(date +%s)
  AGE_H=$(( (NOW_SEC - CACHE_MTIME) / 3600 ))
else
  AGE_H=999
fi

# Peek the Telegram inbound queue (offset=-100 = up to 100 most recent, no consume).
# Race possible with bun child still booting, but useful as a smoke test.
PEEK_RAW=$(curl -s "https://api.telegram.org/bot${TG_TOKEN}/getUpdates?offset=-100&timeout=0" 2>/dev/null || echo '{}')
PENDING=$(echo "$PEEK_RAW" | /usr/bin/python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    print(len(d.get('result', [])) if d.get('ok') else 0)
except: print(0)
" 2>/dev/null || echo 0)

# quick health checks
TS_HEALTH=$(curl -s --max-time 3 "http://localhost:${TOOLS_PORT}/health" 2>/dev/null | grep -c "ok" || echo 0)
N8N_HEALTH=$(curl -s --max-time 3 "http://localhost:${N8N_PORT}/healthz" 2>/dev/null | grep -c "ok" || echo 0)
DASH_HEALTH=$(curl -s --max-time 3 "http://localhost:${DASHBOARD_PORT}/" 2>/dev/null | head -c 50 | grep -c "html" || echo 0)

CHANNELS_PID=$(pgrep -f "claude --channels plugin:telegram" 2>/dev/null | head -1 || echo "")

MSG="🟢 Startup
⏱  Uptime: ${UPTIME_STR}
📊 Cache gmail age: ${AGE_H}h
📡 Tools server: $([ "$TS_HEALTH" -gt 0 ] && echo OK || echo KO)
📡 n8n: $([ "$N8N_HEALTH" -gt 0 ] && echo OK || echo KO)
📡 Dashboard: $([ "$DASH_HEALTH" -gt 0 ] && echo OK || echo KO)
📡 channels session: $([ -n "$CHANNELS_PID" ] && echo "PID $CHANNELS_PID" || echo "❌ MISSING")
📥 Telegram pending peek: ${PENDING}"

if [ "$AGE_H" -gt 12 ]; then
  MSG="${MSG}

⚠️ Session down for ~${AGE_H}h. Telegram retention is 24h: messages older than 24h are unrecoverable."
fi

if [ "$PENDING" -gt 0 ]; then
  # snapshot updates to disk for inspection (bun child will consume normally)
  INBOX_DIR_VAR="$INBOX_DIR" /usr/bin/python3 -c "
import sys, json, os
d = json.load(open('/dev/stdin'))
if not d.get('ok'): sys.exit(0)
for u in d.get('result', []):
    uid = u['update_id']
    path = os.path.join(os.environ['INBOX_DIR_VAR'], f'{uid}.json')
    if not os.path.exists(path):
        with open(path, 'w') as f: json.dump(u, f, indent=2, ensure_ascii=False)
" <<< "$PEEK_RAW" 2>/dev/null || true
  MSG="${MSG}

📋 ${PENDING} updates peeked → snapshot in inbox/journal/. bun will consume them."
fi

if [ -z "$CHANNELS_PID" ]; then
  MSG="${MSG}

❌ Channels session NOT RUNNING. Watchdog should fix within its interval. Or run /start manually."
fi

curl -s -X POST "https://api.telegram.org/bot${TG_TOKEN}/sendMessage" \
  -d "chat_id=${CHAT_ID}" --data-urlencode "text=${MSG}" > /dev/null

log "Sent startup notification: cache=${AGE_H}h pending=${PENDING} channels=${CHANNELS_PID:-NONE}"
