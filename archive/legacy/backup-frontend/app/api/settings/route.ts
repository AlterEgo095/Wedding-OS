export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser, hasPermission } from '@/lib/auth';

export async function GET() {
  try {
    const settings = await db.settings.findMany({
      orderBy: { key: 'asc' },
    });

    // Convert to key-value object for easier consumption
    const settingsMap: Record<string, string> = {};
    for (const s of settings) {
      settingsMap[s.key] = s.value;
    }

    return NextResponse.json({ settings: settingsMap });
  } catch (error) {
    console.error('Get settings error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!hasPermission(user.role, ['SUPER_ADMIN'])) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const { settings } = body as { settings: Record<string, string> };

    if (!settings || typeof settings !== 'object') {
      return NextResponse.json(
        { error: 'Settings object is required' },
        { status: 400 }
      );
    }

    // Upsert each setting
    const upsertPromises = Object.entries(settings).map(([key, value]) =>
      db.settings.upsert({
        where: { key },
        update: { value },
        create: { key, value },
      })
    );

    await Promise.all(upsertPromises);

    await db.auditLog.create({
      data: {
        userId: user.id,
        action: 'UPDATE_SETTINGS',
        details: `Updated ${Object.keys(settings).length} settings`,
      },
    });

    // Return updated settings
    const updatedSettings = await db.settings.findMany({
      orderBy: { key: 'asc' },
    });
    const settingsMap: Record<string, string> = {};
    for (const s of updatedSettings) {
      settingsMap[s.key] = s.value;
    }

    return NextResponse.json({ settings: settingsMap });
  } catch (error) {
    console.error('Update settings error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
