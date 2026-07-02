export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { verifyPassword, generateToken, checkLoginRateLimit, resetLoginRateLimit, setAuthCookie } from '@/lib/auth';
import { getRateLimitKey, checkRateLimit, withSecurityHeaders } from '@/lib/rate-limit';

export async function POST(request: NextRequest) {
  try {
    const rateLimitKey = getRateLimitKey(request);
    if (!checkRateLimit(`login-${rateLimitKey}`, 10, 15 * 60 * 1000)) {
      return NextResponse.json(
        { error: 'Too many login attempts. Please try again later.' },
        { status: 429 }
      );
    }

    const body = await request.json();
    const { email, password } = body;

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      );
    }

    if (!checkLoginRateLimit(email.toLowerCase())) {
      return NextResponse.json(
        { error: 'Too many login attempts. Please try again later.' },
        { status: 429 }
      );
    }

    const user = await db.adminUser.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (!user) {
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
    }

    const isValid = await verifyPassword(password, user.password);
    if (!isValid) {
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
    }

    resetLoginRateLimit(email.toLowerCase());

    // Token now includes weddingId claim (set in auth.ts generateToken)
    const token = generateToken({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      weddingId: user.weddingId,
    });

    await db.auditLog.create({
      data: {
        weddingId: user.weddingId, // null for SUPER_ADMIN
        userId: user.id,
        action: 'LOGIN',
        details: `User ${user.email} logged in`,
      },
    });

    const response = NextResponse.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        weddingId: user.weddingId,
      },
    });

    // SECURITY (P1-SEC-4): Set httpOnly cookie in addition to returning the
    // token in the JSON body. The cookie is the secure default — the body
    // token is kept for backwards compatibility with clients that read it,
    // but new clients should rely on the cookie (auto-sent, not XSS-exfiltrable).
    setAuthCookie(response, token);

    return withSecurityHeaders(response);
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
