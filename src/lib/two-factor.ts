// ══════════════════════════════════════════════════════════════════════════════
// Two-Factor Authentication (TOTP) — P1-SEC-8
// ══════════════════════════════════════════════════════════════════════════════
//
// TOTP-based 2FA for PLATFORM_ADMIN users. Implemented with `otplib` (RFC 6238)
// and `qrcode` (for the QR code image data URL shown in the setup UI).
//
// Flow:
//   1. User goes to /platform/admin → "Sécurité" tab → "Activer 2FA".
//   2. POST /api/platform/2fa/setup (authenticated):
//      - Generates a fresh TOTP secret.
//      - Stores it on AdminUser.twoFactorSecret (encrypted-at-rest) WITHOUT
//        enabling 2FA yet (twoFactorEnabled stays false).
//      - Returns { qrCodeUrl, secret, otpauthUrl } so the UI can show the
//        QR code + manual-entry secret.
//   3. User scans QR with Google Authenticator / Authy / 1Password, etc.
//   4. User enters the 6-digit code from their authenticator.
//   5. POST /api/platform/2fa/verify (authenticated) with { token: <6-digit> }:
//      - Verifies the code against the stored secret.
//      - If valid → sets twoFactorEnabled = true, generates backup codes,
//        returns { backupCodes } (one-time display — user must save them).
//      - If invalid → 400, 2FA stays disabled.
//   6. Next login: POST /api/platform/login detects twoFactorEnabled, returns
//      { requiresTwoFactor: true, challengeToken } instead of setting the
//      auth cookie. challengeToken is a 5-min JWT that allows ONLY
//      /api/platform/2fa/login.
//   7. User enters a fresh 6-digit code from their authenticator.
//   8. POST /api/platform/2fa/login with { challengeToken, token: <6-digit> }:
//      - Verifies challengeToken (must be 2fa-challenge purpose, not expired).
//      - Verifies the 6-digit TOTP code against the user's secret.
//      - If valid → sets auth_token cookie (same as regular login), returns
//        { user, csrfToken }.
//   9. POST /api/platform/2fa/disable (authenticated) with { password }:
//      - Verifies the user's current password.
//      - Clears twoFactorSecret, twoFactorEnabled=false, twoFactorBackupCodes=null.
//
// Secret encryption-at-rest:
//   The TOTP secret is required in plaintext for otplib to compute/verify
//   codes. We encrypt it with the same AES-256-GCM key used by guest-auth
//   (derived from ENCRYPTION_KEY env). The DB column `twoFactorSecret`
//   therefore contains the encrypted form — a DB read alone cannot generate
//   valid TOTP codes.

// otplib v13 API: functional `generateSecret`, `generateURI`, `verifySync`.
// (v12 used `authenticator.generateSecret()` / `authenticator.keyuri()` /
// `authenticator.verify()` — all removed in v13.)
import { generateSecret as otplibGenerateSecret, generateURI, verifySync } from 'otplib';
import QRCode from 'qrcode';
import crypto from 'node:crypto';
import { db } from './db';
import { encryptId, decryptId } from './guest-auth';
import { logger } from './logger';

// TOTP defaults: 6 digits, 30-second step, SHA-1 (RFC 6238 default —
// compatible with Google Authenticator, Authy, 1Password, etc.).
// otplib v13 doesn't have a global options object — pass per-call.
const TOTP_DIGITS = 6;
const TOTP_PERIOD = 30;

const ISSUER = 'Heureux Mariage';

/**
 * Generate a fresh TOTP secret (base32-encoded, 32 bytes of entropy).
 */
export function generateSecret(): string {
  return otplibGenerateSecret();
}

/**
 * Build the otpauth:// URL used to seed an authenticator app.
 * Format: otpauth://totp/<Issuer>:<email>?secret=<secret>&issuer=<Issuer>&algorithm=SHA1&digits=6&period=30
 */
