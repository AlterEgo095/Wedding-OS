import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const q = searchParams.get('q');

    if (!q || q.trim().length === 0) {
      return NextResponse.json(
        { error: 'Search query parameter "q" is required' },
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
      include: {
        table: {
          select: {
            id: true,
            name: true,
            number: true,
          },
        },
      },
      take: 50,
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
