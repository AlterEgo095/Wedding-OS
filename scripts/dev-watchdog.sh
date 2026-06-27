#!/bin/bash
# Watchdog: keeps the Next.js dev server alive.
# Restarts if the process dies or port 3000 stops responding.
cd /home/z/my-project
while true; do
  if ! pgrep -f "next-server" > /dev/null; then
    echo "[$(date +%T)] Dev server down — restarting..." >> /home/z/my-project/dev-watchdog.log
    pkill -f "next dev" 2>/dev/null
    pkill -f "next-server" 2>/dev/null
    sleep 1
    setsid bash -c 'exec ./node_modules/.bin/next dev -p 3000 >> /home/z/my-project/dev.log 2>&1' < /dev/null > /dev/null 2>&1 &
    disown
    sleep 8
  fi
  sleep 5
done
