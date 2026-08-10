// ══════════════════════════════════════════════════════════════════════════════
// /platform/admin/preview/[weddingSlug]/page.tsx
// Phase 4A (MISSION 5.9.0 audit §20.6) — Preview Lab entry point
// ══════════════════════════════════════════════════════════════════════════════
//
// A platform-admin-only Server Component that loads a single wedding and
// hands the serializable bits to the <PreviewLab> client island. The client
// island owns the device + identity selectors, the iframe(s), and the share
// link generator.
//
// AUTH:
//   - Reads the auth_token cookie via `getServerAuthUser()` (SSR-friendly).
//   - Only PLATFORM_ADMIN / SUPER_ADMIN may access. Other roles are bounced
//     to /platform/login. Mirrors the gate pattern used by
//     /org/[slug]/admin/page.tsx (defense-in-depth — even if someone
//     deep-links here, they hit the redirect before seeing any data).
//   - The route is `force-dynamic` because `getServerAuthUser()` calls
//     `cookies()` (a per-request dynamic API). This is correct: the page is
//     admin-only and per-user — no ISR benefit.
//
// DATA:
//   - Fetches the wedding row by slug (db.wedding.findUnique) for the
//     coupleLabel / status / plan (used in the page header).
//   - Fetches the cached wedding data (getCachedWeddingData) for the
//     manifest + publishedConfig + theme — same cache entry the public
//     /w/[slug] route uses, so the preview reflects exactly what guests see.
//   - Reads the static IDENTITY_PRESETS registry (5 identities) and maps
//     each to a minimal serializable shape (id, label, description, preview).
//     We do NOT pass the full IdentityPreset (it contains function-generated
//     data URLs that bloat the payload and aren't needed in the client).
//
// TENANT ISOLATION:
//   - The preview uses the wedding's REAL data (not a copy). The admin can
//     SEE it (read-only) but cannot MODIFY it through the preview — the
//     iframe loads /w/[slug]?preview=true which bypasses the guest auth gate
//     but does NOT grant admin edit permissions. All mutations (RSVP,
//     guestbook, etc.) require the guest session OR the admin session,
//     neither of which is granted by ?preview=true alone.
//
// ISR: NONE — force-dynamic (auth-gated per user).

import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

import { db } from '@/lib/db';
import { getServerAuthUser } from '@/lib/auth';
import { isPlatformAdmin } from '@/lib/types';
import { getCachedWeddingData } from '@/lib/wedding/cache';
import { IDENTITY_PRESETS } from '@/lib/themes/identity-presets';
import { PreviewLab, type PreviewLabIdentity, type PreviewLabWedding } from '@/components/admin/PreviewLab';

// ─── Force dynamic — auth-gated per user (cookies read) ───────────────────────
export const dynamic = 'force-dynamic';

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function PreviewLabPage({
  params,
}: {
  params: Promise<{ weddingSlug: string }>;
}) {
  const { weddingSlug } = await params;

  // ─── Auth gate ────────────────────────────────────────────────────────────
  const user = await getServerAuthUser();
  if (!user) {
    redirect('/platform/login?error=auth_required');
  }
  if (!isPlatformAdmin(user.role)) {
    redirect('/platform/login?error=platform_admin_required');
  }

  // ─── Fetch the wedding row (for the header) ───────────────────────────────
  // We fetch a minimal projection — the heavy data (manifest, theme,
  // publishedConfig) comes from getCachedWeddingData below.
  const wedding = await db.wedding.findUnique({
    where: { slug: weddingSlug },
    select: {
      id: true,
      slug: true,
      coupleLabel: true,
      brideName: true,
      groomName: true,
      status: true,
      plan: true,
      weddingDate: true,
      venueName: true,
      venueCity: true,
      isDefault: true,
    },
  });

  if (!wedding) {
    notFound();
  }

  // ─── Fetch the cached wedding data (manifest + theme + publishedConfig) ───
  // Same cache entry as the public /w/[slug] route → preview matches what
  // guests see. Returns null only if the wedding was deleted between the
  // findUnique above and this call (extremely unlikely).
  const cachedData = await getCachedWeddingData(weddingSlug);

  // ─── Map identity presets → minimal serializable shape ────────────────────
  // We pass only what the <PreviewLab> client needs: the id (for the query
  // param), the label + description (for the buttons), and the preview
  // swatches (for the visual chip). The full IdentityPreset (with
  // function-generated pattern data URLs, motion tier, copy tone, section
  // overrides) is NOT needed client-side — the iframe loads the real
  // wedding page which resolves the identity server-side.
  const identities: PreviewLabIdentity[] = IDENTITY_PRESETS.map((p) => ({
    id: p.id,
    label: p.label,
    description: p.description,
    preview: p.preview,
  }));

  // ─── Current theme name (for the "Current theme" button) ──────────────────
  // Read from the publishedConfig if available, else fall back to "Par défaut".
  const currentThemeName =
    cachedData?.publishedConfig?.themeName ||
    cachedData?.publishedConfig?.templateName ||
    'Thème actuel';

  // ─── Serialize wedding for the client ─────────────────────────────────────
  // weddingDate is a Date in Prisma; serialize to ISO for the client.
  const weddingPayload: PreviewLabWedding = {
    id: wedding.id,
    slug: wedding.slug,
    coupleLabel: wedding.coupleLabel,
    brideName: wedding.brideName,
    groomName: wedding.groomName,
    status: wedding.status,
    plan: wedding.plan,
    weddingDate: wedding.weddingDate ? wedding.weddingDate.toISOString() : null,
    venueName: wedding.venueName,
    venueCity: wedding.venueCity,
    isDefault: wedding.isDefault,
    currentThemeName,
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      {/* ─── Top bar (back to admin + title) ─────────────────────────────── */}
      <header className="sticky top-0 z-30 backdrop-blur-md bg-black/60 border-b border-white/10">
        <div className="max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <Link
              href="/platform/admin"
              className="flex items-center gap-1.5 text-xs text-white/60 hover:text-white transition-colors shrink-0"
            >
              <ArrowLeft className="size-3.5" />
              <span className="hidden sm:inline">Admin</span>
            </Link>
            <span className="text-white/20">/</span>
            <div className="min-w-0">
              <h1 className="font-display text-sm sm:text-base font-semibold truncate">
                Preview Lab
              </h1>
              <p className="text-[10px] text-white/40 uppercase tracking-wider truncate">
                {wedding.coupleLabel} · /w/{wedding.slug}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="hidden md:inline-flex items-center px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wide bg-gold/10 text-gold border border-gold/30">
              Phase 4A
            </span>
            <span className="hidden md:inline-flex items-center px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wide bg-white/5 text-white/60 border border-white/10">
              {wedding.status}
            </span>
          </div>
        </div>
      </header>

      {/* ─── Preview Lab client island ───────────────────────────────────── */}
      <PreviewLab wedding={weddingPayload} identities={identities} />

      {/* ─── Footer note ─────────────────────────────────────────────────── */}
      <footer className="border-t border-white/10 px-4 sm:px-6 lg:px-8 py-4 text-center">
        <p className="text-[11px] text-white/40">
          Le preview lab charge la page réelle du mariage via un iframe.
          Les statistiques de visite ne sont pas incrémentées en mode aperçu.
        </p>
      </footer>
    </div>
  );
}
