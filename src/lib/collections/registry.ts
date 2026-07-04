// ══════════════════════════════════════════════════════════════════════════════
// COLLECTION REGISTRY — the persistence layer for compiled packages
// ══════════════════════════════════════════════════════════════════════════════
//
// The Registry is the IMMUTABLE store of every CompiledPackage ever produced.
// Once a package is written, it is never modified — a new Collection version
// produces a new row. This is what makes the system auditable + version-safe.
//
// Responsibilities:
//   1. Persist CompiledPackages (idempotent on packageHash)
//   2. List packages (with filters: collectionId, marketplace-published, latest)
//   3. Fetch a package by id or (collectionId, version)
//   4. Publish/unpublish to marketplace
//   5. Create migration records when a new version supersedes an old one
//   6. Deploy a package to a Wedding ( WeddingCollectionBinding)
//   7. Migrate a Wedding's binding from one version to another
//
// Wedding OS NEVER renders designs. The Registry stores REFERENCES to Penpot
// frames (via the signed manifest), never the designs themselves.

import { db } from '@/lib/db'
import {
  compileCollection,
  compareManifests,
  serializeManifest,
  deserializeManifest,
  verifyManifest,
  type CollectionManifest,
  type CompiledPackage,
  type ManifestDiff,
} from './compiler'
import { detectCollection, type DetectionResult, type PenpotFrameRegistry } from './penpot-builder'
import { validateCollection } from './validator'
import { runVisualValidation, type VisualValidationSummary } from './visual-validator'
import { getCollection } from './catalog'
import type { PremiumCollection, PackId, ModuleId, VariantId } from './types'

// ══════════════════════════════════════════════════════════════════════════════
// COMPILE + PERSIST
// ══════════════════════════════════════════════════════════════════════════════

export interface CompileAndStoreInput {
  collectionId: string
  registry: PenpotFrameRegistry
  changelog?: string[]
  publishToMarketplace?: boolean
}

export interface CompileAndStoreResult {
  packageId: string
  packageHash: string
  collectionId: string
  collectionVersion: string
  isNew: boolean                 // false if the same packageHash already existed
  passesValidation: boolean
  qualityScore: number
  visualScore: number
  completenessPct: number
  migrationCreated?: {           // present if this is a new version of an existing collection
    fromVersion: string
    toVersion: string
    bump: 'patch' | 'minor' | 'major'
    autoMigratable: boolean
  }
}

/**
 * Compile a Penpot registry into a signed CompiledPackage and persist it.
 *
 * This is the ONLY public entry point that creates CompiledPackage rows.
 * It is IDEMPOTENT on packageHash — re-compiling the same input returns the
 * existing row.
 *
 * If the collectionId already has packages at a different version, a
 * CollectionMigration row is automatically created (compareManifests).
 */
