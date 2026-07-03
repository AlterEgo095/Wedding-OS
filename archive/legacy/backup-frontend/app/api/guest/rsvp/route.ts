export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { validateGuestSession, getClientInfo } from '@/lib/guest-auth';
import { getAuthUser } from '@/lib/auth';

/**
 * RSVP API — Guest confirms or declines invitation
 * 
 * POST /api/guest/rsvp
 * Body: { status: 'CONFIRMED' | 'DECLINED', message?: string, plusOne?: boolean }
 * 
 * Requires authenticated guest session.
 */
export async function POST(request: NextRequest) {
  try {
    // Verify guest session
    const clientInfo = getClientInfo(request);
    const guestToken = request.cookies.get('guest_session')?.value;
    
    if (!guestToken) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    }

    const session = await validateGuestSession(guestToken, clientInfo.userAgent, clientInfo.ipAddress);
    if (!session.valid || !session.guestId) {
      return NextResponse.json({ error: 'Session invalide' }, { status: 401 });
    }

    const body = await request.json();
    const { status, message, plusOne } = body;

    if (!status || !['CONFIRMED', 'DECLINED'].includes(status)) {
      return NextResponse.json(
        { error: 'Statut invalide. Utilisez CONFIRMED ou DECLINED.' },
        { status: 400 }
      );
    }

    // Update guest RSVP
    const updatedGuest = await db.guest.update({
      where: { id: session.guestId },
      data: {
        status,
        rsvpAt: new Date(),
        rsvpMessage: message || null,
        rsvpPlusOne: plusOne || false,
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        status: true,
        rsvpAt: true,
        rsvpMessage: true,
        rsvpPlusOne: true,
        category: true,
        seats: true,
        table: {
          select: { id: true, name: true, number: true },
        },
      },
    });

    return NextResponse.json({
      success: true,
      guest: updatedGuest,
      message: status === 'CONFIRMED'
        ? 'Votre présence est confirmée ! Nous sommes ravis de vous compter parmi nos invités.'
        : 'Nous avons bien pris note de votre réponse. Vous nous manquerez !',
    });
  } catch (error) {
    console.error('RSVP error:', error);
    return NextResponse.json({ error: 'Erreur interne du serveur' }, { status: 500 });
  }
}

/**
 * GET — Retrieve RSVP stats for admin dashboard (requires admin auth)
 * PUT — Reset all RSVPs to PENDING (requires admin auth)
 */
export async function GET(request: NextRequest) {
  try {
    // Require admin auth
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Accès non autorisé' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const stats = searchParams.get('stats');

    if (stats === 'true') {
      const [confirmed, pending, declined, total] = await Promise.all([
        db.guest.count({ where: { status: 'CONFIRMED' } }),
        db.guest.count({ where: { status: 'PENDING' } }),
        db.guest.count({ where: { status: 'DECLINED' } }),
        db.guest.count(),
      ]);

      const totalSeats = await db.guest.aggregate({
        _sum: { seats: true },
      });

      const confirmedSeats = await db.guest.aggregate({
        _sum: { seats: true },
        where: { status: 'CONFIRMED' },
      });

      // By category
      const byCategory = await db.guest.groupBy({
        by: ['category'],
        _count: { id: true },
      });

      return NextResponse.json({
        confirmed,
        pending,
        declined,
        total,
        totalSeats: totalSeats._sum.seats || 0,
        confirmedSeats: confirmedSeats._sum.seats || 0,
        byCategory: byCategory.map(c => ({
          category: c.category,
          count: c._count.id,
        })),
      });
    }

    return NextResponse.json({ error: 'Paramètre manquant' }, { status: 400 });
  } catch (error) {
    console.error('RSVP stats error:', error);
    return NextResponse.json({ error: 'Erreur interne du serveur' }, { status: 500 });
  }
}

/**
 * PUT — Reset all RSVPs to PENDING (admin only)
 */
export async function PUT(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Accès non autorisé' }, { status: 401 });
    }

    const result = await db.guest.updateMany({
      where: {},
      data: {
        status: 'PENDING',
        rsvpAt: null,
        rsvpMessage: null,
        rsvpPlusOne: false,
      },
    });

    return NextResponse.json({
      success: true,
      message: `${result.count} invités réinitialisés en attente`,
      count: result.count,
    });
  } catch (error) {
    console.error('RSVP reset error:', error);
    return NextResponse.json({ error: 'Erreur interne du serveur' }, { status: 500 });
  }
}
