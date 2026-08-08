// ══════════════════════════════════════════════════════════════════════════════
// DNS Verification — P5.2-2 (Node.js-only, NOT Edge-safe)
// ══════════════════════════════════════════════════════════════════════════════
//
// This module is intentionally SEPARATE from custom-domains.ts because it uses
// Node.js built-in modules (node:crypto, node:dns/promises) that are NOT
// available in the Edge runtime. The middleware imports from custom-domains.ts
// (which is Edge-safe), so these functions must live here to avoid polluting
// the Edge bundle.
//
// API route handlers (which run on the Node.js runtime) import from this file.
// The middleware NEVER imports from this file.

import { createHash } from 'node:crypto';
import { resolveTxt } from 'node:dns/promises';

/**
 * Compute a deterministic DNS verification token for a (weddingId, domain)
 * pair. The same couple+domain always gets the same token, so the TXT record
 * they add once keeps working across re-verification attempts — but a
 * different wedding claiming the same domain gets a different token, so a
 * squatter cannot reuse another wedding's TXT record.
 *
 * Format: `hm-verify-<16 hex chars>` (16 chars = 8 bytes of SHA-256).
 */
export function buildVerificationToken(weddingId: string, domain: string): string {
  const normalized = domain.toLowerCase().trim();
  const hash = createHash('sha256')
    .update(`${weddingId}:${normalized}`)
    .digest('hex');
  return `hm-verify-${hash.slice(0, 16)}`;
}

/**
 * Perform the DNS TXT lookup for `_heureux-mariage.{domain}` and verify
 * that the expected verification token is present in at least one record.
 *
 * Uses Node's built-in `dns/promises` (no external deps). Resolves with a
 * structured result so callers can surface useful diagnostics to the user.
 *
 * Failure modes (all gracefully handled, none throw):
 *   - NXDOMAIN / ENOTFOUND  → verified=false, reason='NO_RECORD'
 *   - DNS timeout           → verified=false, reason='TIMEOUT'
 *   - Resolver error        → verified=false, reason='RESOLVER_ERROR'
 *   - Records found but no match → verified=false, reason='TOKEN_MISMATCH'
 */
export async function verifyDnsRecord(
  domain: string,
  expectedToken: string
): Promise<{
  verified: boolean;
  reason: 'OK' | 'NO_RECORD' | 'TOKEN_MISMATCH' | 'TIMEOUT' | 'RESOLVER_ERROR';
  records: string[];
  lookupName: string;
}> {
  const normalized = domain.toLowerCase().trim();
  const lookupName = `_heureux-mariage.${normalized}`;

  let records: string[] = [];
  try {
    const result = await resolveTxt(lookupName);
    records = result.map((r) => r.join(''));
  } catch (err) {
    const code = (err as NodeJS.ErrnoException)?.code;
    if (code === 'ENOTFOUND' || code === 'ENODATA') {
      return { verified: false, reason: 'NO_RECORD', records: [], lookupName };
    }
    if (code === 'ETIMEDOUT' || code === 'ESERVFAIL') {
      return { verified: false, reason: 'TIMEOUT', records: [], lookupName };
    }
    return { verified: false, reason: 'RESOLVER_ERROR', records: [], lookupName };
  }

  const matched = records.some(
    (r) => r === expectedToken || r === `hm-verify=${expectedToken}`
  );

  return {
    verified: matched,
    reason: matched ? 'OK' : 'TOKEN_MISMATCH',
    records,
    lookupName,
  };
}
