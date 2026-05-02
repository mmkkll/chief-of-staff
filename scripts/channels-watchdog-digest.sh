#!/bin/bash
# channels-watchdog-digest.sh — 4h recap of bun crash counts.
# Fires e.g. 08:00 / 12:00 / 16:00 / 20:00 via LaunchAgent (StartCalendarInterval).
# Counts RESTART entries in the watchdog log over the last 4h. Notifies Telegram
# only if restarts > 0 (silent when stable to avoid noise).
#
# Setup:
#   PROJECT_ROOT — path to your project (default $HOME/chief-of-staff)
#   TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID — for notifications

set -u
PROJECT_ROOT="${PROJECT_ROOT:-$HOME/chief-of-staff}"
LOGFILE="$PROJECT_ROOT/logs/channels-watchdog.log"
TG_TOKEN="${TELEGRAM_BOT_TOKEN:-}"
CHAT_ID="${TELEGRAM_CHAT_ID:-}"

[ -z "$TG_TOKEN" ] || [ -z "$CHAT_ID" ] && exit 0
[ ! -f "$LOGFILE" ] && exit 0

# Cutoff: 4h ago in ISO yyyy-mm-dd HH:MM:SS format
CUTOFF=$(date -v-4H '+%Y-%m-%d %H:%M:%S')
NOW_HM=$(date '+%H:%M')

# Log lines from the last 4h
RECENT=$(awk -v cut="$CUTOFF" -F'[][]' '$2 >= cut' "$LOGFILE")

RESTARTS=$(echo "$RECENT" | grep -c "^.*RESTART:")
PEEKED_TOTAL=$(echo "$RECENT" | grep "Peeked" | awk '{sum += $3} END {print sum+0}')
FAILS=$(echo "$RECENT" | grep -c "Restart done. New PID=$")

[ "$RESTARTS" -eq 0 ] && exit 0

# Compose digest
if [ "$FAILS" -gt 0 ]; then
  EMOJI="⚠️"
  TAIL=" — $FAILS restart FAILED."
else
  EMOJI="🔇"
  TAIL="."
fi

MSG="$EMOJI Channels recap (last 4h, ${NOW_HM}): $RESTARTS bun auto-restart, $PEEKED_TOTAL Telegram updates peeked${TAIL}"

curl -s -X POST "https://api.telegram.org/bot${TG_TOKEN}/sendMessage" \
  -d "chat_id=${CHAT_ID}" --data-urlencode "text=${MSG}" > /dev/null 2>&1 || true
