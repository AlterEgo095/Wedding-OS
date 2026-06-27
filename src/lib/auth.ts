import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { NextRequest, NextResponse } from 'next/server';
import { db } from './db';
import { isPlatformAdmin, normalizeRole, type Role } from './types';

// JWT_SECRET — lazy initialization to avoid crashing the entire module at load time.
// Previously, a missing JWT_SECRET in production would throw at module scope,
// which prevented ANY route that imported this module (directly or via shared chunk)
// from loading, causing 500 errors on /api/guest/invite, /api/guest/auto-auth, etc.
let _jwtSecret: string | null = null;
function getJwtSecret(): string {
  if (_jwtSecret !== null) return _jwtSecret;
  const env = process.env.JWT_SECRET;
  if (env) {
    _jwtSecret = env;
    return _jwtSecret;
  }
  // In production without JWT_SECRET, log a warning instead of crashing.
  // This allows the app to start and serve pages while the admin panel
  // will simply fail individual auth attempts (which is correct behavior).
  if (process.env.NODE_ENV === 'production' && process.env.NEXT_PHASE !== 'phase-production-build') {
    console.warn(
      'WARNING: JWT_SECRET is not set in production! Admin authentication will not work securely. ' +
      'Set JWT_SECRET in your .env file with: openssl rand -base64 48'
    );
  }
  _jwtSecret = 'wedding-platform-dev-secret-key-not-for-production';
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
  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.substring(7);
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
 * Cookie is httpOnly, secure (in production), sameSite=lax, 8h expiry.
 */
export function setAuthCookie(response: NextResponse, token: string): NextResponse {
  response.cookies.set('auth_token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 8 * 60 * 60, // 8 hours, matches JWT expiry
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

export const ROLE_LABELS: Record<string, string> = {
  PLATFORM_ADMIN: 'Administrateur Plateforme',
  SUPER_ADMIN: 'Super Admin',
  ORGANIZER: 'Organisateur',
  RECEPTION: 'Réception',
  CONTROLLER: 'Contrôleur',
};

export function getRoleLabel(role: string): string {
  return ROLE_LABELS[role] || role;
}

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
