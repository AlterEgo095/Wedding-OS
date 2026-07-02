export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { withPublicTenant, withAdminTenantHandler } from '@/lib/tenant-context';
import { getAuthUser } from '@/lib/auth';
import { hasRole } from '@/lib/types';
import {
  listModules,
  updateModule,
  ApplyError,
  type ModulePack,
} from '@/lib/collections';

/**
 * GET /api/collections/[id]/modules — public read of all 34 module slots.
 *
 * Returns the module registry for a Collection: 5 packs (Website/Invitations/
 * Print/Communication/Luxury), each with its slots and current Penpot frameId
 * mapping (null = unmapped, falls back to existing component).
 *
 * Public endpoint (withPublicTenant) — couples + guests can see the module
 * structure; the frameId is needed by the renderer to embed Penpot frames.
 */
export const GET = withPublicTenant(async (req: NextRequest) => {
  try {
    const id = req.nextUrl.pathname.split('/').slice(-2, -1)[0] as string
    const modules = await listModules(id)
    return NextResponse.json({ modules, count: modules.length })
  } catch (error) {
    console.error('List modules error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
})

/**
 * PATCH /api/collections/[id]/modules — update a single module slot's frameId.
 *
 * Body: {
 *   pack: ModulePack,
 *   slot: string,
 *   frameId: string | null,
 *   penpotPageId?: string | null,
 *   frameName?: string | null,    // Phase 5 — original Penpot frame name
 *   autoMapped?: boolean          // Phase 5 — false = manual override (preserved on re-sync)
 * }
 *
 * Auth: DESIGNER+ (Phase 5 — opened to designers + art directors per spec §2.4.
 * PLATFORM_ADMIN + SUPER_ADMIN also allowed via role hierarchy).
 *
 * Setting frameId to null unmaps the slot (renderer falls back to existing
 * component — zero regression).
 */
export async function PATCH(request: NextRequest) {
  try {
    const user = await getAuthUser(request)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    // Phase 5 — DESIGNER+ (covers ART_DIRECTOR, PLATFORM_ADMIN, SUPER_ADMIN via hierarchy)
    if (!hasRole(user.role, ['DESIGNER'])) {
      return NextResponse.json(
        { error: 'Forbidden — réservé aux designers, directeurs artistiques et administrateurs plateforme' },
        { status: 403 }
      )
    }

    return withAdminTenantHandler(request, user, async () => {
      const id = request.nextUrl.pathname.split('/').slice(-2, -1)[0] as string
      const body = await request.json()
      const { pack, slot, frameId, penpotPageId, frameName, autoMapped } = body as {
        pack?: ModulePack
        slot?: string
        frameId?: string | null
        penpotPageId?: string | null
        frameName?: string | null
        autoMapped?: boolean
      }

      if (!pack || !slot || typeof pack !== 'string' || typeof slot !== 'string') {
        return NextResponse.json(
          { error: 'pack et slot sont requis' },
          { status: 400 }
        )
      }

      try {
        const updated = await updateModule({
          collectionId: id,
          pack,
          slot,
          frameId: frameId ?? null,
          penpotPageId: penpotPageId ?? null,
          frameName: frameName ?? null,
          autoMapped: autoMapped ?? false,
        })
        return NextResponse.json({ module: updated })
      } catch (e) {
        if (e instanceof ApplyError) {
          return NextResponse.json({ error: e.message }, { status: e.statusCode })
        }
        throw e
      }
    })
  } catch (error) {
    console.error('Update module error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
