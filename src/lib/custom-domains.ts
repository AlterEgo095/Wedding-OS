// ══════════════════════════════════════════════════════════════════════════════
// Custom Domains — Phase 8 Custom Domain Support
// ══════════════════════════════════════════════════════════════════════════════
//
// Premium/Élite weddings can map a custom domain (e.g. mariage-awa-david.fr)
// to their wedding page. The reverse proxy (Caddy/nginx) routes:
//   - heureuxmariage.aenews.net/{slug}  → default domain (multi-tenant)
//   - {custom-domain}                    → /w/{slug} (wildcard cert required)
//
// This module validates domains and checks plan eligibility.

import { PLAN_LIMITS, type Plan } from './types';

/**
 * Known platform domains — a request to these is NOT a custom domain.
 */
const PLATFORM_DOMAINS = [
  'heureuxmariage.aenews.net',
  'www.heureuxmariage.aenews.net',
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
 * domain ownership (TXT record: _heureux-mariage.{domain} → wedding slug).
 */
export function buildDnsVerificationRecord(domain: string, slug: string): {
  type: 'TXT';
  name: string;
  value: string;
} {
  return {
    type: 'TXT',
    name: `_heureux-mariage.${domain}`,
    value: `hm-verify=${slug}`,
  };
}

/**
 * Get the CNAME target a couple should point their custom domain to.
 */
export function getCnameTarget(): string {
  return 'heureuxmariage.aenews.net';
}
