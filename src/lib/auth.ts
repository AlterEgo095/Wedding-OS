import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { createHash } from 'node:crypto';
import os from 'node:os';
import { NextRequest, NextResponse } from 'next/server';
import { db } from './db';
import { isPlatformAdmin, normalizeRole, type Role } from './types';

// P2-SEC-9: dev-fallback secret is now derived from machine signals (not hardcoded).

// JWT_SECRET — lazy initialization. In production, the env var is REQUIRED.
// A missing JWT_SECRET in production throws on first use (not at module load,
// so unrelated routes still work). In development, a fixed dev-only fallback
// is allowed for convenience.
//
// SECURITY (P0-SEC-1): The previous implementation silently fell back to a
// hardcoded string 'wedding-platform-dev-secret-key-not-for-production' in
// production, allowing anyone with source-code access to forge admin JWTs.
// This is now a hard failure in production.
//
// SECURITY (P2-SEC-9): The dev-only fallback used to be a hardcoded string
// in source control — anyone with the source could forge tokens in dev. It
// is now derived from machine-specific signals (cwd + hostname + username)
// via SHA-256. The value is stable across restarts on the same machine (so
// dev sessions don't invalidate every `next dev` restart) but differs on
// other machines/developers.
let _jwtSecret: string | null = null;

/**
 * Derive a stable, machine-specific dev-fallback secret for a named purpose.
 * Used ONLY when the production env var is absent in development — never
 * active in production (production throws a FATAL error).
 *
 * Stability: the same machine (cwd + hostname + username) produces the same
 * secret across restarts, so dev sessions survive `next dev` reloads.
 * Unpredictability: each developer's machine produces a different secret, so
 * a token forged on one laptop doesn't work on another.
 *
 * @param purpose e.g. 'admin-jwt', 'guest-jwt', 'encryption-key'
 */
export function devFallbackSecret(purpose: string): string {
  const username = (() => {
    try { return os.userInfo().username; } catch { return 'unknown'; }
  })();
  const seed = `${purpose}:${process.cwd()}:${os.hostname()}:${username}`;
  return createHash('sha256').update(seed).digest('hex');
}

function getJwtSecret(): string {
  if (_jwtSecret !== null) return _jwtSecret;
  const env = process.env.JWT_SECRET;
  if (env && env.length >= 32) {
    _jwtSecret = env;
    return _jwtSecret;
  }
  const isProd =
    process.env.NODE_ENV === 'production' &&
    process.env.NEXT_PHASE !== 'phase-production-build';
  if (isProd) {
    // Hard fail in production — no silent fallback to a forgeable secret.
    throw new Error(
      'FATAL: JWT_SECRET is missing or too short (<32 chars) in production. ' +
      'Set JWT_SECRET in your .env file with: openssl rand -base64 48. ' +
      'Admin authentication is disabled until this is fixed.'
    );
  }
  // Dev-only fallback — never active in production.
  // P2-SEC-9: derived from machine signals (not hardcoded) so source-code
  // access alone is not enough to forge tokens in dev.
  console.warn(
    'WARNING: JWT_SECRET not set — using insecure dev-only fallback. ' +
    'Set JWT_SECRET in your .env file with: openssl rand -base64 48'
  );
  _jwtSecret = devFallbackSecret('admin-jwt');
  return _jwtSecret;
}

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: string;
  /** ID of the wedding this user belongs to. null for PLATFORM_ADMIN (platform-wide). */
  weddingId?: string | null;
}

// ─── Password helpers ─────────────────────────────────────────────────────────

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hashedPassword: string): Promise<boolean> {
  return bcrypt.compare(password, hashedPassword);
}

// ─── Token generation & verification ──────────────────────────────────────────
//
// Phase 3 — JWT now carries two tenant claims:
//   - weddingId : string | null   (null for PLATFORM_ADMIN)
//   - role      : string          (PLATFORM_ADMIN | SUPER_ADMIN | ORGANIZER | RECEPTION | CONTROLLER)
//
// These claims are read by middleware + API routes to enforce RBAC without
// re-fetching the user from DB on every request. The user record is still
// re-fetched on sensitive operations (login, user mutation) to prevent
// stale-claim attacks (e.g. user revoked but token still valid).

export function generateToken(user: AuthUser): string {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      weddingId: user.weddingId ?? null,
      // Phase 3: explicit platform-admin flag for fast RBAC checks
      isPlatformAdmin: isPlatformAdmin(user.role),
    },
    getJwtSecret(),
    { expiresIn: '8h' }
  );
}

