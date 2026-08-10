// ══════════════════════════════════════════════════════════════════════════════
// EDGE-SAFE IMPERSONATION UTILITIES — Phase 4C fix
// ══════════════════════════════════════════════════════════════════════════════
//
// This file is Edge-Runtime-safe (no node:crypto, no node:os, no db imports).
// The middleware imports from HERE (not from auth.ts) to avoid pulling
// Node.js-only modules into the Edge Runtime.
//
// The full signing/verification functions (signImpersonationToken,
// verifyImpersonationToken, setImpersonationCookie, clearImpersonationCookie)
// remain in auth.ts because they need the JWT secret + db + NextResponse.
// ══════════════════════════════════════════════════════════════════════════════

import jwt from 'jsonwebtoken';

export interface ImpersonationPayload {
  adminUserId: string;
  adminEmail: string;
  targetUserId: string;
  targetName: string;
  targetRole: string;
  targetEmail: string;
  originalToken: string;
  expiresAt: number; // epoch-ms
}

export const IMPERSONATION_COOKIE_NAME = 'impersonation_session';
export const IMPERSONATION_MAX_AGE_MS = 30 * 60 * 1000; // 30 minutes (hard limit)

/**
 * Edge-safe token decode (NO signature verification — pure base64 parse).
 *
 * Used by middleware to detect impersonation sessions and auto-expire them.
 * Signature verification happens server-side in verifyImpersonationToken()
 * (auth.ts) when the actual impersonation start/stop endpoints are called.
 *
 * Security: tampering with the token self-DoSes the user (they get redirected
 * to /platform/admin) but does NOT escalate privileges — the `originalToken`
 * is itself a signed JWT verified by getAuthUser() on the next request.
 */
export function decodeImpersonationToken(token: string): ImpersonationPayload | null {
  try {
    const payload = jwt.decode(token) as ImpersonationPayload | null;
    if (
      !payload ||
      typeof payload.adminUserId !== 'string' ||
      typeof payload.targetUserId !== 'string' ||
      typeof payload.originalToken !== 'string' ||
      typeof payload.expiresAt !== 'number'
    ) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

/**
 * Check if an impersonation session has expired (Edge-safe).
 */
export function isImpersonationExpired(payload: ImpersonationPayload): boolean {
  return Date.now() > payload.expiresAt;
}
