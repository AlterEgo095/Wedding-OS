// ══════════════════════════════════════════════════════════════════════════════
// Guest PII Helpers — Mission 6.0 P4.6
// ══════════════════════════════════════════════════════════════════════════════
//
// Transparent encrypt/decrypt/anonymize layer for Guest PII fields. Wraps the
// low-level `encryptPii` / `decryptPii` primitives (from pii-encryption.ts)
// with Guest-aware semantics:
//
//   - `encryptGuestPii(guest)` → returns a NEW object with PII fields
//     encrypted (safe to pass to `prisma.guest.create/update`).
//   - `decryptGuestPii(guest)` → returns a NEW object with PII fields
//     decrypted (safe to return in API responses).
//   - `anonymizeGuestPii(guest)` → returns a NEW object with PII scrubbed
//     for GDPR right-to-be-forgotten compliance.
//
// ──── PII fields covered ─────────────────────────────────────────────────────
// Per the task spec + schema.prisma Guest model:
//   - phone          (String?) — direct PII (contact)
//   - email          (String?) — direct PII (contact)
//   - personalMessage (String?) — free-text from organizer to guest
//                                 (may contain names, dates, references)
//   - dietary        (String?) — health info (special category under GDPR Art. 9)
//
// NOT encrypted (kept as plaintext in DB):
//   - firstName / lastName / displayName — these are routinely shown in admin
//     lists, exports, table cards, etc. Encrypting them would break every
//     guest-list query. They ARE anonymized by `anonymizeGuestPii` (replaced
//     with "Anonymized" / "User"), but not encrypted at rest in normal
//     operation. A future hardening pass could encrypt these too.
//   - invitationCode — required in plaintext for QR code generation + lookup.
//     Anonymization hashes it (irreversible) so the original code can't be
//     reconstructed from the anonymized record.
//   - status, checkedIn, rsvpAt, etc. — operational metadata, not PII.
//
// ──── Why a NEW object instead of mutating? ───────────────────────────────────
// All three helpers return a SHALLOW CLONE with PII fields replaced. The
// input object is never mutated — callers can safely use the original
// (encrypted) form for DB operations and the returned (decrypted) form for
// API responses without one clobbering the other.

import { encryptPii, decryptPii, isEncryptedPii } from './pii-encryption';
import crypto from 'crypto';

// The 4 PII fields that get encrypted at rest.
export const GUEST_PII_FIELDS = ['phone', 'email', 'personalMessage', 'dietary'] as const;
export type GuestPiiField = (typeof GUEST_PII_FIELDS)[number];

// Lightweight input type — accepts any partial guest-shaped object.
export interface GuestPiiInput {
  phone?: string | null;
  email?: string | null;
  personalMessage?: string | null;
  dietary?: string | null;
  [key: string]: unknown;
}

// ─── encryptGuestPii ─────────────────────────────────────────────────────────
/**
 * Returns a NEW object with the 4 PII fields encrypted (via encryptPii).
 * Non-PII fields are passed through unchanged.
 *
 * Safe to call on objects that will be passed to `prisma.guest.create` or
 * `prisma.guest.update`. Already-encrypted values are NOT re-encrypted
 * (encryptPii's defense-in-depth check).
 *
 * @example
 *   const dbPayload = encryptGuestPii({
 *     firstName: 'Josue',
 *     phone: '+243970000000',
 *     email: 'josue@example.com',
 *   });
 *   await tenantDb.guest.create({ data: dbPayload });
 */
export function encryptGuestPii<T extends GuestPiiInput>(guest: T): T {
  const out: T = { ...guest };
  if (guest.phone !== undefined) (out as Record<string, unknown>).phone = encryptPii(guest.phone);
  if (guest.email !== undefined) (out as Record<string, unknown>).email = encryptPii(guest.email);
  if (guest.personalMessage !== undefined) (out as Record<string, unknown>).personalMessage = encryptPii(guest.personalMessage);
  if (guest.dietary !== undefined) (out as Record<string, unknown>).dietary = encryptPii(guest.dietary);
  return out;
}

// ─── decryptGuestPii ─────────────────────────────────────────────────────────
/**
 * Returns a NEW object with the 4 PII fields decrypted (via decryptPii).
 * Non-PII fields are passed through unchanged.
 *
 * Transparently handles:
 *   - `pii:`-prefixed values (encrypted) → decrypted plaintext.
 *   - Plaintext values (legacy rows) → returned AS-IS.
 *   - null/empty → preserved.
 *
 * @example
 *   const guest = await tenantDb.guest.findUnique({ where: { id } });
 *   return NextResponse.json({ guest: decryptGuestPii(guest) });
 */
