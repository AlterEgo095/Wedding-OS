// ══════════════════════════════════════════════════════════════════════════════
// /w/[slug]/layout.tsx — Phase 2 Multi-Tenant Public Layout
// ══════════════════════════════════════════════════════════════════════════════
// Server component that resolves the wedding by slug. Returns 404 if not found
// or if the wedding is in DRAFT/SUSPENDED state. Provides the wedding data to
// all child pages via a React Context so they can make tenant-scoped API calls
// (using X-Wedding-Slug header).

import { notFound } from 'next/navigation';
import { resolveWeddingBySlug } from '@/lib/tenant-context';
import { WeddingContextProvider } from './wedding-context';

export const dynamic = 'force-dynamic';

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
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-stone-50 to-stone-100 p-6">
        <div className="max-w-md text-center space-y-4">
          <div className="text-6xl">💍</div>
          <h1 className="font-serif text-3xl text-stone-800">Mariage temporairement indisponible</h1>
          <p className="text-stone-600">
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
