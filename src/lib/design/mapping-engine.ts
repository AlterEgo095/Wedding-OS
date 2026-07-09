// ══════════════════════════════════════════════════════════════════════════════
// SEMANTIC MAPPING ENGINE — Mission 5.7.1 Phase 5
// ══════════════════════════════════════════════════════════════════════════════
//
// Maps design elements (nodes with semanticRole) to Wedding OS data paths.
// The mapping is:
//   - INSPECTABLE (PLATFORM_ADMIN can view all bindings)
//   - EDITABLE (PLATFORM_ADMIN can override mappings)
//   - VALIDATABLE (required bindings must resolve)
//   - VERSIONED (stored in CollectionModule.dataBindings JSON)
//   - AUDITED (changes logged via AuditLog)
//
// No client or organizer can access the mapping tools.
// ══════════════════════════════════════════════════════════════════════════════

import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import type { CanonicalDesignPackage, ProductBinding } from './types';

// ─── Binding Context (the data available for resolution) ──────────────────────

export interface BindingContext {
  wedding: {
    id: string;
    slug: string;
    coupleLabel: string;
    brideName: string;
    groomName: string;
    weddingDate: Date | null;
    venueName: string | null;
    venueCity: string | null;
    venueAddress: string | null;
  };
  guest?: {
    id: string;
    displayName: string | null;
    firstName: string;
    lastName: string;
    invitationCode: string;
    category: string | null;
    tableId: string | null;
  };
  table?: {
    id: string;
    name: string;
    number: number;
  } | null;
  invitation?: {
    id: string;
    qrCodeUrl: string;
    accessCode: string;
  };
}

// ─── Resolved Binding ─────────────────────────────────────────────────────────

export interface ResolvedBinding {
  sourceNodeId: string;
  semanticRole: string;
  dataPath: string;
  value: string;
  fallback: string | undefined;
  resolved: boolean;
  required: boolean;
}

// ─── Resolve a data path against the BindingContext ──────────────────────────

function resolveDataPath(dataPath: string, ctx: BindingContext): string | null {
  // Parse "Wedding.coupleLabel" -> obj=Wedding, field=coupleLabel
  const parts = dataPath.split('.');
  if (parts.length !== 2) return null;
  const [objName, fieldName] = parts;

  let obj: Record<string, unknown> | null = null;
  switch (objName) {
    case 'Wedding':
      obj = ctx.wedding as unknown as Record<string, unknown>;
      break;
    case 'Guest':
      obj = ctx.guest as unknown as Record<string, unknown> | null;
      break;
    case 'Table':
      obj = ctx.table as unknown as Record<string, unknown> | null;
      break;
    case 'Invitation':
      obj = ctx.invitation as unknown as Record<string, unknown> | null;
      break;
  }

  if (!obj) return null;
  const value = obj[fieldName];
  if (value === null || value === undefined) return null;
  return String(value);
}

// ─── Apply Transform ──────────────────────────────────────────────────────────

function applyTransform(value: string, transform?: string): string {
  if (!transform) return value;
  switch (transform) {
    case 'formatDate':
      try {
        const d = new Date(value);
        return d.toLocaleDateString('fr-FR', {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        });
      } catch {
        return value;
      }
    case 'toUpperCase':
      return value.toUpperCase();
    case 'toLowerCase':
      return value.toLowerCase();
    default:
      return value;
  }
}

// ─── Resolve All Bindings ─────────────────────────────────────────────────────

export function resolveBindings(
  bindings: ProductBinding[],
  ctx: BindingContext,
): ResolvedBinding[] {
  return bindings.map((binding) => {
    let value: string | null = resolveDataPath(binding.dataPath, ctx);

    if (value === null) {
      // Use fallback if available
      value = binding.fallback || '';
      return {
        sourceNodeId: binding.sourceNodeId,
        semanticRole: binding.semanticRole,
        dataPath: binding.dataPath,
        value,
        fallback: binding.fallback,
        resolved: false,
        required: binding.required,
      };
    }

    value = applyTransform(value, binding.transform);

    return {
      sourceNodeId: binding.sourceNodeId,
      semanticRole: binding.semanticRole,
      dataPath: binding.dataPath,
      value,
      fallback: binding.fallback,
      resolved: true,
      required: binding.required,
    };
  });
}

