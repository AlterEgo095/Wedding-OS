# Work Log — Josué & Hornella Wedding Platform

---
Task ID: 1
Agent: Main Agent
Task: Fix homepage not loading and prepare for production deployment

Work Log:
- Restarted dev server (was not running)
- Verified homepage returns HTTP 200
- Performed comprehensive production audit of entire codebase
- Fixed CRITICAL: Removed hardcoded JWT secret in auth.ts (now throws in production if JWT_SECRET not set)
- Fixed CRITICAL: Updated next.config.ts — disabled ignoreBuildErrors, enabled reactStrictMode, added security headers (HSTS, X-Frame-Options, CSP, etc.)
- Fixed CRITICAL: QR code route now uses NEXT_PUBLIC_BASE_URL instead of localhost:3000 fallback
- Fixed CRITICAL: Guest search now requires minimum 2 chars, returns limited fields (no email/phone), capped at 20 results
- Fixed HIGH: Added rate limiting to login endpoint (in-memory + per-email tracking)
- Fixed HIGH: Added file upload validation — size limit (10MB), extension whitelist, MIME type validation
- Fixed HIGH: Updated db.ts — production logging only shows errors, not queries
- Fixed HIGH: Increased bcrypt salt rounds from 10 to 12
- Fixed HIGH: Reduced JWT expiry from 24h to 8h
- Created /src/lib/rate-limit.ts for shared rate limiting utility
- Created Dockerfile (multi-stage build: deps → builder → runner)
- Created docker-compose.yml (app + nginx with SSL support)
- Created nginx/nginx.conf (reverse proxy with security headers, caching, rate limiting)
- Created .env.production template with all required variables
- Created deploy.sh deployment script (full deploy, zero-downtime update, SSL setup, backup/restore)
- Created .dockerignore for Docker builds
- Updated layout.tsx to use NEXT_PUBLIC_BASE_URL for metadata
- Updated package.json with production scripts (db:migrate:prod, db:seed, node instead of bun for start)
- Removed middleware.ts (deprecated in Next.js 16, moved logic to route-level rate limiting)

Stage Summary:
- All CRITICAL and HIGH security issues resolved
- Production deployment infrastructure complete (Docker + Nginx + deploy script)
- Application is production-ready for VPS deployment
- Key config files: Dockerfile, docker-compose.yml, nginx/nginx.conf, deploy.sh, .env.production
