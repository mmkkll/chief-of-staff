#!/bin/bash
# wa-enqueue.sh — append a WhatsApp send job to the queue file.
#
# Usage:
#   wa-enqueue.sh --to "+393481234567" --at "2026-05-02T09:00:00" --text "Buongiorno"
#   wa-enqueue.sh --to "+393481234567" --name "Marco" --at "..." --text "..." [--quoted MSG_ID]
#
# Setup:
#   PROJECT_ROOT — defaults to $HOME/chief-of-staff
#
# The companion `wa-scheduler.mjs` (LaunchAgent every 60s) drains the queue and
# sends jobs whose `scheduled_at <= now`.

set -u
PROJECT_ROOT="${PROJECT_ROOT:-$HOME/chief-of-staff}"
QUEUE="$PROJECT_ROOT/.state/wa-queue.json"
TO=""; NAME=""; AT=""; TEXT=""; QUOTED=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --to) TO="$2"; shift 2;;
    --name) NAME="$2"; shift 2;;
    --at) AT="$2"; shift 2;;
    --text) TEXT="$2"; shift 2;;
    --quoted) QUOTED="$2"; shift 2;;
    *) echo "unknown arg $1" >&2; exit 2;;
  esac
done
[ -z "$TO" ] && { echo "ERR: --to required" >&2; exit 2; }
[ -z "$AT" ] && { echo "ERR: --at required (ISO datetime)" >&2; exit 2; }
[ -z "$TEXT" ] && { echo "ERR: --text required" >&2; exit 2; }
ID=$(date +%s%N | cut -c1-13)-$RANDOM
CREATED=$(date -u +%Y-%m-%dT%H:%M:%SZ)
mkdir -p "$(dirname "$QUEUE")"
[ ! -f "$QUEUE" ] && echo "[]" > "$QUEUE"
NEW=$(python3 -c "
import json, sys
q = json.load(open('$QUEUE'))
q.append({
    'id': '$ID',
    'created_at': '$CREATED',
    'scheduled_at': '$AT',
    'to': '$TO',
    'name': '''$NAME''',
    'text': '''$TEXT''',
    'quoted_id': '''$QUOTED''' or None,
    'status': 'pending'
})
json.dump(q, open('$QUEUE','w'), indent=2)
print('$ID')
")
echo "queued: $NEW"
