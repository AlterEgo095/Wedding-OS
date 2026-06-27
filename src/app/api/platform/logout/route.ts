export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server';
import { clearAuthCookie, getAuthUser } from '@/lib/auth';

/**
 * Platform admin logout endpoint.
 *
 * Clears the `auth_token` cookie so subsequent SSR requests are
 * unauthenticated. The JWT itself is stateless (no server-side session
 * store), so client-side token clearing is sufficient — the cookie is
 * the source of truth for SSR auth.
 *
 * Optional audit log: if we can still identify the user, log a
 * `PLATFORM_LOGOUT` event for traceability.
 */
export async function POST(request: NextRequest) {
  try {
    // Best-effort audit log — don't block logout if it fails.
    try {
      const user = await getAuthUser(request);
      if (user) {
        const { db } = await import('@/lib/db');
        await db.auditLog.create({
          data: {
            weddingId: null, // platform-level event
            userId: user.id,
            action: 'PLATFORM_LOGOUT',
            details: `Platform admin ${user.email} logged out`,
          },
        });
      }
    } catch (auditError) {
      console.error('Platform logout audit log error:', auditError);
    }

    const response = NextResponse.json({ success: true });
    clearAuthCookie(response);
    return response;
  } catch (error) {
    console.error('Platform logout error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
