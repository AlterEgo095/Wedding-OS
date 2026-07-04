// ══════════════════════════════════════════════════════════════════════════════
// COLLECTION COMPILER — produces signed, immutable CompiledPackages
// ══════════════════════════════════════════════════════════════════════════════
//
// ARCHITECTURE (the user's directive):
//
//   Designer → Penpot → [Compiler] → Manifest → Validator → Registry
//                                              → Marketplace → Deploy → Wedding
//
// The Compiler is the ONLY place where manifest signing happens. It takes a
// PremiumCollection + a PenpotFrameRegistry detection result (already produced
// by penpot-builder.ts) and emits a CompiledPackage containing a signed
// CollectionManifest. The manifest is the immutable contract between every
// downstream stage:
//
//   - Validator   re-runs validateCollection and compares against the snapshot
//   - Registry    stores CompiledPackages by packageHash
//   - Marketplace lists Collections by their signed manifest
//   - Deploy      refuses any package whose signature fails verification
//   - Migration   diffs two signed manifests to compute the upgrade path
//
// The Compiler NEVER creates designs. It only:
//   • reads the Penpot frame registry (already detected)
//   • extracts matched frames (reuses detectCollection output)
//   • computes SHA256 hashes for every frame + the whole package
//   • exports design tokens (colors, fonts, decorative)
//   • generates a deterministic manifest (collection.json equivalent)
//   • verifies constraints (delegates to validateCollection)
//   • produces a signed package (HMAC-SHA256 signature)
//
// SECURITY:
//   - The signing secret lives in `process.env.WEDDING_OS_COMPILER_SECRET`.
//   - The Compiler module is the ONLY place that reads this secret.
//   - signManifest + verifyManifest are the ONLY signing entry points.
//   - This module is imported by API routes only (it uses node:crypto).
//
// DETERMINISM:
//   - canonicalStringify sorts object keys recursively → identical manifests
//     produce identical bodyHash + packageHash across machines and runs.
//   - Body hashes are computed on the COMPACT canonical form (no whitespace).
//   - serializeManifest produces a PRETTY canonical form (2-space indent) for
//     human-readable storage + transport, but the hash is always computed on
//     the compact form so the hash is stable regardless of storage format.

import { createHash, createHmac } from 'node:crypto'
import type {
  PremiumCollection,
  PackId,
  ModuleId,
  VariantId,
  CollectionCategory,
  CollectionTier,
  DesignSystem,
} from './types'
import { validateCollection, type VersionBump } from './validator'
import {
  applyDetection,
  type DetectionResult,
  type PenpotFrame,
} from './penpot-builder'

// ─── Compiler constants ───────────────────────────────────────────────────────

/**
 * Wedding OS refuses to deploy a CompiledPackage if its own version is lower
 * than this. Bump it whenever the manifest schema changes in a breaking way.
 */
export const COMPILER_MIN_WEDDING_OS_VERSION = '2.4.0'

/**
 * Signature algorithm tag written into every CollectionSignature. Verifiers
 * must refuse manifests that use an unknown algorithm.
 */
export const COMPILER_SIGNATURE_ALGORITHM = 'hmac-sha256' as const

// ══════════════════════════════════════════════════════════════════════════════
// TYPES — exported for use by validator / registry / marketplace / deploy
// ══════════════════════════════════════════════════════════════════════════════

/**
 * A frame entry inside the manifest. NEVER store only the frameId — Penpot can
 * regenerate IDs. Store UUID + name + module + variant + hash + updatedAt so
 * the frame can be relocated automatically if moved.
 */
export interface ManifestFrame {
  // Business identifier (per the user's directive: never depend on names only).
  // E.g. "website.hero.A" — derived from the convention but independent of the
  // frame's display name. The compiler writes this into the manifest.
  businessId: string                  // e.g. "website.hero.A"
  pack: PackId
  module: ModuleId
  variant: VariantId
  // Penpot references (for re-linking if the designer moves things)
  frameUuid: string                   // Penpot frame UUID (the id)
  frameName: string                   // current name (informational)
  pageId: string
  // Integrity
  hash: string                        // SHA256 of frame id+name+pageId+dimensions
  width?: number
  height?: number
  thumbnailUrl?: string | null
  updatedAt: string                   // ISO — registry exportedAt
}

