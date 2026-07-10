// ══════════════════════════════════════════════════════════════════════════════
// MASTER LIFECYCLE — Mission 5.7.2 Phase 3
// ══════════════════════════════════════════════════════════════════════════════
// Manages the lifecycle of a design master through the production pipeline.
// Reuses Collection.status (BROUILLON/EN_COURS/VALIDATION/PUBLIE/COMMERCIALISE/ARCHIVE)
// for the product lifecycle, and adds design-pipeline-specific tracking via
// IngestionJob + DesignVersion.
//
// Master lifecycle states (mapped to Collection.status):
//   DRAFT         → Collection.status = BROUILLON (design not yet ingested)
//   INGESTED      → Collection.status = EN_COURS (ingestion completed, design persisted)
//   MAPPED        → Collection.status = EN_COURS (semantic mappings persisted)
//   VALIDATED     → Collection.status = VALIDATION (quality gate passed)
//   APPROVED      → Collection.status = PUBLIE (admin approved for production)
//   PRODUCTION    → Collection.status = COMMERCIALISE (producing outputs)
//   ARCHIVED      → Collection.status = ARCHIVE (retired)
// ══════════════════════════════════════════════════════════════════════════════

import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { writeAuditLog } from '@/lib/audit';
import type { NextRequest } from 'next/server';
import type { CanonicalDesignPackage } from './types';
import { ingestDesignPackage } from './ingestion-engine';
import { GOLDEN_INVITATION_FIXTURE } from './golden-fixture';

// ─── Ingest fixture into a Collection ─────────────────────────────────────────

export async function ingestFixtureIntoCollection(
  collectionId: string,
  userId: string,
  request: NextRequest,
): Promise<{
  ingestionJobId: string;
  designVersionId: string;
  sourceHash: string;
  status: string;
}> {
  // 1. Ingest the golden fixture through the real ingestion pipeline
  const result = await ingestDesignPackage(GOLDEN_INVITATION_FIXTURE, collectionId);

  if (result.status === 'FAILED') {
    throw new Error(`Ingestion failed: ${result.error}`);
  }

  // 2. Create an immutable DesignVersion snapshot
  const collection = await db.collection.findUnique({
    where: { id: collectionId },
    select: { version: true, slug: true },
  });

  if (!collection) {
    throw new Error(`Collection not found: ${collectionId}`);
  }

  // Bump version on ingestion (0.x → 0.x+1 for drafts)
  const currentVersion = collection.version;
  const [major, minor] = currentVersion.split('.').map(Number);
  const newVersion = `${major}.${minor + 1}.0`;

  // Check if a DesignVersion already exists for this sourceHash
  const existingVersion = await db.designVersion.findUnique({
    where: {
      collectionId_version: { collectionId, version: newVersion },
    },
  });

  let designVersionId: string;

  if (existingVersion) {
    designVersionId = existingVersion.id;
  } else {
    const designVersion = await db.designVersion.create({
      data: {
        collectionId,
        version: newVersion,
        manifestSnapshot: '{}', // will be populated when compiled
        sourceHash: result.sourceHash,
        designPackage: JSON.stringify(result.designPackage),
        createdByUserId: userId,
        note: `Ingested from ${result.designPackage.source.sourceType} (hash: ${result.sourceHash.slice(0, 16)})`,
      },
    });
    designVersionId = designVersion.id;
  }

  // 3. Update Collection status to EN_COURS (INGESTED)
  await db.collection.update({
    where: { id: collectionId },
    data: {
      status: 'EN_COURS',
      version: newVersion,
    },
  });

  // 4. Audit log
  await writeAuditLog({
    weddingId: null,
    userId,
    action: 'DESIGN_MASTER_INGESTED',
    details: `Collection ${collection.slug} ingested: version ${newVersion}, sourceHash ${result.sourceHash.slice(0, 16)}, job ${result.jobId}`,
    request,
  });

  logger.info('Master ingested into collection', {
    collectionId,
    version: newVersion,
    sourceHash: result.sourceHash,
    ingestionJobId: result.jobId,
    designVersionId,
  });

  return {
    ingestionJobId: result.jobId,
    designVersionId,
    sourceHash: result.sourceHash,
    status: 'INGESTED',
  };
}

// ─── Reload design from database ──────────────────────────────────────────────

export async function reloadDesignFromDb(
  collectionId: string,
): Promise<CanonicalDesignPackage | null> {
  // Load the latest IngestionJob with the design package
  const job = await db.ingestionJob.findFirst({
    where: { collectionId, status: 'COMPLETED' },
    orderBy: { completedAt: 'desc' },
    select: { designPackage: true, sourceHash: true },
  });

  if (!job || !job.designPackage) {
    return null;
  }

  try {
    return JSON.parse(job.designPackage) as CanonicalDesignPackage;
  } catch {
    logger.error('reloadDesignFromDb: failed to parse designPackage', { collectionId });
    return null;
  }
}

// ─── Approve master for production ────────────────────────────────────────────

export async function approveMaster(
  collectionId: string,
  userId: string,
  request: NextRequest,
): Promise<{ status: string; version: string }> {
  const collection = await db.collection.findUnique({
    where: { id: collectionId },
    select: { status: true, version: true, slug: true, sourceHash: true },
  });

  if (!collection) {
    throw new Error(`Collection not found: ${collectionId}`);
  }

  if (collection.status !== 'VALIDATION') {
    throw new Error(`Cannot approve: current status is ${collection.status}, expected VALIDATION`);
  }

  // Transition to PUBLIE (APPROVED)
  await db.collection.update({
    where: { id: collectionId },
    data: {
      status: 'PUBLIE',
      publishedAt: new Date(),
    },
  });

  await writeAuditLog({
    weddingId: null,
    userId,
    action: 'DESIGN_MASTER_APPROVED',
    details: `Collection ${collection.slug} approved for production (version ${collection.version})`,
    request,
  });

  logger.info('Master approved', { collectionId, version: collection.version });

  return { status: 'APPROVED', version: collection.version };
}

// ─── Get master status ────────────────────────────────────────────────────────

export async function getMasterStatus(collectionId: string): Promise<{
  collectionStatus: string;
  version: string;
  sourceHash: string | null;
  hasIngestedDesign: boolean;
  ingestionJobCount: number;
  designVersionCount: number;
  exportJobCount: number;
  latestIngestionJob: { status: string; completedAt: string | null } | null;
}> {
  const collection = await db.collection.findUnique({
    where: { id: collectionId },
    select: {
      status: true,
      version: true,
      sourceHash: true,
      designDocument: true,
      _count: {
        select: {
          ingestionJobs: true,
          designVersions: true,
          exportJobs: true,
        },
      },
    },
  });

  if (!collection) {
    throw new Error(`Collection not found: ${collectionId}`);
  }

  const latestJob = await db.ingestionJob.findFirst({
    where: { collectionId },
    orderBy: { createdAt: 'desc' },
    select: { status: true, completedAt: true },
  });

  return {
    collectionStatus: collection.status,
    version: collection.version,
    sourceHash: collection.sourceHash,
    hasIngestedDesign: !!collection.designDocument,
    ingestionJobCount: collection._count.ingestionJobs,
    designVersionCount: collection._count.designVersions,
    exportJobCount: collection._count.exportJobs,
    latestIngestionJob: latestJob
      ? { status: latestJob.status, completedAt: latestJob.completedAt?.toISOString() || null }
      : null,
  };
}
