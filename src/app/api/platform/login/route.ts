export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import {
  verifyPassword,
  generateToken,
  checkLoginRateLimit,
  resetLoginRateLimit,
  setAuthCookie,
} from '@/lib/auth';
import { getRateLimitKey, checkRateLimit, withSecurityHeaders } from '@/lib/rate-limit';
import { isPlatformAdmin } from '@/lib/types';
// P2-SEC-1: structured logger (no stack leak).
import { logger } from '@/lib/logger';
// P2-CQ-5: standardised API errors.
import { internalError } from '@/lib/api-errors';
// P2-SEC-14: writeAuditLog populates ipAddress + userAgent from request.
import { writeAuditLog } from '@/lib/audit';

/**
 * Platform admin login endpoint.
 *
 * Same flow as /api/admin/login but gated to PLATFORM_ADMIN / SUPER_ADMIN
 * users only. The issued JWT carries `isPlatformAdmin: true` and
 * `weddingId: null`, which the platform middleware uses to grant
 * cross-tenant access on /api/platform/* routes.
 *
 * AuditLog action `PLATFORM_LOGIN` is recorded with `weddingId: null` so
 * platform-level events are easy to filter in the dashboard.
 */
export async function POST(request: NextRequest) {
  try {
    // ─── IP-based rate limit (10 attempts / 15 min) ────────────────────────
    const rateLimitKey = getRateLimitKey(request);
    if (!checkRateLimit(`platform-login-${rateLimitKey}`, 10, 15 * 60 * 1000)) {
      return NextResponse.json(
        { error: 'Too many login attempts. Please try again later.' },
        { status: 429 }
      );
    }

    const body = await request.json().catch(() => null); // P2-CQ-6
    if (!body) {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      );
    }
    const { email, password } = body;

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      );
    }

    // ─── Per-email rate limit (5 attempts / 15 min) ────────────────────────
    const normalizedEmail = email.toLowerCase();
    if (!checkLoginRateLimit(normalizedEmail)) {
      return NextResponse.json(
        { error: 'Too many login attempts. Please try again later.' },
        { status: 429 }
      );
    }

    const user = await db.adminUser.findUnique({
      where: { email: normalizedEmail },
    });

    if (!user) {
      return NextResponse.json(
        { error: 'Invalid email or password' },
        { status: 401 }
      );
    }

    const isValid = await verifyPassword(password, user.password);
    if (!isValid) {
      return NextResponse.json(
        { error: 'Invalid email or password' },
        { status: 401 }
      );
    }

    // ─── Platform-admin gate ───────────────────────────────────────────────
    // Only PLATFORM_ADMIN / SUPER_ADMIN may use this endpoint. Regular
    // wedding organizers must log in via /api/admin/login instead.
    if (!isPlatformAdmin(user.role)) {
      return NextResponse.json(
        { error: 'Platform admin access required' },
        { status: 403 }
      );
    }

    resetLoginRateLimit(normalizedEmail);

    // ─── Issue JWT + cookie ────────────────────────────────────────────────
    // generateToken() embeds weddingId (null here) + isPlatformAdmin flag.
    const token = generateToken({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      weddingId: user.weddingId, // null for platform admins
    });

    // ─── Update lastLoginAt + audit log (P2-SEC-14) ───────────────────
    // (Skipped wrapping POST with withRateLimit — this route already uses
    // checkRateLimit on IP + checkLoginRateLimit on email.)
    await Promise.all([
      db.adminUser.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
      }),
      writeAuditLog({
        weddingId: null, // platform-level event
        userId: user.id,
        action: 'PLATFORM_LOGIN',
        details: `Platform admin ${user.email} logged in`,
        request,
      }),
    ]);

    const publicUser = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      weddingId: user.weddingId,
    };

    const response = NextResponse.json({ user: publicUser, token });
    setAuthCookie(response, token);
    return withSecurityHeaders(response);
  } catch (error) {
    // P2-SEC-1: never log error.stack.
    logger.error('Platform login error', {
      errMessage: error instanceof Error ? error.message : String(error),
      errName: error instanceof Error ? error.name : 'Unknown',
    });
    return internalError();
  }
}