// ─── Validate Bindings (quality gate) ─────────────────────────────────────────

export interface BindingValidationResult {
  valid: boolean;
  totalBindings: number;
  resolvedBindings: number;
  missingRequired: Array<{ semanticRole: string; dataPath: string }>;
  errors: string[];
}

export function validateBindings(
  resolved: ResolvedBinding[],
): BindingValidationResult {
  const errors: string[] = [];
  const missingRequired: Array<{ semanticRole: string; dataPath: string }> = [];

  for (const r of resolved) {
    if (r.required && !r.resolved) {
      missingRequired.push({
        semanticRole: r.semanticRole,
        dataPath: r.dataPath,
      });
      errors.push(
        `Required binding "${r.semanticRole}" could not be resolved (path: ${r.dataPath})`,
      );
    }
  }

  return {
    valid: missingRequired.length === 0,
    totalBindings: resolved.length,
    resolvedBindings: resolved.filter((r) => r.resolved).length,
    missingRequired,
    errors,
  };
}

// ─── Build Binding Context from Wedding + Guest ───────────────────────────────

export async function buildBindingContext(
  weddingId: string,
  guestId?: string,
): Promise<BindingContext> {
  const wedding = await db.wedding.findUnique({
    where: { id: weddingId },
    select: {
      id: true,
      slug: true,
      coupleLabel: true,
      brideName: true,
      groomName: true,
      weddingDate: true,
      venueName: true,
      venueCity: true,
      venueAddress: true,
    },
  });

  if (!wedding) {
    throw new Error(`Wedding not found: ${weddingId}`);
  }

  const ctx: BindingContext = { wedding };

  if (guestId) {
    const guest = await db.guest.findUnique({
      where: { id: guestId },
      select: {
        id: true,
        displayName: true,
        firstName: true,
        lastName: true,
        invitationCode: true,
        category: true,
        tableId: true,
      },
    });

    if (guest) {
      ctx.guest = guest;

      if (guest.tableId) {
        const table = await db.table.findUnique({
          where: { id: guest.tableId },
          select: { id: true, name: true, number: true },
        });
        ctx.table = table;
      } else {
        ctx.table = null;
      }

      // Build invitation QR URL using the existing real QR pipeline
      const qrCodeUrl = `${process.env.NEXT_PUBLIC_BASE_URL || 'https://heureuxmariage.aenews.net'}/api/guests/qrcode/${guest.invitationCode}?wedding=${wedding.slug}`;
      ctx.invitation = {
        id: guest.id,
        qrCodeUrl,
        accessCode: guest.invitationCode,
      };
    }
  }

  return ctx;
}

// ─── Persist Mappings to CollectionModule ─────────────────────────────────────

export async function persistMappings(
  collectionId: string,
  pack: string,
  slot: string,
  bindings: ProductBinding[],
  userId: string,
): Promise<void> {
  const module = await db.collectionModule.findUnique({
    where: { collectionId_pack_slot: { collectionId, pack, slot } },
  });

  if (!module) {
    throw new Error(`CollectionModule not found: ${collectionId}/${pack}/${slot}`);
  }

  await db.collectionModule.update({
    where: { id: module.id },
    data: { dataBindings: JSON.stringify(bindings) },
  });

  await db.auditLog.create({
    data: {
      weddingId: null,
      userId,
      action: 'DESIGN_MAPPINGS_UPDATED',
      details: `Updated ${bindings.length} data bindings for ${collectionId}/${pack}/${slot}`,
    },
  });

  logger.info('Semantic mappings persisted', {
    collectionId,
    pack,
    slot,
    bindingCount: bindings.length,
    userId,
  });
}

// ─── Extract Bindings from CanonicalDesignPackage ─────────────────────────────

export function extractBindingsFromPackage(
  pkg: CanonicalDesignPackage,
): ProductBinding[] {
  return pkg.bindings;
}
