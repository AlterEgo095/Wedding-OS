export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser, requirePlatformAdmin } from '@/lib/auth';
import { withSecurityHeaders } from '@/lib/rate-limit';
import { writeAuditLog } from '@/lib/audit';
import { logger } from '@/lib/logger';
import { internalError, forbidden } from '@/lib/api-errors';

/**
 * POST /api/platform/seed
 *
 * 5.8.15 — No-Code Seed Endpoint.
 *
 * Seeds the platform with sample Products, Components, and Assets so the
 * Production Studio tabs (Products, Components, Assets) are not empty.
 * This is the "one-click fix" for the P1-03/04/05 audit findings
 * (Products=0, Components=0, Assets=0).
 *
 * Idempotent: if a seed item with the same slug already exists, it is
 * skipped (not duplicated). Safe to call multiple times.
 *
 * Auth: SUPER_ADMIN / PLATFORM_ADMIN only.
 *
 * Body: { what?: 'all' | 'products' | 'components' | 'assets' }
 *   Defaults to 'all'.
 */

interface SeedResult {
  productsCreated: number;
  productsSkipped: number;
  componentsCreated: number;
  componentsSkipped: number;
  assetsCreated: number;
  assetsSkipped: number;
  layoutsCreated: number;
  layoutsSkipped: number;
  errors: string[];
}

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    const denied = requirePlatformAdmin(user);
    if (denied) return denied;

    const body = await request.json().catch(() => ({}));
    const what = (body?.what || 'all').toLowerCase();

    if (!['all', 'products', 'components', 'assets', 'layouts'].includes(what)) {
      return NextResponse.json(
        { error: "`what` doit être 'all' | 'products' | 'components' | 'assets'" },
        { status: 400 }
      );
    }

    const result: SeedResult = {
      productsCreated: 0,
      productsSkipped: 0,
      componentsCreated: 0,
      componentsSkipped: 0,
      assetsCreated: 0,
      assetsSkipped: 0,
      layoutsCreated: 0,
      layoutsSkipped: 0,
      errors: [],
    };

    // ─── 1. Seed Products (P1-03) ──────────────────────────────────────────
    // Commercial products that bundle collections + add-ons.
    if (what === 'all' || what === 'products') {
      const seedProducts = [
        {
          name: 'Royal Gold Complete',
          slug: 'royal-gold-complete',
          description: 'L\'expérience matrimoniale ultime — domaine personnalisé, QR premium, album photo cinéma, crédits SMS illimités.',
          bundleJson: JSON.stringify({
            collectionIds: [],
            addOns: [
              { type: 'SMS_CREDITS', quantity: 500 },
              { type: 'EXPORT_CREDITS', quantity: 100 },
              { type: 'PRINT_MATERIALS', quantity: 200 },
            ],
            features: [
              { key: 'CUSTOM_DOMAIN', value: 'true' },
              { key: 'PREMIUM_QR', value: 'true' },
              { key: 'ANALYTICS', value: 'true' },
              { key: 'GUESTBOOK_MODERATION', value: 'true' },
            ],
          }),
          priceCents: 4999,
          currency: 'USD',
          licence: 'EXCLUSIVE',
          status: 'PUBLISHED',
        },
        {
          name: 'Premium Essentials',
          slug: 'premium-essentials',
          description: 'Tout ce qu\'il faut pour un mariage élégant — thème premium, QR codes, RSVP, galerie, livre d\'or.',
          bundleJson: JSON.stringify({
            collectionIds: [],
            addOns: [
              { type: 'SMS_CREDITS', quantity: 200 },
              { type: 'EXPORT_CREDITS', quantity: 50 },
            ],
            features: [
              { key: 'PREMIUM_QR', value: 'true' },
              { key: 'ANALYTICS', value: 'true' },
            ],
          }),
          priceCents: 1999,
          currency: 'USD',
          licence: 'STANDARD',
          status: 'PUBLISHED',
        },
        {
          name: 'Essentiel Basique',
          slug: 'essentiel-basique',
          description: 'Site de mariage simple et beau — thème standard, RSVP, QR codes de base.',
          bundleJson: JSON.stringify({
            collectionIds: [],
            addOns: [{ type: 'SMS_CREDITS', quantity: 50 }],
            features: [{ key: 'PREMIUM_QR', value: 'false' }],
          }),
          priceCents: 999,
          currency: 'USD',
          licence: 'STANDARD',
          status: 'PUBLISHED',
        },
        {
          name: 'Extension Album Cinéma',
          slug: 'extension-album-cinema',
          description: 'Add-on — album photo cinématographique avec retouche professionnelle, livraison en 7 jours.',
          bundleJson: JSON.stringify({
            collectionIds: [],
            addOns: [{ type: 'PRINT_MATERIALS', quantity: 100 }],
            features: [{ key: 'CINEMA_EDIT', value: 'true' }],
          }),
          priceCents: 1499,
          currency: 'USD',
          licence: 'STANDARD',
          status: 'PUBLISHED',
        },
        {
          name: 'Extension Domaine Personnalisé',
          slug: 'extension-domaine-personnalise',
          description: 'Add-on — domaine personnalisé (ex: mariée-et-marié.com) avec SSL automatique.',
          bundleJson: JSON.stringify({
            collectionIds: [],
            addOns: [],
            features: [{ key: 'CUSTOM_DOMAIN', value: 'true' }, { key: 'SSL_AUTO', value: 'true' }],
          }),
          priceCents: 299,
          currency: 'USD',
          licence: 'STANDARD',
          status: 'PUBLISHED',
        },
      ];

      for (const p of seedProducts) {
        try {
          const existing = await db.product.findUnique({ where: { slug: p.slug } });
          if (existing) {
            result.productsSkipped++;
          } else {
            await db.product.create({ data: p });
            result.productsCreated++;
          }
        } catch (e) {
          result.errors.push(`Product ${p.slug}: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
    }

    // ─── 2. Seed Components (P1-04) ────────────────────────────────────────
    // Visual Frontend Builder component library.
    if (what === 'all' || what === 'components') {
      const seedComponents = [
        { name: 'Hero Section', slug: 'hero', type: 'hero', schemaJson: JSON.stringify({ title: 'string', subtitle: 'string', bgImage: 'string?', ctaText: 'string', ctaLink: 'string?' }) },
        { name: 'Couple Presentation', slug: 'couple', type: 'couple', schemaJson: JSON.stringify({ brideName: 'string', groomName: 'string', bridePhoto: 'string', groomPhoto: 'string', story: 'string' }) },
        { name: 'Countdown Timer', slug: 'countdown', type: 'countdown', schemaJson: JSON.stringify({ targetDate: 'date', labels: 'object' }) },
        { name: 'Our Story', slug: 'story', type: 'story', schemaJson: JSON.stringify({ chapters: 'array', title: 'string' }) },
        { name: 'Photo Gallery', slug: 'gallery', type: 'gallery', schemaJson: JSON.stringify({ photos: 'array', layout: 'grid|carousel|masonry', columns: 'number' }) },
        { name: 'Event Timeline', slug: 'timeline', type: 'timeline', schemaJson: JSON.stringify({ events: 'array', title: 'string' }) },
        { name: 'Venue Information', slug: 'venue', type: 'venue', schemaJson: JSON.stringify({ name: 'string', address: 'string', city: 'string', mapUrl: 'string' }) },
        { name: 'Location Map', slug: 'map', type: 'map', schemaJson: JSON.stringify({ lat: 'number', lng: 'number', zoom: 'number' }) },
        { name: 'Invitation Block', slug: 'invitation', type: 'invitation', schemaJson: JSON.stringify({ title: 'string', message: 'string', ctaText: 'string' }) },
        { name: 'RSVP Form', slug: 'rsvp-form', type: 'rsvp-form', schemaJson: JSON.stringify({ title: 'string', fields: 'array', submitText: 'string' }) },
        { name: 'Guestbook', slug: 'guestbook', type: 'guestbook', schemaJson: JSON.stringify({ title: 'string', allowPhotos: 'boolean', moderation: 'boolean' }) },
        { name: 'Call to Action', slug: 'cta', type: 'cta', schemaJson: JSON.stringify({ text: 'string', buttonText: 'string', buttonLink: 'string', style: 'primary|secondary' }) },
        { name: 'Programme', slug: 'programme', type: 'programme', schemaJson: JSON.stringify({ items: 'array', title: 'string' }) },
        { name: 'Seating Tables', slug: 'tables', type: 'tables', schemaJson: JSON.stringify({ title: 'string', showGuestNames: 'boolean' }) },
        { name: 'Gift Registry', slug: 'gifts', type: 'gifts', schemaJson: JSON.stringify({ title: 'string', items: 'array' }) },
      ];

      for (const c of seedComponents) {
        try {
          const existing = await db.componentRegistry.findUnique({ where: { slug: c.slug } });
          if (existing) {
            result.componentsSkipped++;
          } else {
            await db.componentRegistry.create({ data: { ...c, version: 1, status: 'PUBLISHED' } });
            result.componentsCreated++;
          }
        } catch (e) {
          result.errors.push(`Component ${c.slug}: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
    }

    // ─── 3. Seed Assets (P1-05) ────────────────────────────────────────────
    // Platform-wide media assets (placeholder images + fonts).
    if (what === 'all' || what === 'assets') {
      const seedAssets = [
        { name: 'Hero Background — Gold Bokeh', type: 'image', url: '/images/placeholders/hero-gold-bokeh.jpg', sizeBytes: 245000, metadata: JSON.stringify({ width: 1920, height: 1080, format: 'jpg' }) },
        { name: 'Hero Background — Rose Petals', type: 'image', url: '/images/placeholders/hero-rose-petals.jpg', sizeBytes: 312000, metadata: JSON.stringify({ width: 1920, height: 1080, format: 'jpg' }) },
        { name: 'Couple Placeholder — Bride', type: 'image', url: '/images/placeholders/bride-default.jpg', sizeBytes: 156000, metadata: JSON.stringify({ width: 800, height: 1000, format: 'jpg' }) },
        { name: 'Couple Placeholder — Groom', type: 'image', url: '/images/placeholders/groom-default.jpg', sizeBytes: 148000, metadata: JSON.stringify({ width: 800, height: 1000, format: 'jpg' }) },
        { name: 'Gallery Sample — Ceremony', type: 'image', url: '/images/placeholders/gallery-ceremony.jpg', sizeBytes: 198000, metadata: JSON.stringify({ width: 1200, height: 800, format: 'jpg' }) },
        { name: 'Gallery Sample — Reception', type: 'image', url: '/images/placeholders/gallery-reception.jpg', sizeBytes: 205000, metadata: JSON.stringify({ width: 1200, height: 800, format: 'jpg' }) },
        { name: 'Font — Cormorant Garamond', type: 'font', url: 'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;500;600;700', sizeBytes: 0, metadata: JSON.stringify({ family: 'Cormorant Garamond', weights: [400, 500, 600, 700] }) },
        { name: 'Font — Playfair Display', type: 'font', url: 'https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;500;600;700;800;900', sizeBytes: 0, metadata: JSON.stringify({ family: 'Playfair Display', weights: [400, 500, 600, 700, 800, 900] }) },
        { name: 'Font — Inter (Body)', type: 'font', url: 'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700', sizeBytes: 0, metadata: JSON.stringify({ family: 'Inter', weights: [300, 400, 500, 600, 700] }) },
        { name: 'Icon Set — Wedding Rings', type: 'image', url: '/images/placeholders/icon-rings.svg', sizeBytes: 4200, metadata: JSON.stringify({ width: 128, height: 128, format: 'svg' }) },
      ];

      for (const a of seedAssets) {
        try {
          // Assets don't have a unique slug — check by name + type
          const existing = await db.platformAsset.findFirst({
            where: { name: a.name, type: a.type },
          });
          if (existing) {
            result.assetsSkipped++;
          } else {
            await db.platformAsset.create({ data: a });
            result.assetsCreated++;
          }
        } catch (e) {
          result.errors.push(`Asset ${a.name}: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
    }

    // ─── Audit log ─────────────────────────────────────────────────────────
    await writeAuditLog({
      action: 'platform.seed',
      weddingId: null,
      userId: user?.id ?? null,
      details: JSON.stringify({ what, result }),
      request,
    }).catch((e) => logger.error('seed audit log failed', { err: e }));


    // ─── 5.8.16 P1-03: Default Layouts (Visual Frontend Builder seed) ──────
    if (what === 'all' || what === 'layouts') {
      const DEFAULT_LAYOUTS = [
        {
          name: 'Classique',
          slug: 'classic',
          description: 'Hero, Couple, Galerie, Chronologie, RSVP, QR',
          sections: ['hero','couple','gallery','timeline','rsvp','qr'],
        },
        {
          name: 'Moderne',
          slug: 'modern',
          description: 'Hero, Countdown, Galerie, Programme, Livre d Or',
          sections: ['hero','countdown','gallery','program','guestbook'],
        },
        {
          name: 'Minimaliste',
          slug: 'minimal',
          description: 'Hero, Couple, Infos, RSVP',
          sections: ['hero','couple','info','rsvp'],
        },
        {
          name: 'Romantique',
          slug: 'romantic',
          description: 'Hero, Histoire, Galerie, Chronologie, RSVP, Livre d Or',
          sections: ['hero','story','gallery','timeline','rsvp','guestbook'],
        },
        {
          name: 'Luxe',
          slug: 'luxury',
          description: 'Hero, Couple, Galerie, Programme, Tables, QR, Livre d Or',
          sections: ['hero','couple','gallery','program','tables','qr','guestbook'],
        },
      ];
      for (const layout of DEFAULT_LAYOUTS) {
        const existing = await db.layout.findUnique({ where: { slug: layout.slug } });
        if (!existing) {
          const sectionsJson = JSON.stringify(
            layout.sections.map((s: string, i: number) => ({
              id: s,
              component: s.charAt(0).toUpperCase() + s.slice(1),
              label: s,
              order: i,
              props: {},
            }))
          );
          await db.layout.create({
            data: {
              name: layout.name,
              slug: layout.slug,
              description: layout.description,
              sectionsJson,
              propsJson: '{}',
              status: 'PUBLISHED',
              isBuiltIn: true,
            },
          });
          result.layoutsCreated++;
        }
      }
    }

    return withSecurityHeaders(
      NextResponse.json({
        success: true,
        message: `Seed terminé: ${result.productsCreated} produits, ${result.componentsCreated} composants, ${result.assetsCreated} assets créés.`,
        result,
      })
    );
  } catch (error) {
    logger.error('platform.seed failed', {
      errMessage: error instanceof Error ? error.message : String(error),
    });
    return internalError('Échec du seed');
  }
}

/**
 * GET /api/platform/seed — returns current counts of seedable entities.
 * Read-only preview of what the POST would create.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    const denied = requirePlatformAdmin(user);
    if (denied) return denied;

    const [products, components, assets] = await Promise.all([
      db.product.count(),
      db.componentRegistry.count(),
      db.platformAsset.count(),
    ]);

    return withSecurityHeaders(
      NextResponse.json({
        products,
        components,
        assets,
        isEmpty: products === 0 && components === 0 && assets === 0,
      })
    );
  } catch (error) {
    logger.error('platform.seed GET failed', {
      errMessage: error instanceof Error ? error.message : String(error),
    });
    return internalError();
  }
}
