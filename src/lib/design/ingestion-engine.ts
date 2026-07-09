// ══════════════════════════════════════════════════════════════════════════════
// INGESTION ENGINE — Mission 5.7.1 Phase 4
// ══════════════════════════════════════════════════════════════════════════════
//
// Receives a CanonicalDesignPackage from a SourceAdapter (PenpotAdapter or
// TestFixtureAdapter), validates it, normalizes it, persists it, and audits
// the ingestion.
//
// The ingestion is IDEMPOTENT: importing the same package (same sourceHash)
// twice does not create a duplicate — it returns the existing IngestionJob.
//
// Pipeline:
//   receive -> validate schema -> validate provenance -> validate version
//   -> validate assets -> normalize -> persist -> audit
// ══════════════════════════════════════════════════════════════════════════════

import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import {
  isCanonicalDesignPackage,
  CANONICAL_DESIGN_SCHEMA_VERSION,
  type CanonicalDesignPackage,
  type DesignSource,
} from './types';

// ─── Ingestion Result ─────────────────────────────────────────────────────────

export interface IngestionResult {
  jobId: string;
  status: 'COMPLETED' | 'FAILED' | 'DUPLICATE';
  collectionId: string;
  sourceHash: string;
  designPackage: CanonicalDesignPackage;
  error?: string;
}

// ─── Validation Errors ────────────────────────────────────────────────────────

export class IngestionValidationError extends Error {
  constructor(
    message: string,
    public code: 'SCHEMA_INVALID' | 'PROVENANCE_INVALID' | 'VERSION_MISMATCH' | 'ASSET_MISSING' | 'DUPLICATE_HASH',
  ) {
    super(message);
    this.name = 'IngestionValidationError';
  }
}

// ─── Validate Schema ──────────────────────────────────────────────────────────

function validateSchema(pkg: unknown): asserts pkg is CanonicalDesignPackage {
  if (!isCanonicalDesignPackage(pkg)) {
    throw new IngestionValidationError(
      'Package does not match CanonicalDesignPackage schema',
      'SCHEMA_INVALID',
    );
  }
  if (pkg.schemaVersion !== CANONICAL_DESIGN_SCHEMA_VERSION) {
    throw new IngestionValidationError(
      `Schema version mismatch: expected ${CANONICAL_DESIGN_SCHEMA_VERSION}, got ${pkg.schemaVersion}`,
      'VERSION_MISMATCH',
    );
  }
}

// ─── Validate Provenance ──────────────────────────────────────────────────────

function validateProvenance(source: DesignSource): void {
  if (!source.sourceType || !['PENPOT_PRIVATE', 'TEST_FIXTURE'].includes(source.sourceType)) {
    throw new IngestionValidationError(
      `Invalid sourceType: ${source.sourceType}`,
      'PROVENANCE_INVALID',
    );
  }
  if (!source.sourceHash || source.sourceHash.length !== 64) {
    throw new IngestionValidationError(
      `Invalid sourceHash (expected 64-char SHA-256, got ${source.sourceHash?.length || 0} chars)`,
      'PROVENANCE_INVALID',
    );
  }
  if (!source.importedAt || isNaN(Date.parse(source.importedAt))) {
    throw new IngestionValidationError(
      `Invalid importedAt: ${source.importedAt}`,
      'PROVENANCE_INVALID',
    );
  }
}

// ─── Validate Assets ──────────────────────────────────────────────────────────

function validateAssets(pkg: CanonicalDesignPackage): void {
  const assetIds = pkg.document.assetIds || [];
  for (const assetId of assetIds) {
    if (typeof assetId !== 'string' || assetId.length === 0) {
      throw new IngestionValidationError(
        `Invalid assetId: ${assetId}`,
        'ASSET_MISSING',
      );
    }
  }
  // TODO: when DesignAsset model is populated, verify each assetId exists in DB.
  // For now, the fixture has assetIds=[] so this passes trivially.
}

// ─── Normalize ────────────────────────────────────────────────────────────────

function normalizePackage(pkg: CanonicalDesignPackage): CanonicalDesignPackage {
  // Sort pages by variantCode for deterministic ordering
  const sortedPages = [...pkg.document.pages].sort((a, b) =>
    (a.variantCode || '').localeCompare(b.variantCode || ''),
  );
  // Sort frames by name within each page
  const normalizedPages = sortedPages.map((page) => ({
    ...page,
    frames: [...page.frames].sort((a, b) => a.name.localeCompare(b.name)),
  }));
  return {
    ...pkg,
    document: { ...pkg.document, pages: normalizedPages },
  };
}

