export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser, hasPermission } from '@/lib/auth';
import { withPublicTenant, withAdminTenantHandler } from '@/lib/tenant-context';
import { validateCustomDomain, planSupportsCustomDomain, buildDnsVerificationRecord, buildVerificationToken } from '@/lib/custom-domains';
import { getClientInfo } from '@/lib/guest-auth';
import { badRequest, internalError } from '@/lib/api-errors';
import { logger } from '@/lib/logger';

// GET /api/custom-domain — public, returns the custom domain config for the resolved wedding
export const GET = withPublicTenant(async (_req, ctx) => {
  try {
    const wedding = await db.wedding.findUnique({
      where: { id: ctx.weddingId },
      select: { customDomain: true, plan: true },
    });

    return NextResponse.json({
      customDomain: wedding?.customDomain ?? null,
      plan: wedding?.plan ?? ctx.plan,
      canUseCustomDomain: planSupportsCustomDomain(wedding?.plan ?? ctx.plan),
    });
  } catch (error) {
    logger.error('get-custom-domain failed', {
      errMessage: error instanceof Error ? error.message : String(error),
      errName: error instanceof Error ? error.name : 'Unknown',
    });
    return internalError();
  }
});

// PUT /api/custom-domain — ORGANIZER+, sets the custom domain (Premium/Élite only)
export async function PUT(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!hasPermission(user.role, ['PLATFORM_ADMIN', 'ORGANIZER'])) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    return withAdminTenantHandler(request, user, async (_req, ctx) => {
      const body = await request.json().catch(() => null); // P2-CQ-6
      if (!body) return badRequest('Corps de requête invalide');
      const { domain } = body as { domain?: string };

      if (!domain) {
        return badRequest('Le domaine est requis');
      }

      // Check plan supports custom domain
      const wedding = await db.wedding.findUnique({
        where: { id: ctx.weddingId },
        select: { plan: true },
      });
      if (!planSupportsCustomDomain(wedding?.plan ?? ctx.plan)) {
        return NextResponse.json(
          { error: 'Votre plan ne supporte pas les domaines personnalisés. Passez à Premium ou Élite.' },
          { status: 403 }
        );
      }

      // Validate domain format
      const validation = validateCustomDomain(domain);
      if (!validation.valid) {
        return NextResponse.json({ error: validation.error }, { status: 400 });
      }

      const normalizedDomain = domain.toLowerCase().trim();

      // Check uniqueness — no two weddings can share the same custom domain
      const existing = await db.wedding.findFirst({
        where: {
          customDomain: normalizedDomain,
          NOT: { id: ctx.weddingId },
        },
        select: { id: true },
      });
      if (existing) {
        return NextResponse.json(
          { error: 'Ce domaine est déjà utilisé par un autre mariage' },
          { status: 409 }
        );
      }

      // P2-CQ-7: resolve IP/UA before the tx.
      const client = getClientInfo(request);

      // P5.2-2 (PRE-P5.X-AUDIT-B, HIGH-4): resetting customDomain also
      // resets `customDomainVerified`. The couple must re-prove ownership of
      // the new domain by adding the TXT record returned below and calling
      // POST /api/weddings/{id}/verify-domain.
      const verificationToken = buildVerificationToken(ctx.weddingId, normalizedDomain);
      const dnsRecord = buildDnsVerificationRecord(normalizedDomain, verificationToken);

      // P1-CQ-17: wedding.update + auditLog.create in a single tx.
      await db.$transaction(async (tx) => {
        await tx.wedding.update({
          where: { id: ctx.weddingId },
          data: { customDomain: normalizedDomain, customDomainVerified: false },
        });

        await tx.auditLog.create({
          data: {
            weddingId: ctx.weddingId,
            userId: user.id,
            action: 'SET_CUSTOM_DOMAIN',
            details: `Custom domain set: ${normalizedDomain} (verification reset)`,
            ipAddress: client.ipAddress ?? null,
            userAgent: client.userAgent ?? null,
          },
        });
      });

      return NextResponse.json({
        customDomain: normalizedDomain,
        plan: wedding?.plan ?? ctx.plan,
        canUseCustomDomain: true,
        // P5.2-2: DNS verification instructions for the couple.
        customDomainVerified: false,
        dnsVerification: dnsRecord,
        verifyEndpoint: `/api/weddings/${ctx.weddingId}/verify-domain`,
      });
    });
  } catch (error) {
    logger.error('set-custom-domain failed', {
      errMessage: error instanceof Error ? error.message : String(error),
      errName: error instanceof Error ? error.name : 'Unknown',
    });
    return internalError();
  }
}

// DELETE /api/custom-domain — ORGANIZER+, clears the custom domain
export async function DELETE(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!hasPermission(user.role, ['PLATFORM_ADMIN', 'ORGANIZER'])) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    return withAdminTenantHandler(request, user, async (_req, ctx) => {
      // P2-CQ-7: resolve IP/UA before the tx.
      const client = getClientInfo(request);

      // P1-CQ-17: wedding.update + auditLog.create in a single tx.
      await db.$transaction(async (tx) => {
        await tx.wedding.update({
          where: { id: ctx.weddingId },
          // P5.2-2: clearing the domain also clears the verification flag.
          data: { customDomain: null, customDomainVerified: false },
        });

        await tx.auditLog.create({
          data: {
            weddingId: ctx.weddingId,
            userId: user.id,
            action: 'CLEAR_CUSTOM_DOMAIN',
            details: 'Custom domain cleared (verification reset)',
            ipAddress: client.ipAddress ?? null,
            userAgent: client.userAgent ?? null,
          },
        });
      });

      return NextResponse.json({ customDomain: null, customDomainVerified: false });
    });
  } catch (error) {
    logger.error('clear-custom-domain failed', {
      errMessage: error instanceof Error ? error.message : String(error),
      errName: error instanceof Error ? error.name : 'Unknown',
    });
    return internalError();
  }
}
