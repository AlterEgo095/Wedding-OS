export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser, requirePlatformAdmin } from '@/lib/auth';

/**
 * PATCH /api/onboarding/leads/{id}    (PLATFORM_ADMIN)
 *
 * Update a lead's status and/or private admin notes.
 *
 * Body:
 *   {
 *     status?: 'NEW' | 'CONTACTED' | 'CONVERTED' | 'REJECTED',
 *     notes?: string | null,    // max 2000 chars; null clears the field
 *   }
 *
 * Returns: { lead } with the full admin shape (including private fields).
 */

const VALID_LEAD_STATUSES = ['NEW', 'CONTACTED', 'CONVERTED', 'REJECTED'] as const;

const LEAD_ADMIN_SELECT = {
  id: true,
  brideName: true,
  groomName: true,
  coupleLabel: true,
  weddingDate: true,
  venueCity: true,
  email: true,
  phone: true,
  plan: true,
  message: true,
  status: true,
  notes: true,
  convertedWeddingId: true,
  convertedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await getAuthUser(request);
    const denied = requirePlatformAdmin(user);
    if (denied) return denied;

    const { id } = await params;

    const existing = await db.lead.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json(
        { error: 'Lead introuvable.' },
        { status: 404 },
      );
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json(
        { error: 'Corps de requête invalide.' },
        { status: 400 },
      );
    }

    const { status, notes } = body as Record<string, unknown>;

    const data: Record<string, unknown> = {};
    if (status !== undefined) {
      if (
        typeof status !== 'string' ||
        !VALID_LEAD_STATUSES.includes(status as typeof VALID_LEAD_STATUSES[number])
      ) {
        return NextResponse.json(
          { error: `Statut invalide (autorisé : ${VALID_LEAD_STATUSES.join(', ')}).` },
          { status: 400 },
        );
      }
      data.status = status;
    }
    if (notes !== undefined) {
      if (notes === null) {
        data.notes = null;
      } else if (typeof notes === 'string') {
        if (notes.length > 2000) {
          return NextResponse.json(
            { error: 'Notes trop longues (max 2000 caractères).' },
            { status: 400 },
          );
        }
        data.notes = notes.trim() || null;
      } else {
        return NextResponse.json(
          { error: 'Notes invalides (chaîne ou null attendu).' },
          { status: 400 },
        );
      }
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json(
        { error: 'Aucun champ à mettre à jour (status ou notes requis).' },
        { status: 400 },
      );
    }

    const lead = await db.lead.update({
      where: { id },
      data,
      select: LEAD_ADMIN_SELECT,
    });

    return NextResponse.json({ lead });
  } catch (error) {
    console.error('Update lead error:', error);
    return NextResponse.json(
      { error: 'Erreur interne du serveur.' },
      { status: 500 },
    );
  }
}
