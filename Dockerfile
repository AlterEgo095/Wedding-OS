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
RUN \
  if [ -f yarn.lock ]; then \
    echo "Detected yarn.lock — installing with npm ci (yarn.lock present for reference)"; \
    npm i --frozen-lockfile 2>/dev/null || npm i; \
  elif [ -f package-lock.json ]; then \
    echo "Detected package-lock.json — installing with npm i"; \
    npm i; \
  elif [ -f bun.lock ]; then \
    echo "Detected bun.lock — installing with npm i"; \
    npm i; \
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

# Mission 4.0 Phase 1 — Runtime provenance.
# DEPLOY_SHA is the git commit this image was built from. It is passed as a
# build arg by docker-compose.prod.yml (which reads it via `git rev-parse HEAD`
# at build time) and baked into the image as an ENV var so /api/health can
# return it. This closes the provenance chain:
#   GitHub main SHA == VPS HEAD == container deploySha
# Default "unknown" when the arg is not provided (e.g. local docker build).
ARG DEPLOY_SHA=unknown
ARG BUILD_TIME=unknown

# ── Metadata Labels ──
LABEL maintainer="AENEWS Wedding OS Team"
LABEL description="AENEWS Wedding OS — Next.js 16 Production Image"
LABEL version="2.0.0-rc"
LABEL org.opencontainers.image.title="wedding-platform"
LABEL org.opencontainers.image.description="Multi-tenant wedding/event management platform"
LABEL org.opencontainers.image.vendor="AENEWS"
LABEL org.opencontainers.image.revision="${DEPLOY_SHA}"
LABEL org.opencontainers.image.created="${BUILD_TIME}"

# ── Production Environment ──
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
# Bake the provenance vars into the runtime environment.
ENV DEPLOY_SHA=${DEPLOY_SHA}
ENV BUILD_TIME=${BUILD_TIME}

WORKDIR /app

# ── Security: Create non-root user and group + install su-exec for privilege dropping ──
RUN apk add --no-cache su-exec && \
    addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# ── Copy standalone server output ──
COPY --from=builder /app/.next/standalone ./

# ── Copy static assets (not included in standalone) ──
COPY --from=builder /app/.next/static ./.next/static

# ── Copy public directory for static serving ──
COPY --from=builder /app/public ./public

# ── Copy Prisma client + CLI (required at runtime for db push + queries) ──
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/node_modules/prisma ./node_modules/prisma

# ── Copy Prisma schema (required for db push at runtime) ──
COPY --from=builder /app/prisma ./prisma

# ── Copy required runtime dependencies for init-db.js ──
COPY --from=builder /app/node_modules/bcryptjs ./node_modules/bcryptjs

# ── Copy database init script and entrypoint ──
COPY --from=builder /app/init-db.js ./init-db.js
COPY --from=builder /app/docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh

# ── Create data directories with secure ownership ──
RUN mkdir -p /app/db /app/public/uploads /app/logs && \
    chown -R nextjs:nodejs /app/db /app/public/uploads /app/logs && \
    chmod -R 770 /app/db /app/public/uploads /app/logs

# Ensure the nextjs user owns everything it needs
RUN chown -R nextjs:nodejs /app/.next /app/node_modules /app/prisma && \
    chown nextjs:nodejs /app/server.js /app/package.json /app/init-db.js /app/docker-entrypoint.sh 2>/dev/null || true

# ── Entrypoint runs as ROOT to fix volume permissions, then drops to nextjs ──
# Do NOT set USER nextjs here — the entrypoint handles privilege dropping
# USER nextjs  # Removed: entrypoint runs as root to chown volume files

# ── Expose application port ──
EXPOSE 3000

# ── Health Check ──
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:3000/api/health || exit 1

# ── Start via entrypoint (init-db + server) ──
ENTRYPOINT ["sh", "./docker-entrypoint.sh"]
