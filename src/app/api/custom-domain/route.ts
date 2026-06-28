export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser, hasPermission } from '@/lib/auth';
import { withPublicTenant, withAdminTenantHandler } from '@/lib/tenant-context';
import { validateCustomDomain, planSupportsCustomDomain } from '@/lib/custom-domains';

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
    console.error('Get custom domain error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
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
      const body = await request.json();
      const { domain } = body as { domain?: string };

      if (!domain) {
        return NextResponse.json({ error: 'Le domaine est requis' }, { status: 400 });
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

      await db.wedding.update({
        where: { id: ctx.weddingId },
        data: { customDomain: normalizedDomain },
      });

      await db.auditLog.create({
        data: {
          weddingId: ctx.weddingId,
          userId: user.id,
          action: 'SET_CUSTOM_DOMAIN',
          details: `Custom domain set: ${normalizedDomain}`,
        },
      });

      return NextResponse.json({
        customDomain: normalizedDomain,
        plan: wedding?.plan ?? ctx.plan,
        canUseCustomDomain: true,
      });
    });
  } catch (error) {
    console.error('Set custom domain error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
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
      await db.wedding.update({
        where: { id: ctx.weddingId },
        data: { customDomain: null },
      });

      await db.auditLog.create({
        data: {
          weddingId: ctx.weddingId,
          userId: user.id,
          action: 'CLEAR_CUSTOM_DOMAIN',
          details: 'Custom domain cleared',
        },
      });

      return NextResponse.json({ customDomain: null });
    });
  } catch (error) {
    console.error('Clear custom domain error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
