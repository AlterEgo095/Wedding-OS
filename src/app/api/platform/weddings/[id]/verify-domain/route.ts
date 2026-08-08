export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser, requirePlatformAdmin } from '@/lib/auth';
import { invalidateWeddingCache } from '@/lib/tenant-context';
// P5.2-2 (PRE-P5.X-AUDIT-B, HIGH-4): DNS verification for custom domains.
import { buildDnsVerificationRecord } from '@/lib/custom-domains';
import { buildVerificationToken, verifyDnsRecord } from '@/lib/dns-verification';
import { logger } from '@/lib/logger';
import { internalError } from '@/lib/api-errors';
import { writeAuditLog } from '@/lib/audit';

// ══════════════════════════════════════════════════════════════════════════════
// /api/platform/weddings/[id]/verify-domain — P5.2-2 DNS verification gate
// ══════════════════════════════════════════════════════════════════════════════
//
// Platform-admin endpoint that activates the DNS verification flow for a
// wedding's custom domain. Closes the PRE-P5.X-AUDIT-B HIGH-4 gap where
// `buildDnsVerificationRecord()` existed but was never called, allowing any
// PREMIUM couple to claim `google.com` as their custom domain.
//
// Flow:
//   1. ORGANIZER / Super Admin sets `customDomain` on a wedding →
//      `customDomainVerified` is reset to false (handled in the PUT endpoint).
//   2. GET  /verify-domain  → returns the TXT record the couple must add and
//                              the current verification status.
//   3. POST /verify-domain  → performs the DNS TXT lookup at
//                              `_heureux-mariage.{domain}` and, on success,
//                              flips `customDomainVerified` to true.
//
// Auth: PLATFORM_ADMIN+. The organizer-facing twin lives at
// /api/weddings/[id]/verify-domain (uses assertWeddingAccessAsync).
// ══════════════════════════════════════════════════════════════════════════════

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/platform/weddings/{id}/verify-domain
 *
 * Returns the current verification status and the exact TXT record the couple
 * must add at their DNS provider. Does NOT perform a DNS lookup — call POST
 * to actually verify.
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await getAuthUser(request);
    const denied = requirePlatformAdmin(user);
    if (denied) return denied;

    const { id } = await params;

    const wedding = await db.wedding.findUnique({
      where: { id },
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
      dnsVerification: dnsRecord,
      cnameTarget: 'wedding.hpph.net',
      // Hint for the frontend: how long DNS propagation typically takes.
      propagationHint: 'La propagation DNS peut prendre de quelques minutes à 24h.',
    });
  } catch (error) {
    logger.error('GET /api/platform/weddings/[id]/verify-domain error', {
      errMessage: error instanceof Error ? error.message : String(error),
      errName: error instanceof Error ? error.name : 'Unknown',
    });
    return internalError();
  }
}

/**
 * POST /api/platform/weddings/{id}/verify-domain
 *
 * Performs a live DNS TXT lookup for `_heureux-mariage.{domain}` and verifies
 * that the deterministic verification token is present. On success, flips
 * `customDomainVerified` to true so /api/resolve-domain will start routing
 * the custom domain to this wedding. Writes an audit log entry either way
 * (so verification attempts are traceable).
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await getAuthUser(request);
    const denied = requirePlatformAdmin(user);
    if (denied) return denied;

    const { id } = await params;

    const wedding = await db.wedding.findUnique({
      where: { id },
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

    // Persist verification status + write an audit log entry.
    if (result.verified) {
      await db.wedding.update({
        where: { id },
        data: { customDomainVerified: true },
      });
      invalidateWeddingCache(wedding.slug);
    }

    await writeAuditLog({
      weddingId: null, // platform-level event
      userId: user!.id,
      action: result.verified ? 'CUSTOM_DOMAIN_VERIFIED' : 'CUSTOM_DOMAIN_VERIFY_FAILED',
      details:
        `DNS verification ${result.verified ? 'succeeded' : 'failed'} for ` +
        `${wedding.customDomain} (wedding ${wedding.slug}, reason=${result.reason}, ` +
        `records=${JSON.stringify(result.records)})`,
      request,
    });

    return NextResponse.json({
      customDomain: wedding.customDomain,
      customDomainVerified: result.verified,
      reason: result.reason,
      lookupName: result.lookupName,
      records: result.records,
      expectedToken,
    });
  } catch (error) {
    logger.error('POST /api/platform/weddings/[id]/verify-domain error', {
      errMessage: error instanceof Error ? error.message : String(error),
      errName: error instanceof Error ? error.name : 'Unknown',
    });
    return internalError();
  }
}
