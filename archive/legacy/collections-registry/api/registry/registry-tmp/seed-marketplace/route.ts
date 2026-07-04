import { NextRequest, NextResponse } from 'next/server'
import { compileAndStore, publishToMarketplace } from '@/lib/collections/registry'
import { buildSimulatedRegistry } from '@/lib/collections/registry-seed'
import { COLLECTIONS } from '@/lib/collections/catalog'
import { getAuthUser, requirePlatformAdmin } from '@/lib/auth'

// POST /api/registry/seed-marketplace
//
// BOOTSTRAP ENDPOINT — compiles all 5 template Collections with simulated
// Penpot registries and publishes them to the marketplace.
//
// This is the "first boot" of the Marketplace: it populates the Registry with
// real signed CompiledPackages (real hashes, real validation reports, real
// visual scores) so the marketplace UI has content to display.
//
// In production, this is replaced by the real Designer-Publish workflow:
// each designer creates a real Penpot file, pastes its URL, and the Compiler
// produces a real CompiledPackage from the real Penpot API response.
//
// Idempotent: re-running returns the existing packages (same packageHash).
//
// AUTH: PLATFORM_ADMIN only — bootstrapping the marketplace is a platform op.

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthUser(req)
    const denied = requirePlatformAdmin(user)
    if (denied) return denied

    const results = []
    for (const collection of COLLECTIONS) {
      const registry = buildSimulatedRegistry(collection)
      const result = await compileAndStore({
        collectionId: collection.id,
        registry,
        changelog: [`Initial marketplace publication for ${collection.name}`],
        publishToMarketplace: true,
      })
      // Ensure it's published (compileAndStore with publishToMarketplace=true does this,
      // but if the package already existed without publication, we publish it now)
      if (!result.isNew) {
        try {
          await publishToMarketplace(result.packageId)
        } catch {
          // Already published or failed validation — skip
        }
      }
      results.push({
        collectionId: collection.id,
        collectionName: collection.name,
        ...result,
      })
    }

    return NextResponse.json({
      success: true,
      compiled: results.length,
      results,
    })
  } catch (e) {
    return NextResponse.json(
      { error: 'Seed failed', detail: (e as Error).message },
      { status: 500 },
    )
  }
}
