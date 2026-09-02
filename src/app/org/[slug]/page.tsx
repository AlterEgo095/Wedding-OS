// ══════════════════════════════════════════════════════════════════════════════
// /org/[slug]/page.tsx — P3-UX (Sprint Premium tranche 2, PX-8)
// White-label public organization page.
// ══════════════════════════════════════════════════════════════════════════════
//
// Previously the org slug resolved ONLY to the admin back-office
// (/org/[slug]/admin) — an agency had no public, shareable presence on the
// platform. This page gives every organization a premium landing surface:
//
//   - Organization identity: name, logo (when uploaded), brand color accent.
//   - The org's PUBLIC weddings only (status PUBLISHED) as premium cards:
//     couple label, formatted date, venue — deep-linking into /w/[slug].
//   - No PII: email, plan, quotas, members, DRAFT/UNPUBLISHED weddings are
//     never rendered. Suspended / archived orgs 404 (no existence leak —
//     same posture as P1-3a on published-config and PX-3 on ICS).
//
// Server Component (async, Next 16 Promise params) — zero client JS, zero
// API waterfall: one direct db query with an explicit, public-safe select.
// `force-dynamic` so status flips (publish/unpublish/suspend) reflect
// immediately instead of living in an ISR cache.

import { notFound } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import { CalendarDays, MapPin, ArrowRight, Sparkles } from 'lucide-react';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ slug: string }>;
}

function formatDate(d: Date | null): string | null {
  if (!d) return null;
  try {
    return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long' }).format(d);
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const org = await db.organization.findUnique({
    where: { slug },
    select: { name: true, status: true },
  });
  if (!org || org.status !== 'ACTIVE') return { title: 'Page introuvable' };
  return {
    title: `${org.name} — Mariages`,
    description: `Découvrez les mariages organisés par ${org.name} et confirmez votre présence en ligne.`,
  };
}

export default async function OrgPublicPage({ params }: Props) {
  const { slug } = await params;

  const org = await db.organization.findUnique({
    where: { slug },
    select: {
      name: true,
      slug: true,
      logoUrl: true,
      brandColor: true,
      status: true,
      weddings: {
        where: { status: 'PUBLISHED' },
        select: {
          slug: true,
          coupleLabel: true,
          brideName: true,
          groomName: true,
          weddingDate: true,
          venueName: true,
          venueCity: true,
        },
        orderBy: { weddingDate: 'asc' },
      },
    },
  });

  // ACTIVE orgs only — SUSPENDED / ARCHIVED / unknown slugs all 404 alike
  // (no existence oracle for suspended tenants).
  if (!org || org.status !== 'ACTIVE') notFound();

  const brand = org.brandColor && /^#[0-9a-fA-F]{3,8}$/.test(org.brandColor) ? org.brandColor : '#d4a853';

  return (
    <div className="min-h-screen bg-[#0d0a14] relative overflow-hidden">
      {/* Ambient gold glows — same language as the wedding pages */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(212,168,83,0.10)_0%,transparent_55%)] pointer-events-none" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_right,rgba(212,168,83,0.06)_0%,transparent_50%)] pointer-events-none" />

      <div className="relative max-w-4xl mx-auto px-4 py-14 md:py-20">
        {/* ── Org identity ── */}
        <header className="flex flex-col items-center text-center gap-4">
          {org.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={org.logoUrl}
              alt={`Logo ${org.name}`}
              className="w-20 h-20 rounded-2xl object-cover border border-white/10 shadow-xl"
            />
          ) : (
            <div
              className="w-20 h-20 rounded-2xl flex items-center justify-center shadow-xl"
              style={{ backgroundColor: `${brand}22`, border: `1px solid ${brand}55` }}
            >
              <Sparkles className="w-9 h-9" style={{ color: brand }} />
            </div>
          )}
          <div>
            <p className="text-[11px] uppercase tracking-[0.25em] text-muted-foreground mb-2">
              Organisation
            </p>
            <h1 className="font-display text-3xl md:text-4xl font-semibold text-foreground">
              {org.name}
            </h1>
          </div>
          <p className="text-sm text-muted-foreground max-w-md">
            Retrouvez les mariages organisés par {org.name}, confirmez votre présence et
            préparez votre venue en ligne.
          </p>
        </header>

        {/* ── Public weddings ── */}
        <section className="mt-12">
          {org.weddings.length === 0 ? (
            <div className="glass-card gold-border border-0 rounded-2xl p-10 text-center">
              <CalendarDays className="w-8 h-8 mx-auto text-gold/60 mb-3" />
              <p className="font-display text-lg font-semibold text-foreground">
                Aucun mariage public pour le moment
              </p>
              <p className="text-sm text-muted-foreground mt-1.5">
                Revenez bientôt — les prochains événements apparaîtront ici.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {org.weddings.map((w) => {
                const coupleLabel =
                  w.coupleLabel ||
                  [w.brideName, w.groomName].filter(Boolean).join(' & ') ||
                  'Mariage';
                const date = formatDate(w.weddingDate);
                return (
                  <Link
                    key={w.slug}
                    href={`/w/${w.slug}`}
                    className="group glass-card gold-border border-0 rounded-2xl p-6 transition-transform hover:-translate-y-0.5"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h2 className="font-display text-xl font-semibold gold-gradient">
                          {coupleLabel}
                        </h2>
                        <div className="mt-3 space-y-1.5">
                          {date && (
                            <p className="flex items-center gap-2 text-sm text-muted-foreground">
                              <CalendarDays className="w-4 h-4 text-gold/70 shrink-0" />
                              {date}
                            </p>
                          )}
                          {(w.venueName || w.venueCity) && (
                            <p className="flex items-center gap-2 text-sm text-muted-foreground">
                              <MapPin className="w-4 h-4 text-gold/70 shrink-0" />
                              {[w.venueName, w.venueCity].filter(Boolean).join(' — ')}
                            </p>
                          )}
                        </div>
                      </div>
                      <span
                        className="mt-1 w-9 h-9 rounded-full flex items-center justify-center transition-transform group-hover:translate-x-0.5 shrink-0"
                        style={{ backgroundColor: `${brand}1a`, border: `1px solid ${brand}44` }}
                      >
                        <ArrowRight className="w-4 h-4" style={{ color: brand }} />
                      </span>
                    </div>
                    <p className="mt-4 text-xs text-muted-foreground group-hover:text-gold transition-colors">
                      Ouvrir l&apos;invitation →
                    </p>
                  </Link>
                );
              })}
            </div>
          )}
        </section>

        {/* ── Powered-by ── */}
        <footer className="mt-16 text-center">
          <Link
            href="/"
            className="text-xs text-muted-foreground hover:text-gold transition-colors inline-flex items-center gap-1.5"
          >
            <Sparkles className="w-3 h-3" /> Propulsé par Wedding OS
          </Link>
        </footer>
      </div>
    </div>
  );
}
