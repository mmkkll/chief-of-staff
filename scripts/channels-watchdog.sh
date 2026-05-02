#!/bin/bash
# channels-watchdog.sh — keep the persistent `claude --channels` Telegram session healthy.
#
# Detects three failure modes:
#   1. claude --channels process missing → kickstart LaunchAgent
#   2. bun child (Telegram polling MCP) missing → kickstart
#   3. bun alive but 0 TCP connections to Telegram (zombie polling) → kickstart
#
# Also enforces a preventive restart after MAX_UPTIME_HOURS to dodge known
# REPL-stuck bugs after multi-day uptime.
#
# Setup: export the following before running (or via LaunchAgent EnvironmentVariables):
#   LAUNCHD_LABEL    — label of the persistent claude --channels LaunchAgent (e.g. com.you.chiefofstaff)
#   PROJECT_ROOT     — path to your local project root (e.g. $HOME/chief-of-staff)
#   TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID — for restart notifications

set -e

LABEL="${LAUNCHD_LABEL:-com.you.chiefofstaff}"
PROJECT_ROOT="${PROJECT_ROOT:-$HOME/chief-of-staff}"
UID_NUM=$(id -u)
LOGFILE="$PROJECT_ROOT/logs/channels-watchdog.log"
TG_TOKEN="${TELEGRAM_BOT_TOKEN:-}"
CHAT_ID="${TELEGRAM_CHAT_ID:-}"

# Thresholds
MAX_UPTIME_HOURS=72       # preventive restart after 72h uptime

mkdir -p "$(dirname "$LOGFILE")" "$PROJECT_ROOT/.state"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" >> "$LOGFILE"; }

notify_telegram() {
  local msg="$1"
  [ -z "$TG_TOKEN" ] || [ -z "$CHAT_ID" ] && return
  curl -s -X POST "https://api.telegram.org/bot${TG_TOKEN}/sendMessage" \
    -d "chat_id=${CHAT_ID}" --data-urlencode "text=${msg}" > /dev/null 2>&1 || true
}

# Match the claude --channels process via the unique --debug-file flag set by the LaunchAgent wrapper.
# Excludes manual terminal sessions and the PTY `script` wrapper.
find_pid() {
  pgrep -fl "claude --channels plugin:telegram.*--debug-file" 2>/dev/null \
    | grep -v "^[0-9]* script " \
    | awk '{print $1}' \
    | head -1
}

PID=$(find_pid)

if [ -z "$PID" ]; then
  log "WARN: no claude --channels process found. Sleep 5s and retry."
  sleep 5
  PID=$(find_pid)
fi

if [ -z "$PID" ]; then
  log "ALERT: confirmed no process. Kickstart."
  launchctl kickstart -k "gui/${UID_NUM}/${LABEL}"
  notify_telegram "⚠️ Watchdog: claude-channels not running, restarted."
  exit 0
fi

# Uptime in seconds — macOS ps lacks etimes, derive from lstart.
START_STR=$(ps -p "$PID" -o lstart= 2>/dev/null)
if [ -n "$START_STR" ]; then
  START_SEC=$(date -j -f "%a %b %e %T %Y" "$START_STR" "+%s" 2>/dev/null || echo 0)
  NOW_SEC=$(date +%s)
  UPTIME_SEC=$(( NOW_SEC - START_SEC ))
else
  UPTIME_SEC=0
fi
UPTIME_H=$(( UPTIME_SEC / 3600 ))

# bun child health — can die silently leaving claude --channels orphaned.
# If claude alive but bun missing → inbound Telegram blocked. Immediate restart.
BUN_PID=$(pgrep -f "bun.*server.ts" 2>/dev/null | head -1)
if [ -n "$BUN_PID" ]; then
  # Also check TCP to Telegram (149.154.166.* bots api): if bun exists but 0 ESTABLISHED, it's a zombie.
  BUN_TCP=$(lsof -p "$BUN_PID" 2>/dev/null | grep -c "149.154.166.*ESTABLISHED" || echo 0)
else
  BUN_TCP=0
fi

log "PID=$PID uptime=${UPTIME_H}h bun_pid=${BUN_PID:-NONE} bun_tcp=${BUN_TCP}"

NEEDS_RESTART=0
REASON=""

if [ -z "$BUN_PID" ]; then
  NEEDS_RESTART=1
  REASON="bun (Telegram polling MCP child) is DEAD — claude --channels orphaned"
elif [ "$BUN_TCP" -eq 0 ]; then
  NEEDS_RESTART=1
  REASON="bun alive but 0 TCP ESTABLISHED to Telegram (zombie polling)"
fi

if [ "$UPTIME_H" -gt "$MAX_UPTIME_HOURS" ]; then
  NEEDS_RESTART=1
  REASON="uptime ${UPTIME_H}h > ${MAX_UPTIME_HOURS}h (preventive)"
fi

if [ "$NEEDS_RESTART" -eq 1 ]; then
  log "RESTART: $REASON"

  # Stop bun + claude BEFORE kickstart to avoid Telegram getUpdates race,
  # then peek queue (no consume) and snapshot to inbox/journal/. The new bun
  # instance will consume updates normally; the snapshot gives visibility into
  # what arrived during the gap.
  launchctl bootout "gui/${UID_NUM}/${LABEL}" 2>/dev/null || true
  pkill -f "bun.*server.ts" 2>/dev/null || true
  sleep 2

  INBOX_DIR="$PROJECT_ROOT/inbox/journal"
  mkdir -p "$INBOX_DIR"
  PEEKED=0
  if [ -n "$TG_TOKEN" ]; then
    PEEK_RAW=$(curl -s "https://api.telegram.org/bot${TG_TOKEN}/getUpdates?offset=-100&timeout=0" 2>/dev/null || echo '{}')
    PEEKED=$(echo "$PEEK_RAW" | /usr/bin/python3 -c "
import sys, json, os
try:
    d = json.load(sys.stdin)
    if not d.get('ok'):
        print(0); sys.exit()
    n = 0
    inbox = os.environ.get('INBOX_DIR', '/tmp')
    for u in d.get('result', []):
        uid = u['update_id']
        path = os.path.join(inbox, f'{uid}.json')
        if not os.path.exists(path):
            with open(path, 'w') as f: json.dump(u, f, indent=2, ensure_ascii=False)
            n += 1
    print(n)
except Exception:
    print(0)
" 2>/dev/null || echo 0)
  fi
  log "Peeked $PEEKED new updates into inbox/journal/"

  launchctl bootstrap "gui/${UID_NUM}" "$HOME/Library/LaunchAgents/${LABEL}.plist" 2>/dev/null \
    || launchctl kickstart -k "gui/${UID_NUM}/${LABEL}"
  sleep 3
  NEW_PID=$(pgrep -f "claude --channels plugin:telegram.*--debug-file" | head -1)
  log "Restart done. New PID=$NEW_PID"

  # Telegram notify ONLY on real problems — silent on healthy auto-recovery to
  # avoid spam (bun can crash every 30-90 min in some setups). Notify only if
  # PEEKED > 0 (updates were potentially missed) OR restart failed (no new PID).
  if [ "$PEEKED" -gt 0 ] || [ -z "$NEW_PID" ]; then
    notify_telegram "🔄 Watchdog: claude-channels restart ($REASON). New PID=${NEW_PID:-FAILED}. Peeked $PEEKED missed updates → inbox/journal/."
  fi
fi

export INBOX_DIR  # noop — kept for future python invocations
