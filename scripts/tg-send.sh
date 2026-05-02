#!/bin/bash
# tg-send.sh — outgoing Telegram via Bot API curl. Default fallback when the
# MCP Telegram plugin disconnects. Designed to be safe against arg-swap bugs.
#
# Setup: export TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID before use, e.g.
#   export TELEGRAM_BOT_TOKEN="123456789:AA..."
#   export TELEGRAM_CHAT_ID="123456789"
#
# Or pass --chat <id> at call site.
#
# Usage:
#   tg-send.sh "text"
#   echo "text" | tg-send.sh
#   tg-send.sh --chat 123456789 "text"
#   tg-send.sh --html "<b>bold</b>"
#   tg-send.sh --reply-to 123 "thread reply"
TOKEN="${TELEGRAM_BOT_TOKEN:-}"
CHAT="${TELEGRAM_CHAT_ID:-}"
MODE=""
REPLY=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --chat) CHAT="$2"; shift 2;;
    --html) MODE="HTML"; shift;;
    --markdown) MODE="MarkdownV2"; shift;;
    --reply-to) REPLY="$2"; shift 2;;
    *) break;;
  esac
done
if [ -z "$TOKEN" ]; then
  echo "ERR: TELEGRAM_BOT_TOKEN not set" >&2
  exit 2
fi
if [ -z "$CHAT" ]; then
  echo "ERR: TELEGRAM_CHAT_ID not set (use --chat or env var)" >&2
  exit 2
fi
TEXT="${1:-$(cat)}"
# Guardrail: refuse payloads that look like a bare chat_id (caller swapped args).
# Pattern: 8-12 digits only = misuse, avoid sending the chat_id itself as message.
if [[ "$TEXT" =~ ^[0-9]{8,12}$ ]]; then
  echo "ERR: text looks like a chat_id ($TEXT). Did you swap args? Use: tg-send.sh --chat <id> \"text\"" >&2
  exit 2
fi
if [ -z "${TEXT// }" ]; then
  echo "ERR: empty text" >&2
  exit 2
fi
ARGS=( -s -X POST "https://api.telegram.org/bot${TOKEN}/sendMessage" -d "chat_id=${CHAT}" --data-urlencode "text=${TEXT}" )
[ -n "$MODE" ] && ARGS+=( -d "parse_mode=${MODE}" )
[ -n "$REPLY" ] && ARGS+=( -d "reply_to_message_id=${REPLY}" )
RESP=$(curl "${ARGS[@]}")
echo "$RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['result']['message_id'] if d.get('ok') else 'ERR: '+str(d))"
