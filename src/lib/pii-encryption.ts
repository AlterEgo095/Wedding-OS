// ══════════════════════════════════════════════════════════════════════════════
// PII Field Encryption — Mission 6.0 P4.6
// ══════════════════════════════════════════════════════════════════════════════
//
// AES-256-GCM encryption for Guest PII fields (phone, email, personalMessage,
// dietary) at rest. Encrypts BEFORE writing to the DB; decrypts AFTER reading.
//
// ──── Why a separate module from guest-auth.ts? ──────────────────────────────
// guest-auth.ts already exposes `encryptId` / `decryptId` for invitation-link
// tokens. But:
//   1. Those functions use a 16-byte IV (legacy IV_LENGTH=16) and the
//      `<iv>:<tag>:<ciphertext>` format with NO prefix.
//   2. PII fields need a DIFFERENTIABLE format so the decryptor can tell
//      "this value is encrypted PII" vs "this is a plaintext legacy value"
//      vs "this is an encrypted invitation link token" — without that, the
//      transparent decrypt layer in `decryptGuestPii` would corrupt
//      non-PII-encrypted strings.
//   3. PII uses a 12-byte IV (NIST-recommended for GCM; 16-byte IVs are
//      legal but not the standard 96-bit form).
//
// The PII format is: `pii:<iv-hex>:<tag-hex>:<ciphertext-hex>`
//   - `pii:` prefix → unambiguous identifier (decryptGuestPii / isEncryptedPii
//     check for it to decide whether to decrypt or return-as-is).
//   - 12-byte random IV per record (crypto.randomBytes(12)).
//   - 16-byte GCM auth tag (appended by createCipheriv).
//
// ──── Backward compatibility ──────────────────────────────────────────────────
// PII encryption is OPT-IN for this phase. Existing rows in production have
// plaintext `phone`, `email`, `personalMessage`, `dietary` values. The
// `decryptPii()` function detects the `pii:` prefix and ONLY attempts
// decryption when present — otherwise it returns the value AS-IS. This means:
//   - Existing plaintext data continues to work.
//   - New GDPR endpoints (P4.4/P4.5) encrypt on write via encryptGuestPii().
//   - A future migration script can backfill existing rows (encrypt every
//     plaintext value) without breaking reads — the decrypt layer handles both.
//
// ──── Key reuse ───────────────────────────────────────────────────────────────
// Reuses `getEncryptionKey()` from guest-auth.ts (SHA-256 of ENCRYPTION_KEY env
// var → 32-byte AES-256 key). One key, two purposes (link tokens + PII). The
// `pii:` prefix ensures the two ciphertext spaces cannot be confused.

import crypto from 'crypto';
import { getEncryptionKey } from './guest-auth';

// ─── Constants ────────────────────────────────────────────────────────────────
const PII_ALGORITHM = 'aes-256-gcm';
const PII_IV_LENGTH = 12; // NIST-recommended 96-bit IV for GCM
const PII_TAG_LENGTH = 16; // GCM auth tag is always 128 bits
const PII_PREFIX = 'pii:';

// ─── isEncryptedPii ───────────────────────────────────────────────────────────
/**
 * Returns true if `value` is a PII-encrypted string (starts with `pii:`).
 * Null/empty/undefined → false (no PII to decrypt).
 *
 * @example
 *   isEncryptedPii('pii:aabbcc:ddeeff:112233') → true
 *   isEncryptedPii('+243970000000') → false (plaintext phone)
 *   isEncryptedPii(null) → false
 */
export function isEncryptedPii(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.startsWith(PII_PREFIX);
}

// ─── encryptPii ───────────────────────────────────────────────────────────────
/**
 * Encrypt a PII plaintext string for storage at rest.
 *
 * Output format: `pii:<iv-hex>:<tag-hex>:<ciphertext-hex>`
 *   - iv: 12 random bytes (hex, 24 chars)
 *   - tag: 16-byte GCM auth tag (hex, 32 chars)
 *   - ciphertext: AES-256-GCM ciphertext (hex, variable length)
 *
 * Returns `null` for `null`/`undefined` input (preserves nullable columns).
 * Returns empty string for empty-string input (preserves "intentionally empty"
 * semantics — empty ≠ null in some UI contexts).
 *
 * @example
 *   encryptPii('+243970000000') → 'pii:aabb...:ccdd...:eeff...'
 *   encryptPii(null) → null
 *   encryptPii('') → ''
 */
