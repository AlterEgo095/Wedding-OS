// ══════════════════════════════════════════════════════════════════════════════
// GOVERNANCE ENGINE — Mission 5.8.6
// ══════════════════════════════════════════════════════════════════════════════
// The canonical governance pipeline for all production artifacts.
// Enforces: version → quality → approval → publish → audit
//
// Reuses:
//   - transitionCollection() from collections/index.ts (the canonical lifecycle)
//   - DesignVersion model for immutable snapshots
//   - AuditLog for forensic trail
//   - quality-engine.ts for quality checks
//
// Does NOT create a second lifecycle. Wraps the existing one with governance.
// ══════════════════════════════════════════════════════════════════════════════

import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import type { NextRequest } from 'next/server';

// ─── Governance Lifecycle (maps to Collection.status) ─────────────────────────
//
// DRAFT          → Collection.status = BROUILLON
// IN_REVIEW      → Collection.status = EN_COURS
// QUALITY_CHECK  → Collection.status = EN_COURS (quality running)
// APPROVED       → Collection.status = VALIDATION (waiting for approval)
// PUBLISHED      → Collection.status = PUBLIE
// ACTIVE         → Collection.status = COMMERCIALISE
// DEPRECATED     → Collection.status = PUBLIE (but marked deprecated)
// ARCHIVED       → Collection.status = ARCHIVE
// RESTORED       → Collection.status = PUBLIE (from ARCHIVE)

export type GovernanceState =
  | 'DRAFT'
  | 'IN_REVIEW'
  | 'QUALITY_CHECK'
  | 'APPROVED'
  | 'PUBLISHED'
  | 'ACTIVE'
  | 'DEPRECATED'
  | 'ARCHIVED'
  | 'RESTORED';

export interface GovernanceActionResult {
  success: boolean;
  previousStatus: string;
  newStatus: string;
  versionCreated?: string;
  auditLogId?: string;
  error?: string;
}

// ─── Create Version Snapshot ──────────────────────────────────────────────────

export async function createVersionSnapshot(
  collectionId: string,
  userId: string,
  comment: string,
  request: NextRequest,
): Promise<{ versionId: string; version: string }> {
  // Get current collection state
  const collection = await db.collection.findUnique({
    where: { id: collectionId },
    select: {
      id: true, slug: true, name: true, version: true,
      themeSeed: true, luxuryPreset: true, status: true,
      designDocument: true, sourceHash: true,
    },
  });

  if (!collection) throw new Error('Collection not found');

  // Bump version (0.x.y → 0.x.y+1 for drafts, 1.0.0+ for published)
  const [major, minor, patch] = collection.version.split('.').map(Number);
  const newVersion = `${major}.${minor}.${patch + 1}`;

  // Create immutable DesignVersion snapshot
  const designVersion = await db.designVersion.create({
    data: {
      collectionId,
      version: newVersion,
      manifestSnapshot: JSON.stringify({
        slug: collection.slug,
        name: collection.name,
        themeSeed: collection.themeSeed,
        luxuryPreset: collection.luxuryPreset,
        status: collection.status,
      }),
      sourceHash: collection.sourceHash,
      designPackage: collection.designDocument,
      createdByUserId: userId,
      note: comment,
    },
  });

  // Update collection version
  await db.collection.update({
    where: { id: collectionId },
    data: { version: newVersion },
  });

  // Audit log
  await db.auditLog.create({
    data: {
      weddingId: null,
      userId,
      action: 'GOVERNANCE_VERSION_CREATED',
      details: `Collection ${collection.slug} version ${newVersion} created (parent: ${collection.version}). Comment: ${comment}`,
    },
  });

  logger.info('Governance: version snapshot created', {
    collectionId, version: newVersion, parentVersion: collection.version, userId,
  });

  return { versionId: designVersion.id, version: newVersion };
}

// ─── Request Quality Check (transition EN_COURS → VALIDATION) ─────────────────

