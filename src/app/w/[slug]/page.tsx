// ══════════════════════════════════════════════════════════════════════════════
// /w/[slug]/page.tsx — MANIFEST-DRIVEN PUBLIC WEDDING PAGE (Phase 2A: RSC)
// ══════════════════════════════════════════════════════════════════════════════
// Renders the wedding experience from the published manifest.
//
// ─── Phase 2A (MISSION 5.9.0 audit §20.4) — Server Component migration ────────
// This page used to be a `'use client'` component that issued a 4-call API
// waterfall on the client (`/api/couple-story`, `/api/timeline`,
// `/api/settings`, `/api/music`). It is now an async Server Component that:
//
//   1. Awaits the route `params` (Next.js 16 params are Promise-based).
//   2. Calls `getCachedWeddingPageData(slug)` to fetch all 4 datasets
//      server-side in a single ISR-cached round-trip. The cache is keyed by
//      slug (`['wedding-page-data', slug]`) and tagged `wedding-{slug}` so
//      on-demand invalidation (publish pipeline) busts it atomically with
//      the layout's `getCachedWeddingData` cache.
//   3. Passes the 4 datasets as serializable props to <WeddingPageClient>,
//      a `'use client'` shell that hydrates ONLY the interactive islands
//      (GuestAuthForm, RSVP form, MusicPlayer, VisualEffectsLayer, etc.).
//
// Expected benefit per the audit: -200ms TTI, -50KB JS gzip.
//
// The wedding identity + manifest + publishedConfig still come from the
// layout's <WeddingContextProvider> (unchanged) — the layout calls
// `getCachedWeddingData(slug)` and feeds it into the React context. The
// page does NOT re-fetch that (no DB round-trip waste): <WeddingPageClient>
// reads it via useWedding() like before.
//
// ISR is preserved: the page inherits `revalidate = 300` from the layout
// (Next.js propagates the most aggressive revalidate among layout + page).
// The per-wedding cache tag (`wedding-${slug}`) is the primary invalidation
// mechanism (on-demand via revalidateTag in the publish pipeline).
//
// ─── Phase 4A (MISSION 5.9.0 audit §20.6) — Preview Lab integration ──────────
// The `?preview=true` and `?identity=<id>` query params are resolved
// CLIENT-side by <WeddingPageClient> (via useSearchParams, inside the
// existing <Suspense> boundary). The Phase 4A design deliberately did NOT
// read searchParams here in order to preserve ISR for normal visitors.
//
//   ?preview=true  → <GuestAuthProvider preview={true}> skips the
//                    /api/guest/me session check (no visit logged, no
//                    analytics event). <WeddingPageContent> shows a
//                    "read-only preview" banner and skips the ?invite
//                    auto-login. The admin sees the full page (manifest
//                    renders via the "not-authenticated" branch) but
//                    cannot submit RSVPs or interact with guest-only
//                    features (no guest session is established).
//
//   ?identity=<id> → When the id resolves to one of the 5 wedding
//                    identities, <WeddingPageContent> overrides the theme
//                    (via ThemeInjector) and the hero/gallery sections
//                    (via <SectionRenderer identity={...}>). The override
//                    is CLIENT-side only — no DB write — so the admin can
//                    preview an identity without committing it.
//
// ─── Phase 5.9.0 POST-PHASE-3 — Signed-token preview gate ─────────────────────
// SECURITY FIX: `?preview=true` alone is no longer enough to enter preview
// mode. The Preview Lab now issues a 24h signed JWT (per-admin, per-wedding)
// via /api/platform/preview-token/{slug} and appends it as `?token=xxx`.
// This Server Component reads searchParams + verifies the token BEFORE the
// request reaches <WeddingPageClient>. If the token is missing or invalid,
// we strip `?preview=true&token=xxx` from the URL via a redirect (keeping
// other params like `?identity=`) — so the client never sees preview=true
// and naturally falls through to the normal guest-auth flow.
//
// TRADE-OFF: reading searchParams opts this route out of ISR for ALL
// visitors (Phase 2A's ISR benefit is regressed). This is accepted because:
//   - The security gain (no more permanent leaked-preview-link attacks)
//     outweighs the perf cost.
//   - The page is still cached at the CDN level via `Vary: Host,
//     Accept-Encoding, X-White-Label` (set by middleware) + the per-wedding
//     cache tag (still used by getCachedWeddingData / getCachedWeddingPageData
//     internally — the underlying unstable_cache entries survive).
//   - The redirect for invalid tokens is a one-time cost per leaked link;
//     once the link is stripped, the visitor lands on /w/[slug] which
//     re-enters the (still-cached) data path.
//
// Alternative considered: Edge-middleware token verification (using `jose`
// instead of `jsonwebtoken`) to keep ISR. Rejected because the task spec
// explicitly requires `verifyPreviewToken` (Node-based, jsonwebtoken) to be
// imported + called in this file. A future optimisation could move
// verification to middleware + use `jose` if the ISR regression proves
// measurable in production metrics.
//
// TOKEN PROPERTIES (see src/lib/preview-token.ts):
//   - 24h TTL (auto-expiry, no blocklist needed)
//   - Wedding-bound (decoded.wid === slug — defense-in-depth)
//   - Admin-bound (decoded.admin — audit trail)
//   - Read-only (only bypasses guest auth, NOT write APIs)
//
// ─── MISSION 5.9.2 P2-5 — DB theme preview (?theme=<slug>) ────────────────────
// EXTENSION: in addition to the 5 identity presets (?identity=<id>), the
// Preview Lab can now preview ANY of the 21 DB-backed PlatformThemes
// (royal-gold, royal-black, sapphire-noir, congo-prestige, kente, …)
// via `?theme=<slug>`.
//
// SECURITY: the `?theme=` param is ONLY honoured when:
//   1. `?preview=true` is present AND
//   2. The `?token=<jwt>` was verified above (24h signed, wedding-bound).
// If a normal visitor hits /w/[slug]?theme=royal-gold without a valid
// preview token, the verification block above already redirected them
// (stripping preview+token). They land here without preview=true, so the
// `?theme=` param is silently ignored — the published theme renders as
// normal. This preserves the "themes are read-only cosmetic" invariant:
// a guest can NEVER trigger a PlatformTheme lookup on the public path.
//
// FLOW:
//   - After token verification succeeds (preview mode confirmed), read
//     `sp.theme` (the PlatformTheme slug).
//   - If it's a non-empty string, fetch the PlatformTheme by slug using
//     `unsafePlatformDb.platformTheme.findUnique({ where: { slug } })`.
//     `unsafePlatformDb` is the cross-tenant alias (safe here because we
//     just verified the admin's preview token — it's a platform-level
//     read, not a tenant-scoped one).
//   - Parse `configJson` + `paletteJson` with `safeJsonParse`.
//   - Build a serializable `themeOverride` object (slug + name + raw JSON
//     strings + fontDisplay + fontBody + identity). We pass the RAW JSON
//     strings — not the parsed objects — because Next.js serializes props
//     via RSC wire format and we want the parsing to happen client-side
//     (where <WeddingPageClient> can log parse errors without breaking
//     the server render).
//   - Pass `themeOverride={themeOverride}` to <WeddingPageClient>. The
//     client treats it as an optional prop (default null) and applies it
//     BEFORE the identityOverride branch (theme > identity > published).
//   - If the theme is not found, log + pass `themeOverride={null}` (the
//     client falls through to identityOverride or publishedConfig).