export function encryptPii(plaintext: string | null | undefined): string | null {
  if (plaintext === null || plaintext === undefined) return null;
  if (plaintext === '') return '';

  // Defense-in-depth: if the value is ALREADY encrypted, don't double-encrypt
  // (would make the outer layer's IV/tag point at ciphertext, which is valid
  // but wastes a layer + confuses auditors inspecting the DB).
  if (isEncryptedPii(plaintext)) return plaintext;

  const key = getEncryptionKey();
  const iv = crypto.randomBytes(PII_IV_LENGTH);
  const cipher = crypto.createCipheriv(PII_ALGORITHM, key, iv);

  let ciphertext = cipher.update(plaintext, 'utf8', 'hex');
  ciphertext += cipher.final('hex');
  const tag = cipher.getAuthTag();

  return `${PII_PREFIX}${iv.toString('hex')}:${tag.toString('hex')}:${ciphertext}`;
}

// ─── decryptPii ───────────────────────────────────────────────────────────────
/**
 * Decrypt a PII ciphertext back to plaintext.
 *
 * Behavior:
 *   - `null`/`undefined` → `null` (preserve nullable columns).
 *   - Empty string → empty string.
 *   - String NOT starting with `pii:` → returned AS-IS (legacy plaintext
 *     value — backward-compat for rows written before P4.6 encryption).
 *   - String starting with `pii:` → decrypted via AES-256-GCM. On ANY error
 *     (corrupted IV/tag/ciphertext, wrong key), returns `null` and logs a
 *     warning. Returning null is safer than throwing — a single corrupted
 *     row must not crash a `findMany` that returns 1000 guests.
 *
 * @example
 *   decryptPii('pii:aabb...:ccdd...:eeff...') → '+243970000000'
 *   decryptPii('+243970000000') → '+243970000000' (legacy plaintext, returned as-is)
 *   decryptPii(null) → null
 */
export function decryptPii(ciphertext: string | null | undefined): string | null {
  if (ciphertext === null || ciphertext === undefined) return null;
  if (ciphertext === '') return '';
  if (!isEncryptedPii(ciphertext)) return ciphertext; // legacy plaintext

  try {
    // Strip `pii:` prefix, then split into <iv>:<tag>:<ciphertext>.
    const body = ciphertext.slice(PII_PREFIX.length);
    const parts = body.split(':');
    if (parts.length !== 3) {
      console.warn('decryptPii: malformed ciphertext (expected 3 parts)');
      return null;
    }
    const [ivHex, tagHex, ciphertextHex] = parts;

    const iv = Buffer.from(ivHex, 'hex');
    const tag = Buffer.from(tagHex, 'hex');
    const encrypted = Buffer.from(ciphertextHex, 'hex');

    // Validate lengths to fail fast on obviously-corrupt data.
    if (iv.length !== PII_IV_LENGTH) {
      console.warn(`decryptPii: IV length ${iv.length} != expected ${PII_IV_LENGTH}`);
      return null;
    }
    if (tag.length !== PII_TAG_LENGTH) {
      console.warn(`decryptPii: tag length ${tag.length} != expected ${PII_TAG_LENGTH}`);
      return null;
    }

    const key = getEncryptionKey();
    const decipher = crypto.createDecipheriv(PII_ALGORITHM, key, iv);
    decipher.setAuthTag(tag);

    let decrypted = decipher.update(encrypted, undefined, 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (err) {
    // GCM auth tag mismatch → decipher.final() throws. Wrong key → same.
    // Corrupted hex → Buffer.from throws. All cases: log + return null.
    console.warn('decryptPii: decryption failed', err instanceof Error ? err.message : String(err));
    return null;
  }
}

// ─── rotatePii (future migration helper) ─────────────────────────────────────
/**
 * Re-encrypt a value with a fresh IV (same key). Useful for key rotation
 * or for migrating legacy plaintext values to encrypted form.
 *
 * If the input is plaintext (no `pii:` prefix), it gets encrypted.
 * If the input is already `pii:`-encrypted, it gets re-encrypted with a new IV.
 * If the input is null/empty, it's returned as-is.
 *
 * NOT used by the GDPR endpoints in P4.4/P4.5 — exported for the future
 * backfill migration script (P5.x).
 */
export function rotatePii(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  if (value === '') return '';
  const plaintext = isEncryptedPii(value) ? decryptPii(value) : value;
  if (plaintext === null) return null;
  return encryptPii(plaintext);
}
