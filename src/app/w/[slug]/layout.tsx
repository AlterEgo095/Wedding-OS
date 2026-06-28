// ══════════════════════════════════════════════════════════════════════════════
// /w/[slug]/layout.tsx — Phase 2 Multi-Tenant Public Layout
// ══════════════════════════════════════════════════════════════════════════════
// Server component that resolves the wedding by slug. Returns 404 if not found
// or if the wedding is in DRAFT/SUSPENDED state. Provides the wedding data to
// all child pages via a React Context so they can make tenant-scoped API calls
// (using X-Wedding-Slug header).

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { resolveWeddingBySlug } from '@/lib/tenant-context';
import { WeddingContextProvider } from './wedding-context';

export const dynamic = 'force-dynamic';

// ─── Per-wedding SEO metadata ────────────────────────────────────────────────
// Generates a wedding-specific <title>, description, openGraph and twitter card
// so each tenant's share preview reflects their own couple (Phase 3 ÉTAPE 3b
// multi-tenant SEO fix). The root layout.tsx keeps a generic platform-level
// default for non-wedding routes (/, /platform/admin, 404, etc.).
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

  // Gate by status — DRAFT weddings are not publicly visible (except default)
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
      }}
    >
      {children}
    </WeddingContextProvider>
  );
}
