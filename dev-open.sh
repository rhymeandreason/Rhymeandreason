#!/usr/bin/env bash
# Starts the local CMS server (if not already running) and opens the CMS + index.
set -euo pipefail
# Monitor mode: puts the backgrounded server in its own process group, so it
# survives signals sent to this script's group (e.g. Studio's own dev-server
# restarts) instead of dying with them.
set -m

PORT=4848
URL_INDEX="http://localhost:$PORT/index.html"
URL_CMS="http://localhost:$PORT/admin.html"
cd "$(dirname "$0")"

if ! curl -s -o /dev/null "$URL_INDEX"; then
  nohup node admin-server.js > /tmp/rhymeandreason-server.log 2>&1 &
  until curl -s -o /dev/null "$URL_INDEX"; do sleep 0.3; done
fi

osascript -e 'display notification "Server is running" with title "Rhyme and Reason"'

open "$URL_CMS"
open "$URL_INDEX"
