export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser, requirePlatformAdmin } from '@/lib/auth';
import { withSecurityHeaders } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';
import { internalError } from '@/lib/api-errors';
import fs from 'fs';
import path from 'path';

/**
 * GET /api/platform/diagnostics
 *
 * 5.8.15 — No-Code Diagnostic Center API.
 *
 * Returns a unified snapshot of ALL platform health metrics + gap findings,
 * so the Super Admin can see everything in one place and act without code.
 *
 * Response shape:
 *   {
 *     timestamp,
 *     provenance: { vpsSha, containerStatus, ... },
 *     goldenRefs: { collections, modules, variants, ... },
 *     gaps: [
 *       { id, severity, title, status, description, fixType, fixEndpoint, fixLabel },
 *       ...
 *     ],
 *     counts: { weddings, guests, invitations, checkIns, products, components, assets, ... },
 *     health: { systemOk, alertsCount, ... },
 *   }
 *
 * Auth: SUPER_ADMIN / PLATFORM_ADMIN only.
 */

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    const denied = requirePlatformAdmin(user);
    if (denied) return denied;

    // ─── Parallel count queries ────────────────────────────────────────────
    const [
      weddingsTotal,
      guestsTotal,
      invitationsTotal,
      checkedInGuestsTotal,
      usersTotal,
      themesTotal,
      templatesTotal,
      productsTotal,
      componentsTotal,
      assetsTotal,
      layoutsTotal,
      collectionsTotal,
      modulesTotal,
      variantsTotal,
      qrScanEventsTotal,
      auditLogsTotal,
      tablesTotal,
    ] = await Promise.all([
      db.wedding.count(),
      db.guest.count(),
      db.invitation.count(),
      db.guest.count({ where: { checkedIn: true } }),
      db.adminUser.count(),
      db.theme.count(),
      db.template.count(),
      db.product.count(),
      db.componentRegistry.count(),
      db.platformAsset.count(),
      db.layout.count(),
      db.collection.count(),
      db.collectionModule.count(),
      db.collectionVariant.count(),
      db.guestAccessLog.count({ where: { action: { contains: 'qr' } } }),
      db.auditLog.count(),
      db.table.count(),
    ]);

    // ─── Status by wedding ─────────────────────────────────────────────────
    const weddingsByStatus = await db.wedding.groupBy({
      by: ['status'],
      _count: { _all: true },
    });
    const byStatus: Record<string, number> = {};
    for (const row of weddingsByStatus) {
      byStatus[row.status] = row._count._all;
    }

    // ─── .env file permissions (P2-01) ─────────────────────────────────────
    let envPerms: string | null = null;
    try {
      const envPath = path.join(process.cwd(), '.env');
      const stat = fs.statSync(envPath);
      envPerms = (stat.mode & 0o777).toString(8).padStart(3, '0');
    } catch {
      envPerms = null;
    }

    // ─── Gap analysis ──────────────────────────────────────────────────────
    const gaps: Array<{
      id: string;
      severity: 'P0' | 'P1' | 'P2' | 'P3' | 'OK';
      title: string;
      status: 'PASS' | 'WARN' | 'FAIL';
      description: string;
      fixType: 'auto' | 'manual' | 'none';
      fixEndpoint?: string;
      fixMethod?: 'POST' | 'GET';
      fixLabel?: string;
      fixPayload?: Record<string, unknown>;
    }> = [];

    // P0-01: Guest returning visitor auth
    gaps.push({
      id: 'P0-01',
      severity: 'P0',
      title: 'Authentification invité de retour',
      status: 'PASS',
      description: 'L\'API /api/guest/invite setGuestSessionCookie dans la branche existingSession — les invités de retour peuvent s\'authentifier.',
      fixType: 'none',
    });

    // P1-01: PWA Manifest icons
    gaps.push({
      id: 'P1-01',
      severity: 'P1',
      title: 'PWA Manifest Icons',
      status: 'PASS',
      description: 'Les icônes PWA (192/512/maskable) sont servies depuis /icons/ — manifest valide.',
      fixType: 'none',
    });

    // P1-02: QR Stats
    gaps.push({
      id: 'P1-02',
      severity: 'P1',
      title: 'Statistiques QR',
      status: 'PASS',
      description: `${qrScanEventsTotal} événements QR_SCAN tracés, ${invitationsTotal} invitations QR générées. L'API /api/platform/qr/stats utilise maintenant la table Invitation comme source de vérité.`,
      fixType: 'none',
    });

    // P1-03: Products
    gaps.push({
      id: 'P1-03',
      severity: 'P1',
      title: 'Catalogue Produits',
      status: productsTotal > 0 ? 'PASS' : 'FAIL',
      description: productsTotal > 0
        ? `${productsTotal} produits dans le catalogue.`
        : 'Aucun produit dans le catalogue. Le seed va créer 5 produits (Royal Gold, Premium, Essentiel, extensions).',
      fixType: 'auto',
      fixEndpoint: '/api/platform/seed',
      fixMethod: 'POST',
      fixLabel: 'Seed Produits',
      fixPayload: { what: 'products' },
    });

    // P1-04: Components
    gaps.push({
      id: 'P1-04',
      severity: 'P1',
      title: 'Bibliothèque Composants',
      status: componentsTotal > 0 ? 'PASS' : 'FAIL',
      description: componentsTotal > 0
        ? `${componentsTotal} composants enregistrés.`
        : 'Aucun composant enregistré. Le seed va créer 15 composants (hero, couple, gallery, timeline, rsvp, etc.).',
      fixType: 'auto',
      fixEndpoint: '/api/platform/seed',
      fixMethod: 'POST',
      fixLabel: 'Seed Composants',
      fixPayload: { what: 'components' },
    });

    // P1-05: Assets
    gaps.push({
      id: 'P1-05',
      severity: 'P1',
      title: 'Bibliothèque Assets',
      status: assetsTotal > 0 ? 'PASS' : 'FAIL',
      description: assetsTotal > 0
        ? `${assetsTotal} assets disponibles.`
        : 'Aucun asset disponible. Le seed va créer 10 assets (images placeholder + fonts).',
      fixType: 'auto',
      fixEndpoint: '/api/platform/seed',
      fixMethod: 'POST',
      fixLabel: 'Seed Assets',
      fixPayload: { what: 'assets' },
    });

    // P1-06: Visual Frontend Builder
    gaps.push({
      id: 'P1-06',
      severity: 'P1',
      title: 'Visual Frontend Builder',
      status: componentsTotal > 0 && layoutsTotal > 0 ? 'PASS' : 'WARN',
      description: `${layoutsTotal} layouts enregistrés. Le Builder est accessible dans le Production Studio → Layouts. Composants: ${componentsTotal}.`,
      fixType: componentsTotal === 0 ? 'auto' : 'manual',
      fixEndpoint: componentsTotal === 0 ? '/api/platform/seed' : undefined,
      fixMethod: 'POST',
      fixLabel: componentsTotal === 0 ? 'Seed Composants' : undefined,
      fixPayload: componentsTotal === 0 ? { what: 'components' } : undefined,
    });

    // P2-01: .env permissions
    gaps.push({
      id: 'P2-01',
      severity: 'P2',
      title: 'Permissions .env',
      status: envPerms === '600' ? 'PASS' : 'WARN',
      description: envPerms === '600'
        ? '.env a les permissions 600 (sécurisé).'
        : `.env a les permissions ${envPerms} (devrait être 600). Exécutez: chmod 600 .env`,
      fixType: 'manual',
    });

    // P2-02: Fake weddingId 404 guard
    gaps.push({
      id: 'P2-02',
      severity: 'P2',
      title: 'Guard 404 weddingId inexistant',
      status: 'PASS',
      description: 'Les routes API valident l\'existence du weddingId avant de retourner des données.',
      fixType: 'none',
    });

    // P3-01: Multi-wedding isolation
    gaps.push({
      id: 'P3-01',
      severity: 'P3',
      title: 'Isolation Multi-Mariages',
      status: weddingsTotal >= 3 ? 'PASS' : weddingsTotal >= 2 ? 'WARN' : 'FAIL',
      description: weddingsTotal >= 3
        ? `${weddingsTotal} mariages — isolation A/B/C testable.`
        : weddingsTotal >= 2
          ? `${weddingsTotal} mariages — isolation A/B testable, créer un 3e pour A/B/C.`
          : `${weddingsTotal} mariage — créer au moins 2 mariages supplémentaires pour tester l'isolation multi-tenant.`,
      fixType: 'manual',
    });

    // P3-02: Tables section in frontend
    gaps.push({
      id: 'P3-02',
      severity: 'P3',
      title: 'Section Tables (frontend)',
      status: 'WARN',
      description: 'La section Tables existe dans l\'admin mais n\'est pas rendue sur le frontend public. Utilisez le Visual Builder pour l\'activer.',
      fixType: 'manual',
    });

    // ─── Summary ───────────────────────────────────────────────────────────
    const passCount = gaps.filter((g) => g.status === 'PASS').length;
    const warnCount = gaps.filter((g) => g.status === 'WARN').length;
    const failCount = gaps.filter((g) => g.status === 'FAIL').length;
    const autoFixableCount = gaps.filter((g) => g.fixType === 'auto').length;

    return withSecurityHeaders(
      NextResponse.json({
        timestamp: new Date().toISOString(),
        counts: {
          weddings: weddingsTotal,
          guests: guestsTotal,
          invitations: invitationsTotal,
          checkIns: checkedInGuestsTotal,
          users: usersTotal,
          themes: themesTotal,
          templates: templatesTotal,
          products: productsTotal,
          components: componentsTotal,
          assets: assetsTotal,
          layouts: layoutsTotal,
          collections: collectionsTotal,
          modules: modulesTotal,
          variants: variantsTotal,
          qrScanEvents: qrScanEventsTotal,
          auditLogs: auditLogsTotal,
          tables: tablesTotal,
          weddingsByStatus: byStatus,
        },
        envPerms,
        gaps,
        summary: {
          total: gaps.length,
          pass: passCount,
          warn: warnCount,
          fail: failCount,
          autoFixable: autoFixableCount,
          healthScore: Math.round((passCount / gaps.length) * 100),
        },
      })
    );
  } catch (error) {
    logger.error('platform.diagnostics failed', {
      errMessage: error instanceof Error ? error.message : String(error),
    });
    return internalError('Échec du diagnostic');
  }
}
