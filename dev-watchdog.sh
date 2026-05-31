#!/bin/bash
# Auto-restart dev server for sandbox environment
while true; do
  echo "[$(date)] Starting Next.js dev server..."
  node node_modules/.bin/next dev -p 3000 2>&1
  EXIT_CODE=$?
  echo "[$(date)] Next.js exited with code $EXIT_CODE. Restarting in 3s..."
  sleep 3
done
