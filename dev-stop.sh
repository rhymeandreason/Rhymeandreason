#!/usr/bin/env bash
# Stops the local CMS server started by dev-open.sh.
set -euo pipefail

PORT=4848
PID="$(lsof -ti:$PORT || true)"

if [ -z "$PID" ]; then
  osascript -e 'display notification "Server was not running" with title "Rhyme and Reason"'
  exit 0
fi

kill "$PID"
osascript -e 'display notification "Server stopped" with title "Rhyme and Reason"'
