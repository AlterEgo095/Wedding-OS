// POST /api/design/governance — Mission 5.8.6
// Unified governance actions: version, quality-check, approve, publish, archive, restore
import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser, requirePlatformAdmin } from '@/lib/auth';
import { internalError, badRequest } from '@/lib/api-errors';
import { logger } from '@/lib/logger';
import {
  createVersionSnapshot,
  requestQualityCheck,
  approveForPublication,
  publishToProduction,
  archive,
  restore,
  getVersionHistory,
  getGovernanceDashboard,
} from '@/lib/components/governance-engine';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    const denied = requirePlatformAdmin(user);
    if (denied) return denied;

    const body = await request.json().catch(() => null);
    if (!body) return badRequest('Corps de requête invalide');

    const { action, collectionId, comment } = body as {
      action?: string; collectionId?: string; comment?: string;
    };

    if (!action) return badRequest('action requis');
    if (!collectionId && action !== 'dashboard') return badRequest('collectionId requis');

    switch (action) {
      case 'version':
        if (!comment) return badRequest('comment requis pour version');
        const vr = await createVersionSnapshot(collectionId!, user!.id, comment, request);
        return NextResponse.json({ success: true, ...vr });

      case 'quality-check':
        const qr = await requestQualityCheck(collectionId!, user!.id, request);
        return NextResponse.json({ ...qr });

      case 'approve':
        const ar = await approveForPublication(collectionId!, user!.id, request);
        return NextResponse.json({ ...ar });

      case 'publish':
        const pr = await publishToProduction(collectionId!, user!.id, request);
        return NextResponse.json({ ...pr });

      case 'archive':
        const acr = await archive(collectionId!, user!.id, request);
        return NextResponse.json({ ...acr });

      case 'restore':
        const rr = await restore(collectionId!, user!.id, request);
        return NextResponse.json({ ...rr });

      case 'history':
        const history = await getVersionHistory(collectionId!);
        return NextResponse.json({ success: true, history });

      case 'dashboard':
        const dash = await getGovernanceDashboard();
        return NextResponse.json({ success: true, dashboard: dash });

      default:
        return badRequest(`action inconnue: ${action}`);
    }
  } catch (error) {
    logger.error('Governance API error', { errMessage: error instanceof Error ? error.message : String(error) });
    return internalError(error instanceof Error ? error.message : undefined);
  }
}

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    const denied = requirePlatformAdmin(user);
    if (denied) return denied;

    const collectionId = request.nextUrl.searchParams.get('collectionId');
    if (collectionId) {
      const history = await getVersionHistory(collectionId);
      return NextResponse.json({ success: true, history });
    }

    const dash = await getGovernanceDashboard();
    return NextResponse.json({ success: true, dashboard: dash });
  } catch (error) {
    return internalError(error instanceof Error ? error.message : undefined);
  }
}
