import { NextRequest, NextResponse } from 'next/server'
import { compileAndStore } from '@/lib/collections/registry'
import { parsePastedRegistry, fetchPenpotRegistry } from '@/lib/collections/penpot-builder'
import { getCollection } from '@/lib/collections/catalog'
import { getAuthUser, requirePlatformAdmin } from '@/lib/auth'

// POST /api/registry/compile
//
// Body:
//   { collectionId, fileUrl, registryJson?, changelog?, publishToMarketplace? }
//
// Compiles a Penpot registry into a signed CompiledPackage and persists it.
// This is the entry point of the Compiler → Registry → Marketplace pipeline.
//
// The registry can be provided in two ways:
//   (a) Auto-fetch from Penpot API (fileUrl must point to a public Penpot file)
//   (b) Designer pastes a registry JSON (registryJson field — always works)
//
// Wedding OS does NOT render designs. It only compiles Penpot frame references
// into a signed, immutable package.
//
// AUTH: PLATFORM_ADMIN only — compiling signed packages is a platform-level operation.

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthUser(req)
    const denied = requirePlatformAdmin(user)
    if (denied) return denied

    const body = await req.json()
    const { collectionId, fileUrl, registryJson, changelog, publishToMarketplace } = body as {
      collectionId: string
      fileUrl: string
      registryJson?: string
      changelog?: string[]
      publishToMarketplace?: boolean
    }

    if (!collectionId || !fileUrl) {
      return NextResponse.json(
        { error: 'collectionId and fileUrl are required' },
        { status: 400 },
      )
    }

    const collection = getCollection(collectionId)
    if (!collection) {
      return NextResponse.json({ error: 'Collection not found', collectionId }, { status: 404 })
    }

    // 1. Try auto-fetch from Penpot API first
    let registry = await fetchPenpotRegistry(fileUrl)
    let registrySource: 'penpot-api' | 'designer-paste' = 'penpot-api'

    // 2. Fallback to designer-pasted JSON
    if (!registry && registryJson) {
      try {
        registry = parsePastedRegistry(fileUrl, registryJson)
        registrySource = 'designer-paste'
      } catch (e) {
        return NextResponse.json(
          { error: 'Invalid registry JSON', detail: (e as Error).message },
          { status: 400 },
        )
      }
    }

    if (!registry) {
      return NextResponse.json({
        error: 'Could not fetch Penpot registry. The file may be private. Please paste the registry JSON manually.',
        hint: 'Use the "Export frame registry" option in Penpot and paste the JSON in the registryJson field.',
      }, { status: 422 })
    }

    // 3. Compile + persist
    const result = await compileAndStore({
      collectionId,
      registry,
      changelog,
      publishToMarketplace,
    })

    return NextResponse.json({
      success: true,
      ...result,
      registrySource,
      framesDetected: registry.frames.length,
    })
  } catch (e) {
    return NextResponse.json(
      { error: 'Compile failed', detail: (e as Error).message },
      { status: 500 },
    )
  }
}