/**
 * Design tokens extracted from the Collection's DesignSystem.
 * These are EXPORTED — but they are NEVER copied onto the Wedding's Theme.
 * (Per the user's directive #7: Theme becomes reference-only.)
 */
export interface ManifestTokens {
  colors: {
    primary: string
    secondary: string
    background: string
    surface: string
    text: string
    textMuted: string
  }
  fonts: {
    display: string
    body: string
  }
  decorative?: DesignSystem['decorative']
}

/**
 * Collection signature — identifies who/when/what/compatibility.
 */
export interface CollectionSignature {
  collectionId: string                // 'royal-gold'
  name: string                        // 'Royal Gold'
  version: string                     // semver '1.0.0'
  designer: string                    // 'Studio AENEWS'
  compiledAt: string                  // ISO
  // SHA256 of the canonical manifest body (everything except signature.hash)
  bodyHash: string
  // HMAC-SHA256 signature of bodyHash using a server-side secret.
  // Verifies the package was produced by THIS Wedding OS instance.
  hash: string
  // Compatibility contract — Wedding OS refuses to deploy if its version is lower.
  minWeddingOsVersion: string         // '2.4.0'
  signatureAlgorithm: 'hmac-sha256'
}

/**
 * The full manifest — the CONTRACT between designer, compiler, registry, deploy.
 */
export interface CollectionManifest {
  signature: CollectionSignature
  collection: {
    id: string
    name: string
    family: string
    category: CollectionCategory
    tier: CollectionTier
    tagline: string
    description: string
    coverImage: string
    priceFcfa: number
    priceUsd: number
  }
  tokens: ManifestTokens
  packs: Array<{
    id: PackId
    name: string
    pageId: string | null
    modules: Array<{
      id: ModuleId
      name: string
      required: boolean
      variants: Array<{
        id: VariantId
        name: string
        frame: ManifestFrame
      }>
    }>
  }>
  validation: {
    // Snapshot of the structural validation result at compile time
    passes: boolean
    qualityScore: number
    completenessPct: number
    detectedFrames: number
    expectedFrames: number
    issues: Array<{ level: 'ERROR' | 'WARNING' | 'INFO'; code: string; message: string }>
  }
  visualValidation?: VisualValidationSummary  // optional — added by visual-validator
  changelog?: string[]                // changelog entries for this version
}

/**
 * A compiled package = manifest + size + content hash + storage reference.
 */
export interface CompiledPackage {
  manifest: CollectionManifest
  packageHash: string                 // SHA256 of the canonical serialized manifest
  packageSize: number                 // bytes
  compiledAt: string
  // Storage reference — where the package is persisted (filesystem or DB)
  storageRef: string                  // e.g. 'db:compiled_packages:<id>' or 'fs:/data/packages/<id>.json'
}

/**
 * Visual validation summary — local type to avoid a circular import with the
 * visual-validator module (Task 2-b). The real module will export an identical
 * shape; consumers should treat this structurally.
 */
export interface VisualValidationSummary {
  passes: boolean
  score: number                       // 0-100
  checks: number
  failedChecks: number
  issues: Array<{ level: 'ERROR' | 'WARNING' | 'INFO'; code: string; message: string }>
}

/**
 * A structured diff between two manifests — produced by compareManifests.
 * Consumed by the migration system (Task 4) to compute the upgrade path.
 */
export interface ManifestDiff {
  fromVersion: string
  toVersion: string
  addedFrames: ManifestFrame[]
  removedFrames: ManifestFrame[]        // frames in prev but not in next (need migration)
  changedFrames: Array<{ before: ManifestFrame; after: ManifestFrame; changes: string[] }>
  tokenChanges: Array<{ token: string; from: string; to: string }>
  packChanges: { added: PackId[]; removed: PackId[] }
  moduleChanges: { added: ModuleId[]; removed: ModuleId[] }
  bump: VersionBump                     // 'patch' | 'minor' | 'major'
  summary: string                       // human-readable
}

