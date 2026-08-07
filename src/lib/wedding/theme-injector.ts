// ══════════════════════════════════════════════════════════════════════════════
// Organization Theme — P1.10 White Label runtime
// ══════════════════════════════════════════════════════════════════════════════
//
// Provides cached lookups of Organization branding fields (logoUrl, brandColor,
// name) so that the <ThemeInjector> server component can render a `<style>` tag
// overriding the platform's default --primary CSS variable with the org's
// brandColor — without a DB round-trip on every request.
//
// Two resolvers are provided:
//   - getOrgTheme(orgSlug)   → for /org/[slug]/admin pages (P1.8) where the
//                              slug is already in the URL.
//   - getOrgThemeByHost(host) → for the public /w/[slug] layout when it's
//                              served via a custom domain. Resolves
//                              Organization.customDomain === host → branding.
//
// Both are cached for 5 minutes in a per-process in-memory Map (same pattern
// as resolveWeddingBySlug in src/lib/tenant-context.ts). Cache invalidation
// is exposed via invalidateOrgThemeCache() for the org-admin update routes
// (P1.6/P1.7) to call when branding fields are edited.
//
// Security:
//   - Uses the raw `db` (a.k.a. unsafePlatformDb) from @/lib/db. This is a
//     public/unauthenticated code path (the ThemeInjector runs in the public
//     wedding layout, and resolve-domain is called by the middleware before
//     auth). The Organization model is NOT tenant-scoped, so the tenant-scoped
//     Prisma extension is intentionally bypassed.
//   - Only ACTIVE organizations are resolvable. SUSPENDED/ARCHIVED orgs lose
//     their custom-domain branding (defence-in-depth — suspended orgs should
//     not appear "live" on their white-label domain).
//   - The brandColor field is validated by the ThemeInjector component before
//     being injected into a <style> tag (regex-confined to hex syntax) to
//     prevent CSS injection.
//
// Graceful degradation:
//   - If the DB lookup throws, the resolver returns null and the ThemeInjector
//     renders nothing — the platform default theme wins.
//   - If the org has no brandColor, getOrgTheme returns the org theme object
//     with brandColor: null, and the ThemeInjector renders nothing (no <style>).
//   - If the host is not a custom domain, getOrgThemeByHost returns null.
//
// Error logging:
//   - All errors are logged via the structured `logger` from @/lib/logger.
//     The error object is passed as `err` context — the logger serializes it
//     to { errMessage, errName, errCode } and NEVER emits `error.stack`
//     (P1-SEC-15: stacks can leak source paths + secrets).

import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { isCustomDomainRequest } from '@/lib/custom-domains';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface OrgTheme {
  /** Organization slug (used as the cache key for getOrgTheme). */
  slug: string;
  /** Display name (for future use — e.g. <title> suffix or logo alt text). */
  name: string;
  /** Logo URL (nullable — org may not have uploaded a logo yet). */
  logoUrl: string | null;
  /** Brand color (hex, nullable — org may not have customized branding). */
  brandColor: string | null;
}

// ─── In-memory cache (5-min TTL, per-process) ─────────────────────────────────
// Same pattern as resolveWeddingBySlug in src/lib/tenant-context.ts.
// Two maps because the lookup key differs (slug vs host). Both share the same
// TTL — the cache is best-effort, invalidation is explicit via
// invalidateOrgThemeCache().

const ORG_THEME_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

interface CachedOrgTheme {
  theme: OrgTheme | null; // null = "confirmed no org / no branding" (negative cache)
  expires: number;
}

const themeCacheBySlug = new Map<string, CachedOrgTheme>();
const themeCacheByHost = new Map<string, CachedOrgTheme>();

// ─── Resolver: by slug ────────────────────────────────────────────────────────
/**
 * Get the branding theme for an organization by its slug.
 * Used by /org/[slug]/admin pages (P1.8) where the slug is in the URL.
 *
 * Cached for 5 minutes. Returns null if:
 *   - The org doesn't exist
 *   - The org is not ACTIVE
 *   - The DB lookup fails
 *
 * @example
 *   const theme = await getOrgTheme('agence-mariage');
 *   if (theme?.brandColor) { ... }
 */
