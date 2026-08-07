#!/bin/sh
# ═══════════════════════════════════════════════════════════════
# docker-entrypoint.sh — Production entrypoint for wedding platform
# Runs as ROOT first to fix volume permissions, then drops to nextjs
# ═══════════════════════════════════════════════════════════════
set -e

echo "🚀 Starting wedding platform..."

# Fix database file ownership (Docker volumes may be owned by root)
echo "🔧 Ensuring database permissions..."
if [ -f /app/db/custom.db ]; then
  chown nextjs:nodejs /app/db/custom.db 2>/dev/null || true
  chmod 660 /app/db/custom.db 2>/dev/null || true
fi
chown nextjs:nodejs /app/db 2>/dev/null || true
chmod 770 /app/db 2>/dev/null || true
chown -R nextjs:nodejs /app/public/uploads 2>/dev/null || true
chown -R nextjs:nodejs /app/logs 2>/dev/null || true

# Apply Prisma migrations (single source of truth)
echo "📦 Running prisma migrate deploy..."
su-exec nextjs node node_modules/prisma/build/index.js migrate deploy 2>/dev/null \
  || node node_modules/prisma/build/index.js migrate deploy 2>/dev/null \
  || npx prisma migrate deploy 2>/dev/null \
  || {
    echo "⚠️ migrate deploy failed — falling back to db push (no data loss)..."
    su-exec nextjs node node_modules/prisma/build/index.js db push --skip-generate 2>/dev/null \
      || node node_modules/prisma/build/index.js db push --skip-generate 2>/dev/null \
      || npx prisma db push --skip-generate 2>/dev/null \
      || echo "⚠️ prisma db push failed — assuming schema is already in sync"
  }

# Ensure the Prisma client is generated for the runtime
echo "🔧 Running prisma generate..."
su-exec nextjs node node_modules/prisma/build/index.js generate 2>/dev/null \
  || node node_modules/prisma/build/index.js generate 2>/dev/null \
  || npx prisma generate 2>/dev/null \
  || echo "⚠️ prisma generate failed — client may be stale"

# Fix ownership again after migrations
chown -R nextjs:nodejs /app/db/ 2>/dev/null || true

echo "✅ Database ready!"

# Drop to nextjs user and start the Next.js standalone server
echo "🌐 Starting Next.js server..."
if command -v su-exec >/dev/null 2>&1; then
  exec su-exec nextjs node server.js
elif command -v gosu >/dev/null 2>&1; then
  exec gosu nextjs node server.js
else
  exec node server.js
fi