export function verifyToken(token: string): AuthUser | null {
  try {
    const payload = jwt.verify(token, getJwtSecret()) as AuthUser & { isPlatformAdmin?: boolean };
    return {
      id: payload.id,
      email: payload.email,
      name: payload.name,
      role: payload.role,
      weddingId: payload.weddingId ?? null,
    };
  } catch {
    return null;
  }
}

export function getTokenFromRequest(request: NextRequest): string | null {
  // P1-SEC-3: Authorization header is kept as a fallback for any client that
  // still sends it, but the httpOnly `auth_token` cookie is the primary auth
  // path. If the Authorization header is present but the bearer value is
  // empty (e.g. `Bearer ` with no token, which is what client components
  // now send because they no longer have a token in localStorage), fall
  // through to the cookie.
  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const bearerToken = authHeader.substring(7).trim();
    if (bearerToken) {
      return bearerToken;
    }
    // Empty bearer — fall through to cookie lookup.
  }
  const token = request.cookies.get('auth_token')?.value;
  return token || null;
}

export async function getAuthUser(request: NextRequest): Promise<AuthUser | null> {
  const token = getTokenFromRequest(request);
  if (!token) return null;
  const user = verifyToken(token);
  if (!user) return null;
  // Verify user still exists
  const dbUser = await db.adminUser.findUnique({ where: { id: user.id } });
  if (!dbUser) return null;
  // Refresh weddingId + role from DB in case they changed since token was issued
  // (e.g. user was demoted, or assigned to a different wedding)
  return {
    ...user,
    role: dbUser.role,
    weddingId: dbUser.weddingId,
  };
}

// ─── RBAC helpers ─────────────────────────────────────────────────────────────
//
// Phase 3 RBAC matrix:
//
//   Action                  | Required roles (any)             | Wedding lock?
//   ------------------------|----------------------------------|---------------
//   View own wedding data   | CONTROLLER, RECEPTION, ORGANIZER, PLATFORM_ADMIN | yes (own wedding)
//   Manage guests/tables    | ORGANIZER, PLATFORM_ADMIN        | yes
//   Manage media/music/timeline | ORGANIZER, PLATFORM_ADMIN    | yes
//   Manage settings         | ORGANIZER, PLATFORM_ADMIN        | yes
//   Manage appearance/theme | ORGANIZER, PLATFORM_ADMIN        | yes
//   Check-in guests         | RECEPTION, ORGANIZER, PLATFORM_ADMIN | yes
//   Manage users (per wedding) | ORGANIZER (own), PLATFORM_ADMIN | yes (organizer) / no (platform)
//   Create users            | PLATFORM_ADMIN                   | no
//   View platform dashboard | PLATFORM_ADMIN                   | no
//   Manage weddings         | PLATFORM_ADMIN                   | no
//
// `hasPermission` checks the role hierarchy.
// `assertWeddingAccess` ensures non-platform users can only touch their own wedding.

export function hasPermission(role: string, requiredRoles: string[]): boolean {
  const userLevel = isPlatformAdmin(role) ? 4 : (roleLevel(role));
  return requiredRoles.some(r => {
    const required = isPlatformAdmin(r) ? 4 : roleLevel(r);
    return userLevel >= required;
  });
}

function roleLevel(role: string): number {
  switch (role) {
    case 'PLATFORM_ADMIN':
    case 'SUPER_ADMIN': return 4;
    case 'ORGANIZER': return 3;
    case 'RECEPTION': return 2;
    case 'CONTROLLER': return 1;
    default: return 0;
  }
}

/**
 * Assert that a user is allowed to operate on a given wedding.
 *
 * Rules:
 *   - PLATFORM_ADMIN can access any wedding (returns true)
 *   - Other roles can only access their own wedding (user.weddingId === weddingId)
 *
 * Use this in API routes after resolving the tenant context:
 *   if (!assertWeddingAccess(user, ctx.weddingId)) {
 *     return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
 *   }
 */
export function assertWeddingAccess(
  user: { role: string; weddingId?: string | null },
  weddingId: string
): boolean {
  if (isPlatformAdmin(user.role)) return true;
  return user.weddingId === weddingId;
}

/**
 * Require a minimum role for an action. Returns a 403 NextResponse if the user
 * doesn't meet the requirement, or null if access is granted.
 *
 * @example
 *   const denied = requireRole(user, ['ORGANIZER']);
 *   if (denied) return denied;
 */
export function requireRole(
  user: AuthUser | null,
  requiredRoles: Role[]
): NextResponse | null {
  if (!user) {
    return NextResponse.json(
      { error: 'Unauthorized — authentication required' },
      { status: 401 }
    );
  }
  if (!hasPermission(user.role, requiredRoles)) {
    return NextResponse.json(
      { error: 'Forbidden — insufficient permissions' },
      { status: 403 }
    );
  }
  return null;
}