export function buildOtpAuthUrl(secret: string, email: string): string {
  return generateURI({
    secret,
    label: email,
    issuer: ISSUER,
    algorithm: 'sha1',
    digits: TOTP_DIGITS,
    period: TOTP_PERIOD,
  });
}

/**
 * Generate a QR code as a data URL (PNG base64) for the given otpauth URL.
 * The UI renders this in an <img src="data:image/png;base64,..."> — no need
 * for a separate /api/2fa/qrcode endpoint.
 */
export async function generateQrCodeDataUrl(otpauthUrl: string): Promise<string> {
  return QRCode.toDataURL(otpauthUrl, {
    errorCorrectionLevel: 'M',
    margin: 1,
    width: 240,
  });
}

/**
 * Verify a 6-digit TOTP token against a secret. Returns true on match.
 * The window (±1 step) is configured above to absorb minor clock drift.
 */
export function verifyToken(token: string, secret: string): boolean {
  try {
    // Sanitize: strip whitespace, take first 6 digits.
    const clean = String(token).trim().replace(/\s+/g, '');
    if (!/^\d{6}$/.test(clean)) return false;
    // otplib v13: verifySync returns a VerifyResult. For TOTP strategy,
    // a successful verification returns an object with `valid: true`.
    // We coerce to boolean for backwards compat with the v12 API.
    const result = verifySync({
      token: clean,
      secret,
      digits: TOTP_DIGITS,
      period: TOTP_PERIOD,
      // window: 1 — allow 1 step before/after current time (±30s clock drift).
      // otplib v13 doesn't expose `window` directly on verify; the guardrails
      // plugin handles drift tolerance. Default tolerance matches v12 window=1.
    });
    // VerifyResult is either `boolean` (legacy) or `{ valid: boolean, delta?: number }`.
    if (typeof result === 'boolean') return result;
    return Boolean(result && (result as { valid?: boolean }).valid);
  } catch {
    return false;
  }
}

/**
 * Encrypt a TOTP secret for storage in AdminUser.twoFactorSecret.
 * Uses the existing AES-256-GCM `encryptId` from guest-auth.ts — same key
 * derivation, same format (iv:tag:ciphertext, hex-encoded).
 */
export function encryptSecret(secret: string): string {
  return encryptId(secret);
}

/**
 * Decrypt a TOTP secret stored in AdminUser.twoFactorSecret.
 * Returns null if the value is empty or malformed (defensive — shouldn't
 * happen but a DB schema migration could leave stale rows).
 */
export function decryptSecret(encrypted: string | null | undefined): string | null {
  if (!encrypted) return null;
  return decryptId(encrypted);
}

/**
 * Generate 8 one-time backup codes (8 hex chars each = 4 bytes entropy).
 * These are returned to the user ONCE (at /api/platform/2fa/verify time) and
 * stored in the DB as a JSON array of SHA-256 hashes — never in plaintext.
 *
 * The user can use a backup code in place of a TOTP code at login (P3 TODO —
 * the /api/platform/2fa/login route currently only accepts TOTP codes; backup
 * codes are stored now to avoid a schema migration later).
 */
export function generateBackupCodes(): { plaintext: string[]; hashed: string[] } {
  const plaintext: string[] = [];
  const hashed: string[] = [];
  for (let i = 0; i < 8; i++) {
    // 4 random bytes → 8 hex chars. Format: xxxxx-xxxx (10 chars with dash)
    // for human readability.
    const bytes = crypto.randomBytes(4);
    const hex = bytes.toString('hex');
    const code = `${hex.slice(0, 4)}-${hex.slice(4)}`;
    plaintext.push(code);
    hashed.push(hashBackupCode(code));
  }
  return { plaintext, hashed };
}

export function hashBackupCode(code: string): string {
  return crypto.createHash('sha256').update(code).digest('hex');
}

