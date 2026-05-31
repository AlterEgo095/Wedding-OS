import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { createGuestSession, logGuestAccess, getClientInfo } from '@/lib/guest-auth';
import { checkRateLimit, getRateLimitKey } from '@/lib/rate-limit';

export async function POST(request: NextRequest) {
  try {
    const clientInfo = getClientInfo(request);
    const rateLimitKey = getRateLimitKey(request);

    // Rate limit: 10 attempts per minute per IP
    if (!checkRateLimit(`guest-auth-${rateLimitKey}`, 10, 60 * 1000)) {
      return NextResponse.json(
        { error: 'Trop de tentatives. Veuillez réessayer dans un instant.' },
        { status: 429 }
      );
    }

    const body = await request.json();
    const { code, firstName, lastName } = body;

    if (!code || typeof code !== 'string' || code.trim().length < 3) {
      return NextResponse.json(
        { error: 'Code d\'invitation requis (minimum 3 caractères)' },
        { status: 400 }
      );
    }

    const invitationCode = code.trim().toUpperCase();

    // Find guest by invitation code (exact match for security)
    const whereClause: Record<string, unknown> = {
      invitationCode: invitationCode,
    };

    if (firstName && lastName) {
      whereClause.firstName = { contains: firstName.trim() };
      whereClause.lastName = { contains: lastName.trim() };
    }

    const guest = await db.guest.findFirst({
      where: whereClause,
      include: {
        table: {
          select: { id: true, name: true, number: true },
        },
      },
    });

    if (!guest) {
      // Log failed attempt
      await logGuestAccess({
        action: 'AUTH_FAILED',
        details: `Failed auth with code: ${invitationCode.substring(0, 2)}***`,
        ...clientInfo,
      });

      return NextResponse.json(
        { error: 'Code d\'invitation ou nom invalide. Vérifiez vos informations.' },
        { status: 401 }
      );
    }

    // Create session
    const session = await createGuestSession(
      guest.id,
      guest.invitationCode,
      clientInfo.userAgent,
      clientInfo.ipAddress
    );

    // Log successful login (fire and forget)
    logGuestAccess({
      guestId: guest.id,
      action: 'LOGIN',
      details: `Guest ${guest.firstName} authenticated`,
      ...clientInfo,
    }).catch(() => {});

    // Set HttpOnly cookie
    const response = NextResponse.json({
      success: true,
      guest: {
        id: guest.id,
        firstName: guest.firstName,
        lastName: guest.lastName,
        invitationCode: guest.invitationCode,
        seats: guest.seats,
        category: guest.category,
        status: guest.status,
        personalMessage: guest.personalMessage,
        checkedIn: guest.checkedIn,
        table: guest.table,
      },
    });

    response.cookies.set({
      name: 'guest_session',
      value: session.token,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 30 * 24 * 60 * 60,
    });

    return response;
  } catch (error) {
    console.error('Guest auth error:', error);
    return NextResponse.json(
      { error: 'Erreur interne du serveur' },
      { status: 500 }
    );
  }
}
