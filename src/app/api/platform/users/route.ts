export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser, requirePlatformAdmin } from '@/lib/auth';

/**
 * Platform-wide user listing.
 *
 * GET /api/platform/users?page=1&limit=20&search=&role=&weddingId=
 *   → { users, total, page, limit }
 *
 * Returns AdminUser records across ALL weddings. Each user includes the
 * `wedding` relation (slug + coupleLabel) when `weddingId` is set, so the
 * platform UI can show which tenant each staff member belongs to.
 *
 * Password hashes are NEVER selected — the API response excludes them
 * explicitly via the `select` clause.
 */

const USER_LIST_SELECT = {
  id: true,
  email: true,
  name: true,
  role: true,
  weddingId: true,
  lastLoginAt: true,
  createdAt: true,
  updatedAt: true,
  wedding: {
    select: { slug: true, coupleLabel: true },
  },
} as const;

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    const denied = requirePlatformAdmin(user);
    if (denied) return denied;

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20', 10)));
    const search = searchParams.get('search')?.trim() || '';
    const role = searchParams.get('role')?.trim() || '';
    const weddingId = searchParams.get('weddingId')?.trim() || '';

    const where: Record<string, unknown> = {};
    if (role) where.role = role;
    if (weddingId) where.weddingId = weddingId;
    if (search) {
      where.OR = [
        { email: { contains: search } },
        { name: { contains: search } },
      ];
    }

    const skip = (page - 1) * limit;

    const [users, total] = await Promise.all([
      db.adminUser.findMany({
        where,
        select: USER_LIST_SELECT,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      db.adminUser.count({ where }),
    ]);

    return NextResponse.json({
      users,
      total,
      page,
      limit,
    });
  } catch (error) {
    console.error('List platform users error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
