// ══════════════════════════════════════════════════════════════════════════════
// SITEMAP — Dynamic per-wedding sitemap
// ══════════════════════════════════════════════════════════════════════════════
// Phase 0 ÉTAPE 3 — SEO: generate a sitemap.xml that includes all published
// weddings. Previously no sitemap existed, hurting SEO crawl coverage.
//
// Next.js App Router automatically serves this at /sitemap.xml.
// ══════════════════════════════════════════════════════════════════════════════

import type { MetadataRoute } from 'next';
import { db } from '@/lib/db';
import { PLATFORM } from '@/lib/config';

export const dynamic = 'force-dynamic';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = `https://${PLATFORM.productionDomain}`;
  const entries: MetadataRoute.Sitemap = [];

  // ── Static pages ──
  entries.push({
    url: `${baseUrl}/`,
    lastModified: new Date(),
    changeFrequency: 'weekly',
    priority: 1.0,
  });
  entries.push({
    url: `${baseUrl}/onboarding`,
    lastModified: new Date(),
    changeFrequency: 'monthly',
    priority: 0.6,
  });

  // ── Published weddings ──
  try {
    const weddings = await db.wedding.findMany({
      where: { status: 'PUBLISHED' },
      select: { slug: true, updatedAt: true },
      orderBy: { updatedAt: 'desc' },
    });

    for (const wedding of weddings) {
      entries.push({
        url: `${baseUrl}/w/${wedding.slug}`,
        lastModified: wedding.updatedAt,
        changeFrequency: 'weekly',
        priority: 0.8,
      });
    }
  } catch {
    // DB unavailable — return static entries only
  }

  return entries;
}
