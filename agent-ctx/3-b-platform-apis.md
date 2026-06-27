# Task 3-B: Backend Platform APIs

## Agent: Full-Stack Developer (Phase 3-B Platform APIs)

## Summary

Created 6 new backend API routes under `/api/platform/*` for the platform-admin (super-admin) role. These endpoints enable cross-tenant management of weddings, users, and platform-wide dashboard stats. All routes are PLATFORM_ADMIN-only (enforced via `requirePlatformAdmin()` helper from `lib/auth.ts`).

## Previous Agents' Work Referenced

- **Phase 1 (Task 4-PHASE1)**: Wedding model + weddingId columns, `lib/types.ts` (isValidSlug, buildCoupleLabel, Plan, WeddingStatus, isPlatformAdmin), `lib/auth.ts` (AuthUser with weddingId claim)
- **Phase 2 (Task 5-PHASE2)**: `lib/db.ts` exports both `db` (raw) and `tenantDb` (anti-leak extension); `lib/tenant-context.ts` (invalidateWeddingCache); per-wedding routing at `/w/{slug}`
- **Task 3-A** (just-completed predecessor): Updated `lib/auth.ts` with `requirePlatformAdmin()`, `setAuthCookie`, `clearAuthCookie`; updated `lib/types.ts` with `Role` type accepting `PLATFORM_ADMIN` + `SUPER_ADMIN` legacy alias, `isPlatformAdmin()`, `normalizeRole()`
- **Task 2-A** (`agent-ctx/2-a-api-backend.md`): Existing API route conventions (try/catch, NextResponse patterns, AuditLog creation, dynamic route handler signature `params: Promise<{ id: string }>`)

## Files Created (6 new files)

1. **`/src/app/api/platform/login/route.ts`** (118 lines)
   - POST platform-admin-only login
   - Dual rate limiting (IP 10/15min + email 5/15min)
   - Password verify via bcrypt
   - 403 if `isPlatformAdmin(user.role)` is false
   - Issues JWT with `weddingId: null` + `isPlatformAdmin: true` claim
   - Sets `auth_token` httpOnly cookie via `setAuthCookie`
   - Updates `lastLoginAt` + creates `PLATFORM_LOGIN` audit log (weddingId=null) in parallel
   - Returns `{ user, token }` with security headers

2. **`/src/app/api/platform/logout/route.ts`** (43 lines)
   - POST clears `auth_token` cookie via `clearAuthCookie`
   - Best-effort `PLATFORM_LOGOUT` audit log (wrapped in try/catch so logout never fails)
   - Returns `{ success: true }`

3. **`/src/app/api/platform/dashboard/route.ts`** (138 lines)
   - GET platform-wide stats (PLATFORM_ADMIN only via `requirePlatformAdmin`)
   - 10 parallel queries via `Promise.all` using RAW `db` (cross-tenant — `tenantDb` would auto-scope incorrectly)
   - Returns: weddings { total, byStatus, byPlan }, users { total, byRole, platformAdmins }, guests { total, last7days }, recentWeddings (5), recentActivity (20 with user relation)
   - `groupBy` results formatted into `Record<string, number>`

4. **`/src/app/api/platform/weddings/route.ts`** (203 lines)
   - GET: paginated list `?page&limit&search&status&plan`; limit capped at 100; searches slug/coupleLabel/brideName/groomName/venueName/venueCity/customDomain; each wedding includes `_count: { guests, admins }`
   - POST: creates wedding; validates slug via `isValidSlug`; validates status/plan enum; checks slug uniqueness (409); auto-computes `coupleLabel` via `buildCoupleLabel`; forces `isDefault: false`; auto-sets `publishedAt` when status=PUBLISHED; returns 201; AuditLog `CREATE_WEDDING`

5. **`/src/app/api/platform/weddings/[id]/route.ts`** (261 lines)
   - GET: single wedding with `_count: { guests, tables, media, admins }`
   - PUT: updates fields; validates status/plan enum; checks customDomain uniqueness (409); recomputes `coupleLabel` when bride/groom changes; auto-sets `publishedAt` on first PUBLISHED transition; calls `invalidateWeddingCache(slug)` after update; AuditLog `UPDATE_WEDDING` with field list in details
   - DELETE: 400 "Cannot delete the default wedding" if `isDefault`; otherwise cascade-deletes via Prisma; invalidates cache; AuditLog `DELETE_WEDDING`

6. **`/src/app/api/platform/users/route.ts`** (76 lines)
   - GET: paginated list `?page&limit&search&role&weddingId`; searches email+name; each user includes `wedding: { slug, coupleLabel }` relation (null for platform admins); ALWAYS excludes `password` via explicit `select`

## Key Design Decisions

