// ══════════════════════════════════════════════════════════════════════════════
// Custom Domains — Phase 8 Custom Domain Support
// ══════════════════════════════════════════════════════════════════════════════
//
// Premium/Élite weddings can map a custom domain (e.g. mariage-awa-david.fr)
// to their wedding page. The reverse proxy (Caddy/nginx) routes:
//   - wedding.hpph.net/{slug}  → default domain (multi-tenant)
//   - {custom-domain}                    → /w/{slug} (wildcard cert required)
//
// This module validates domains and checks plan eligibility.
//
// P5.2-2 (PRE-P5.X-AUDIT-B, HIGH-4): DNS verification is now ACTIVE.
// The flow is:
//   1. ORGANIZER / Super Admin sets `customDomain` on a wedding →
//      `customDomainVerified` is reset to false and the response carries the
//      TXT record they must add (buildDnsVerificationRecord).
//   2. The couple adds the TXT record at their DNS provider.
//   3. They call POST /api/platform/weddings/{id}/verify-domain (or the
//      organizer-scoped /api/weddings/{id}/verify-domain) → the endpoint runs
//      verifyDnsRecord(), which performs a DNS TXT lookup for
//      `_heureux-mariage.{domain}` and checks that the deterministic token is
//      present. On success `customDomainVerified` is flipped to true.
//   4. /api/resolve-domain only resolves verified domains, so unverified
//      custom domains never reach the public routing layer.

import { createHash } from 'node:crypto';
import { resolveTxt } from 'node:dns/promises';
import { PLAN_LIMITS, type Plan } from './types';

/**
 * Known platform domains — a request to these is NOT a custom domain.
 */
const PLATFORM_DOMAINS = [
  'wedding.hpph.net',
  'www.wedding.hpph.net',
  'localhost',
  '127.0.0.1',
];

/**
 * Check if a host header corresponds to a custom domain (not the platform domain).
 * Used by middleware/routing to detect custom domain requests.
 */
export function isCustomDomainRequest(host: string): boolean {
  const normalized = host.toLowerCase().trim().split(':')[0]; // strip port
  if (!normalized) return false;
  if (PLATFORM_DOMAINS.includes(normalized)) return false;
  // If it ends with the platform domain, it's a subdomain, not custom
  if (normalized.endsWith('.aenews.net')) return false;
  if (normalized.endsWith('.hpph.net')) return false;
  return true;
}

/**
 * Resolve a custom domain to a wedding slug.
 * In production, this queries the DB for Wedding.customDomain === host.
 * Returns null if no wedding matches.
 *
 * NOTE: This is a stub for documentation — actual resolution happens in
 * middleware via a DB lookup. Exported here so middleware + tests can mock it.
 */
export async function resolveCustomDomain(
  host: string,
  lookup: (domain: string) => Promise<string | null>
): Promise<string | null> {
  const normalized = host.toLowerCase().trim().split(':')[0];
  if (!isCustomDomainRequest(normalized)) return null;
  return lookup(normalized);
}

/**
 * Validate a custom domain format.
 * Rules:
 *   - Lowercase, alphanumeric + hyphens + dots
 *   - 3-253 chars total
 *   - Each label 1-63 chars
 *   - At least one dot
 *   - No consecutive dots
 *   - Doesn't start/end with hyphen or dot
 */
export function validateCustomDomain(domain: string): { valid: boolean; error?: string } {
  const d = domain.toLowerCase().trim();
  if (!d) return { valid: false, error: 'Le domaine est requis' };
  if (d.length > 253) return { valid: false, error: 'Le domaine est trop long (max 253 caractères)' };
  if (!d.includes('.')) return { valid: false, error: 'Le domaine doit contenir au moins un point (ex: mon-mariage.fr)' };
  if (PLATFORM_DOMAINS.includes(d)) return { valid: false, error: 'Ce domaine est réservé à la plateforme' };
  if (d.endsWith('.aenews.net')) return { valid: false, error: 'Les sous-domaines aenews.net ne sont pas personnalisables' };
  if (d.endsWith('.hpph.net')) return { valid: false, error: 'Les sous-domaines hpph.net ne sont pas personnalisables' };

  // Validate each label
  const labels = d.split('.');
  for (const label of labels) {
    if (!label) return { valid: false, error: 'Le domaine contient des points consécutifs' };
    if (label.length > 63) return { valid: false, error: `Le label "${label}" est trop long (max 63 caractères)` };
    if (label.startsWith('-') || label.endsWith('-')) {
      return { valid: false, error: `Le label "${label}" ne peut pas commencer ou finir par un tiret` };
    }
    if (!/^[a-z0-9-]+$/.test(label)) {
      return { valid: false, error: `Le label "${label}" contient des caractères invalides` };
    }
  }

  return { valid: true };
}

/**
 * Check if a plan supports custom domains.
 * Premium and Élite plans allow custom domains; TRIAL and ESSENTIEL do not.
 */
export function planSupportsCustomDomain(plan: string): boolean {
  const p = plan as Plan;
  return PLAN_LIMITS[p]?.customDomain === true;
}

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
 * Build the DNS verification record that a couple must add to verify
 * domain ownership (TXT record: _heureux-mariage.{domain} → hm-verify=...).
 *
 * P5.2-2: the TXT value is now a deterministic token derived from the
 * wedding ID + domain (see buildVerificationToken), NOT the bare slug.
 * This prevents a squatter who controls a different domain from simply
 * copying the slug into their own TXT record.
 *
 * Accepts the verification token directly (computed by the caller via
 * buildVerificationToken) so the same function works for both the
 * "show me what to add" GET and the "verify what's there" POST flows.
 */
export function buildDnsVerificationRecord(
  domain: string,
  tokenOrSlug: string
): {
  type: 'TXT';
  name: string;
  value: string;
} {
  // P5.2-2 backward-compat shim: callers used to pass the slug here. We now
  // pass a full verification token (starts with "hm-verify-"). If a caller
  // passes a bare slug (legacy), we still produce the old shape so existing
  // callers don't break — but new code should pass a token.
  const isToken = tokenOrSlug.startsWith('hm-verify-');
  const value = isToken ? tokenOrSlug : `hm-verify=${tokenOrSlug}`;
  return {
    type: 'TXT',
    name: `_heureux-mariage.${domain.toLowerCase().trim()}`,
    value,
  };
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
 *
 * The lookup is performed against the *system* resolver (which honours
 * /etc/resolv.conf). In production this is fine; for local dev the couple's
 * DNS provider has already propagated the record by the time they trigger
 * verification.
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
    // resolveTxt returns string[][] (each TXT record is split into chunks).
    // We flatten so a multi-chunk TXT record is compared as a single string.
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

  // Accept either the bare token (`hm-verify-<hex>`) or the legacy
  // `hm-verify=<slug>` form. The bare token is the canonical P5.2-2 form.
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

/**
 * Get the CNAME target a couple should point their custom domain to.
 */
export function getCnameTarget(): string {
  return 'wedding.hpph.net';
}
