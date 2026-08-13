// ══════════════════════════════════════════════════════════════════════════════
// SITEMAP — Dynamic SEO sitemap (Mission 5.9.4 SEO upgrade)
// ══════════════════════════════════════════════════════════════════════════════
// Previously: only 3 URLs (/, /onboarding, /w/[slug]).
// Now: includes ALL public routes + all published weddings.
//
// Public routes added:
//   - /              (home — marketing OS)
//   - /onboarding    (create-event entry point)
//   - /showcase      (portfolio / case studies)
//   - /org/signup    (B2B2C organization signup)
//
// Per-wedding URLs:
//   - /w/[slug]      (public wedding experience — PUBLISHED only)
//
// Excluded (disallowed in robots.txt):
//   - /platform/*    (admin login + dashboard)
//   - /admin/*       (legacy admin)
//   - /api/*         (API endpoints)
//   - /w/*/admin/*   (per-wedding admin)
//   - /w/*/invite/*  (guest-only invitation access — private)
//   - /offline       (PWA offline fallback — not useful for SEO)
// ══════════════════════════════════════════════════════════════════════════════

import type { MetadataRoute } from 'next';
import { db } from '@/lib/db';
import { PLATFORM } from '@/lib/config';

export const dynamic = 'force-dynamic';
// Revalidate every 60 minutes — weddings don't change often, but we want
// fresh slugs to appear within an hour of publication.
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = `https://${PLATFORM.productionDomain}`;
  const now = new Date();
  const entries: MetadataRoute.Sitemap = [];

  // ── Static public pages (ordered by priority) ──────────────────────────────
  entries.push({
    url: `${baseUrl}/`,
    lastModified: now,
    changeFrequency: 'weekly',
    priority: 1.0,
  });
  entries.push({
    url: `${baseUrl}/showcase`,
    lastModified: now,
    changeFrequency: 'weekly',
    priority: 0.9,
  });
  entries.push({
    url: `${baseUrl}/onboarding`,
    lastModified: now,
    changeFrequency: 'monthly',
    priority: 0.7,
  });
  entries.push({
    url: `${baseUrl}/org/signup`,
    lastModified: now,
    changeFrequency: 'monthly',
    priority: 0.6,
  });

  // ── Published weddings (public experience pages) ───────────────────────────
  try {
    const weddings = await db.wedding.findMany({
      where: {
        status: 'PUBLISHED',
        // Only include weddings that are publicly accessible (not draft, not archived).
        // The /w/[slug] route checks this too — we mirror the gate here so the
        // sitemap never advertises a page that would 404.
      },
      select: {
        slug: true,
        updatedAt: true,
        // Use weddingDate if available for lastmod (more meaningful than updatedAt
        // for past events — their content is frozen).
        weddingDate: true,
      },
      orderBy: { updatedAt: 'desc' },
    });

    for (const wedding of weddings) {
      // For past events, lastmod = weddingDate (content is frozen after the event).
      // For upcoming events, lastmod = updatedAt (details may change).
      const lastModified = wedding.weddingDate && wedding.weddingDate < now
        ? wedding.weddingDate
        : wedding.updatedAt;

      entries.push({
        url: `${baseUrl}/w/${wedding.slug}`,
        lastModified,
        changeFrequency: 'weekly',
        priority: 0.8,
      });
    }
  } catch {
    // DB unavailable — return static entries only (sitemap still valid, just smaller)
  }

  return entries;
}
