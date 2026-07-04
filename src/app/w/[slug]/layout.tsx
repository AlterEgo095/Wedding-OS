// ══════════════════════════════════════════════════════════════════════════════
// /w/[slug]/layout.tsx — Multi-Tenant Public Layout (Slice 1: manifest-driven)
// ══════════════════════════════════════════════════════════════════════════════
// Server component that:
//   1. Resolves the wedding by slug
//   2. Resolves the published manifest (WeddingCollectionBinding.manifest)
//   3. Passes BOTH identity + manifest to the client via WeddingContextProvider
//
// The manifest is the single source of truth for section rendering.
// page.tsx reads it from context and renders via SectionRenderer.

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { resolveWeddingBySlug } from '@/lib/tenant-context';
import { resolveWeddingManifest } from '@/lib/wedding/manifest';
import { WeddingContextProvider } from './wedding-context';

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
    notFound();
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

  // ── Resolve the published manifest (Slice 1) ───────────────────────────────
  // This is the CANONICAL render-time read of the Collection Engine.
  // If no binding exists, resolveWeddingManifest returns a default (backward compat).
  //
  // Slice 2 preview: handled in page.tsx via useSearchParams + /api/weddings/[id]/design
  // (layouts in Next.js 16 don't receive searchParams, so preview is client-side).
  const manifest = await resolveWeddingManifest(wedding.id);

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
      }}
    >
      {children}
    </WeddingContextProvider>
  );
}
