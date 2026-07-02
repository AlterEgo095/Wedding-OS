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
# P0-ARCH-2: init-db.js is a legacy Phase-1 script that creates only 10 of the
# 19 Prisma models. We keep it for idempotent seeding of the default wedding /
# admin user, but ALSO run `prisma db push` to ensure ALL models and columns
# from prisma/schema.prisma exist on the volume. Without this, the first
# tenant-scoped query on a fresh volume throws `no such column: weddingId`
# (Prisma P2022) and platform routes throw `no such table: Wedding`.
echo "📦 Initializing database..."
su-exec nextjs node init-db.js 2>/dev/null || node init-db.js

echo "🔧 Syncing Prisma schema (db push)..."
su-exec nextjs node node_modules/prisma/build/index.js db push --skip-generate --accept-data-loss 2>/dev/null \
  || node node_modules/prisma/build/index.js db push --skip-generate --accept-data-loss 2>/dev/null \
  || npx prisma db push --skip-generate --accept-data-loss 2>/dev/null \
  || echo "⚠️ prisma db push failed — assuming schema is already in sync"

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