export async function compileAndStore(input: CompileAndStoreInput): Promise<CompileAndStoreResult> {
  const collection = getCollection(input.collectionId)
  if (!collection) {
    throw new Error(`Collection not found: ${input.collectionId}`)
  }

  // 1. Detect frames in the Penpot registry
  const detection = detectCollection(collection, input.registry)

  // 2. Run visual validation
  const visualValidation = runVisualValidation(collection, detection)

  // 3. Compile to a signed package
  const pkg = compileCollection(collection, detection, {
    visualValidation,
    changelog: input.changelog,
  })

  // 4. Idempotency check — same packageHash means same content, return existing
  const existing = await db.compiledPackage.findUnique({
    where: { packageHash: pkg.packageHash },
    select: { id: true, collectionVersion: true, passesValidation: true, qualityScore: true, visualScore: true, completenessPct: true },
  })
  if (existing) {
    return {
      packageId: existing.id,
      packageHash: pkg.packageHash,
      collectionId: collection.id,
      collectionVersion: existing.collectionVersion,
      isNew: false,
      passesValidation: existing.passesValidation,
      qualityScore: existing.qualityScore,
      visualScore: existing.visualScore,
      completenessPct: existing.completenessPct,
    }
  }

  // 5. Serialize the manifest for storage
  const manifestJson = serializeManifest(pkg.manifest)
  const m = pkg.manifest

  // 6. Persist the new CompiledPackage row
  const created = await db.compiledPackage.create({
    data: {
      collectionId: collection.id,
      collectionName: collection.name,
      collectionFamily: collection.family,
      collectionCategory: collection.category,
      collectionTier: collection.tier,
      collectionVersion: collection.version,
      designer: collection.designer,
      packageHash: pkg.packageHash,
      packageSize: pkg.packageSize,
      signatureAlgorithm: m.signature.signatureAlgorithm,
      manifestJson,
      minWeddingOsVersion: m.signature.minWeddingOsVersion,
      qualityScore: m.validation.qualityScore,
      completenessPct: m.validation.completenessPct,
      visualScore: visualValidation.score,
      passesValidation: m.validation.passes,
      detectedFrames: m.validation.detectedFrames,
      expectedFrames: m.validation.expectedFrames,
      priceFcfa: collection.priceFcfa,
      priceUsd: collection.priceUsd,
      coverImage: collection.coverImage,
      publishedToMarketplace: input.publishToMarketplace ?? false,
      publishedAt: input.publishToMarketplace ? new Date() : null,
    },
  })

  // 7. If a previous version exists, create a CollectionMigration record
  const prev = await db.compiledPackage.findFirst({
    where: {
      collectionId: collection.id,
      collectionVersion: { not: collection.version },
    },
    orderBy: { compiledAt: 'desc' },
  })

  let migrationCreated: CompileAndStoreResult['migrationCreated'] | undefined
  if (prev) {
    const prevManifest = deserializeManifest(prev.manifestJson)
    const diff = compareManifests(prevManifest, pkg.manifest)
    migrationCreated = await createMigrationRecord(prev, created, diff)
  }

  return {
    packageId: created.id,
    packageHash: pkg.packageHash,
    collectionId: collection.id,
    collectionVersion: collection.version,
    isNew: true,
    passesValidation: m.validation.passes,
    qualityScore: m.validation.qualityScore,
    visualScore: visualValidation.score,
    completenessPct: m.validation.completenessPct,
    migrationCreated,
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// MIGRATION RECORD CREATION
// ══════════════════════════════════════════════════════════════════════════════

async function createMigrationRecord(
  fromPkg: { id: string; collectionId: string; collectionVersion: string },
  toPkg: { id: string; collectionId: string; collectionVersion: string },
  diff: ManifestDiff,
): Promise<{ fromVersion: string; toVersion: string; bump: 'patch' | 'minor' | 'major'; autoMigratable: boolean }> {
  // Idempotency — if a migration record already exists for this pair, skip
  const existing = await db.collectionMigration.findUnique({
    where: {
      collectionId_fromVersion_toVersion: {
        collectionId: fromPkg.collectionId,
        fromVersion: fromPkg.collectionVersion,
        toVersion: toPkg.collectionVersion,
      },
    },
  })
  if (existing) {
    return {
      fromVersion: fromPkg.collectionVersion,
      toVersion: toPkg.collectionVersion,
      bump: existing.bump as 'patch' | 'minor' | 'major',
      autoMigratable: existing.autoMigratable,
    }
  }

  // Count affected weddings (bindings on the fromVersion)
  const weddingsAffected = await db.weddingCollectionBinding.count({
    where: { collectionId: fromPkg.collectionId, collectionVersion: fromPkg.collectionVersion },
  })

  const autoMigratable = diff.bump !== 'major'
  await db.collectionMigration.create({
    data: {
      collectionId: fromPkg.collectionId,
      fromVersion: fromPkg.collectionVersion,
      toVersion: toPkg.collectionVersion,
      fromPackageId: fromPkg.id,
      toPackageId: toPkg.id,
      diffJson: JSON.stringify(diff),
      bump: diff.bump,
      autoMigratable,
      summary: diff.summary,
      // Auto-approve patch + minor bumps; major bumps require manual review
      status: autoMigratable ? 'APPROVED' : 'PENDING',
      weddingsAffected,
    },
  })

  // Mark all current bindings on the fromVersion as "MIGRATION_AVAILABLE"
  if (weddingsAffected > 0) {
    await db.weddingCollectionBinding.updateMany({
      where: { collectionId: fromPkg.collectionId, collectionVersion: fromPkg.collectionVersion, migrationStatus: 'CURRENT' },
      data: { migrationStatus: 'MIGRATION_AVAILABLE' },
    })
  }

  return {
    fromVersion: fromPkg.collectionVersion,
    toVersion: toPkg.collectionVersion,
    bump: diff.bump,
    autoMigratable,
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// QUERY API
// ══════════════════════════════════════════════════════════════════════════════

export interface RegistryListFilters {
  collectionId?: string
  marketplaceOnly?: boolean
  passesOnly?: boolean
  category?: string
  limit?: number
}

export async function listPackages(filters: RegistryListFilters = {}) {
  const where: Record<string, unknown> = {}
  if (filters.collectionId) where.collectionId = filters.collectionId
  if (filters.marketplaceOnly) where.publishedToMarketplace = true
  if (filters.passesOnly) where.passesValidation = true
  if (filters.category) where.collectionCategory = filters.category

  return db.compiledPackage.findMany({
    where,
    orderBy: { compiledAt: 'desc' },
    take: filters.limit ?? 100,
    select: {
      id: true,
      collectionId: true,
      collectionName: true,
      collectionFamily: true,
      collectionCategory: true,
      collectionTier: true,
      collectionVersion: true,
      designer: true,
      packageHash: true,
      packageSize: true,
      qualityScore: true,
      completenessPct: true,
      visualScore: true,
      passesValidation: true,
      detectedFrames: true,
      expectedFrames: true,
      priceFcfa: true,
      priceUsd: true,
      coverImage: true,
      publishedToMarketplace: true,
      publishedAt: true,
      compiledAt: true,
      minWeddingOsVersion: true,
    },
  })
}

/**
 * Return only the LATEST version of each collection — the marketplace view.
 */
export async function listLatestMarketplacePackages(filters: { category?: string; limit?: number } = {}) {
  const all = await listPackages({
    marketplaceOnly: true,
    category: filters.category,
    limit: 200,
  })
  // Dedupe by collectionId, keeping the highest version (semver compare)
  const byCollection = new Map<string, typeof all[number]>()
  for (const p of all) {
    const cur = byCollection.get(p.collectionId)
    if (!cur || compareSemver(p.collectionVersion, cur.collectionVersion) > 0) {
      byCollection.set(p.collectionId, p)
    }
  }
  return Array.from(byCollection.values()).slice(0, filters.limit ?? 50)
}

export async function getPackageById(id: string) {
  return db.compiledPackage.findUnique({ where: { id }, include: { bindings: true } })
}

export async function getPackageByHash(hash: string) {
  return db.compiledPackage.findUnique({ where: { packageHash: hash } })
}

export async function getPackageVersions(collectionId: string) {
  return db.compiledPackage.findMany({
    where: { collectionId },
    orderBy: { compiledAt: 'desc' },
    select: {
      id: true,
      collectionVersion: true,
      packageHash: true,
      qualityScore: true,
      visualScore: true,
      completenessPct: true,
      passesValidation: true,
      publishedToMarketplace: true,
      compiledAt: true,
      publishedAt: true,
    },
  })
}

export async function getLatestPackage(collectionId: string) {
  const versions = await getPackageVersions(collectionId)
  if (versions.length === 0) return null
  // Pick the highest semver
  return versions.reduce((latest, cur) =>
    compareSemver(cur.collectionVersion, latest.collectionVersion) > 0 ? cur : latest,
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// PUBLISH TO MARKETPLACE
// ══════════════════════════════════════════════════════════════════════════════

export async function publishToMarketplace(packageId: string): Promise<void> {
  const pkg = await db.compiledPackage.findUnique({ where: { id: packageId }, select: { passesValidation: true } })
  if (!pkg) throw new Error('Package not found')
  if (!pkg.passesValidation) {
    throw new Error('Cannot publish a package that failed structural validation')
  }
  await db.compiledPackage.update({
    where: { id: packageId },
    data: { publishedToMarketplace: true, publishedAt: new Date() },
  })
}

export async function unpublishFromMarketplace(packageId: string): Promise<void> {
  await db.compiledPackage.update({
    where: { id: packageId },
    data: { publishedToMarketplace: false, publishedAt: null },
  })
}

// ══════════════════════════════════════════════════════════════════════════════
// DEPLOY TO A WEDDING — creates the WeddingCollectionBinding (reference-only)
// ══════════════════════════════════════════════════════════════════════════════

export interface DeployInput {
  weddingId: string
  packageId: string
  variantSelections?: Partial<Record<ModuleId, VariantId>>
  overrides?: Record<string, unknown>
}

export interface DeployResult {
  bindingId: string
  collectionId: string
  collectionVersion: string
  // The legacy PenpotIntegration blob — kept for backward compat with ThemeInjector.
  // The runtime resolves tokens from: manifest.tokens → apply overrides → inject.
  legacyPenpotIntegration: {
    fileUrl: string
    fileId: string
    pageId: string | null
    invitationFrameId: string | null
    saveTheDateFrameId: string | null
    lastSyncedAt: string
    tokens: {
      'penpot-primary'?: string
      'penpot-secondary'?: string
      'penpot-bg'?: string
      'penpot-surface'?: string
      'penpot-text'?: string
      'penpot-text-muted'?: string
      'penpot-font-display'?: string
      'penpot-font-body'?: string
    }
  }
}

export async function deployToWedding(input: DeployInput): Promise<DeployResult> {
  const pkg = await db.compiledPackage.findUnique({ where: { id: input.packageId } })
  if (!pkg) throw new Error('Package not found')
  if (!pkg.passesValidation) {
    throw new Error('Cannot deploy a package that failed structural validation')
  }

  const manifest = deserializeManifest(pkg.manifestJson)
  if (!verifyManifest(manifest)) {
    throw new Error('Manifest signature verification failed — refusing to deploy tampered package')
  }

  // Build the legacy PenpotIntegration blob (for ThemeInjector compat)
  const invitationFrame = manifest.packs
    .find((p) => p.id === 'invitations')
    ?.modules.find((m) => m.id === 'standard')
    ?.variants.find((v) => v.id === (input.variantSelections?.standard ?? 'A'))?.frame
  const heroFrame = manifest.packs
    .find((p) => p.id === 'website')
    ?.modules.find((m) => m.id === 'hero')
    ?.variants.find((v) => v.id === (input.variantSelections?.hero ?? 'A'))?.frame

  const legacyPenpotIntegration: DeployResult['legacyPenpotIntegration'] = {
    fileUrl: pkg.collectionId ? `penpot://${pkg.collectionId}` : '', // informational — actual file URL is in the manifest
    fileId: manifest.packs[0]?.modules[0]?.variants[0]?.frame.frameUuid ?? '',
    pageId: manifest.packs[0]?.pageId ?? null,
    invitationFrameId: invitationFrame?.frameUuid ?? null,
    saveTheDateFrameId: heroFrame?.frameUuid ?? null,
    lastSyncedAt: new Date().toISOString(),
    tokens: {
      'penpot-primary': manifest.tokens.colors.primary,
      'penpot-secondary': manifest.tokens.colors.secondary,
      'penpot-bg': manifest.tokens.colors.background,
      'penpot-surface': manifest.tokens.colors.surface,
      'penpot-text': manifest.tokens.colors.text,
      'penpot-text-muted': manifest.tokens.colors.textMuted,
      'penpot-font-display': manifest.tokens.fonts.display,
      'penpot-font-body': manifest.tokens.fonts.body,
    },
  }

  // Upsert the binding (1:1 weddingId)
  const existing = await db.weddingCollectionBinding.findUnique({ where: { weddingId: input.weddingId } })
  if (existing) {
    await db.weddingCollectionBinding.update({
      where: { weddingId: input.weddingId },
      data: {
        packageId: pkg.id,
        collectionId: pkg.collectionId,
        collectionVersion: pkg.collectionVersion,
        variantSelections: input.variantSelections ? JSON.stringify(input.variantSelections) : null,
        overrides: input.overrides ? JSON.stringify(input.overrides) : null,
        migrationStatus: 'CURRENT',
      },
    })
  } else {
    await db.weddingCollectionBinding.create({
      data: {
        weddingId: input.weddingId,
        packageId: pkg.id,
        collectionId: pkg.collectionId,
        collectionVersion: pkg.collectionVersion,
        variantSelections: input.variantSelections ? JSON.stringify(input.variantSelections) : null,
        overrides: input.overrides ? JSON.stringify(input.overrides) : null,
        migrationStatus: 'CURRENT',
      },
    })
  }

  return {
    bindingId: existing?.id ?? '',
    collectionId: pkg.collectionId,
    collectionVersion: pkg.collectionVersion,
    legacyPenpotIntegration,
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// MIGRATE A WEDDING — move its binding from one Collection version to another
// ══════════════════════════════════════════════════════════════════════════════

export interface MigrateWeddingInput {
  weddingId: string
  toPackageId: string
  /**
   * Optional explicit mapping for removed frames: { businessId: 'replacement businessId' }.
   * Required when the migration involves removed frames (major bumps).
   */
  frameRemapping?: Record<string, string>
}

export interface MigrateWeddingResult {
  ok: boolean
  fromVersion: string
  toVersion: string
  bump: 'patch' | 'minor' | 'major'
  remappedFrames: number
  warnings: string[]
}

export async function migrateWedding(input: MigrateWeddingInput): Promise<MigrateWeddingResult> {
  const binding = await db.weddingCollectionBinding.findUnique({ where: { weddingId: input.weddingId } })
  if (!binding) throw new Error('Wedding has no active Collection binding')

  const fromPkg = await db.compiledPackage.findUnique({ where: { id: binding.packageId } })
  const toPkg = await db.compiledPackage.findUnique({ where: { id: input.toPackageId } })
  if (!fromPkg || !toPkg) throw new Error('Source or target package not found')
  if (fromPkg.collectionId !== toPkg.collectionId) {
    throw new Error('Cross-collection migration is not supported — undeploy and redeploy instead')
  }

  // Find the migration record
  const migration = await db.collectionMigration.findUnique({
    where: {
      collectionId_fromVersion_toVersion: {
        collectionId: fromPkg.collectionId,
        fromVersion: fromPkg.collectionVersion,
        toVersion: toPkg.collectionVersion,
      },
    },
  })
  if (!migration) throw new Error('No migration record found — recompile to generate one')
  if (migration.bump === 'major' && migration.status !== 'APPROVED') {
    throw new Error('Major bump requires manual approval before migration')
  }

  // Apply frame remapping for removed frames
  const fromManifest = deserializeManifest(fromPkg.manifestJson)
  const toManifest = deserializeManifest(toPkg.manifestJson)
  const diff = JSON.parse(migration.diffJson) as ManifestDiff

  let variantSelections: Record<string, string> | null = null
  if (binding.variantSelections) {
    variantSelections = JSON.parse(binding.variantSelections)
  }

  const warnings: string[] = []
  let remappedFrames = 0

  // For each removed frame, try to remap
  for (const removed of diff.removedFrames) {
    const replacement = input.frameRemapping?.[removed.businessId]
    if (!replacement) {
      warnings.push(`Frame "${removed.businessId}" was removed and no replacement was provided — variant selection will be reset to default`)
      // Reset the variant selection for this module to default (A)
      if (variantSelections) {
        const moduleId = removed.module as ModuleId
        if (variantSelections[moduleId]) {
          delete variantSelections[moduleId]
        }
      }
    } else {
      remappedFrames++
      // The replacement businessId implies a new variant — extract the variant letter
      const parts = replacement.split('.')
      if (parts.length === 3 && variantSelections) {
        const moduleId = parts[1] as ModuleId
        const variantId = parts[2] as VariantId
        variantSelections[moduleId] = variantId
      }
    }
  }

  // Verify the target manifest is valid
  if (!verifyManifest(toManifest)) {
    throw new Error('Target manifest signature verification failed')
  }

  // Update the binding
  await db.weddingCollectionBinding.update({
    where: { weddingId: input.weddingId },
    data: {
      packageId: toPkg.id,
      collectionVersion: toPkg.collectionVersion,
      variantSelections: variantSelections ? JSON.stringify(variantSelections) : null,
      migrationStatus: 'MIGRATED',
    },
  })

  // Bump the migration record's applied counter
  await db.collectionMigration.update({
    where: { id: migration.id },
    data: {
      weddingsMigrated: { increment: 1 },
      status: 'APPLIED',
      appliedAt: new Date(),
    },
  })

  return {
    ok: true,
    fromVersion: fromPkg.collectionVersion,
    toVersion: toPkg.collectionVersion,
    bump: migration.bump as 'patch' | 'minor' | 'major',
    remappedFrames,
    warnings,
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Semver compare. Returns > 0 if a > b, < 0 if a < b, 0 if equal.
 */
export function compareSemver(a: string, b: string): number {
  const pa = a.split('.').map((n) => parseInt(n, 10) || 0)
  const pb = b.split('.').map((n) => parseInt(n, 10) || 0)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const da = pa[i] ?? 0
    const db = pb[i] ?? 0
    if (da !== db) return da - db
  }
  return 0
}

/**
 * Extract the manifest from a CompiledPackage row (parses + verifies).
 * Throws if the signature is invalid.
 */
export function extractManifest(pkg: { manifestJson: string }): CollectionManifest {
  const manifest = deserializeManifest(pkg.manifestJson)
  if (!verifyManifest(manifest)) {
    throw new Error('Manifest signature verification failed')
  }
  return manifest
}

/**
 * Get a Wedding's currently bound Collection (manifest + binding).
 */
export async function getWeddingBinding(weddingId: string) {
  const binding = await db.weddingCollectionBinding.findUnique({
    where: { weddingId },
    include: { package: true },
  })
  if (!binding) return null
  const manifest = extractManifest(binding.package)
  return { binding, manifest, package: binding.package }
}

/**
 * Resolve the effective tokens for a Wedding: manifest.tokens → apply overrides.
 * This is the runtime resolution path — ThemeInjector reads from here.
 */
export function resolveEffectiveTokens(
  manifest: CollectionManifest,
  overrides?: Record<string, unknown> | null,
): {
  colors: { primary: string; secondary: string; background: string; surface: string; text: string; textMuted: string }
  fonts: { display: string; body: string }
} {
  const base = {
    colors: { ...manifest.tokens.colors },
    fonts: { ...manifest.tokens.fonts },
  }
  if (!overrides) return base
  // Apply token overrides — overrides shape: { tokens: { colors: { primary: '#XXX' }, fonts: { display: 'YYY' } } }
  const tokenOverrides = (overrides as { tokens?: { colors?: Record<string, string>; fonts?: Record<string, string> } }).tokens
  if (tokenOverrides?.colors) {
    for (const [k, v] of Object.entries(tokenOverrides.colors)) {
      if (k in base.colors) (base.colors as Record<string, string>)[k] = v
    }
  }
  if (tokenOverrides?.fonts) {
    for (const [k, v] of Object.entries(tokenOverrides.fonts)) {
      if (k in base.fonts) (base.fonts as Record<string, string>)[k] = v
    }
  }
  return base
}