// ─── Main Ingestion Function ──────────────────────────────────────────────────

export async function ingestDesignPackage(
  pkg: CanonicalDesignPackage,
  collectionId: string,
): Promise<IngestionResult> {
  const sourceHash = pkg.source.sourceHash;

  try {
    // 1. Validate schema
    validateSchema(pkg);

    // 2. Validate provenance
    validateProvenance(pkg.source);

    // 3. Validate version
    if (pkg.schemaVersion !== CANONICAL_DESIGN_SCHEMA_VERSION) {
      throw new IngestionValidationError(
        `Schema version mismatch`,
        'VERSION_MISMATCH',
      );
    }

    // 4. Validate assets
    validateAssets(pkg);

    // 5. Normalize
    const normalizedPkg = normalizePackage(pkg);

    // 6. Check idempotency — is there already a job with the same sourceHash?
    const existing = await db.ingestionJob.findUnique({
      where: { collectionId_sourceHash: { collectionId, sourceHash } },
    });

    if (existing && existing.status === 'COMPLETED') {
      logger.info('Ingestion: duplicate package detected, returning existing job', {
        jobId: existing.id,
        collectionId,
        sourceHash,
      });
      return {
        jobId: existing.id,
        status: 'DUPLICATE',
        collectionId,
        sourceHash,
        designPackage: normalizedPkg,
      };
    }

    // 7. Create or update the IngestionJob
    const job = await db.ingestionJob.upsert({
      where: { collectionId_sourceHash: { collectionId, sourceHash } },
      create: {
        collectionId,
        sourceUrl: `${pkg.source.sourceType}:${pkg.source.fileId}`,
        sourceHash,
        status: 'FETCHING',
        attemptCount: 1,
      },
      update: {
        status: 'FETCHING',
        attemptCount: { increment: 1 },
        lastError: null,
      },
    });

    // 8. Persist the design package + update Collection cache
    await db.$transaction([
      db.ingestionJob.update({
        where: { id: job.id },
        data: {
          status: 'COMPLETED',
          designPackage: JSON.stringify(normalizedPkg),
          startedAt: new Date(),
          completedAt: new Date(),
        },
      }),
      db.collection.update({
        where: { id: collectionId },
        data: {
          sourceHash,
          designDocument: JSON.stringify(normalizedPkg.document),
        },
      }),
    ]);

    logger.info('Ingestion: package ingested successfully', {
      jobId: job.id,
      collectionId,
      sourceHash,
      sourceType: pkg.source.sourceType,
    });

    return {
      jobId: job.id,
      status: 'COMPLETED',
      collectionId,
      sourceHash,
      designPackage: normalizedPkg,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const code = error instanceof IngestionValidationError ? error.code : 'SCHEMA_INVALID';

    logger.error('Ingestion: failed', {
      collectionId,
      sourceHash,
      errMessage: message,
      code,
    });

    // Record the failure in the IngestionJob (if it was created)
    try {
      await db.ingestionJob.update({
        where: { collectionId_sourceHash: { collectionId, sourceHash } },
        data: {
          status: 'FAILED',
          lastError: message,
          completedAt: new Date(),
        },
      });
    } catch {
      // Job may not exist yet — ignore
    }

    return {
      jobId: '',
      status: 'FAILED',
      collectionId,
      sourceHash,
      designPackage: pkg,
      error: message,
    };
  }
}

// ─── Get Ingestion Status ─────────────────────────────────────────────────────

export async function getIngestionStatus(
  collectionId: string,
  sourceHash?: string,
): Promise<{ status: string; lastJob: unknown } | null> {
  const where = sourceHash
    ? { collectionId_sourceHash: { collectionId, sourceHash } }
    : { collectionId };
  const jobs = await db.ingestionJob.findMany({
    where: sourceHash ? { collectionId, sourceHash } : { collectionId },
    orderBy: { createdAt: 'desc' },
    take: 1,
  });
  if (jobs.length === 0) return null;
  return { status: jobs[0].status, lastJob: jobs[0] };
}
