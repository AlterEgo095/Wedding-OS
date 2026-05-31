import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const q = searchParams.get('q');

    if (!q || q.trim().length < 2) {
      return NextResponse.json(
        { error: 'Search query must be at least 2 characters' },
        { status: 400 }
      );
    }

    const searchTerm = q.trim();

    const guests = await db.guest.findMany({
      where: {
        OR: [
          { firstName: { contains: searchTerm } },
          { lastName: { contains: searchTerm } },
          { invitationCode: { contains: searchTerm } },
        ],
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        invitationCode: true,
        seats: true,
        category: true,
        status: true,
        personalMessage: true,
        table: {
          select: {
            id: true,
            name: true,
            number: true,
          },
        },
      },
      take: 20,
    });

    return NextResponse.json({ guests });
  } catch (error) {
    console.error('Guest search error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
