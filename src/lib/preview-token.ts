// ══════════════════════════════════════════════════════════════════════════════
// src/lib/preview-token.ts
// Phase 5.9.0 POST-PHASE-3 — Signed-token preview access for the Preview Lab
// ══════════════════════════════════════════════════════════════════════════════
//
// Server-only utility for issuing + verifying Preview Lab signed tokens.
//
// PROBLEM (Phase 4A遗留):
//   The Preview Lab iframe loads /w/[slug]?preview=true. The public wedding
//   route checks `searchParams.preview === 'true'` to bypass guest auth
//   (read-only mode). But `?preview=true` is just a query param — anyone who
//   guesses it can bypass guest auth. There's NO signed token and NO expiry.
//   A leaked preview link is permanently accessible.
//
// SOLUTION:
//   Tokens are JWTs signed with JWT_SECRET (same as auth tokens), containing:
//     - wid:   wedding slug (string) — bound to a specific wedding
//     - admin: admin user id (string) — bound to the issuing platform admin
//     - iat:   issued-at (auto by jwt.sign)
//     - exp:   expiry (24h, auto by jwt.sign)
//
//   The token is passed as `?preview=true&token=xxx` on /w/[slug]. The public
//   route calls `verifyPreviewToken(token, slug)` BEFORE granting read-only
//   preview access. If the token is missing or invalid, the route falls
//   through to the normal guest-auth flow (preview mode NOT granted).
//
// SECURITY PROPERTIES:
//   - SHORT-LIVED: 24h max. After expiry, the admin must re-issue via
//     /api/platform/preview-token/{slug} (PLATFORM_ADMIN only, rate-limited,
//     audit-logged).
//   - WEDDING-BOUND: a token for wedding A cannot preview wedding B — the
//     verifier checks `decoded.wid === expectedWeddingSlug`.
//   - ADMIN-BOUND: a token carries the issuing admin's user id. If a leaked
//     token is identified, the audit log shows which admin issued it (and
//     when). Revocation is by expiry (no blocklist — short TTL makes this
//     acceptable; a stolen token dies within 24h).
//   - READ-ONLY: the token only bypasses the GUEST AUTH GATE. It does NOT
//     grant write access (no RSVP, no guestbook, no guest session). The
//     preview route is read-only by design.
//
// RUNTIME: server-only. Imports `jsonwebtoken` (Node-only). Do NOT import
// this module from Edge middleware or client components.

import jwt from 'jsonwebtoken';

// ─── Secret ──────────────────────────────────────────────────────────────────
//
// Mirrors the auth-token secret strategy (src/lib/auth.ts): in production,
// JWT_SECRET is REQUIRED (the route fails closed if absent). In dev, a
// machine-derived fallback is used (see devFallbackSecret in auth.ts). We
// import + reuse the same secret so preview tokens are signed with the same
// key as admin auth tokens — a single rotation point.
//
// To avoid pulling the full auth.ts module (which transitively imports
// prisma, next/headers, etc.), we read the env var directly here. The
// dev-fallback uses the same SHA-256 machine-fingerprint as auth.ts.

import { createHash } from 'node:crypto';
import os from 'node:os';

function previewTokenSecret(): string {
  const env = process.env.JWT_SECRET;
  if (env && env.length >= 32) return env;

  const isProd =
    process.env.NODE_ENV === 'production' &&
    process.env.NEXT_PHASE !== 'phase-production-build';
  if (isProd) {
    // Hard fail — preview-token issuance/verification is disabled in prod
    // without JWT_SECRET. The Preview Lab will fall back to guest-auth
    // preview (no bypass), which is a degraded UX but not a security hole.
    throw new Error(
      'FATAL: JWT_SECRET is missing or too short (<32 chars) in production. ' +
        'Preview-token issuance is disabled until JWT_SECRET is set.'
    );
  }

  // Dev-only fallback — derived from machine signals (matches auth.ts).
  // Stable across restarts on the same machine, differs across machines.
  const username = (() => {
    try {
      return os.userInfo().username;
    } catch {
      return 'unknown';
    }
  })();
  const seed = `preview-token:${process.cwd()}:${os.hostname()}:${username}`;
  return createHash('sha256').update(seed).digest('hex');
}

// ─── TTL ─────────────────────────────────────────────────────────────────────

export const PREVIEW_TOKEN_TTL_SECONDS = 24 * 60 * 60; // 24 hours

// ─── Payload types ───────────────────────────────────────────────────────────

export interface PreviewTokenPayload {
  /** Wedding slug the token is bound to. Verifier checks wid === slug. */
  wid: string;
  /** AdminUser.id of the issuing platform admin (for audit trail). */
  admin: string;
}

export interface PreviewTokenDecoded extends PreviewTokenPayload {
  /** Issued-at (unix seconds, auto-populated by jwt.sign). */
  iat: number;
  /** Expiry (unix seconds, auto-populated by jwt.sign). */
  exp: number;
}

// ─── Issue ───────────────────────────────────────────────────────────────────

/**
 * Issue a 24h preview token bound to (weddingSlug, adminUserId).
 *
 * Called by /api/platform/preview-token/{slug} (PLATFORM_ADMIN only).
 * The token is returned to the Preview Lab client, which appends it as
 * `?token=xxx` on the iframe URL.
 *
 * @param weddingSlug  The wedding's slug — the token is bound to this.
 * @param adminUserId  The issuing platform admin's AdminUser.id.
 * @returns Signed JWT string.
 */
export function issuePreviewToken(
  weddingSlug: string,
  adminUserId: string
): string {
  if (!weddingSlug || !adminUserId) {
    throw new Error(
      'issuePreviewToken: weddingSlug and adminUserId are required'
    );
  }
  return jwt.sign(
    { wid: weddingSlug, admin: adminUserId },
    previewTokenSecret(),
    { expiresIn: PREVIEW_TOKEN_TTL_SECONDS }
  );
}

// ─── Verify ──────────────────────────────────────────────────────────────────

/**
 * Verify a preview token against an expected wedding slug.
 *
 * Called by /w/[slug]/page.tsx (Server Component) before granting preview
 * mode. Returns the decoded payload on success, or null on any failure
 * (expired, invalid signature, malformed, wedding-slug mismatch).
 *
 * Defense-in-depth: the wedding-slug binding is checked in addition to the
 * JWT signature. A token issued for wedding A cannot preview wedding B even
 * if the signature is valid — `decoded.wid` MUST equal `expectedWeddingSlug`.
 *
 * @param token               The JWT string from ?token=xxx.
 * @param expectedWeddingSlug The wedding slug from the route's [slug] param.
 * @returns Decoded payload on success, null on any failure.
 */
export function verifyPreviewToken(
  token: string,
  expectedWeddingSlug: string
): PreviewTokenDecoded | null {
  if (!token || !expectedWeddingSlug) return null;
  try {
    const decoded = jwt.verify(token, previewTokenSecret()) as PreviewTokenDecoded;
    if (!decoded || typeof decoded !== 'object') return null;
    if (typeof decoded.wid !== 'string' || typeof decoded.admin !== 'string') {
      return null;
    }
    // Bind to expected wedding slug (defense-in-depth — a token for wedding A
    // must NOT grant preview access to wedding B).
    if (decoded.wid !== expectedWeddingSlug) return null;
    return decoded;
  } catch {
    // expired, invalid signature, malformed — all return null (fail-closed)
    return null;
  }
}
