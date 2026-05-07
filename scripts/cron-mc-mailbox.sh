#!/bin/bash
# MC Assistant Mailbox cron — fires every 30min between 07:00 and 22:00.
# Triggered by a LaunchAgent (com.YOUR_USER.mc-mailbox).
#
# Triggers a headless Claude run that follows the prompt in
# `mission-control.md` (look for the "Assistant Mailbox" section).
# The full flow: emails_since via mailbox MCP → verify Authentication-Results
# spf+dkim+dmarc pass → check sender allowlist → classify
# CC / MATERIAL / COMMAND → process bucket → mark read + update state file +
# counter digest in .state/mc-mailbox-digest-$(date +%Y%m%d).json.

set -u

LOG_FILE="$HOME/mission-control/logs/cron-mc-mailbox.log"
CLAUDE_BIN="$HOME/.local/bin/claude"
CWD="$HOME/mission-control"

mkdir -p "$(dirname "$LOG_FILE")"

NOW_TS="$(date '+%Y-%m-%d %H:%M:%S %Z')"
log() { echo "[$NOW_TS] $1" >>"$LOG_FILE"; }

log "fired"

PROMPT='Run the MC Assistant Mailbox flow as documented in ~/mission-control/mission-control.md in the "Assistant Mailbox" section (steps 1-7: emails_since via mailbox MCP with the dedicated account alias → verify Authentication-Results spf+dkim+dmarc pass → check sender allowlist → classify CC/MATERIAL/COMMAND → process the matching bucket → mark email as read + update state file + bump counter digest in ~/mission-control/.state/mc-mailbox-digest-$(date +%Y%m%d).json).'

cd "$CWD" || exit 1

"$CLAUDE_BIN" -p --dangerously-skip-permissions "$PROMPT" >>"$LOG_FILE" 2>&1
RC=$?

if [ $RC -eq 0 ]; then
  log "completed OK"
else
  log "FAILED rc=$RC"
fi

exit $RC
