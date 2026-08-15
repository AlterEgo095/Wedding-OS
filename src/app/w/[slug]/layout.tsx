// ══════════════════════════════════════════════════════════════════════════════
// /w/[slug]/layout.tsx — Multi-Tenant Public Layout (Slice 1: manifest-driven)
// ══════════════════════════════════════════════════════════════════════════════
// Server component that:
//   1. Resolves the wedding by slug
//   2. Resolves the published manifest (WeddingCollectionBinding.manifest)
//   3. CONS-6-PIPELINE: prefers Wedding.publishedConfigJson (deployment snapshot)
//      when present — it's the source of truth after a successful pipeline run.
//   4. Passes BOTH identity + manifest + publishedConfig to the client via
//      WeddingContextProvider
//   5. P1.10: renders <ThemeInjector /> — when the request arrives via a
//      custom domain bound to an Organization, injects the org's brandColor
//      as a CSS variable override on :root. On the default platform domain
//      (wedding.hpph.net) it renders nothing (no DB lookup, ISR preserved).
//
// The manifest is the single source of truth for section rendering.
// page.tsx reads it from context and renders via SectionRenderer.
//
// ─── Mission 6.0 P0.9 — ISR + per-wedding cache tags ──────────────────────────
// Previously this layout used `export const dynamic = 'force-dynamic'`, forcing
// a full server-side data fetch on every request. Now it uses ISR:
//   - `revalidate = 300` (5-min fallback revalidation)
//   - The data fetch is wrapped in `unstable_cache` (see src/lib/wedding/cache.ts)
//     with a per-wedding cache tag `wedding-${slug}`.
//   - On publish, the pipeline calls `invalidateWeddingCache(slug)` which calls
//     `revalidateTag('wedding-{slug}')` → the next request re-fetches fresh data.
//
// Cross-tenant safety (§11 leak fix) is PRESERVED: the cache key is the slug
// itself, so wedding A's cache entry is 100% isolated from wedding B's.
//
// What stays dynamic (not cached): the DRAFT admin-route check uses `headers()`
// which is a per-request dynamic API — it runs AFTER the cached data fetch,
// so the cache only stores the wedding row + manifest + publishedConfig.
//
// ─── Mission 6.0 P1.10 — White Label runtime ─────────────────────────────────
// The <ThemeInjector /> server component below is async (it reads `headers()`
// and may call `getOrgThemeByHost` which hits the DB). On the default platform
// domain it returns null after the `headers()` read (no DB lookup, no SSR cost)
// so ISR cache behaviour is unchanged. On a custom domain it opts the layout
// out of static prerendering for THAT host — which is correct, because the
// org-level branding is host-specific and cannot be cached at the wedding-slug
// level (two different custom domains bound to the same wedding would render
// different brand colors).

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { headers } from 'next/headers';
import { getCachedWeddingData } from '@/lib/wedding/cache';
import { db } from '@/lib/db';
import { WeddingContextProvider } from './wedding-context';
import { ThemeInjector } from '@/components/ThemeInjector';

// ─── ISR config ───────────────────────────────────────────────────────────────
// Fallback time-based revalidation: 5 minutes. The per-wedding cache tag
// (`wedding-${slug}`) is the primary invalidation mechanism (on-demand via
// `revalidateTag` in the publish pipeline). This `revalidate` value is the
// safety net for cases where an invalidation call is missed.
export const revalidate = 300;

// Allow generating new wedding pages on-demand (not just pre-rendered ones).
// New weddings are published → cache invalidated → first request renders &
// caches them. No need for generateStaticParams at build time.
export const dynamicParams = true;