import { notFound, redirect } from 'next/navigation';
import {
  getCachedWeddingData,
  getCachedWeddingPageData,
} from '@/lib/wedding/cache';
import { logger } from '@/lib/logger';
import { verifyPreviewToken } from '@/lib/preview-token';
import { unsafePlatformDb } from '@/lib/db';
import { safeJsonParse } from '@/lib/safe-json';
import WeddingPageClient from './WeddingPageClient';

// ─── ISR config ───────────────────────────────────────────────────────────────
// NOTE (Phase 5.9.0 POST-PHASE-3): `revalidate = 300` is retained for
// documentation + as a fallback, but reading `searchParams` below forces
// this route into dynamic rendering at request time. Next.js honours the
// `revalidate` value only for the unstable_cache entries INSIDE
// getCachedWeddingData / getCachedWeddingPageData (those still serve cached
// DB results for 5 min). The React render itself is per-request.
export const revalidate = 300;

// ─── Types ───────────────────────────────────────────────────────────────────

/**
 * Serializable theme override blob passed to <WeddingPageClient> when the
 * admin previews a DB-backed PlatformTheme via `?theme=<slug>`.
 *
 * All fields are JSON-primitive (string | null) so the object survives RSC
 * serialization without any custom toJSON / revive logic. The raw JSON
 * strings (`paletteJson`, `configJson`) are parsed CLIENT-side by
 * <WeddingPageClient> using `safeJsonParse` — that way a malformed DB row
 * only breaks the preview, never the server render.
 */