- **RAW `db` not `tenantDb`**: All platform routes use `db` (raw Prisma) because platform admins need cross-tenant aggregates. `tenantDb` would auto-inject `weddingId` filters via AsyncLocalStorage, breaking the platform view.
- **`requirePlatformAdmin(user)` pattern**: Returns `NextResponse | null` — routes use `const denied = requirePlatformAdmin(user); if (denied) return denied;` for clean 1-line guards.
- **AuditLog weddingId=null**: All platform-level audit entries use `weddingId: null` so they don't get scoped to any tenant — they appear in the dashboard's `recentActivity` feed regardless of which wedding context the dashboard is viewed from.
- **Default wedding protection**: API layer blocks deletion of `isDefault: true` weddings with HTTP 400 — the legacy client at "/" depends on the default wedding existing.
- **coupleLabel auto-sync**: On PUT, if `brideName` or `groomName` changes, `coupleLabel` is recomputed via `buildCoupleLabel()` — keeps the display label in sync without requiring the client to send it.
- **Cache invalidation**: `invalidateWeddingCache(slug)` is called after every wedding PUT/DELETE so the next `/w/{slug}` request re-fetches fresh data (60s cache otherwise).
- **Password hash safety**: Every AdminUser select clause explicitly omits `password` — never exposed in any API response.
- **Dual rate limiting on login**: IP-based (10/15min via `checkRateLimit`) + per-email (5/15min via `checkLoginRateLimit`) — same proven pattern as `/api/admin/login`.
- **Force-dynamic**: All 6 routes export `dynamic = "force-dynamic"` — no static caching of authenticated responses.

## Lint Status

✅ 0 errors in any of the 6 new platform files.

The 17 pre-existing lint errors are unrelated:
- `backup-frontend/components/AmbientMusicPlayer.tsx` (setState in effect)
- `src/components/AmbientMusicPlayer.tsx` (setState in effect)
- `scripts/deploy-vps-*.cjs` (require() imports in .cjs deploy scripts)
- `sync-vps-tables-only.js` (require() imports)

## End-to-End Verification (curl on dev server, port 3000)

All 6 endpoints tested with both unauthenticated and authenticated requests:

| Endpoint | Method | Test | Result |
|---|---|---|---|
| `/api/platform/login` | POST | missing creds | 400 "Email and password are required" ✅ |
| `/api/platform/login` | POST | non-platform user (ORGANIZER) | 403 "Platform admin access required" ✅ |
| `/api/platform/login` | POST | valid SUPER_ADMIN | 200 with {user, token} + cookie + PLATFORM_LOGIN audit ✅ |
| `/api/platform/logout` | POST | authenticated | 200 {success:true} + cookie cleared + PLATFORM_LOGOUT audit ✅ |
| `/api/platform/dashboard` | GET | unauthenticated | 401 "Unauthorized — authentication required" ✅ |
| `/api/platform/dashboard` | GET | authenticated | 200 with full payload (1 wedding, 11 users, 243 guests, recentActivity) ✅ |
| `/api/platform/weddings` | GET | authenticated, paginated | 200 with {weddings, total, page, limit}, _count correct ✅ |
| `/api/platform/weddings` | POST | valid slug + names | 201, coupleLabel auto-computed "Alice & Bob" ✅ |
| `/api/platform/weddings/{id}` | GET | existing wedding | 200 with _count (guests/tables/media/admins) ✅ |
| `/api/platform/weddings/{id}` | PUT | change brideName | 200, coupleLabel re-computed, publishedAt set, cache invalidated ✅ |
| `/api/platform/weddings/{id}` | DELETE | default wedding | 400 "Cannot delete the default wedding" ✅ |
| `/api/platform/weddings/{id}` | DELETE | non-default wedding | 200 {success:true}, follow-up GET returns 404 ✅ |
| `/api/platform/users` | GET | authenticated, paginated | 200 with {users, total, page, limit}, wedding relation populated ✅ |

Audit trail verified end-to-end: dashboard's `recentActivity` correctly shows `PLATFORM_LOGIN → PLATFORM_LOGOUT → DELETE_USER → CREATE_USER → DELETE_WEDDING` in reverse-chronological order with the `user` relation populated.

## Notes for Next Agent (Phase 3-C — Frontend Platform Admin Pages)

- **SSR auth ready**: Login endpoint sets `auth_token` httpOnly cookie, so server components can use `getServerAuthUser()` from `lib/auth.ts` to gate platform pages without any client-side token handling.
- **API client conventions**: All GET endpoints accept `?page&limit&search` query params and return `{ items, total, page, limit }`. POST/PUT return `{ entity }`. DELETE returns `{ success: true }`.
- **Error response shape**: All errors return `{ error: string }` with appropriate HTTP status (400, 401, 403, 404, 409, 500).
- **Authentication header**: Client-side fetches should send `Authorization: Bearer {token}` OR rely on the httpOnly cookie (both are read by `getAuthUser`). For SSR fetches, the cookie is automatically sent.
- **Pagination cap**: `limit` is capped at 100 — UI should use 20-50 for default page size.
- **Wedding create flow**: UI should collect slug, brideName, groomName (required); weddingDate, timezone, venueName, venueCity, status, plan (optional). The API auto-computes coupleLabel.
