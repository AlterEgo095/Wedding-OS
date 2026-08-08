export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server';
import { clearAuthCookie, getAuthUser } from '@/lib/auth';
import { writeAuditLog } from '@/lib/audit';
import { logger } from '@/lib/logger';

/**
 * Platform admin logout endpoint.
 *
 * Clears the `auth_token` cookie so subsequent SSR requests are
 * unauthenticated. The JWT itself is stateless (no server-side session
 * store), so client-side token clearing is sufficient — the cookie is
 * the source of truth for SSR auth.
 *
 * P1-SEC-7: also clears the `csrf_token` cookie. The CSRF token is a
 * random nonce tied to the now-logged-out session; keeping it around
 * would let an attacker reuse it within the 1h maxAge if they managed
 * to inject a request before the cookie expired.
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
        await writeAuditLog({
          weddingId: null,
          userId: user.id,
          action: 'PLATFORM_LOGOUT',
          details: `Platform admin ${user.email} logged out`,
          request,
        });
      }
    } catch (auditError) {
      // P2-SEC-1: never log error.stack. Audit-log failure must not block logout.
      logger.error('Platform logout audit log error', { err: auditError instanceof Error ? auditError.message : String(auditError) });
    }

    const response = NextResponse.json({ success: true });
    clearAuthCookie(response);
    // P1-SEC-7: clear the CSRF cookie too — invalidate any cached token.
    response.cookies.delete('csrf_token');
    return response;
  } catch (error) {
    // P2-SEC-1: never log error.stack.
    logger.error('Platform logout error', { err: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { error: 'Erreur interne du serveur' },
      { status: 500 }
    );
  }
}
