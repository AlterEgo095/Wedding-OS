export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server';
import { tenantDb } from '@/lib/db';
import { getAuthUser, hasPermission } from '@/lib/auth';
import { validateGuestSession, logGuestAccess, getClientInfo, generateInvitationLinkToken } from '@/lib/guest-auth';
import { resolvePublicTenant, resolveAdminTenant, runWithTenant } from '@/lib/tenant-context';
import QRCode from 'qrcode';
import { logger } from '@/lib/logger'; // P2-SEC-1
import { internalError } from '@/lib/api-errors'; // P2-CQ-5
import { checkRateLimitAsync, getRateLimitKey } from '@/lib/rate-limit'; // P0.7

/**
 * QR Code Generation API — with access control (tenant-scoped since Phase 2)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    // Mission 6.0 P0.7 — rate limit (60 req/min — QR generation is expensive)
    const rlKey = getRateLimitKey(request);
    const { allowed: rlAllowed, retryAfterSeconds: rlRetry } = await checkRateLimitAsync(rlKey, 60, 60_000);
    if (!rlAllowed) {
      return NextResponse.json(
        { error: 'Trop de requêtes. Veuillez réessayer dans un instant.' },
        { status: 429, headers: { 'Retry-After': String(rlRetry ?? Math.ceil(60_000 / 1000)) } }
      );
    }
    const { code } = await params;
    const clientInfo = getClientInfo(request);

    if (!code) return NextResponse.json({ error: 'Invitation code is required' }, { status: 400 });

    // Resolve tenant — admin or public (for guest sessions)
    // First try admin auth
    const adminUser = await getAuthUser(request);
    const isAdmin = adminUser && hasPermission(adminUser.role, ['ORGANIZER']);

    let context;
    if (isAdmin) {
      const result = await resolveAdminTenant(request, adminUser!);
      if (result.error || !result.context) {
        return NextResponse.json({ error: result.error?.message }, { status: result.error?.status ?? 500 });
      }
      context = result.context;
    } else {
      const result = await resolvePublicTenant(request);
      if (result.error || !result.context) {
        return NextResponse.json({ error: result.error?.message }, { status: result.error?.status ?? 500 });
      }
      context = result.context;
    }

    return runWithTenant(context, async () => {
      // findFirst auto-scoped by tenant extension
      const guest = await tenantDb.guest.findFirst({
        where: { invitationCode: code },
        include: { table: { select: { id: true, name: true, number: true } } },
      });

      if (!guest) {
        return NextResponse.json({ error: 'Guest not found with this invitation code' }, { status: 404 });
      }

      // ACCESS CONTROL
      let authorized = isAdmin;

      // Guest session check
      if (!authorized) {
        const guestToken = request.cookies.get('guest_session')?.value;
        if (guestToken) {
          const session = await validateGuestSession(guestToken, clientInfo.userAgent, clientInfo.ipAddress);
          if (session.valid && session.guestId === guest.id) {
            authorized = true;
          } else if (session.valid && session.guestId !== guest.id) {
            await logGuestAccess({
              guestId: session.guestId, action: 'ACCESS_DENIED',
              details: `Guest attempted to access QR code for another guest (${code.substring(0, 3)}***)`,
              ...clientInfo,
            });
            return NextResponse.json(
              { error: 'Cette invitation est privée et exclusivement réservée à son titulaire.' },
              { status: 403 }
            );
          }
        }
      }

      if (!authorized) {
        return NextResponse.json(
          { error: 'Authentification requise pour accéder au QR code' },
          { status: 401 }
        );
      }

      // P2-SEC-11: never trust request.headers.get('host') — an attacker
      // can send an arbitrary Host header to make the QR code resolve to a
      // lookalike domain. Use the configured NEXT_PUBLIC_BASE_URL instead.
      // In dev without NEXT_PUBLIC_BASE_URL, fall back to localhost:3000.
      // In prod without NEXT_PUBLIC_BASE_URL, fail closed (500) rather than
      // mint a QR pointing at an attacker-controlled host.
      const baseUrl =
        process.env.NEXT_PUBLIC_BASE_URL ||
        (process.env.NODE_ENV === 'production'
          ? ''
          : 'http://localhost:3000');
      if (!baseUrl) {
        // P2-SEC-11: configuration error — refuse to mint a QR code rather
        // than fall back to the Host header.
        logger.error('QR code route: NEXT_PUBLIC_BASE_URL not configured', {});
        return NextResponse.json(
          { error: 'Configuration manquante: NEXT_PUBLIC_BASE_URL' },
          { status: 500 }
        );
      }

      const encryptedToken = generateInvitationLinkToken(code);
      // For multi-tenant, encode the wedding slug in the QR URL so it lands on /w/{slug}/invite/{token}
      // The legacy /?invite= path continues working (default wedding fallback) for backward compat.
      const qrUrl = context.isDefault
        ? `${baseUrl}/?invite=${encryptedToken}`
        : `${baseUrl}/w/${context.slug}/invite/${encryptedToken}`;

      const qrDataUrl = await QRCode.toDataURL(qrUrl, {
        width: 300, margin: 2,
        color: { dark: '#000000', light: '#FFFFFF' },
      });

      await logGuestAccess({
        guestId: guest.id, action: 'QR_SCAN',
        details: `QR code generated for ${guest.firstName} ${guest.lastName}`,
        ...clientInfo,
      });

      return NextResponse.json({
        guest: {
          id: guest.id, firstName: guest.firstName, lastName: guest.lastName,
          invitationCode: guest.invitationCode, status: guest.status,
          category: guest.category, seats: guest.seats, checkedIn: guest.checkedIn,
          table: guest.table,
        },
        qrCode: qrDataUrl, qrUrl,
      });
    });
  } catch (error) {
    // P2-SEC-1: never log error.stack.
    logger.error('QR code generation error', {
      errMessage: error instanceof Error ? error.message : String(error),
      errName: error instanceof Error ? error.name : 'Unknown',
    });
    return internalError();
  }
}