// ══════════════════════════════════════════════════════════════════════════════
// CANONICAL JSON — deterministic serialization for hashing + transport
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Recursively sort object keys, skip undefined values, and produce a compact
 * JSON string. Two structurally-identical objects ALWAYS produce the same
 * canonicalStringify output, regardless of insertion order.
 *
 * Used for hashing (bodyHash, packageHash) — must NEVER include whitespace.
 */
function canonicalStringify(obj: unknown): string {
  if (obj === null || typeof obj !== 'object') {
    return JSON.stringify(obj)
  }
  if (Array.isArray(obj)) {
    return '[' + obj.map(canonicalStringify).join(',') + ']'
  }
  const record = obj as Record<string, unknown>
  const sortedKeys = Object.keys(record)
    .filter((k) => record[k] !== undefined)
    .sort()
  const pairs = sortedKeys.map(
    (k) => JSON.stringify(k) + ':' + canonicalStringify(record[k]),
  )
  return '{' + pairs.join(',') + '}'
}

/**
 * Pretty canonical JSON — sorted keys, 2-space indent, human-readable.
 * Used for storage + transport (filesystem, DB text column, HTTP response).
 * The hash is always computed on the COMPACT canonicalStringify form so the
 * hash is stable regardless of how the manifest is stored.
 */
function canonicalStringifyPretty(obj: unknown, indent = 0): string {
  const pad = '  '.repeat(indent)
  const padInner = '  '.repeat(indent + 1)
  if (obj === null || typeof obj !== 'object') {
    return JSON.stringify(obj)
  }
  if (Array.isArray(obj)) {
    if (obj.length === 0) return '[]'
    return (
      '[\n' +
      obj.map((v) => padInner + canonicalStringifyPretty(v, indent + 1)).join(',\n') +
      '\n' +
      pad +
      ']'
    )
  }
  const record = obj as Record<string, unknown>
  const sortedKeys = Object.keys(record)
    .filter((k) => record[k] !== undefined)
    .sort()
  if (sortedKeys.length === 0) return '{}'
  const pairs = sortedKeys.map(
    (k) =>
      padInner +
      JSON.stringify(k) +
      ': ' +
      canonicalStringifyPretty(record[k], indent + 1),
  )
  return '{\n' + pairs.join(',\n') + '\n' + pad + '}'
}

// ══════════════════════════════════════════════════════════════════════════════
// HASHING + SIGNING — the integrity core
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Compute a SHA256 hash for a single Penpot frame.
 * Covers the frame's stable identity (id + name + page + dimensions) so any
 * change to the frame's content or location produces a different hash.
 */
export function computeFrameHash(frame: PenpotFrame): string {
  const payload = `${frame.id}|${frame.name}|${frame.pageId}|${frame.width ?? 0}|${frame.height ?? 0}`
  return createHash('sha256').update(payload, 'utf8').digest('hex')
}

/**
 * Compute the SHA256 of a manifest BODY (everything except signature).
 * Uses canonicalStringify so the hash is deterministic across machines + runs.
 */
export function computeManifestBodyHash(
  manifestBody: Omit<CollectionManifest, 'signature'>,
): string {
  const canonical = canonicalStringify(manifestBody)
  return createHash('sha256').update(canonical, 'utf8').digest('hex')
}

/**
 * Read the compiler secret. Falls back to a dev-only secret in non-production.
 * In production, the env var MUST be set — otherwise signatures are forgeable.
 */
function getCompilerSecret(): string {
  const secret = process.env.WEDDING_OS_COMPILER_SECRET
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'WEDDING_OS_COMPILER_SECRET must be set in production to sign manifests.',
      )
    }
    return 'wedding-os-dev-secret'
  }
  return secret
}

/**
 * Sign a manifest body hash with HMAC-SHA256.
 * The signed payload is `${collectionId}:${version}:${bodyHash}` so the
 * signature is bound to (a) which collection, (b) which version, (c) what body.
 */
export function signManifest(
  bodyHash: string,
  collectionId: string,
  version: string,
): { hash: string; algorithm: 'hmac-sha256' } {
  const payload = `${collectionId}:${version}:${bodyHash}`
  const hash = createHmac('sha256', getCompilerSecret())
    .update(payload, 'utf8')
    .digest('hex')
  return { hash, algorithm: COMPILER_SIGNATURE_ALGORITHM }
}

