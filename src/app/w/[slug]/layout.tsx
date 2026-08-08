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
  const data = await getCachedWeddingData(slug);

  if (!data) {
    return { title: 'Mariage — Introuvable' };
  }

  const wedding = data.wedding;
  const coupleLabel = wedding.coupleLabel;
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
  const data = await getCachedWeddingData(slug);

  if (!data) {
    notFound();
  }

  const { wedding, manifest, publishedConfig } = data;

  // P5.0 H-SUSP-1 + H-ARCH-2 — Compute admin-route bypass ONCE for all status
  // gates. Admin routes (/w/[slug]/admin/*) must remain accessible when the
  // wedding is DRAFT (configuration), SUSPENDED (recovery), or ARCHIVED
  // (viewing historical data). Only public routes show holding/memorial pages.
  const h = await headers();
  const pathname = h.get('x-invoke-path') || h.get('referer') || '';
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
