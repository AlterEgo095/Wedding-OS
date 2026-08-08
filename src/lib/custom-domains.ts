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
//      verifyDnsRecord() (from dns-verification.ts, NOT this file), which
//      performs a DNS TXT lookup for `_heureux-mariage.{domain}` and checks
//      that the deterministic token is present. On success
//      `customDomainVerified` is flipped to true.
//   4. /api/resolve-domain only resolves verified domains, so unverified
//      custom domains never reach the public routing layer.
//
// IMPORTANT: This file is imported by the middleware (Edge runtime). It MUST
// NOT import any Node.js built-in modules (node:crypto, node:dns, etc.).
// The DNS verification functions that use Node.js built-ins live in
// src/lib/dns-verification.ts (imported only by API route handlers).

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
 * Build the DNS verification record that a couple must add to verify
 * domain ownership (TXT record: _heureux-mariage.{domain} → hm-verify=...).
 *
 * P5.2-2: the TXT value is now a deterministic token derived from the
 * wedding ID + domain (see buildVerificationToken in dns-verification.ts),
 * NOT the bare slug. This prevents a squatter who controls a different
 * domain from simply copying the slug into their own TXT record.
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
 * Get the CNAME target a couple should point their custom domain to.
 */
export function getCnameTarget(): string {
  return 'wedding.hpph.net';
}
