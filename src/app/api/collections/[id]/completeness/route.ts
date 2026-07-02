export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { withPublicTenant } from '@/lib/tenant-context';
import { validateCompleteness, ApplyError } from '@/lib/collections';

/**
 * GET /api/collections/[id]/completeness — validation report for a Collection.
 *
 * Returns a CompletenessReport: total/filled/missing counts, per-pack
 * breakdown, and the list of missing slots. Used by the CollectionModulesManager
 * admin UI to show progress and block publish when incomplete (per §4.8 spec).
 *
 * Public endpoint (withPublicTenant) — the completeness state is informational
 * and not sensitive.
 */
export const GET = withPublicTenant(async (req: NextRequest) => {
  try {
    const id = req.nextUrl.pathname.split('/').slice(-2, -1)[0] as string
    try {
      const report = await validateCompleteness(id)
      return NextResponse.json({ report })
    } catch (e) {
      if (e instanceof ApplyError) {
        return NextResponse.json({ error: e.message }, { status: e.statusCode })
      }
      throw e
    }
  } catch (error) {
    console.error('Completeness check error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
})
