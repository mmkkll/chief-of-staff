#!/bin/bash
# cron-wrapper-template.sh — pattern for headless `claude -p` cron wrappers.
#
# Each cron job in this framework follows the same shape:
#   1. A LaunchAgent (StartCalendarInterval or StartInterval) calls a wrapper bash script.
#   2. The wrapper invokes `claude -p --dangerously-skip-permissions "<prompt>"`.
#   3. The prompt references a section of your config markdown (e.g. `chief-of-staff.md`)
#      and instructs Claude to perform the routine, using whatever MCP tools are needed.
#   4. Output goes to a per-cron log file for audit + the daily verify script.
#
# Why headless instead of using the always-on channels session?
#   - Cron firings shouldn't compete for REPL focus with user interactions.
#   - Headless runs are reliable: no PTY/FIFO requirements, predictable exit codes.
#   - But: headless `claude -p` does NOT have the channels plugin loaded, so it can't
#     receive Telegram inbound. It can only SEND outbound (via curl Bot API or MCP).
#
# Customize this template for each cron (briefing / email-monitor / reminder / etc.).

set -u

# === Configure these per-cron ===
CRON_NAME="example"
PROMPT_REF_SECTION="## 1. My routine"
LOG_FILE="$HOME/chief-of-staff/logs/cron-${CRON_NAME}.log"
CLAUDE_BIN="${CLAUDE_BIN:-$HOME/.local/bin/claude}"
CWD="$HOME/chief-of-staff"

mkdir -p "$(dirname "$LOG_FILE")"

NOW_TS="$(date '+%Y-%m-%d %H:%M:%S %Z')"
log() { echo "[$NOW_TS] $1" >>"$LOG_FILE"; }

log "fired"

PROMPT="Run the routine described in ~/chief-of-staff/chief-of-staff.md section \"${PROMPT_REF_SECTION}\". Read that file, then execute every step listed there. Use the MCP tools you have available. Be silent on Telegram if there are no actionable items (skip empty notifications)."

cd "$CWD" || exit 1
"$CLAUDE_BIN" -p --dangerously-skip-permissions "$PROMPT" >>"$LOG_FILE" 2>&1
RC=$?

if [ $RC -eq 0 ]; then
  log "completed OK"
else
  log "FAILED rc=$RC"
fi

exit $RC