// ─── Metadata (also uses the cached fetch) ────────────────────────────────────

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;

  // 5.8.18 P2-4 — Fresh status check BEFORE reading cached data.
  // ROOT CAUSE: generateMetadata() previously called getCachedWeddingData()
  // directly, which is wrapped in unstable_cache with SWR semantics. After
  // UNPUBLISH, the cached entry still contained the couple's names for up
  // to 5 minutes, leaking private metadata via <title>, <meta description>,
  // and OpenGraph tags — even though the page BODY correctly showed the
  // holding page (fixed in 5.8.17 commit 6cdc153).
  //
  // FIX: Do a direct (uncached) Prisma query for the wedding's current
  // status + coupleLabel. If the wedding is NOT PUBLISHED, return generic
  // holding-page metadata that reveals NO couple information. This mirrors
  // the fresh-status-check pattern already used in the layout body below.
  const freshMeta = await db.wedding.findUnique({
    where: { slug },
    select: { status: true, isDefault: true, coupleLabel: true },
  });

  if (!freshMeta) {
    return { title: 'Mariage — Introuvable' };
  }

  // If the wedding is not PUBLISHED (and not the default demo wedding),
  // return generic metadata. The page body will show the holding page.
  if (freshMeta.status !== 'PUBLISHED' && !freshMeta.isDefault) {
    return {
      title: 'Mariage — Bientôt disponible',
      description: 'Ce mariage n\'est pas encore en ligne. Revenez bientôt.',
      robots: { index: false, follow: false },
      openGraph: {
        title: 'Mariage — Bientôt disponible',
        description: 'Ce mariage n\'est pas encore en ligne.',
        type: 'website',
        locale: 'fr_FR',
      },
      twitter: {
        card: 'summary',
        title: 'Mariage — Bientôt disponible',
        description: 'Ce mariage n\'est pas encore en ligne.',
      },
    };
  }

  const data = await getCachedWeddingData(slug);

  if (!data) {
    return { title: 'Mariage — Introuvable' };
  }

  const wedding = data.wedding;
  // Use the fresh coupleLabel (not the cached one) to avoid leaking stale data
  const coupleLabel = freshMeta.coupleLabel || wedding.coupleLabel;
  const weddingDate = wedding.weddingDate
    ? new Date(wedding.weddingDate).toLocaleDateString('fr-FR', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : '';
  const venue = wedding.venueName || '';

  const title = `Mariage ${coupleLabel}${weddingDate ? ` — ${weddingDate}` : ''}`;
  const description = `Rejoignez-nous pour célébrer l'union de ${coupleLabel}.${venue ? ` Lieu: ${venue}.` : ''} Découvrez les détails, trouvez votre table et partagez ce moment unique.`;

  return {
    title,
    description,
    keywords: [coupleLabel, 'mariage', 'invitation', 'wedding', wedding.slug],
    openGraph: {
      title,
      description,
      type: 'website',
      locale: 'fr_FR',
      siteName: `Mariage ${coupleLabel}`,
      images: [
        {
          url: '/icons/icon-512x512.png',
          width: 512,
          height: 512,
          alt: `Mariage ${coupleLabel}`,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: ['/icons/icon-512x512.png'],
    },
  };
}

// ─── Layout component ─────────────────────────────────────────────────────────

export default async function WeddingLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  // ─── 5.8.17-CACHE-FIX-V2 — Bypass unstable_cache for the status check ─────
  // ROOT CAUSE (worklog 5.8.17-CACHE-FIX-COMPLETE):
  //   `getCachedWeddingData(slug)` is wrapped in `unstable_cache` with SWR
  //   semantics. After `revalidateTag`, the next request still serves the
  //   STALE entry while triggering a background revalidation that does NOT
  //   complete reliably within 60s (the holding page never appeared in the
  //   60s probe window). `revalidatePath` is a no-op here because the route
  //   is already DYNAMIC (page.tsx reads searchParams for the preview-token
  //   gate, opting the route out of ISR).
  //
  //   Net effect: after UNPUBLISH, public visitors still saw PUBLISHED
  //   content (couple names, theme, sections) for 60s+.
  //
  // SURGICAL FIX (Option 1 — bypass cache for status check only):
  //   Do a DIRECT (uncached) Prisma query for the wedding's current
  //   `status`, `isDefault`, and `coupleLabel` BEFORE relying on the cached
  //   `getCachedWeddingData` result. Then OVERRIDE the cached `wedding.status`
  //   (and friends) with these fresh values so all status gates below see
  //   the CURRENT DB state, not the stale SWR-cached status.
  //
  //   - The cached `getCachedWeddingData` is still called (for theme,
  //     manifest, publishedConfig, brideName/groomName, etc.) — performance
  //     is preserved for the PUBLISHED hot path.
  //   - Only the status field (the one that changes on publish/unpublish/
  //     republish transitions) is fetched fresh every request (~2ms PK lookup
  //     on the unique `slug` index).
  //   - `unstable_cache` JSON-serializes its return value, so each caller
  //     gets a fresh deserialized object — mutating `wedding.status` here
  //     does NOT pollute the shared cache entry.
  //   - Also acts as a more reliable existence check: if the wedding was
  //     deleted, the direct query returns null (vs. the cached entry which
  //     could still return stale data for up to 5 min).
  const freshStatusRow = await db.wedding.findUnique({
    where: { slug },
    select: { status: true, isDefault: true, coupleLabel: true },
  });

  if (!freshStatusRow) {
    notFound();
  }

  const data = await getCachedWeddingData(slug);

  if (!data) {
    notFound();
  }

  const { wedding, manifest, publishedConfig } = data;

  // Override the (potentially stale) cached status fields with the fresh
  // direct-query values. This is the KEY fix: every status gate below
  // (DRAFT, SUSPENDED, UNPUBLISHED, ARCHIVED) now sees the CURRENT DB
  // status, so unpublish takes effect IMMEDIATELY on the next request —
  // no 60s SWR staleness window.
  wedding.status = freshStatusRow.status;
  wedding.isDefault = freshStatusRow.isDefault;
  wedding.coupleLabel = freshStatusRow.coupleLabel;

  // P5.0 H-SUSP-1 + H-ARCH-2 — Compute admin-route bypass ONCE for all status
  // gates. Admin routes (/w/[slug]/admin/*) must remain accessible when the
  // wedding is DRAFT (configuration), SUSPENDED (recovery), or ARCHIVED
  // (viewing historical data). Only public routes show holding/memorial pages.
  const h = await headers();
  // 5.8.16 P0-01: use x-pathname set by middleware (reliable) instead of
  // x-invoke-path (Next.js internal, not always present on direct navigations).
  const pathname = h.get('x-pathname') || h.get('x-invoke-path') || '';
  const isAdminRoute = pathname.includes('/admin');

  if (wedding.status === 'DRAFT' && !wedding.isDefault) {
    // Mission 5.3.1: Allow admin routes (/w/[slug]/admin/*) for DRAFT weddings
    // so organizers can log in, configure, and publish their event.
    // Public routes (/w/[slug]) remain hidden until PUBLISHED.
    //
    // NOTE: `headers()` is a dynamic API and runs OUTSIDE the cached fetch,
    // so this per-request check is not cached. The cached `wedding.status`
    // is the source of truth for the status value itself.
    if (!isAdminRoute) {
      notFound();
    }
  }

  if (wedding.status === 'SUSPENDED' && !isAdminRoute) {
    return (
      <>
        {/* P1.10: org-level branding still applies on custom domains even
            when the wedding is suspended (the holding page is the org's
            face to the visitor). On the default domain this is a no-op. */}
        <ThemeInjector />
        <div className="min-h-screen flex items-center justify-center bg-gradient-warm p-6">
          <div className="max-w-md text-center space-y-4">
            <div className="text-6xl">💍</div>
            <h1 className="font-serif text-3xl text-foreground">Mariage temporairement indisponible</h1>
            <p className="text-muted-foreground">
              Le mariage de <strong>{wedding.coupleLabel}</strong> est actuellement suspendu.
              Veuillez contacter les organisateurs ou réessayer plus tard.
            </p>
          </div>
        </div>
      </>
    );
  }

  {/* P5.1 H-UNPUB-1 — UNPUBLISHED: Super Admin has taken this wedding offline.
      Public visitors see a 410 Gone page. Admin routes (/admin/*) bypass this
      so the organizer can still manage the wedding and re-publish when ready. */}
  if (wedding.status === 'UNPUBLISHED' && !isAdminRoute) {
    return (
      <>
        <ThemeInjector />
        <div className="min-h-screen flex items-center justify-center bg-gradient-warm p-6">
          <div className="max-w-md text-center space-y-4">
            <div className="text-6xl">🕊️</div>
            <h1 className="font-serif text-3xl text-foreground">Ce mariage n&apos;est plus en ligne</h1>
            <p className="text-muted-foreground">
              Le mariage de <strong>{wedding.coupleLabel}</strong> a été retiré de la publication.
              Pour toute question, veuillez contacter les organisateurs.
            </p>
          </div>
        </div>
      </>
    );
  }

  if (wedding.status === 'ARCHIVED' && !isAdminRoute) {
    return (
      <>
        {/* P1.10: org-level branding still applies on custom domains even
            when the wedding is archived. On the default domain this is a no-op. */}
        <ThemeInjector />
        <div className="min-h-screen flex items-center justify-center bg-gradient-warm p-6">
          <div className="max-w-md text-center space-y-4">
            <div className="text-6xl">📖</div>
            <h1 className="font-serif text-3xl text-foreground">Souvenirs archivés</h1>
            <p className="text-muted-foreground">
              Le mariage de <strong>{wedding.coupleLabel}</strong> a eu lieu. Les souvenirs sont désormais archivés.
            </p>
          </div>
        </div>
      </>
    );
  }

  return (
    <WeddingContextProvider
      wedding={{
        id: wedding.id,
        slug: wedding.slug,
        coupleLabel: wedding.coupleLabel,
        brideName: wedding.brideName,
        groomName: wedding.groomName,
        weddingDate: wedding.weddingDate ?? null,
        venueName: wedding.venueName,
        venueCity: wedding.venueCity,
        status: wedding.status,
        plan: wedding.plan,
        isDefault: wedding.isDefault,
        manifest,
        publishedConfig,
      }}
    >
      {/* P1.10 White Label — injects org brandColor as a CSS variable override
          when the request is on a custom domain bound to an Organization.
          Renders nothing on the default platform domain (preserves ISR). */}
      <ThemeInjector />
      {children}
    </WeddingContextProvider>
  );
}
