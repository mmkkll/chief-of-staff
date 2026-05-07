#!/bin/bash
# MC Assistant Mailbox digest — fires daily 21:00.
# Reads ~/mission-control/.state/mc-mailbox-digest-<YYYYMMDD>.json and sends
# a Telegram recap. If all counters are 0, no notification.

set -u

LOG_FILE="$HOME/mission-control/logs/cron-mc-mailbox-digest.log"
CLAUDE_BIN="$HOME/.local/bin/claude"
CWD="$HOME/mission-control"

mkdir -p "$(dirname "$LOG_FILE")"

NOW_TS="$(date '+%Y-%m-%d %H:%M:%S %Z')"
log() { echo "[$NOW_TS] $1" >>"$LOG_FILE"; }

log "fired"

PROMPT='Run the MC Assistant Mailbox daily digest. Read ~/mission-control/.state/mc-mailbox-digest-$(date +%Y%m%d).json (counters written during the day by the mc-mailbox cron). If ALL counters (cc_processed, material_saved, commands_pending, errors) are 0, do NOT send anything on Telegram. Otherwise send a recap:

📬 ASSISTANT MAILBOX RECAP — <today>
✓ <N> CC processed (silent)
✓ <M> materials saved (Notion links if any)
⏳ <K> commands still pending confirmation (subject list)
⚠️ <E> errors (see log)

For pending commands include the subject as a reminder. For saved materials include the Notion link. Delete the digest file for the day after sending (next day starts fresh).'

cd "$CWD" || exit 1

"$CLAUDE_BIN" -p --dangerously-skip-permissions "$PROMPT" >>"$LOG_FILE" 2>&1
RC=$?

if [ $RC -eq 0 ]; then
  log "completed OK"
else
  log "FAILED rc=$RC"
fi

exit $RC