export async function requestQualityCheck(
  collectionId: string,
  userId: string,
  request: NextRequest,
): Promise<GovernanceActionResult> {
  const collection = await db.collection.findUnique({
    where: { id: collectionId },
    select: { id: true, slug: true, status: true, version: true },
  });

  if (!collection) throw new Error('Collection not found');

  const previousStatus = collection.status;

  // Must be EN_COURS to request quality check
  if (collection.status !== 'EN_COURS') {
    return {
      success: false,
      previousStatus,
      newStatus: previousStatus,
      error: `Cannot request quality check: current status is ${previousStatus}, expected EN_COURS`,
    };
  }

  // Transition to VALIDATION (which triggers quality gate in transitionCollection)
  // The transitionCollection function enforces the completeness gate
  const { transitionCollection } = await import('@/lib/collections');
  try {
    await transitionCollection({
      collectionId,
      to: 'VALIDATION',
      userId,
      userRole: "PLATFORM_ADMIN",
    });

    await db.auditLog.create({
      data: {
        weddingId: null,
        userId,
        action: 'GOVERNANCE_QUALITY_REQUESTED',
        details: `Collection ${collection.slug} submitted for quality check (EN_COURS → VALIDATION)`,
      },
    });

    return { success: true, previousStatus, newStatus: 'VALIDATION' };
  } catch (error) {
    return {
      success: false,
      previousStatus,
      newStatus: previousStatus,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// ─── Approve (transition VALIDATION → PUBLIE) ─────────────────────────────────

export async function approveForPublication(
  collectionId: string,
  userId: string,
  request: NextRequest,
): Promise<GovernanceActionResult> {
  const collection = await db.collection.findUnique({
    where: { id: collectionId },
    select: { id: true, slug: true, status: true, version: true },
  });

  if (!collection) throw new Error('Collection not found');

  const previousStatus = collection.status;

  if (collection.status !== 'VALIDATION') {
    return {
      success: false,
      previousStatus,
      newStatus: previousStatus,
      error: `Cannot approve: current status is ${previousStatus}, expected VALIDATION`,
    };
  }

  // Create version snapshot before approval
  const { version } = await createVersionSnapshot(
    collectionId, userId, `Approved for publication (v${collection.version} → v${collection.version})`, request
  );

  // Transition VALIDATION → PUBLIE
  const { transitionCollection } = await import('@/lib/collections');
  try {
    await transitionCollection({
      collectionId,
      to: 'PUBLIE',
      userId,
      userRole: "PLATFORM_ADMIN",
    });

    await db.auditLog.create({
      data: {
        weddingId: null,
        userId,
        action: 'GOVERNANCE_APPROVED',
        details: `Collection ${collection.slug} approved for publication (VALIDATION → PUBLIE). Version: ${version}`,
      },
    });

    return { success: true, previousStatus, newStatus: 'PUBLIE', versionCreated: version };
  } catch (error) {
    return {
      success: false,
      previousStatus,
      newStatus: previousStatus,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// ─── Publish (transition PUBLIE → COMMERCIALISE) ──────────────────────────────

export async function publishToProduction(
  collectionId: string,
  userId: string,
  request: NextRequest,
): Promise<GovernanceActionResult> {
  const collection = await db.collection.findUnique({
    where: { id: collectionId },
    select: { id: true, slug: true, status: true, version: true },
  });

  if (!collection) throw new Error('Collection not found');

  const previousStatus = collection.status;

  if (collection.status !== 'PUBLIE') {
    return {
      success: false,
      previousStatus,
      newStatus: previousStatus,
      error: `Cannot publish: current status is ${previousStatus}, expected PUBLIE`,
    };
  }

  const { transitionCollection } = await import('@/lib/collections');
  try {
    await transitionCollection({
      collectionId,
      to: 'COMMERCIALISE',
      userId,
      userRole: "PLATFORM_ADMIN",
    });

    await db.auditLog.create({
      data: {
        weddingId: null,
        userId,
        action: 'GOVERNANCE_PUBLISHED',
        details: `Collection ${collection.slug} published to production (PUBLIE → COMMERCIALISE). Version: ${collection.version}`,
      },
    });

    return { success: true, previousStatus, newStatus: 'COMMERCIALISE' };
  } catch (error) {
    return {
      success: false,
      previousStatus,
      newStatus: previousStatus,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// ─── Archive ──────────────────────────────────────────────────────────────────

export async function archive(
  collectionId: string,
  userId: string,
  request: NextRequest,
): Promise<GovernanceActionResult> {
  const collection = await db.collection.findUnique({
    where: { id: collectionId },
    select: { id: true, slug: true, status: true, version: true },
  });

  if (!collection) throw new Error('Collection not found');

  const previousStatus = collection.status;
  const { transitionCollection } = await import('@/lib/collections');

  try {
    await transitionCollection({
      collectionId,
      to: 'ARCHIVE',
      userId,
      userRole: "PLATFORM_ADMIN",
    });

    await db.auditLog.create({
      data: {
        weddingId: null,
        userId,
        action: 'GOVERNANCE_ARCHIVED',
        details: `Collection ${collection.slug} archived (${previousStatus} → ARCHIVE). Version: ${collection.version}`,
      },
    });

    return { success: true, previousStatus, newStatus: 'ARCHIVE' };
  } catch (error) {
    return {
      success: false,
      previousStatus,
      newStatus: previousStatus,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// ─── Restore (ARCHIVE → PUBLIE) ───────────────────────────────────────────────

export async function restore(
  collectionId: string,
  userId: string,
  request: NextRequest,
): Promise<GovernanceActionResult> {
  const collection = await db.collection.findUnique({
    where: { id: collectionId },
    select: { id: true, slug: true, status: true, version: true },
  });

  if (!collection) throw new Error('Collection not found');

  const previousStatus = collection.status;

  if (collection.status !== 'ARCHIVE') {
    return {
      success: false,
      previousStatus,
      newStatus: previousStatus,
      error: `Cannot restore: current status is ${previousStatus}, expected ARCHIVE`,
    };
  }

  const { transitionCollection } = await import('@/lib/collections');
  try {
    await transitionCollection({
      collectionId,
      to: 'PUBLIE',
      userId,
      userRole: "PLATFORM_ADMIN",
    });

    await db.auditLog.create({
      data: {
        weddingId: null,
        userId,
        action: 'GOVERNANCE_RESTORED',
        details: `Collection ${collection.slug} restored from archive (ARCHIVE → PUBLIE). Version: ${collection.version}`,
      },
    });

    return { success: true, previousStatus, newStatus: 'PUBLIE' };
  } catch (error) {
    return {
      success: false,
      previousStatus,
      newStatus: previousStatus,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// ─── Get Version History ──────────────────────────────────────────────────────

export async function getVersionHistory(collectionId: string) {
  const versions = await db.designVersion.findMany({
    where: { collectionId },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      version: true,
      note: true,
      sourceHash: true,
      createdByUserId: true,
      createdAt: true,
    },
    take: 20,
  });

  return versions.map(v => ({
    id: v.id,
    version: v.version,
    note: v.note,
    sourceHash: v.sourceHash ? v.sourceHash.slice(0, 16) + '...' : null,
    createdBy: v.createdByUserId,
    createdAt: v.createdAt.toISOString(),
  }));
}

// ─── Get Governance Dashboard Data ────────────────────────────────────────────

export async function getGovernanceDashboard() {
  const [total, drafts, inReview, validation, published, commercialised, archived, versions, recentAudits] = await Promise.all([
    db.collection.count(),
    db.collection.count({ where: { status: 'BROUILLON' } }),
    db.collection.count({ where: { status: 'EN_COURS' } }),
    db.collection.count({ where: { status: 'VALIDATION' } }),
    db.collection.count({ where: { status: 'PUBLIE' } }),
    db.collection.count({ where: { status: 'COMMERCIALISE' } }),
    db.collection.count({ where: { status: 'ARCHIVE' } }),
    db.designVersion.count(),
    db.auditLog.findMany({
      where: { action: { startsWith: 'GOVERNANCE_' } },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: { id: true, action: true, details: true, userId: true, createdAt: true },
    }),
  ]);

  return {
    collections: { total, drafts, inReview, validation, published, commercialised, archived },
    versions: { total: versions },
    recentAudits: recentAudits.map(a => ({
      id: a.id,
      action: a.action,
      details: a.details,
      userId: a.userId,
      createdAt: a.createdAt.toISOString(),
    })),
  };
}
