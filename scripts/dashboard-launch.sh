#!/usr/bin/env bash
# Mission Control Dashboard launcher
#   ./dashboard-launch.sh        # start server (if needed) + open Chrome in app mode
#   ./dashboard-launch.sh stop   # kill server
#   ./dashboard-launch.sh status # show status

set -euo pipefail

PORT="${DASHBOARD_PORT:-3848}"
URL="http://localhost:${PORT}"
PID_FILE="$HOME/mission-control/dashboard/.server.pid"
LOG_FILE="$HOME/mission-control/logs/dashboard.log"
SERVER="$HOME/mission-control/dashboard/server.mjs"
NODE="$(command -v node)"
if [[ -z "$NODE" ]]; then
  echo "[dashboard] node not found on PATH — install Node 18+ first" >&2
  exit 1
fi

mkdir -p "$HOME/mission-control/logs"

is_running() {
  if [[ -f "$PID_FILE" ]] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
    return 0
  fi
  return 1
}

health_ok() {
  curl -s -m 2 "$URL/api/health" >/dev/null 2>&1
}

start_server() {
  if is_running && health_ok; then
    echo "[dashboard] already running (pid $(cat "$PID_FILE"))"
    return 0
  fi
  echo "[dashboard] starting server on $URL"
  nohup "$NODE" "$SERVER" >>"$LOG_FILE" 2>&1 &
  echo $! > "$PID_FILE"
  for i in $(seq 1 20); do
    if health_ok; then
      echo "[dashboard] up (pid $(cat "$PID_FILE"))"
      return 0
    fi
    sleep 0.2
  done
  echo "[dashboard] failed to become healthy — see $LOG_FILE" >&2
  return 1
}

stop_server() {
  if is_running; then
    kill "$(cat "$PID_FILE")" 2>/dev/null || true
    rm -f "$PID_FILE"
    echo "[dashboard] stopped"
  else
    echo "[dashboard] not running"
  fi
}

open_chrome() {
  local app
  if [[ -d "/Applications/Google Chrome.app" ]]; then
    app="Google Chrome"
  elif [[ -d "/Applications/Chromium.app" ]]; then
    app="Chromium"
  elif [[ -d "/Applications/Arc.app" ]]; then
    app="Arc"
  else
    echo "[dashboard] no Chromium-family browser found — opening in default"
    open "$URL"
    return
  fi
  open -na "$app" --args --app="$URL" --window-size=1600,1000 --user-data-dir="$HOME/mission-control/dashboard/.chrome-profile"
}

case "${1:-open}" in
  start)  start_server ;;
  stop)   stop_server ;;
  status)
    if is_running; then echo "[dashboard] running (pid $(cat "$PID_FILE"))"; else echo "[dashboard] stopped"; fi
    health_ok && echo "[dashboard] health OK" || echo "[dashboard] health FAIL"
    ;;
  open|*)
    start_server
    open_chrome
    ;;
esac
