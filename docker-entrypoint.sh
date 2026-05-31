#!/bin/sh
# ═══════════════════════════════════════════════════════════════
# docker-entrypoint.sh — Production entrypoint for wedding platform
# Runs database init + seed before starting Next.js server
# ═══════════════════════════════════════════════════════════════
set -e

echo "🚀 Starting wedding platform..."

# Run database initialization (creates tables + seeds data)
echo "📦 Initializing database..."
node init-db.js

echo "✅ Database ready!"

# Start the Next.js standalone server
echo "🌐 Starting Next.js server..."
exec node server.js
