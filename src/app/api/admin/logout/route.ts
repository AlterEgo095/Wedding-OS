export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { clearAuthCookie, getAuthUser } from '@/lib/auth';
import { writeAuditLog } from '@/lib/audit';

/**
 * Per-wedding admin logout endpoint.
 *
 * P1-SEC-3: clears the httpOnly `auth_token` cookie. The legacy admin SPA
 * (src/app/admin/page.tsx) used to rely solely on localStorage; the cookie
 * migration makes the cookie the source of truth, so we MUST clear it
 * server-side here too.
 *
 * P1-SEC-7: also clears the `csrf_token` cookie. The CSRF token is a
 * random nonce tied to the now-logged-out session; keeping it around
 * would let an attacker reuse it within the 1h maxAge.
 *
 * Optional audit log: if we can still identify the user, log a `LOGOUT`
 * event for traceability.
 */
export async function POST(request: NextRequest) {
  try {
    // Best-effort audit log — don't block logout if it fails.
    try {
      const user = await getAuthUser(request);
      if (user) {
        await writeAuditLog({
          weddingId: user.weddingId, // null for SUPER_ADMIN
          userId: user.id,
          action: 'LOGOUT',
          details: `User ${user.email} logged out`,
          request,
        });
      }
    } catch (auditError) {
      // P2-SEC-1: never log error.stack. Audit-log failure must not block logout.
      console.error('Admin logout audit log error:', auditError instanceof Error ? auditError.message : String(auditError));
    }

    const response = NextResponse.json({ success: true });
    clearAuthCookie(response);
    // P1-SEC-7: clear the CSRF cookie too — invalidate any cached token.
    response.cookies.delete('csrf_token');
    return response;
  } catch (error) {
    // P2-SEC-1: never log error.stack.
    console.error('Admin logout error:', error instanceof Error ? error.message : String(error));
    return NextResponse.json(
      { error: 'Erreur interne du serveur' },
      { status: 500 }
    );
  }
}
