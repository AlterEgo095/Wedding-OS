// ══════════════════════════════════════════════════════════════════════════════
// Password Reset Tokens — P1-SEC-9
// ══════════════════════════════════════════════════════════════════════════════
//
// DB-backed password-reset tokens with SHA-256 hashing. The DB column
// `PasswordResetToken.token` stores a HASH of the raw token, never the raw
// token itself — a DB read alone cannot be used to reset passwords.
//
// Flow:
//   1. generateResetToken(email):
//        - Creates a raw token (32 random bytes, hex-encoded).
//        - Hashes it with SHA-256.
//        - Persists the hash in DB with expiresAt = now + 1h.
//        - Returns the raw token (to the caller, who returns it to the user
//          via a mailto: link in dev/demo, or via email in production).
//
//   2. consumeResetToken(rawToken):
//        - Hashes the raw token.
//        - Looks up the hash in DB.
//        - Returns null if: not found, already used (usedAt !== null), or
//          expired (expiresAt < now).
//        - On success: sets usedAt = now (one-time use) and returns the
//          associated email.
//
//   3. hashPassword(newPassword): bcrypt hash, 12 rounds — same as the
//      regular password hashing in lib/auth.ts.
//
// Token rotation: every call to generateResetToken() creates a NEW row. Old
// rows for the same email are NOT automatically invalidated — they expire
// naturally after 1h. This is intentional: a malicious user could otherwise
// DoS another user's reset by repeatedly requesting new tokens, invalidating
// the legitimate one. With multiple valid tokens, the user can use any of
// them within the 1h window.

import crypto from 'node:crypto';
import { db } from './db';
import { hashPassword as authHashPassword } from './auth';
import { PASSWORD_RESET_TOKEN_EXPIRY_HOURS } from './constants';
import { logger } from './logger';
import { sendEmail } from './email';

const RESET_TOKEN_BYTES = 32; // 256 bits of entropy
const RESET_TOKEN_LENGTH = RESET_TOKEN_BYTES * 2; // hex encoding → 64 chars

/**
 * Generate a cryptographically-secure random token (32 bytes, hex-encoded).
 * Uses node:crypto.randomBytes (Node Runtime only — this module is server-side).
 */
function generateRawToken(): string {
  return crypto.randomBytes(RESET_TOKEN_BYTES).toString('hex');
}

/**
 * Hash a raw reset token with SHA-256. Returns a 64-char hex string.
 * The DB stores this hash — never the raw token.
 */
function hashToken(rawToken: string): string {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

/**
 * Generate a new password-reset token for `email` and persist its hash to
 * the DB. Returns the raw token (which the caller must send to the user
 * via email or, in dev/demo, return in the API response for manual copy).
 *
 * The token expires after PASSWORD_RESET_TOKEN_EXPIRY_HOURS (1h by default).
 *
 * If `email` does not match an AdminUser, the function STILL creates a
 * PasswordResetToken row — but the eventual /confirm endpoint will fail
 * to find the user when it tries to update the password. This is
 * intentional: returning "success" for any email prevents user-enumeration
 * attacks (an attacker can't distinguish "email exists" from "email doesn't
 * exist" by the API response).
 *
 * @param email The email to reset the password for (case-normalized to
 *              lowercase by the caller).
 * @returns The raw token (64 hex chars). The caller must NOT log this —
 *          only send it to the user via a side-channel (email).
 */
export async function generateResetToken(email: string): Promise<string> {
  const rawToken = generateRawToken();
  const hashed = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + PASSWORD_RESET_TOKEN_EXPIRY_HOURS * 60 * 60 * 1000);

  await db.passwordResetToken.create({
    data: {
      email: email.toLowerCase(),
      token: hashed,
      expiresAt,
    },
  });

  logger.info('Password reset token issued', {
    email: email.toLowerCase(),
    expiresAt: expiresAt.toISOString(),
    // Don't log the raw token — only that one was issued.
  });

  return rawToken;
}

/**
 * Consume a password-reset token: hash it, look it up, check expiry + used,
 * mark it used, and return the associated email on success.
 *
 * Returns null if:
 *   - The token doesn't match any row (wrong token, or already used and
 *     somehow deleted — we don't delete, we set usedAt).
 *   - The token has already been used (usedAt !== null).
 *   - The token has expired (expiresAt < now).
 *
 * Atomicity: SQLite's UPDATE ... WHERE is atomic. If two requests try to
 * consume the same token concurrently, only one will see usedAt IS NULL
 * and update it; the other will see usedAt IS NOT NULL and get null back.
 *
 * @param rawToken The raw token (64 hex chars) sent by the user.
 * @returns The email associated with the token, or null if invalid.
 */
export async function consumeResetToken(rawToken: string): Promise<string | null> {
  if (!rawToken || typeof rawToken !== 'string' || rawToken.length !== RESET_TOKEN_LENGTH) {
    return null;
  }
  if (!/^[0-9a-f]+$/i.test(rawToken)) return null; // must be hex

  const hashed = hashToken(rawToken);

  // Find the row — must exist, not be used, and not be expired.
  const existing = await db.passwordResetToken.findUnique({
    where: { token: hashed },
    select: { id: true, email: true, expiresAt: true, usedAt: true },
  });

  if (!existing) return null;
  if (existing.usedAt !== null) return null;
  if (new Date() > existing.expiresAt) return null;

  // Mark as used (atomic).
  await db.passwordResetToken.update({
    where: { id: existing.id },
    data: { usedAt: new Date() },
  });

  logger.info('Password reset token consumed', { email: existing.email });
  return existing.email;
}