/**
 * Verify a manifest's signature. Re-computes the body hash and verifies the
 * HMAC. Returns false if tampered or secret mismatch.
 */
export function verifyManifest(manifest: CollectionManifest): boolean {
  const { signature, ...body } = manifest

  // 1. Algorithm check — refuse unknown algorithms
  if (signature.signatureAlgorithm !== COMPILER_SIGNATURE_ALGORITHM) {
    return false
  }

  // 2. Compatibility check — refuse manifests from the future
  // (Not strictly a signature concern, but a verifier should never accept a
  // manifest that requires a newer Wedding OS than itself.)
  if (signature.minWeddingOsVersion > COMPILER_MIN_WEDDING_OS_VERSION) {
    return false
  }

  // 3. Body hash check — recompute and compare
  const expectedBodyHash = computeManifestBodyHash(body)
  if (
    expectedBodyHash.length !== signature.bodyHash.length ||
    !timingSafeEqual(expectedBodyHash, signature.bodyHash)
  ) {
    return false
  }

  // 4. Signature check — recompute HMAC and compare
  const expectedSign = signManifest(
    signature.bodyHash,
    signature.collectionId,
    signature.version,
  )
  if (
    expectedSign.hash.length !== signature.hash.length ||
    !timingSafeEqual(expectedSign.hash, signature.hash)
  ) {
    return false
  }

  return true
}

/**
 * Constant-time string comparison to prevent timing attacks on signature
 * verification. Both inputs must be the same length.
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return diff === 0
}

// ══════════════════════════════════════════════════════════════════════════════
// MANIFEST BUILDERS — turn a Collection + Detection into a Manifest
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Build a ManifestTokens block from the Collection's DesignSystem.
 * Tokens are EXPORTED but NEVER auto-applied to a Wedding's Theme — the
 * deploy route is responsible for how (or whether) to use them.
 */
function buildManifestTokens(ds: DesignSystem): ManifestTokens {
  return {
    colors: {
      primary: ds.primary,
      secondary: ds.secondary,
      background: ds.background,
      surface: ds.surface,
      text: ds.text,
      textMuted: ds.textMuted,
    },
    fonts: {
      display: ds.fontDisplay,
      body: ds.fontBody,
    },
    decorative: ds.decorative,
  }
}

/**
 * Build the packs structure for the manifest. Only variants that have a
 * matched Penpot frame are emitted — unmatched variants are silently dropped
 * (the validation snapshot records their absence).
 */