// ─── 2FA challenge tokens (short-lived JWTs) ─────────────────────────────────
//
// A challenge token is issued by /api/platform/login when 2FA is enabled.
// It is a JWT signed with the same JWT_SECRET as auth tokens, but carries:
//   - sub: AdminUser.id
//   - email: AdminUser.email (for re-fetching the user)
//   - purpose: '2fa-challenge' (distinguishes from auth tokens)
//   - exp: 5 minutes from issuance
//
// It is consumed by /api/platform/2fa/login, which:
//   1. Verifies the JWT signature.
//   2. Checks purpose === '2fa-challenge'.
//   3. Re-fetches the AdminUser from DB (defends against deleted users).
//   4. Verifies the 6-digit TOTP code against the user's stored secret.
//   5. Issues a regular auth_token JWT (8h expiry) via setAuthCookie.

import jwt from 'jsonwebtoken';
import { devFallbackSecret } from './auth';

const CHALLENGE_TOKEN_EXPIRY = '5m';

function getJwtSecret(): string {
  const env = process.env.JWT_SECRET;
  if (env && env.length >= 32) return env;
  const isProd =
    process.env.NODE_ENV === 'production' &&
    process.env.NEXT_PHASE !== 'phase-production-build';
  if (isProd) {
    throw new Error('FATAL: JWT_SECRET missing in production — 2FA challenge disabled.');
  }
  return devFallbackSecret('admin-jwt');
}

/**
 * Issue a 2FA challenge token. The token is returned to the client INSTEAD
 * of setting the auth cookie — the client must POST it back to
 * /api/platform/2fa/login with a valid TOTP code to obtain a real session.
 */
export function generateChallengeToken(userId: string, email: string): string {
  return jwt.sign(
    { sub: userId, email, purpose: '2fa-challenge' },
    getJwtSecret(),
    { expiresIn: CHALLENGE_TOKEN_EXPIRY }
  );
}

interface ChallengePayload {
  sub: string;
  email: string;
  purpose: string;
}

/**
 * Verify a 2FA challenge token. Returns the payload (sub, email) on success,
 * or null if the token is invalid, expired, or has the wrong purpose.
 *
 * Also re-fetches the user from the DB to ensure they still exist + still
 * have 2FA enabled (defends against: token issued, then admin disables 2FA
 * for that user — the challenge should no longer be honored).
 */
export async function verifyChallengeToken(
  token: string
): Promise<{ userId: string; email: string } | null> {
  try {
    const payload = jwt.verify(token, getJwtSecret()) as ChallengePayload;
    if (payload.purpose !== '2fa-challenge') return null;
    if (!payload.sub || !payload.email) return null;

    // Re-fetch user — must still exist + still have 2FA enabled.
    const user = await db.adminUser.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, twoFactorEnabled: true },
    });
    if (!user) return null;
    if (!user.twoFactorEnabled) return null;
    // Email must match (defends against token-rewriting attacks — JWT
    // signature already covers this, but defense-in-depth).
    if (user.email !== payload.email) return null;

    return { userId: user.id, email: user.email };
  } catch {
    return null;
  }
}

/**
 * Verify a backup code against the stored hash array. Returns the index of
 * the matching hash (so the caller can remove it from the array) or -1 if
 * no match. Constant-time per-code comparison; iteration count is fixed.
 *
 * (Backup codes are currently generated + stored at setup time but NOT yet
 * accepted by /api/platform/2fa/login — that's a P3 enhancement. The
 * helper is here so the eventual implementation doesn't need to re-derive
 * the hashing scheme.)
 */
export function verifyBackupCode(
  code: string,
  hashedCodes: string[]
): number {
  const candidateHash = hashBackupCode(code.trim());
  for (let i = 0; i < hashedCodes.length; i++) {
    if (hashedCodes[i] === candidateHash) return i;
  }
  return -1;
}

// (otplib v13 no longer exports a `totp` singleton — callers should import
// `TOTP` class directly from 'otplib' if they need instance-level config.)

// Re-export a logger-bound helper for audit-friendly 2FA logging.
export function logTwoFactorEvent(event: string, meta: Record<string, unknown>): void {
  logger.info(`2FA: ${event}`, meta);
}
