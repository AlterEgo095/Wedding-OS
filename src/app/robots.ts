// ══════════════════════════════════════════════════════════════════════════════
// ROBOTS — Dynamic robots.txt
// ══════════════════════════════════════════════════════════════════════════════
// Phase 0 ÉTAPE 3 — SEO: disallow admin/platform/API routes, allow public
// wedding pages, reference the sitemap.
//
// Next.js App Router automatically serves this at /robots.txt.
// ══════════════════════════════════════════════════════════════════════════════

import type { MetadataRoute } from 'next';
import { PLATFORM } from '@/lib/config';

export default function robots(): MetadataRoute.Robots {
  const baseUrl = `https://${PLATFORM.productionDomain}`;

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/admin', '/platform', '/api', '/w/*/admin', '/w/*/invite'],
      },
      // Allow social media crawlers to access invitation pages for OG previews
      {
        userAgent: ['Googlebot', 'Bingbot', 'facebookexternalhit', 'Twitterbot', 'WhatsApp'],
        allow: '/',
        disallow: ['/admin', '/platform', '/api'],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
    host: baseUrl,
  };
}