function buildManifestPacks(
  collection: PremiumCollection,
  detection: DetectionResult,
): CollectionManifest['packs'] {
  const packsOut: CollectionManifest['packs'] = []
  for (const pack of collection.packs) {
    const modulesOut: CollectionManifest['packs'][number]['modules'] = []
    for (const mod of pack.modules) {
      const variantsOut: CollectionManifest['packs'][number]['modules'][number]['variants'] = []
      for (const v of mod.variants) {
        const penpotFrame = detection.matchedFrames[v.frame.expectedFrameName]
        if (!penpotFrame) continue // skip unmatched variants
        const manifestFrame: ManifestFrame = {
          businessId: `${pack.id}.${mod.id}.${v.id}`,
          pack: pack.id,
          module: mod.id,
          variant: v.id,
          frameUuid: penpotFrame.id,
          frameName: penpotFrame.name,
          pageId: penpotFrame.pageId,
          hash: computeFrameHash(penpotFrame),
          width: penpotFrame.width,
          height: penpotFrame.height,
          thumbnailUrl: penpotFrame.thumbnailUrl ?? null,
          updatedAt: detection.registry.exportedAt,
        }
        variantsOut.push({ id: v.id, name: v.name, frame: manifestFrame })
      }
      if (variantsOut.length === 0) continue // skip modules with no matched variants
      modulesOut.push({
        id: mod.id,
        name: mod.name,
        required: mod.required,
        variants: variantsOut,
      })
    }
    if (modulesOut.length === 0) continue // skip empty packs
    packsOut.push({
      id: pack.id,
      name: pack.name,
      pageId: pack.pageId,
      modules: modulesOut,
    })
  }
  return packsOut
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN: compile a Collection into a signed CompiledPackage
// ══════════════════════════════════════════════════════════════════════════════

export interface CompileCollectionOptions {
  visualValidation?: VisualValidationSummary
  changelog?: string[]
  prevPackageHash?: string
}

/**
 * Compile a PremiumCollection + DetectionResult into a signed, immutable
 * CompiledPackage.
 *
 * Steps:
 *   1. applyDetection → stamps frameIds onto the Collection
 *   2. validateCollection → snapshot of the structural validation result
 *   3. buildManifestPacks → ManifestFrame[] with SHA256 hashes per frame
 *   4. buildManifestTokens → colors/fonts/decorative exported
 *   5. assemble the manifest BODY (everything except signature)
 *   6. compute bodyHash = SHA256(canonicalStringify(body))
 *   7. signManifest → HMAC-SHA256 of `${collectionId}:${version}:${bodyHash}`
 *   8. assemble the full manifest (body + signature)
 *   9. compute packageHash = SHA256(canonicalStringify(manifest))
 *  10. return CompiledPackage with storageRef
 */
export function compileCollection(
  collection: PremiumCollection,
  detection: DetectionResult,
  opts?: CompileCollectionOptions,
): CompiledPackage {
  // 1. Stamp detection onto the collection so validateCollection sees the
  //    latest sync report + frame IDs.
  const detected = applyDetection(collection, detection)

  // 2. Structural validation snapshot
  const validation = validateCollection(detected)

  // 3-4. Build packs + tokens
  const packsManifest = buildManifestPacks(detected, detection)
  const tokensManifest = buildManifestTokens(detected.designSystem)

  // 5. Assemble the manifest body (no signature yet)
  const compiledAt = new Date().toISOString()
  const manifestBody: Omit<CollectionManifest, 'signature'> = {
    collection: {
      id: detected.id,
      name: detected.name,
      family: detected.family,
      category: detected.category,
      tier: detected.tier,
      tagline: detected.tagline,
      description: detected.description,
      coverImage: detected.coverImage,
      priceFcfa: detected.priceFcfa,
      priceUsd: detected.priceUsd,
    },
    tokens: tokensManifest,
    packs: packsManifest,
    validation: {
      passes: validation.passes,
      qualityScore: validation.summary.qualityScore,
      completenessPct: validation.summary.completenessPct,
      detectedFrames: validation.summary.detectedFrames,
      expectedFrames: validation.summary.expectedFrames,
      issues: validation.issues.map((i) => ({
        level: i.level,
        code: i.code,
        message: i.message,
      })),
    },
    visualValidation: opts?.visualValidation,
    changelog: opts?.changelog,
  }

  // 6. Body hash
  const bodyHash = computeManifestBodyHash(manifestBody)

  // 7. Sign
  const signResult = signManifest(bodyHash, detected.id, detected.version)

  // 8. Assemble signature
  const signature: CollectionSignature = {
    collectionId: detected.id,
    name: detected.name,
    version: detected.version,
    designer: detected.designer,
    compiledAt,
    bodyHash,
    hash: signResult.hash,
    minWeddingOsVersion: COMPILER_MIN_WEDDING_OS_VERSION,
    signatureAlgorithm: COMPILER_SIGNATURE_ALGORITHM,
  }

  // 9. Full manifest + package hash
  const manifest: CollectionManifest = {
    ...manifestBody,
    signature,
  }
  const packageHash = createHash('sha256')
    .update(canonicalStringify(manifest), 'utf8')
    .digest('hex')
  const packageSize = Buffer.byteLength(
    canonicalStringify(manifest),
    'utf8',
  )

  // 10. Compiled package
  return {
    manifest,
    packageHash,
    packageSize,
    compiledAt,
    storageRef: `db:compiled_packages:${packageHash.slice(0, 12)}`,
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// SERIALIZATION — for storage + transport
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Serialize a manifest to canonical JSON (sorted keys, 2-space indent).
 * Used for storage (filesystem, DB text column) + transport (HTTP, file copy).
 * The hash is computed on the COMPACT canonical form, so storing the pretty
 * form does not affect the packageHash or signature validity.
 */
export function serializeManifest(manifest: CollectionManifest): string {
  return canonicalStringifyPretty(manifest)
}

/**
 * Deserialize a manifest from JSON and verify its signature.
 * Throws on tamper, unknown algorithm, or compatibility violation.
 */
export function deserializeManifest(json: string): CollectionManifest {
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch (err) {
    throw new Error(
      `Failed to parse manifest JSON: ${err instanceof Error ? err.message : String(err)}`,
    )
  }
  if (!parsed || typeof parsed !== 'object' || !('signature' in parsed)) {
    throw new Error('Invalid manifest: missing signature block')
  }
  const manifest = parsed as CollectionManifest
  if (!verifyManifest(manifest)) {
    throw new Error(
      'Manifest signature verification failed — package may have been tampered with or signed by a different Wedding OS instance',
    )
  }
  return manifest
}

// ══════════════════════════════════════════════════════════════════════════════
// MANIFEST DIFF — for the migration system
// ══════════════════════════════════════════════════════════════════════════════

/** Flatten all frames in a manifest into a single array. */
function extractFrames(manifest: CollectionManifest): ManifestFrame[] {
  const frames: ManifestFrame[] = []
  for (const pack of manifest.packs) {
    for (const mod of pack.modules) {
      for (const v of mod.variants) {
        frames.push(v.frame)
      }
    }
  }
  return frames
}

/** Flatten ManifestTokens into a record of token path → string value. */
function flattenTokens(tokens: ManifestTokens): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(tokens.colors)) {
    out[`colors.${k}`] = String(v)
  }
  for (const [k, v] of Object.entries(tokens.fonts)) {
    out[`fonts.${k}`] = String(v)
  }
  if (tokens.decorative) out['decorative'] = String(tokens.decorative)
  return out
}

/** Compute the structured diff between two tokens blocks. */
function diffTokens(
  prev: ManifestTokens,
  next: ManifestTokens,
): Array<{ token: string; from: string; to: string }> {
  const p = flattenTokens(prev)
  const n = flattenTokens(next)
  const keys = new Set([...Object.keys(p), ...Object.keys(n)])
  const changes: Array<{ token: string; from: string; to: string }> = []
  for (const k of keys) {
    if (p[k] !== n[k]) {
      changes.push({ token: k, from: p[k] ?? '<unset>', to: n[k] ?? '<unset>' })
    }
  }
  return changes
}

/**
 * Compare two signed manifests and produce a structured diff for the migration
 * system. The bump follows the same convention as validator.ts:
 *   - major: pack or module structure changed (added/removed)
 *   - minor: frames added (new variants)
 *   - patch: frames changed or token-only changes
 */
export function compareManifests(
  prev: CollectionManifest,
  next: CollectionManifest,
): ManifestDiff {
  const prevFrames = extractFrames(prev)
  const nextFrames = extractFrames(next)
  const prevById = new Map(prevFrames.map((f) => [f.businessId, f]))
  const nextById = new Map(nextFrames.map((f) => [f.businessId, f]))

  // Frame-level diff (keyed by businessId)
  const addedFrames: ManifestFrame[] = []
  const removedFrames: ManifestFrame[] = []
  const changedFrames: Array<{
    before: ManifestFrame
    after: ManifestFrame
    changes: string[]
  }> = []

  for (const [id, f] of nextById) {
    const p = prevById.get(id)
    if (!p) {
      addedFrames.push(f)
      continue
    }
    if (p.hash !== f.hash) {
      const changes: string[] = []
      if (p.frameName !== f.frameName) changes.push('name')
      if (p.frameUuid !== f.frameUuid) changes.push('frameUuid')
      if (p.pageId !== f.pageId) changes.push('pageId')
      if ((p.width ?? 0) !== (f.width ?? 0)) changes.push('width')
      if ((p.height ?? 0) !== (f.height ?? 0)) changes.push('height')
      if (p.thumbnailUrl !== f.thumbnailUrl) changes.push('thumbnail')
      changedFrames.push({ before: p, after: f, changes })
    }
  }
  for (const [id, f] of prevById) {
    if (!nextById.has(id)) removedFrames.push(f)
  }

  // Pack changes
  const prevPacks = new Set(prev.packs.map((p) => p.id))
  const nextPacks = new Set(next.packs.map((p) => p.id))
  const packChanges: { added: PackId[]; removed: PackId[] } = {
    added: [...nextPacks].filter((p) => !prevPacks.has(p)),
    removed: [...prevPacks].filter((p) => !nextPacks.has(p)),
  }

  // Module changes (composite key pack:module to avoid 'story' collision)
  const prevModules = new Set<string>()
  for (const p of prev.packs)
    for (const m of p.modules) prevModules.add(`${p.id}:${m.id}`)
  const nextModules = new Set<string>()
  for (const p of next.packs)
    for (const m of p.modules) nextModules.add(`${p.id}:${m.id}`)
  const moduleChanges: { added: ModuleId[]; removed: ModuleId[] } = {
    added: [...nextModules]
      .filter((m) => !prevModules.has(m))
      .map((m) => m.split(':')[1] as ModuleId),
    removed: [...prevModules]
      .filter((m) => !nextModules.has(m))
      .map((m) => m.split(':')[1] as ModuleId),
  }

  // Token changes
  const tokenChanges = diffTokens(prev.tokens, next.tokens)

  // Determine the bump
  let bump: VersionBump
  if (
    packChanges.added.length > 0 ||
    packChanges.removed.length > 0 ||
    moduleChanges.added.length > 0 ||
    moduleChanges.removed.length > 0
  ) {
    bump = 'major'
  } else if (addedFrames.length > 0 || removedFrames.length > 0) {
    bump = 'minor'
  } else {
    bump = 'patch'
  }

  // Human-readable summary
  const summary = buildDiffSummary({
    fromVersion: prev.signature.version,
    toVersion: next.signature.version,
    bump,
    addedFrames: addedFrames.length,
    removedFrames: removedFrames.length,
    changedFrames: changedFrames.length,
    tokenChanges: tokenChanges.length,
    packChanges,
    moduleChanges,
  })

  return {
    fromVersion: prev.signature.version,
    toVersion: next.signature.version,
    addedFrames,
    removedFrames,
    changedFrames,
    tokenChanges,
    packChanges,
    moduleChanges,
    bump,
    summary,
  }
}

/** Build a one-line human-readable summary of a manifest diff. */
function buildDiffSummary(args: {
  fromVersion: string
  toVersion: string
  bump: VersionBump
  addedFrames: number
  removedFrames: number
  changedFrames: number
  tokenChanges: number
  packChanges: { added: PackId[]; removed: PackId[] }
  moduleChanges: { added: ModuleId[]; removed: ModuleId[] }
}): string {
  const parts: string[] = [`v${args.fromVersion} → v${args.toVersion}`, `[${args.bump}]`]
  if (args.packChanges.added.length > 0)
    parts.push(`+packs:${args.packChanges.added.length}`)
  if (args.packChanges.removed.length > 0)
    parts.push(`-packs:${args.packChanges.removed.length}`)
  if (args.moduleChanges.added.length > 0)
    parts.push(`+modules:${args.moduleChanges.added.length}`)
  if (args.moduleChanges.removed.length > 0)
    parts.push(`-modules:${args.moduleChanges.removed.length}`)
  if (args.addedFrames > 0) parts.push(`+frames:${args.addedFrames}`)
  if (args.removedFrames > 0) parts.push(`-frames:${args.removedFrames}`)
  if (args.changedFrames > 0) parts.push(`~frames:${args.changedFrames}`)
  if (args.tokenChanges > 0) parts.push(`~tokens:${args.tokenChanges}`)
  if (
    args.addedFrames === 0 &&
    args.removedFrames === 0 &&
    args.changedFrames === 0 &&
    args.tokenChanges === 0 &&
    args.packChanges.added.length === 0 &&
    args.packChanges.removed.length === 0 &&
    args.moduleChanges.added.length === 0 &&
    args.moduleChanges.removed.length === 0
  ) {
    parts.push('no changes')
  }
  return parts.join(' ')
}
