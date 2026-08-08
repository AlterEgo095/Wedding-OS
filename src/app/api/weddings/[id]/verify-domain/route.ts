export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser, hasPermission, assertWeddingAccessAsync } from '@/lib/auth';
import { invalidateWeddingCache } from '@/lib/tenant-context';
// P5.2-2 (PRE-P5.X-AUDIT-B, HIGH-4): DNS verification for custom domains.
import { buildDnsVerificationRecord } from '@/lib/custom-domains';
import { buildVerificationToken, verifyDnsRecord } from '@/lib/dns-verification';
import { logger } from '@/lib/logger';
import { internalError } from '@/lib/api-errors';
import { getClientInfo } from '@/lib/guest-auth';

// ══════════════════════════════════════════════════════════════════════════════
// /api/weddings/[id]/verify-domain — P5.2-2 organizer-facing DNS verification
// ══════════════════════════════════════════════════════════════════════════════
//
// Organizer-accessible twin of /api/platform/weddings/[id]/verify-domain.
// Closes the PRE-P5.X-AUDIT-B HIGH-4 gap by letting the couple themselves
// (after adding the TXT record at their DNS provider) trigger verification
// without needing a platform admin.
//
// Auth: ORGANIZER+ (or ORG_* with org-scoped access). Tenant-scoped via
// assertWeddingAccessAsync (B2B2C-safe — see P5.1-2).
//
// Flow:
//   GET  → returns the TXT record to add + current verification status
//   POST → performs the DNS lookup and flips `customDomainVerified` on success
// ══════════════════════════════════════════════════════════════════════════════

interface RouteParams {
  params: Promise<{ id: string }>;
}

async function checkAuth(request: NextRequest, weddingId: string) {
  const user = await getAuthUser(request);
  if (!user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  if (!hasPermission(user.role, ['PLATFORM_ADMIN', 'ORGANIZER'])) {
    return { error: NextResponse.json({ error: 'Forbidden — ORGANIZER+ required' }, { status: 403 }) };
  }
  // Tenant-scoped access check — resolves org-scoped access via DB lookup
  // (P5.1-2: B2B2C ORG_ADMIN/ORG_MEMBER access for weddings under their org).
  if (!(await assertWeddingAccessAsync(user, weddingId))) {
    return { error: NextResponse.json({ error: 'Forbidden — not your wedding' }, { status: 403 }) };
  }
  return { user };
}

/**
 * GET /api/weddings/{id}/verify-domain
 *
 * Returns the TXT record the couple must add and the current verification
 * status. Does NOT perform a DNS lookup.
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  const { id: weddingId } = await params;
  const auth = await checkAuth(request, weddingId);
  if ('error' in auth) return auth.error;

  try {
    const wedding = await db.wedding.findUnique({
      where: { id: weddingId },
      select: {
        id: true,
        slug: true,
        customDomain: true,
        customDomainVerified: true,
        plan: true,
      },
    });

    if (!wedding) {
      return NextResponse.json(
        { error: 'Wedding not found' },
        { status: 404 }
      );
    }

    if (!wedding.customDomain) {
      return NextResponse.json({
        customDomain: null,
        customDomainVerified: false,
        dnsVerification: null,
        message: 'Aucun domaine personnalisé configuré pour ce mariage.',
      });
    }

    const token = buildVerificationToken(wedding.id, wedding.customDomain);
    const dnsRecord = buildDnsVerificationRecord(wedding.customDomain, token);

    return NextResponse.json({
      customDomain: wedding.customDomain,
      customDomainVerified: wedding.customDomainVerified,
      plan: wedding.plan,
      dnsVerification: dnsRecord,
      cnameTarget: 'wedding.hpph.net',
      propagationHint: 'La propagation DNS peut prendre de quelques minutes à 24h.',
    });
  } catch (error) {
    logger.error('GET /api/weddings/[id]/verify-domain error', {
      weddingId,
      errMessage: error instanceof Error ? error.message : String(error),
      errName: error instanceof Error ? error.name : 'Unknown',
    });
    return internalError();
  }
}

/**
 * POST /api/weddings/{id}/verify-domain
 *
 * Performs a live DNS TXT lookup and, on success, flips `customDomainVerified`
 * to true. Writes an audit log entry either way. The wedding cache is
 * invalidated on success so the next request to /api/resolve-domain picks up
 * the new verification state.
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  const { id: weddingId } = await params;
  const auth = await checkAuth(request, weddingId);
  if ('error' in auth) return auth.error;
  const { user } = auth;

  try {
    const wedding = await db.wedding.findUnique({
      where: { id: weddingId },
      select: {
        id: true,
        slug: true,
        customDomain: true,
        customDomainVerified: true,
      },
    });

    if (!wedding) {
      return NextResponse.json(
        { error: 'Wedding not found' },
        { status: 404 }
      );
    }

    if (!wedding.customDomain) {
      return NextResponse.json(
        { error: 'Aucun domaine personnalisé à vérifier.' },
        { status: 400 }
      );
    }

    const expectedToken = buildVerificationToken(wedding.id, wedding.customDomain);
    const result = await verifyDnsRecord(wedding.customDomain, expectedToken);

    const client = getClientInfo(request);

    if (result.verified) {
      await db.$transaction(async (tx) => {
        await tx.wedding.update({
          where: { id: weddingId },
          data: { customDomainVerified: true },
        });
        await tx.auditLog.create({
          data: {
            weddingId,
            userId: user.id,
            action: 'CUSTOM_DOMAIN_VERIFIED',
            details:
              `DNS verification succeeded for ${wedding.customDomain} ` +
              `(wedding ${wedding.slug}, token present in TXT record ${result.lookupName})`,
            ipAddress: client.ipAddress ?? null,
            userAgent: client.userAgent ?? null,
          },
        });
      });
      invalidateWeddingCache(wedding.slug);
    } else {
      // Persist the failure as an audit log entry (no DB state change).
      await db.auditLog.create({
        data: {
          weddingId,
          userId: user.id,
          action: 'CUSTOM_DOMAIN_VERIFY_FAILED',
          details:
            `DNS verification failed for ${wedding.customDomain} ` +
            `(wedding ${wedding.slug}, reason=${result.reason}, ` +
            `records=${JSON.stringify(result.records)})`,
          ipAddress: client.ipAddress ?? null,
          userAgent: client.userAgent ?? null,
        },
      });
    }

    return NextResponse.json({
      customDomain: wedding.customDomain,
      customDomainVerified: result.verified,
      reason: result.reason,
      lookupName: result.lookupName,
      records: result.records,
      expectedToken,
    });
  } catch (error) {
    logger.error('POST /api/weddings/[id]/verify-domain error', {
      weddingId,
      errMessage: error instanceof Error ? error.message : String(error),
      errName: error instanceof Error ? error.name : 'Unknown',
    });
    return internalError();
  }
}
