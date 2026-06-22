#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOST="${UDON_TEST_SERVER_HOST:-127.0.0.1}"
PORT="${UDON_TEST_SERVER_PORT:-4322}"
RUNTIME_DIR="${UDON_TEST_SERVER_RUNTIME_DIR:-"$ROOT_DIR/.dev-runtime"}"
PID_FILE="${UDON_TEST_SERVER_PID_FILE:-"$RUNTIME_DIR/test-server.pid"}"
LOG_FILE="${UDON_TEST_SERVER_LOG_FILE:-"$RUNTIME_DIR/test-server.log"}"
WAIT_FOR_READY="${UDON_TEST_SERVER_WAIT:-1}"
READY_TIMEOUT_SECONDS="${UDON_TEST_SERVER_TIMEOUT:-30}"
BACKGROUND="${UDON_TEST_SERVER_BACKGROUND:-0}"
URL="http://$HOST:$PORT"

mkdir -p "$(dirname "$PID_FILE")" "$(dirname "$LOG_FILE")"

stop_pid() {
  local pid="$1"

  if [[ -z "$pid" ]] || ! kill -0 "$pid" 2>/dev/null; then
    return 0
  fi

  echo "Stopping existing test server process: $pid"
  kill "$pid" 2>/dev/null || true

  for _ in {1..20}; do
    if ! kill -0 "$pid" 2>/dev/null; then
      return 0
    fi
    sleep 0.1
  done

  echo "Process $pid did not stop after TERM; sending KILL"
  kill -9 "$pid" 2>/dev/null || true
  sleep 0.2

  if kill -0 "$pid" 2>/dev/null; then
    echo "Could not stop process $pid" >&2
    return 1
  fi
}

stop_pid_file_process() {
  if [[ ! -f "$PID_FILE" ]]; then
    return 0
  fi

  local pid
  pid="$(tr -d '[:space:]' < "$PID_FILE")"
  stop_pid "$pid"
  rm -f "$PID_FILE"
}

stop_port_listeners() {
  if ! command -v lsof >/dev/null 2>&1; then
    echo "lsof is not available; skipping port listener cleanup for $PORT"
    return 0
  fi

  local pid
  while IFS= read -r pid; do
    [[ -n "$pid" ]] && stop_pid "$pid"
  done < <(lsof -tiTCP:"$PORT" -sTCP:LISTEN 2>/dev/null || true)
}

wait_for_ready() {
  if [[ "$WAIT_FOR_READY" == "0" ]]; then
    return 0
  fi

  if ! command -v curl >/dev/null 2>&1; then
    echo "curl is not available; server started without readiness check."
    return 0
  fi

  echo "Waiting for $URL ..."
  local deadline=$((SECONDS + READY_TIMEOUT_SECONDS))
  while (( SECONDS < deadline )); do
    if curl --noproxy '*' -fsS "$URL" >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done

  echo "Server did not become ready within ${READY_TIMEOUT_SECONDS}s. See log: $LOG_FILE" >&2
  return 1
}

stop_pid_file_process
stop_port_listeners
if command -v lsof >/dev/null 2>&1; then
  remaining_port_pids="$(lsof -tiTCP:"$PORT" -sTCP:LISTEN 2>/dev/null || true)"
  if [[ -n "$remaining_port_pids" ]]; then
    echo "Port $PORT is still in use; refusing to start on a different port." >&2
    exit 1
  fi
fi

echo "Starting test server on $URL"
cd "$ROOT_DIR"
if [[ "$BACKGROUND" == "1" ]]; then
  nohup env ASTRO_TELEMETRY_DISABLED=1 npm run dev -- --host "$HOST" --port "$PORT" < /dev/null > "$LOG_FILE" 2>&1 &
  server_pid="$!"
  echo "$server_pid" > "$PID_FILE"
  disown "$server_pid" 2>/dev/null || true

  wait_for_ready

  echo "Test server is running: $URL"
  echo "PID file: $PID_FILE"
  echo "Log file: $LOG_FILE"
else
  echo "$$" > "$PID_FILE"
  echo "Running in foreground. Press Ctrl+C to stop."
  echo "Log file is not used in foreground mode."
  exec env ASTRO_TELEMETRY_DISABLED=1 npm run dev -- --host "$HOST" --port "$PORT"
fi
