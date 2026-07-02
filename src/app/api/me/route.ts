export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { withSecurityHeaders } from '@/lib/rate-limit';

/**
 * GET /api/me — returns the currently-authenticated user (from the httpOnly
 * `auth_token` cookie) or 401 if not authenticated.
 *
 * Used by client-side admin shells (/admin, /platform/admin, /w/[slug]/admin)
 * to determine auth status on mount without storing a token in localStorage
 * (P1-SEC-3 cookie migration).
 *
 * Response (200):
 *   { user: { id, email, name, role, weddingId } }
 *
 * Response (401):
 *   { error: 'Non authentifié' }
 *
 * Note: this endpoint does NOT issue a CSRF token. The login endpoint sets
 * the CSRF cookie alongside the auth cookie; /api/me is for re-hydrating
 * auth state on a page refresh, not for issuing new tokens.
 */
export async function GET(request: NextRequest) {
  const user = await getAuthUser(request);
  if (!user) {
    return withSecurityHeaders(
      NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
    );
  }
  return withSecurityHeaders(
    NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        weddingId: user.weddingId ?? null,
      },
    })
  );
}