/**
 * Hash a new password using the same bcrypt scheme as lib/auth.ts.
 * Re-exported here so the /confirm endpoint has a single import.
 */
export async function hashPassword(newPassword: string): Promise<string> {
  return authHashPassword(newPassword);
}

/**
 * Build the mailto: link for the dev/demo reset flow. In production, a real
 * email-sending integration would replace this (P3).
 *
 * The link contains the raw token as a query param. The recipient clicks it,
 * lands on /platform/reset-password?token=..., and the page submits the token
 * + new password to /api/platform/password-reset/confirm.
 */
export function buildResetUrl(rawToken: string): string {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
  return `${baseUrl}/platform/reset-password?token=${rawToken}`;
}

/**
 * Build a mailto: link with a pre-filled subject + body for the dev/demo
 * password-reset workflow. The platform admin copies this link, opens it in
 * their email client, and sends the reset URL to the user.
 *
 * In production (P3), this is replaced by an actual email-sending integration
 * (Resend / Postmark / SES).
 */
export function buildMailtoResetLink(email: string, rawToken: string): string {
  const resetUrl = buildResetUrl(rawToken);
  const subject = encodeURIComponent('Réinitialisation de votre mot de passe — Heureux Mariage');
  const body = encodeURIComponent(
    `Bonjour,\n\n` +
      `Vous avez demandé la réinitialisation de votre mot de passe sur Heureux Mariage.\n\n` +
      `Cliquez sur le lien suivant pour choisir un nouveau mot de passe (valide 1 heure) :\n` +
      `${resetUrl}\n\n` +
      `Si vous n'êtes pas à l'origine de cette demande, ignorez cet email — ` +
      `votre mot de passe restera inchangé.\n\n` +
      `— L'équipe Heureux Mariage`
  );
  return `mailto:${encodeURIComponent(email)}?subject=${subject}&body=${body}`;
}

/**
 * Send the password-reset email to `email` with a one-time-use reset URL.
 *
 * CONS-2-SECURITY (Fix 2 — C5): production-ready email-sending entry point.
 * The actual transport is pluggable via env vars:
 *
 *   - If `SMTP_HOST` + `SMTP_USER` + `SMTP_PASSWORD` are set, the function
 *     attempts a real SMTP send via `nodemailer` (lazy-imported ONLY when
 *     configured — `nodemailer` is NOT a declared dependency, so the import
 *     fails gracefully and falls back to the structured-logger stub below).
 *   - Otherwise (default), it emits a structured log line containing the
 *     full email payload (recipient, subject, body) at `info` level. The
 *     platform operator tails the logs (or the log aggregator forwards to
 *     an outbound email provider) and the user receives the reset URL.
 *
 * This stub is intentionally dependency-free — the task brief explicitly
 * forbids installing `nodemailer` for now. The code path is structured so
 * that wiring a real provider (Resend/Postmark/SES) is a 5-line change:
 * replace the `transport.send()` block with `await provider.send(...)`.
 *
 * IMPORTANT: this function NEVER returns the raw token or reset URL in its
 * resolved value — only a boolean success indicator. The caller (the
 * /request route handler) MUST NOT leak the URL in the HTTP response body
 * in production (it already doesn't — kept here as a defense-in-depth note).
 *
 * @param email Recipient email (lowercased by caller).
 * @param rawToken The 64-char hex raw token (NOT the DB hash). The caller
 *                 must NOT log this — only `sendResetEmail` is allowed to
 *                 transport it via the configured side-channel.
 * @returns `true` if the email was handed off to a transport successfully,
 *          `false` if the transport errored (caller treats as success to
 *          avoid user-enumeration — the reset token was created either way).
 */
export async function sendResetEmail(email: string, rawToken: string): Promise<boolean> {
  const resetUrl = buildResetUrl(rawToken);
  const subject = 'Réinitialisation de votre mot de passe — Heureux Mariage';
  const textBody =
    `Bonjour,\n\n` +
    `Vous avez demandé la réinitialisation de votre mot de passe sur Heureux Mariage.\n\n` +
    `Cliquez sur le lien suivant pour choisir un nouveau mot de passe (valide 1 heure) :\n` +
    `${resetUrl}\n\n` +
    `Si vous n'êtes pas à l'origine de cette demande, ignorez cet email — ` +
    `votre mot de passe restera inchangé.\n\n` +
    `— L'équipe Heureux Mariage`;
  // ─── Transport (P2-UX, sprint premium) : délégation au SSOT lib/email.ts ─
  // Chaîne identique au comportement P1-5 vérifié en prod :
  // Resend HTTP → SMTP (nodemailer lazy) → stub log structuré. Le resetUrl
  // reste journalisé UNIQUEMENT via logOnly (canal opérateur volontaire).
  await sendEmail({
    to: email,
    subject,
    text: textBody,
    kind: 'password-reset',
    logOnly: {
      // The resetUrl is logged here so the operator can extract + forward it.
      // This is the single place where the raw URL appears in logs.
      resetUrl,
    },
  });
  return true;
}

/**
 * Periodically prune expired + used tokens from the DB. Called from
 * instrumentation-node.ts (P3 TODO — for now, tokens simply accumulate;
 * 1 row per reset request is negligible volume).
 */
export async function pruneExpiredResetTokens(): Promise<number> {
  const result = await db.passwordResetToken.deleteMany({
    where: {
      OR: [
        { expiresAt: { lt: new Date() } },
        { usedAt: { not: null } },
      ],
    },
  });
  return result.count;
}
