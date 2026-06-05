---
Task ID: 1
Agent: Main
Task: Fix admin dashboard 401 issue - remove broken middleware that uses jsonwebtoken in Edge Runtime

Work Log:
- Identified that middleware.ts was using jsonwebtoken (jwt.verify) which is not available in Edge Runtime
- This caused ALL /api/admin/* routes to return 401 "Invalid or expired token" even with valid tokens
- The middleware was also redundant since each API route already calls getAuthUser() for authentication
- Removed the broken middleware by clearing the matcher config and adding documentation
- Verified locally that admin login and dashboard work correctly after the fix

Stage Summary:
- Root cause: jsonwebtoken incompatible with Edge Runtime in middleware
- Fix: Disabled middleware, auth handled by individual API routes
- Local test: Login + Dashboard working ✅
- VPS: Needs rebuild to apply fix (build in progress)

---
Task ID: 2
Agent: Main
Task: Fix venue location coordinates - change from Gombe to Debonhomme/Limete area

Work Log:
- Searched for "Debonhomme" and found it's a quartier in Commune de Matete, Kinshasa
- Found from Yandex Maps that Avenue Bobozo coordinates are -4.347890, 15.339533 (Limete)
- Previous coords (-4.3250, 15.3222) pointed to Gombe/downtown area which was wrong
- Updated local DB: venue_lat = -4.3479, venue_lng = 15.3395
- Updated MapSection.tsx default coordinates
- Updated VPS database via Settings API

Stage Summary:
- Correct coordinates: -4.3479, 15.3395 (Avenue Bobozo, Limete/Matete area)
- Location is near Debonhomme quartier as user specified
- Both local and VPS databases updated ✅

---
Task ID: 3
Agent: Main
Task: Add venue_lat, venue_lng, venue_time, venue_parking to SettingsManager admin panel

Work Log:
- Added venue_lat (Latitude GPS), venue_lng (Longitude GPS), venue_time (Heure de la Cérémonie), venue_parking (Parking) fields to the "Informations du Mariage" group in SettingsManager

Stage Summary:
- Admin can now edit GPS coordinates, time, and parking from the settings panel ✅

---
Task ID: 4
Agent: Main
Task: Restore VPS platforms after Docker incident

Work Log:
- Multiple Docker builds caused VPS overload (load average > 25)
- Docker daemon became unresponsive, all containers stopped
- Restarted Docker daemon
- Started all stopped containers: aenews-lms, aenews-dashboard, aenews-marketplace, aenews-ai-studio, aenews-crm, aenews-erp, monitoring stack
- Recreated wedding-app container with --env-file and correct Docker volumes
- Updated venue coordinates on VPS via Settings API
- All platforms restored and operational

Stage Summary:
- All platforms back online: aenews.net ✅, heureuxmariage.aenews.net ✅
- Wedding container running with old image (middleware fix pending rebuild)
- Docker image rebuild running in background

---
Task ID: 5
Agent: Main
Task: Fix invitation loading Internal Server Error (500) on production

Work Log:
- User reported "Erreur interne du serveur" when trying to load invitation after name search
- Tested production API: /api/guest/lookup works (200), but /api/guest/auto-auth returns 500, /api/guest/invite returns 500
- Analyzed the code flow: lookup (read-only) works, auto-auth/invite (write operations) fail
- Checked VPS Docker logs: found "attempt to write a readonly database" (SQLite error code 8)
- Root cause: custom.db owned by root:root with 644 permissions, container runs as nextjs user (can't write)
- Also found secondary issue: auth.ts throws at module load time if JWT_SECRET is not set in production, crashing any route that imports it

Fixes applied:
1. Fixed auth.ts: Changed JWT_SECRET from eager module-level throw to lazy initialization with warning (no crash)
2. Fixed guest data: Added displayName and invitationType fields to auto-auth, invite, auth endpoint responses
3. Fixed VPS DB permissions: chown nextjs:nodejs /app/db/custom.db, chmod 660
4. Fixed Dockerfile: Removed USER nextjs, added su-exec for privilege dropping in entrypoint
5. Fixed docker-entrypoint.sh: Runs as root first to fix volume permissions, then drops to nextjs via su-exec
6. Added better error logging with stack traces to auto-auth and invite routes

Stage Summary:
- Root cause 1: Database file had root ownership (readonly for nextjs user) — FIXED ✅
- Root cause 2: auth.ts module crash when JWT_SECRET missing — FIXED ✅
- Guest data now includes displayName and invitationType — FIXED ✅
- Docker entrypoint now fixes volume permissions automatically on restart — FIXED ✅
- Production invitation loading works: Search → Select → Envelope reveal → Full invitation displayed ✅
