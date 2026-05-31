# Task 2-a: Backend API Routes

## Agent: API Backend Developer

## Summary
Created all 14 API route files for the premium wedding platform backend.

## Files Created

1. **`/src/app/api/admin/login/route.ts`** - POST admin login with JWT, logs to AuditLog
2. **`/src/app/api/admin/dashboard/route.ts`** - GET dashboard stats (guests, tables, seats, activity, categories)
3. **`/src/app/api/admin/users/route.ts`** - GET/POST/PUT/DELETE admin users with role-based access
4. **`/src/app/api/guests/search/route.ts`** - GET public guest search by name/invitation code
5. **`/src/app/api/guests/route.ts`** - GET (paginated/filtered) / POST / PUT / DELETE guests
6. **`/src/app/api/guests/[id]/route.ts`** - GET / PUT / DELETE single guest by ID
7. **`/src/app/api/guests/export/route.ts`** - GET export guests as XLSX file
8. **`/src/app/api/guests/import/route.ts`** - POST import guests from XLSX file
9. **`/src/app/api/tables/route.ts`** - GET (with guest counts) / POST / PUT / DELETE tables
10. **`/src/app/api/timeline/route.ts`** - GET (ordered) / POST / PUT / DELETE timeline events
11. **`/src/app/api/couple-story/route.ts`** - GET (ordered) / POST / PUT / DELETE couple story entries
12. **`/src/app/api/media/route.ts`** - GET (filterable) / POST (upload to /public/uploads/) / DELETE media
13. **`/src/app/api/settings/route.ts`** - GET (public, key-value map) / PUT (upsert, SUPER_ADMIN only)
14. **`/src/app/api/guests/qrcode/[code]/route.ts`** - GET QR code data URL for guest by invitation code

## Key Design Decisions

- **Auth**: Uses `getAuthUser(request)` from `@/lib/auth` for authentication, `hasPermission(role, requiredRoles)` for authorization
- **Permission hierarchy**: SUPER_ADMIN > ORGANIZER > RECEPTION > CONTROLLER (using `hasPermission` with level check)
- **Pagination**: Guests API supports `page`, `limit`, `status`, `category`, `tableId`, `search` query params
- **Invitation codes**: Auto-generated using `uuidv4().substring(0, 8).toUpperCase()`
- **File uploads**: Media files saved to `/public/uploads/` with unique filenames
- **Excel**: Uses `xlsx` package for both import and export
- **QR codes**: Uses `qrcode` package to generate data URLs encoding `{baseURL}/?code={invitationCode}`
- **Audit logging**: All mutating operations log to AuditLog with user ID, action, and details
- **Error handling**: All routes use try/catch with appropriate HTTP status codes (400, 401, 403, 404, 409, 500)
- **Dynamic routes**: Using Next.js 16 pattern with `params: Promise<{ id: string }>` and `await params`

## Lint Status
✅ All files pass ESLint with zero errors
