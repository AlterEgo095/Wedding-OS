export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import QRCode from 'qrcode';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const { code } = await params;

    if (!code) {
      return NextResponse.json(
        { error: 'Invitation code is required' },
        { status: 400 }
      );
    }

    const guest = await db.guest.findUnique({
      where: { invitationCode: code },
      include: {
        table: {
          select: {
            id: true,
            name: true,
            number: true,
          },
        },
      },
    });

    if (!guest) {
      return NextResponse.json(
        { error: 'Guest not found with this invitation code' },
        { status: 404 }
      );
    }

    // Build the URL that the QR code will encode
    // Priority: NEXT_PUBLIC_BASE_URL > x-forwarded headers > request host
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ||
      `${request.headers.get('x-forwarded-proto') || 'https'}://${request.headers.get('host') || 'localhost:3000'}`;
    const qrUrl = `${baseUrl}/?code=${code}`;

    // Generate QR code as data URL
    const qrDataUrl = await QRCode.toDataURL(qrUrl, {
      width: 300,
      margin: 2,
      color: {
        dark: '#000000',
        light: '#FFFFFF',
      },
    });

    return NextResponse.json({
      guest: {
        id: guest.id,
        firstName: guest.firstName,
        lastName: guest.lastName,
        invitationCode: guest.invitationCode,
        status: guest.status,
        category: guest.category,
        seats: guest.seats,
        checkedIn: guest.checkedIn,
        table: guest.table,
      },
      qrCode: qrDataUrl,
      qrUrl,
    });
  } catch (error) {
    console.error('QR code generation error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