export function decryptGuestPii<T extends Record<string, unknown>>(guest: T): T {
  const out: T = { ...guest };
  for (const field of GUEST_PII_FIELDS) {
    const raw = guest[field];
    if (typeof raw === 'string' || raw === null) {
      (out as Record<string, unknown>)[field] = decryptPii(raw as string | null);
    }
    // If the field is missing (undefined), leave it as undefined — don't
    // inject `null` into objects that didn't have the key in the first place.
  }
  return out;
}

// ─── anonymizeGuestPii ───────────────────────────────────────────────────────
/**
 * GDPR right-to-be-forgotten: returns a NEW object with PII scrubbed.
 *
 * The returned object is suitable for `prisma.guest.update({ data: ... })` —
 * it replaces identifying fields with non-identifying values while preserving
 * the row for audit (so the wedding's guest count, RSVP stats, and check-in
 * history remain accurate; only the IDENTITY of the guest is removed).
 *
 * Field-by-field:
 *   - firstName → 'Anonymized'
 *   - lastName  → 'User'
 *   - displayName → null
 *   - phone → null
 *   - email → null
 *   - personalMessage → null
 *   - dietary → null
 *   - rsvpMessage → null
 *   - invitationCode → SHA-256(invitationCode)[:32] (hashed, irreversible —
 *       preserves uniqueness constraint @@unique([weddingId, invitationCode])
 *       so a re-import won't collide, but the original code can't be
 *       recovered from the anonymized row)
 *
 * Preserved (NOT anonymized — needed for audit + analytics):
 *   - id, weddingId — required for foreign-key integrity (GuestSession,
 *     GuestAccessLog, GuestbookEntry, DeliveryJob all reference guestId).
 *   - status, checkedIn, checkedInAt — operational state for the wedding's
 *     check-in dashboard.
 *   - seats, category — aggregate stats (confirmed seats per category).
 *   - rsvpAt, rsvpPlusOne, invitationViewed, invitationViewCount,
 *     lastAccessAt, createdAt, updatedAt — analytics + audit timeline.
 *   - invitationType, tableId, familyId, groupId — structural relations
 *     (table seating, family grouping) — NOT identity.
 *
 * @example
 *   const guest = await tenantDb.guest.findFirst({ where: { id: guestId } });
 *   const anonymized = anonymizeGuestPii(guest);
 *   await tenantDb.guest.update({ where: { id: guestId }, data: anonymized });
 */
export function anonymizeGuestPii<T extends Record<string, unknown>>(guest: T): Record<string, unknown> {
  // Start from the input to preserve any fields we don't explicitly touch.
  const out: Record<string, unknown> = { ...guest };

  // ─── PII fields → null ────────────────────────────────────────────────────
  out.phone = null;
  out.email = null;
  out.personalMessage = null;
  out.dietary = null;
  out.rsvpMessage = null;
  out.displayName = null;

  // ─── Name fields → anonymized placeholders ────────────────────────────────
  // Keep them as non-null strings (schema requires `String` non-nullable for
  // firstName/lastName). "Anonymized User" reads naturally in admin lists.
  out.firstName = 'Anonymized';
  out.lastName = 'User';

  // ─── invitationCode → irreversible hash ───────────────────────────────────
  // The schema's @@unique([weddingId, invitationCode]) constraint means we
  // can't just null this out. Hash it with SHA-256, take the first 32 hex
  // chars (16 bytes / 128 bits — collision-resistant for guest-code scale).
  // The hash is deterministic, so a re-import of the same invitation code
  // would produce the same hash → same anonymized value → no constraint
  // violation. But the original code CANNOT be recovered from the hash.
  const originalCode = typeof guest.invitationCode === 'string' ? guest.invitationCode : '';
  out.invitationCode = originalCode
    ? crypto.createHash('sha256').update(originalCode).digest('hex').substring(0, 32)
    : 'anonymized-' + crypto.randomBytes(8).toString('hex');

  return out;
}

// ─── isGuestPiiEncrypted ─────────────────────────────────────────────────────
/**
 * Returns true if ANY of the 4 PII fields on the guest are encrypted.
 * Useful for the future migration script to find rows that still need
 * backfilling.
 *
 * @example
 *   const guests = await unsafePlatformDb.guest.findMany();
 *   const needMigration = guests.filter(g => !isGuestPiiEncrypted(g));
 */
export function isGuestPiiEncrypted(guest: Record<string, unknown>): boolean {
  for (const field of GUEST_PII_FIELDS) {
    const value = guest[field];
    if (typeof value === 'string' && isEncryptedPii(value)) {
      return true;
    }
  }
  return false;
}
