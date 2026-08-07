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
//
// The manifest is the single source of truth for section rendering.
// page.tsx reads it from context and renders via SectionRenderer.

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { headers } from 'next/headers';
import { resolveWeddingBySlug } from '@/lib/tenant-context';
import { resolveWeddingManifest } from '@/lib/wedding/manifest';
import type { WeddingManifest } from '@/lib/wedding/manifest';
import { db } from '@/lib/db';
import { safeJsonParse } from '@/lib/safe-json';
import { logger } from '@/lib/logger';
import { WeddingContextProvider } from './wedding-context';
import type { PublishedConfigSnapshot } from './wedding-context';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const wedding = await resolveWeddingBySlug(slug);

  if (!wedding) {
    return { title: 'Mariage — Introuvable' };
  }

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

export default async function WeddingLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const wedding = await resolveWeddingBySlug(slug);

  if (!wedding) {
    notFound();
  }

  if (wedding.status === 'DRAFT' && !wedding.isDefault) {
    // Mission 5.3.1: Allow admin routes (/w/[slug]/admin/*) for DRAFT weddings
    // so organizers can log in, configure, and publish their event.
    // Public routes (/w/[slug]) remain hidden until PUBLISHED.
    const h = await headers();
    const pathname = h.get('x-invoke-path') || h.get('referer') || '';
    const isAdminRoute = pathname.includes('/admin');
    if (!isAdminRoute) {
      notFound();
    }
  }

  if (wedding.status === 'SUSPENDED') {
    return (
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
    );
  }

  if (wedding.status === 'ARCHIVED') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-warm p-6">
        <div className="max-w-md text-center space-y-4">
          <div className="text-6xl">📖</div>
          <h1 className="font-serif text-3xl text-foreground">Souvenirs archivés</h1>
          <p className="text-muted-foreground">
            Le mariage de <strong>{wedding.coupleLabel}</strong> a eu lieu. Les souvenirs sont désormais archivés.
          </p>
        </div>
      </div>
    );
  }

  // ── CONS-6-PIPELINE: prefer publishedConfigJson (deployment snapshot) ──────
  // The deployment pipeline writes a PublishedConfig JSON blob to
  // Wedding.publishedConfigJson on successful publish. When present, it's the
  // source of truth for the manifest + theme (it captures the exact
  // Template+Theme+Collection combination that was deployed). We pass it
  // through context so page.tsx can feed ThemeInjector + SectionRenderer
  // without an extra HTTP round-trip.
  //
  // If publishedConfigJson is missing OR malformed, we fall back to the
  // binding-based manifest (resolveWeddingManifest) — backward compat for
  // weddings deployed before the pipeline existed.
  let publishedConfig: PublishedConfigSnapshot | null = null;
  let manifest: WeddingManifest;
  try {
    const publishedRow = await db.wedding.findUnique({
      where: { id: wedding.id },
      select: { publishedConfigJson: true, publishedVersion: true },
    });
    if (publishedRow?.publishedConfigJson) {
      const parsed = safeJsonParse<{
        manifest?: WeddingManifest;
        theme?: {
          primaryColor: string;
          accentColor: string;
          fontDisplay: string;
          fontBody: string;
          layout: string;
        };
        templateName?: string;
        themeName?: string;
        version?: string;
        compiledAt?: string;
      } | null>(publishedRow.publishedConfigJson, null);
      if (parsed && parsed.manifest && parsed.theme) {
        publishedConfig = {
          manifest: parsed.manifest,
          theme: parsed.theme,
          templateName: parsed.templateName ?? '',
          themeName: parsed.themeName ?? '',
          version: parsed.version ?? publishedRow.publishedVersion ?? '',
          compiledAt: parsed.compiledAt ?? '',
        };
      }
    }
  } catch (error) {
    // Non-fatal — fall back to binding-based manifest.
    logger.warn('layout: failed to read publishedConfigJson', {
      weddingId: wedding.id,
      errMessage: error instanceof Error ? error.message : String(error),
    });
  }

  if (publishedConfig) {
    manifest = publishedConfig.manifest;
  } else {
    manifest = await resolveWeddingManifest(wedding.id);
  }

  return (
    <WeddingContextProvider
      wedding={{
        id: wedding.id,
        slug: wedding.slug,
        coupleLabel: wedding.coupleLabel,
        brideName: wedding.brideName,
        groomName: wedding.groomName,
        weddingDate: wedding.weddingDate?.toISOString() ?? null,
        venueName: wedding.venueName,
        venueCity: wedding.venueCity,
        status: wedding.status,
        plan: wedding.plan,
        isDefault: wedding.isDefault,
        manifest,
        publishedConfig,
      }}
    >
      {children}
    </WeddingContextProvider>
  );
}