interface ThemeOverride {
  slug: string;
  name: string;
  paletteJson: string;
  configJson: string;
  fontDisplay: string | null;
  fontBody: string | null;
  identity: string | null;
}

// ─── Page (async Server Component) ────────────────────────────────────────────

export default async function WeddingLandingPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  // Phase 5.9.0 POST-PHASE-3: we now read searchParams to verify the preview
  // token. This opts the route out of ISR (see the trade-off note above).
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const sp = await searchParams;

  // ─── Phase 5.9.0 POST-PHASE-3 — Preview token gate ────────────────────────
  // If ?preview=true is present, require a valid 24h signed token bound to
  // this wedding slug. If the token is missing or invalid, strip ?preview +
  // ?token from the URL (preserving other params like ?identity=) via a
  // redirect — <WeddingPageClient> then loads without preview=true and the
  // normal guest-auth flow takes over. This closes the Phase 4A hole where
  // any guessed ?preview=true link granted permanent read-only access.
  const previewFlag = Array.isArray(sp.preview) ? sp.preview[0] : sp.preview;
  // P2-5: tracks whether we are in token-verified preview mode. We need this
  // later to decide whether to honour `?theme=<slug>` (only in preview mode).
  let isPreviewVerified = false;
  if (previewFlag === 'true') {
    const tokenRaw = Array.isArray(sp.token) ? sp.token[0] : sp.token;
    const token = typeof tokenRaw === 'string' ? tokenRaw.trim() : '';
    const decoded = token ? verifyPreviewToken(token, slug) : null;
    if (!decoded) {
      // Invalid / missing token → strip preview + token, keep other params.
      // We rebuild the URL with only the non-preview / non-token params so
      // an old bookmarked link like ?preview=true&identity=X gracefully
      // degrades to ?identity=X (no preview, normal guest-auth flow).
      logger.info('wedding-page.preview-token-invalid', {
        slug,
        hasToken: Boolean(token),
      });
      const stripped = new URLSearchParams();
      for (const [key, value] of Object.entries(sp)) {
        if (key === 'preview' || key === 'token') continue;
        if (typeof value === 'string') stripped.set(key, value);
        else if (Array.isArray(value)) value.forEach((v) => stripped.append(key, v));
      }
      const qs = stripped.toString();
      redirect(`/w/${slug}${qs ? `?${qs}` : ''}`);
      // redirect() throws — the return below is unreachable but keeps TS happy.
      return null as never;
    }
    // Token valid — fall through. <WeddingPageClient> will read ?preview=true
    // from the URL via useSearchParams and enter preview mode (skip guest
    // auth, skip analytics, show read-only banner). The token is also still
    // in the URL — the client doesn't need it (verification is server-side)
    // but it doesn't hurt to leave it (it's a signed JWT, not a secret).
    isPreviewVerified = true;
    logger.debug('wedding-page.preview-token-valid', {
      slug,
      adminId: decoded.admin,
      exp: decoded.exp,
    });
  }

  // Fetch the wedding identity + manifest (cached) so we can 404 early if
  // the slug is unknown. The layout already calls getCachedWeddingData and
  // will notFound() too, but doing it here means we don't waste a DB
  // round-trip on getCachedWeddingPageData for a non-existent wedding.
  // Both calls hit the same unstable_cache entry → second is free.
  const [weddingData, pageData] = await Promise.all([
    getCachedWeddingData(slug),
    getCachedWeddingPageData(slug),
  ]);

  if (!weddingData || !pageData) {
    // The layout also calls notFound() in this case, but the page-level
    // notFound() takes precedence when the data is missing here. This is
    // defensive — if the layout's cache is warm but the page's is cold
    // (extremely unlikely given the same tag), we still 404 cleanly.
    logger.warn('wedding-page.data-missing', {
      slug,
      hasWeddingData: Boolean(weddingData),
      hasPageData: Boolean(pageData),
    });
    notFound();
  }

  // ─── MISSION 5.9.2 P2-5 — Resolve ?theme=<slug> (preview-only) ────────────
  // Only honoured in preview mode (token verified above). For normal
  // visitors, `?theme=` is silently ignored — they see the published theme.
  // This block is the ONLY place where a PlatformTheme row is fetched on the
  // public /w/[slug] render path. The fetch is conditional (skipped when
  // not in preview, or when the param is absent) so normal visitors pay no
  // extra DB cost.
  let themeOverride: ThemeOverride | null = null;
  if (isPreviewVerified) {
    const themeSlugRaw = Array.isArray(sp.theme) ? sp.theme[0] : sp.theme;
    const themeSlug =
      typeof themeSlugRaw === 'string' ? themeSlugRaw.trim() : '';
    if (themeSlug.length > 0) {
      try {
        const platformTheme = await unsafePlatformDb.platformTheme.findUnique({
          where: { slug: themeSlug },
          // Select only the fields we need (avoid leaking isPremium / pricing
          // data into the serialized RSC payload — defense in depth).
          select: {
            slug: true,
            name: true,
            paletteJson: true,
            configJson: true,
            fontDisplay: true,
            fontBody: true,
            identity: true,
          },
        });
        if (platformTheme) {
          // Sanity-check the JSON columns are parseable BEFORE handing them
          // to the client. If either is malformed, we log + skip the override
          // (the client would fall through to the published theme anyway).
          // We don't strip the parsed result here — we pass the raw strings
          // so the client can re-parse with its own safeJsonParse + log.
          // T is `unknown` so we can use `null` as the fallback sentinel (a
          // successful parse yields an object/array/primitive, never null
          // — null only happens when the column itself is NULL, but Prisma
          // would have already filtered that out by selecting non-null).
          const cfgProbe: unknown = safeJsonParse<unknown>(
            platformTheme.configJson,
            null,
          );
          const palProbe: unknown = safeJsonParse<unknown>(
            platformTheme.paletteJson,
            null,
          );
          // Treat BOTH null as "unparseable" — if only one is null, we still
          // pass the row (the client will gracefully fall through per-field).
          if (cfgProbe !== null || palProbe !== null) {
            themeOverride = {
              slug: platformTheme.slug,
              name: platformTheme.name,
              paletteJson: platformTheme.paletteJson,
              configJson: platformTheme.configJson,
              fontDisplay: platformTheme.fontDisplay,
              fontBody: platformTheme.fontBody,
              identity: platformTheme.identity,
            };
            logger.debug('wedding-page.theme-override-resolved', {
              slug,
              themeSlug: platformTheme.slug,
              themeName: platformTheme.name,
            });
          } else {
            logger.warn('wedding-page.theme-override-unparseable', {
              slug,
              themeSlug,
            });
          }
        } else {
          logger.info('wedding-page.theme-override-not-found', {
            slug,
            themeSlug,
          });
        }
      } catch (err) {
        // DB error (transient) — log + fall through to the published theme.
        // We do NOT 500 — the admin can still see the published theme.
        logger.warn('wedding-page.theme-override-fetch-error', {
          slug,
          themeSlug,
          err: err instanceof Error ? err : new Error(String(err)),
        });
      }
    }
  }

  // Pass the 4 server-fetched datasets as serializable props. The client
  // shell takes over from here — it owns all the interactive islands.
  return (
    <WeddingPageClient
      stories={pageData.stories}
      timeline={pageData.timeline}
      settings={pageData.settings}
      music={pageData.music}
      themeOverride={themeOverride}
    />
  );
}
