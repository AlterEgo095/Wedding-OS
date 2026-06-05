#!/bin/sh
# ═══════════════════════════════════════════════════════════════
# docker-entrypoint.sh — Production entrypoint for wedding platform
# Runs as ROOT first to fix volume permissions, then drops to nextjs
# ═══════════════════════════════════════════════════════════════
set -e

echo "🚀 Starting wedding platform..."

# Fix database file ownership (Docker volumes may be owned by root)
# This MUST run as root before dropping privileges
echo "🔧 Ensuring database permissions..."
if [ -f /app/db/custom.db ]; then
  chown nextjs:nodejs /app/db/custom.db 2>/dev/null || true
  chmod 660 /app/db/custom.db 2>/dev/null || true
fi
chown nextjs:nodejs /app/db 2>/dev/null || true
chmod 770 /app/db 2>/dev/null || true
chown -R nextjs:nodejs /app/public/uploads 2>/dev/null || true
chown -R nextjs:nodejs /app/logs 2>/dev/null || true

# Run database initialization as nextjs user (creates tables + seeds data)
echo "📦 Initializing database..."
su-exec nextjs node init-db.js 2>/dev/null || node init-db.js

# Fix ownership again after init-db.js may have created new files
chown -R nextjs:nodejs /app/db/ 2>/dev/null || true

echo "✅ Database ready!"

# Drop to nextjs user and start the Next.js standalone server
echo "🌐 Starting Next.js server..."
if command -v su-exec >/dev/null 2>&1; then
  exec su-exec nextjs node server.js
elif command -v gosu >/dev/null 2>&1; then
  exec gosu nextjs node server.js
else
  # If no privilege-dropping tool, just run as current user
  exec node server.js
fi
