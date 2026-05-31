# ══════════════════════════════════════════════════════════════════════════════
# Dockerfile — Josué & Hornella Wedding Platform
# Ultra-secure multi-stage production build for Next.js 16 + SQLite/Prisma
# ══════════════════════════════════════════════════════════════════════════════

# ─── Stage 1: Dependencies ────────────────────────────────────────────────────
FROM node:20-alpine AS deps

# Install libc6-compat for native module compatibility (bcryptjs, sharp, etc.)
RUN apk add --no-cache libc6-compat

WORKDIR /app

# Copy lockfiles and package manifest first for maximum cache efficiency
COPY package.json ./
COPY bun.lock* package-lock.json* yarn.lock* ./

# Install dependencies using the appropriate lockfile
# npm ci requires package-lock.json; fallback to npm i for bun.lock / yarn.lock
RUN \
  if [ -f yarn.lock ]; then \
    echo "Detected yarn.lock — installing with npm ci (yarn.lock present for reference)"; \
    npm i --frozen-lockfile 2>/dev/null || npm i; \
  elif [ -f package-lock.json ]; then \
    echo "Detected package-lock.json — installing with npm ci"; \
    npm ci; \
  elif [ -f bun.lock ]; then \
    echo "Detected bun.lock — installing with npm ci"; \
    npm ci 2>/dev/null || npm i; \
  else \
    echo "WARNING: No lockfile detected — installing with npm i (non-deterministic)"; \
    npm i; \
  fi

# ─── Stage 2: Builder ─────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Copy installed dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules

# Copy all source code
COPY . .

# Disable Next.js telemetry during build
ENV NEXT_TELEMETRY_DISABLED=1

# Generate Prisma client from schema (required before Next.js build)
RUN npx prisma generate

# Build the Next.js application (standalone output mode)
RUN npm run build

# ─── Stage 3: Production Runner ───────────────────────────────────────────────
FROM node:20-alpine AS runner

# ── Metadata Labels ──
LABEL maintainer="Josué & Hornella Wedding Team"
LABEL description="Josué & Hornella Wedding Platform — Next.js 16 Production Image"
LABEL version="1.0.0"
LABEL org.opencontainers.image.title="wedding-platform"
LABEL org.opencontainers.image.description="Wedding guest management & invitation platform"
LABEL org.opencontainers.image.vendor="Josué & Hornella"

# ── Production Environment ──
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

WORKDIR /app

# ── Security: Create non-root user and group ──
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# ── Copy standalone server output ──
COPY --from=builder /app/.next/standalone ./

# ── Copy static assets (not included in standalone) ──
COPY --from=builder /app/.next/static ./.next/static

# ── Copy public directory for static serving ──
COPY --from=builder /app/public ./public

# ── Copy Prisma client (required at runtime for SQLite queries) ──
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma

# ── Copy Prisma schema (required for migrations at runtime if needed) ──
COPY --from=builder /app/prisma ./prisma

# ── Create data directories with secure ownership ──
# /app/db         — SQLite database files (persistent volume)
# /app/public/uploads — User-uploaded media (persistent volume)
# /app/logs       — Application log files (persistent volume)
RUN mkdir -p /app/db /app/public/uploads /app/logs && \
    chown -R nextjs:nodejs /app/db /app/public/uploads /app/logs && \
    chmod -R 770 /app/db /app/public/uploads /app/logs

# Ensure the nextjs user owns the standalone server files it needs to execute
RUN chown -R nextjs:nodejs /app/.next && \
    chown nextjs:nodejs /app/server.js /app/package.json 2>/dev/null || true

# ── Switch to non-root user ──
USER nextjs

# ── Expose application port ──
EXPOSE 3000

# ── Health Check ──
# Verify the HTTP server is responsive every 30 seconds
# wget with --spider performs a HEAD request (lightweight check)
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/ || exit 1

# ── Start the Next.js standalone server ──
CMD ["node", "server.js"]
