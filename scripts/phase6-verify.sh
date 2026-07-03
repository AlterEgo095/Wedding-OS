#!/bin/bash
# Phase 6 end-to-end browser verification.
# Starts dev server, logs in, tests billing tab workflow, screenshots.
set -e
cd /home/z/my-project

echo "=== 1. Kill any existing servers ==="
pkill -f "next-server" 2>/dev/null || true
pkill -f "next dev" 2>/dev/null || true
sleep 2

echo "=== 2. Start fresh dev server ==="
rm -rf .next
setsid bash -c 'exec ./node_modules/.bin/next dev -p 3000 >> dev.log 2>&1' < /dev/null > /dev/null 2>&1 &
disown
DEV_PID=$!
echo "Started dev server wrapper, waiting for boot..."

# Wait for port 3000 to be listening
for i in $(seq 1 30); do
  if ss -tlnp 2>/dev/null | grep -q ":3000 "; then
    echo "Port 3000 listening after ${i}s"
    break
  fi
  sleep 1
done

echo "=== 3. Pre-warm pages (Turbopack compile) ==="
curl -s --max-time 120 http://localhost:3000/platform/login -o /dev/null -w "  /platform/login: HTTP %{http_code}\n"
curl -s --max-time 120 http://localhost:3000/platform/admin -o /dev/null -w "  /platform/admin: HTTP %{http_code}\n"

echo "=== 4. Open browser & login ==="
agent-browser close 2>/dev/null || true
sleep 1
agent-browser open http://localhost:3000/platform/login --timeout 60000 2>&1 | tail -1
sleep 2
agent-browser snapshot -i 2>&1 | grep -E "textbox|button" | head -5

# Fill login form
agent-browser fill @e5 "admin@josue-hornella.wedding" 2>&1 | tail -1
agent-browser fill @e6 "admin2026" 2>&1 | tail -1
agent-browser click @e4 2>&1 | tail -1
sleep 4

URL=$(agent-browser get url 2>&1 | tail -1)
echo "After login URL: $URL"

if echo "$URL" | grep -q "/platform/admin"; then
  echo "✓ Login successful, on /platform/admin"
else
  echo "✗ Login failed — still on $URL"
  echo "Console:"
  agent-browser console 2>&1 | tail -10
  exit 1
fi

echo ""
echo "=== 5. Snapshot admin page (find Facturation tab) ==="
agent-browser snapshot -i 2>&1 | grep -iE "facturation|billing|tab|vue|wedding|mariage|utilisateurs" | head -20

echo ""
echo "=== 6. Click 'Facturation' tab ==="
# Find the Facturation nav item
FACT_REF=$(agent-browser snapshot -i 2>&1 | grep -i "facturation" | head -1 | grep -oE '@e[0-9]+' | head -1)
echo "Facturation ref: $FACT_REF"
if [ -z "$FACT_REF" ]; then
  echo "✗ Could not find Facturation tab"
  agent-browser snapshot -i 2>&1 | head -30
  exit 1
fi
agent-browser click $FACT_REF 2>&1 | tail -1
sleep 3

echo ""
echo "=== 7. Snapshot billing tab ==="
agent-browser snapshot -i 2>&1 | head -50

echo ""
echo "=== 8. Screenshot billing tab ==="
agent-browser screenshot /home/z/my-project/phase6-billing-tab.png 2>&1 | tail -1
echo "Screenshot saved: /home/z/my-project/phase6-billing-tab.png"

echo ""
echo "=== 9. Find 'Gérer' button and click it ==="
GERER_REF=$(agent-browser snapshot -i 2>&1 | grep -i "gérer" | head -1 | grep -oE '@e[0-9]+' | head -1)
echo "Gérer ref: $GERER_REF"
if [ -z "$GERER_REF" ]; then
  echo "✗ Could not find Gérer button"
  agent-browser snapshot -i 2>&1 | grep -i "button\|wallet" | head -10
  exit 1
fi
agent-browser click $GERER_REF 2>&1 | tail -1
sleep 4

echo ""
echo "=== 10. Snapshot subscription editor dialog ==="
agent-browser snapshot -i 2>&1 | head -80

echo ""
echo "=== 11. Screenshot editor dialog ==="
agent-browser screenshot /home/z/my-project/phase6-billing-editor.png 2>&1 | tail -1
echo "Screenshot saved: /home/z/my-project/phase6-billing-editor.png"

echo ""
echo "=== 12. Verify plan cards are visible ==="
agent-browser snapshot -i 2>&1 | grep -iE "essentiel|premium|élite|essai" | head -10

echo ""
echo "=== DONE ==="