/**
 * Require the user to be a platform admin. Returns 403 NextResponse otherwise.
 * Use this to guard /api/platform/* routes.
 */
export function requirePlatformAdmin(user: AuthUser | null): NextResponse | null {
  return requireRole(user, ['PLATFORM_ADMIN']);
}

// ─── Server-side (SSR) cookie-based auth ──────────────────────────────────────
//
// These helpers read the auth_token cookie directly (without NextRequest) so
// they can be used inside Server Components and route handlers that don't have
// a NextRequest object handy (e.g. layout.tsx).
//
// For API routes, prefer getAuthUser(NextRequest) — it also checks the
// Authorization header which is needed for client-side fetches.

import { cookies } from 'next/headers';

/**
 * Get the authenticated user from the request cookie (SSR-friendly).
 * Use this inside Server Components to gate page rendering.
 *
 * @example
 *   const user = await getServerAuthUser();
 *   if (!user) redirect('/platform/login');
 */
export async function getServerAuthUser(): Promise<AuthUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get('auth_token')?.value;
  if (!token) return null;
  const user = verifyToken(token);
  if (!user) return null;
  const dbUser = await db.adminUser.findUnique({ where: { id: user.id } });
  if (!dbUser) return null;
  return {
    ...user,
    role: dbUser.role,
    weddingId: dbUser.weddingId,
  };
}

/**
 * Set the auth_token cookie on a NextResponse. Used by login endpoints.
 *
 * Cookie attributes (P2-SEC-4 + P2-CQ-21):
 *   - httpOnly: true (JS cannot read the token → XSS-resistant)
 *   - secure: true in production (HTTPS-only)
 *   - sameSite: 'strict' (CSRF-resistant — cookie NOT sent on cross-site
 *     requests, even top-level navigations from a third-party site).
 *     Previously 'lax' which still leaked the cookie on top-level GET
 *     navigations from a malicious site.
 *   - path: '/'
 *   - maxAge: defaults to 8h to match `generateToken`'s JWT expiresIn of '8h'.
 *     Callers may override via `maxAgeSeconds` (e.g. if a longer-lived JWT
 *     is introduced in the future). Note: setting a cookie maxAge longer
 *     than the JWT expiry gives the user a cookie containing an expired
 *     token — they'll be redirected to login on the next request anyway.
 *
 * @param response NextResponse to attach the cookie to.
 * @param token JWT string from generateToken().
 * @param maxAgeSeconds Optional override (seconds). Default: 8h to match JWT.
 */
export function setAuthCookie(
  response: NextResponse,
  token: string,
  maxAgeSeconds: number = 8 * 60 * 60
): NextResponse {
  response.cookies.set('auth_token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: maxAgeSeconds,
  });
  return response;
}

/**
 * Clear the auth_token cookie. Used by logout endpoints.
 */
export function clearAuthCookie(response: NextResponse): NextResponse {
  response.cookies.delete('auth_token');
  return response;
}

// ─── Role display helpers (for UI) ────────────────────────────────────────────
// P2-CQ-14 + P2-CQ-21: ROLE_LABELS + getRoleLabel moved to src/lib/ui-labels.ts
// (single source of truth shared with platform/admin UI). Re-exported here for
// backwards-compat with existing imports of `@/lib/auth`.
// `ui-labels` is pure (no Prisma, no next/server) — no runtime circular dep.
export { ROLE_LABELS, getRoleLabel } from './ui-labels';

/**
 * Get a normalized role for new user creation. SUPER_ADMIN is migrated to
 * PLATFORM_ADMIN on creation (legacy users in DB keep their value).
 */
export function getCanonicalRole(role: string): Role {
  return normalizeRole(role);
}

// ─── Rate limiting (login attempts) ───────────────────────────────────────────
//
// Simple in-memory rate limiter — sufficient for a single-instance deployment.
// For multi-instance (Phase 9+), migrate to Redis-backed rate limiting.

const loginAttempts = new Map<string, { count: number; lastAttempt: number }>();
const MAX_LOGIN_ATTEMPTS = 5;
const LOGIN_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

export function checkLoginRateLimit(email: string): boolean {
  const now = Date.now();
  const record = loginAttempts.get(email);

  if (!record || (now - record.lastAttempt) > LOGIN_WINDOW_MS) {
    loginAttempts.set(email, { count: 1, lastAttempt: now });
    return true;
  }

  if (record.count >= MAX_LOGIN_ATTEMPTS) {
    return false;
  }

  record.count++;
  record.lastAttempt = now;
  return true;
}

export function resetLoginRateLimit(email: string): void {
  loginAttempts.delete(email);
}