export async function getOrgTheme(orgSlug: string): Promise<OrgTheme | null> {
  const normalizedSlug = orgSlug.toLowerCase().trim();
  if (!normalizedSlug) return null;

  // Cache hit?
  const cached = themeCacheBySlug.get(normalizedSlug);
  if (cached && cached.expires > Date.now()) {
    return cached.theme;
  }

  try {
    const org = await db.organization.findUnique({
      where: { slug: normalizedSlug },
      select: {
        slug: true,
        name: true,
        logoUrl: true,
        brandColor: true,
        status: true,
      },
    });

    if (!org || org.status !== 'ACTIVE') {
      // Negative cache — avoids repeated DB lookups for non-existent / suspended orgs.
      themeCacheBySlug.set(normalizedSlug, {
        theme: null,
        expires: Date.now() + ORG_THEME_CACHE_TTL_MS,
      });
      return null;
    }

    const theme: OrgTheme = {
      slug: org.slug,
      name: org.name,
      logoUrl: org.logoUrl,
      brandColor: org.brandColor,
    };
    themeCacheBySlug.set(normalizedSlug, {
      theme,
      expires: Date.now() + ORG_THEME_CACHE_TTL_MS,
    });
    return theme;
  } catch (err) {
    // Log + return null. Do NOT cache failures (so the next request retries).
    logger.error('getOrgTheme: lookup failed', {
      orgSlug: normalizedSlug,
      err,
    });
    return null;
  }
}

// ─── Resolver: by host (for custom-domain white-label) ───────────────────────
/**
 * Get the branding theme for an organization by its custom domain (host).
 * Used by the public <ThemeInjector> server component on the wedding layout
 * when the request arrives via a custom domain.
 *
 * The host is normalized (lowercase, port-stripped) and validated via
 * `isCustomDomainRequest` — platform domains (wedding.hpph.net, *.aenews.net,
 * *.hpph.net, localhost) return null immediately without a DB lookup.
 *
 * Cached for 5 minutes (separate cache from getOrgTheme, keyed by host).
 *
 * Returns null if:
 *   - The host is not a custom domain
 *   - No ACTIVE organization has this customDomain
 *   - The DB lookup fails
 *
 * @example
 *   const theme = await getOrgThemeByHost('agence-mariage.fr');
 *   if (theme?.brandColor) { ... }
 */
export async function getOrgThemeByHost(host: string): Promise<OrgTheme | null> {
  const normalized = host.toLowerCase().trim().split(':')[0];
  if (!normalized) return null;
  if (!isCustomDomainRequest(normalized)) return null;

  // Cache hit?
  const cached = themeCacheByHost.get(normalized);
  if (cached && cached.expires > Date.now()) {
    return cached.theme;
  }

  try {
    const org = await db.organization.findFirst({
      where: { customDomain: normalized, status: 'ACTIVE' },
      select: {
        slug: true,
        name: true,
        logoUrl: true,
        brandColor: true,
      },
    });

    if (!org) {
      // Negative cache — avoids repeated DB lookups for unbound custom domains.
      themeCacheByHost.set(normalized, {
        theme: null,
        expires: Date.now() + ORG_THEME_CACHE_TTL_MS,
      });
      return null;
    }

    const theme: OrgTheme = {
      slug: org.slug,
      name: org.name,
      logoUrl: org.logoUrl,
      brandColor: org.brandColor,
    };
    themeCacheByHost.set(normalized, {
      theme,
      expires: Date.now() + ORG_THEME_CACHE_TTL_MS,
    });
    return theme;
  } catch (err) {
    logger.error('getOrgThemeByHost: lookup failed', {
      host: normalized,
      err,
    });
    return null;
  }
}

// ─── Cache invalidation ──────────────────────────────────────────────────────
/**
 * Invalidate the org theme cache.
 *
 * Call this from org-admin update routes (P1.6/P1.7) after editing any of:
 *   - Organization.name
 *   - Organization.logoUrl
 *   - Organization.brandColor
 *   - Organization.customDomain
 *   - Organization.status
 *
 * Pass `slug` to bust the slug-keyed cache, `host` to bust the host-keyed
 * cache, or both. Pass neither to clear the entire cache (cold-start).
 *
 * @example
 *   // After updating the org's brandColor:
 *   invalidateOrgThemeCache({ slug: org.slug });
 *   // After changing the org's customDomain (old + new hosts both stale):
 *   invalidateOrgThemeCache({
 *     slug: org.slug,
 *     host: oldCustomDomain,
 *   });
 */
export function invalidateOrgThemeCache(opts?: {
  slug?: string;
  host?: string;
}): void {
  if (!opts || (!opts.slug && !opts.host)) {
    themeCacheBySlug.clear();
    themeCacheByHost.clear();
    return;
  }
  if (opts.slug) {
    themeCacheBySlug.delete(opts.slug.toLowerCase().trim());
  }
  if (opts.host) {
    const normalized = opts.host.toLowerCase().trim().split(':')[0];
    themeCacheByHost.delete(normalized);
  }
}
