// ══════════════════════════════════════════════════════════════════════════════
// Mission 6.0 — P4.3 — ProgramItem / EventTimeline Merge Helper
// ══════════════════════════════════════════════════════════════════════════════
//
// The platform historically had TWO overlapping models describing the same
// concept (the schedule of the wedding day):
//
//   • ProgramItem    (canonical going-forward) — scheduledAt DateTime?,
//                     title, description?, location?, iconName?, sortOrder Int
//   • EventTimeline  (legacy)                  — time String, activity,
//                     location?, description?, icon? (emoji), order Int
//
// P4.3 merges them: ProgramItem becomes the canonical read/write model, and
// EventTimeline is kept as a deprecated read-only-backward-compat surface.
//
// This module performs the one-way migration:
//   1. Reads EventTimeline rows whose `migratedToProgramItemId` IS NULL.
//   2. For each row, parses the `time` String into a proper DateTime
//      (using Wedding.weddingDate as the date component when available).
//   3. Maps fields:  activity→title, description→description,
//                     location→location, icon(emoji)→iconName, order→sortOrder.
//   4. Creates a ProgramItem. Back-writes the new ProgramItem.id into
//      EventTimeline.migratedToProgramItemId so the row is never re-migrated.
//
// The migration is IDEMPOTENT — safe to run multiple times. Rows that have
// already been migrated (migratedToProgramItemId != null) are skipped.
//
// EventTimeline rows are NEVER deleted (kept for audit). The deprecation
// contract: EventTimeline remains writable for backward compat with legacy
// clients (the existing /api/timeline route), but all NEW UI writes go to
// ProgramItem.
//
// ─── Why `tenantDb` is a parameter (not imported) ─────────────────────────────
// The function is callable from two contexts:
//   • Inside `runWithTenant()` — the global `tenantDb` from `@/lib/db` auto-
//     injects weddingId into all queries (preferred path; used by the migrate
//     endpoint when the request resolves a tenant context).
//   • Outside `runWithTenant()` (e.g. a platform-level script) — the caller
//     can pass `db` from `@/lib/db` plus explicit `weddingId` filtering.
// Accepting the client as a parameter makes both call-sites work without
// forcing a particular tenant-context strategy on the caller.
// ══════════════════════════════════════════════════════════════════════════════

import type { PrismaClient } from '@prisma/client';
import { db as unsafePlatformDb } from '@/lib/db';
import { logger } from '@/lib/logger';

// ─── DB client type ──────────────────────────────────────────────────────────
//
// We accept the raw PrismaClient type. Both `db` (the raw client from
// `@/lib/db`) and `tenantDb` (the extended client with the tenant-scoped
// auto-inject extension) are structurally compatible — both expose the same
// `programItem`, `eventTimeline`, and `$transaction` members. The extended
// client is a strict superset of PrismaClient's API surface.
//
// Inside `runWithTenant()`, the extended client auto-injects `weddingId` into
// WHERE clauses — but our helper always passes `weddingId` explicitly, so the
// behaviour is identical inside or outside a tenant context.
export type ProgramMergeDb = PrismaClient;

// ─── Public types ────────────────────────────────────────────────────────────

export interface MigrationResult {
  /** Number of EventTimeline rows successfully migrated in this run. */
  migrated: number;
  /** Non-fatal parse errors — e.g. time strings we could not interpret. */
  errors: string[];
}

// ─── Time-string parsing ─────────────────────────────────────────────────────
//
// EventTimeline.time is a free-form String. In practice it stores values like:
//   "14:30", "14h30", "14:30:00", "14h", "14", "9h00", "09:00", "18:00:00".
// We parse the hour+minute components and combine them with the wedding date
// (or today's date as fallback) to produce a real DateTime for ProgramItem.
//
// Returns null when parsing fails — the caller logs the error and continues
// with scheduledAt=null (the ProgramItem.scheduledAt column is nullable).

const TIME_PATTERNS: readonly RegExp[] = [
  // 14:30:00 or 14:30
  /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/,
  // 14h30 or 14h30min
  /^(\d{1,2})h(\d{2})(?:min)?$/i,
  // 14h (hour only)
  /^(\d{1,2})h$/i,
];

/**
 * Parse a free-form time string into { hour, minute }.
 * Returns null when no pattern matches (the value is logged as a non-fatal
 * error by the caller).
 */
function parseTimeString(time: string): { hour: number; minute: number } | null {
  const trimmed = time.trim();
  if (!trimmed) return null;
  for (const pattern of TIME_PATTERNS) {
    const m = trimmed.match(pattern);
    if (m) {
      const hour = parseInt(m[1], 10);
      const minute = m[2] ? parseInt(m[2], 10) : 0;
      if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
        return { hour, minute };
      }
      return null; // out of range
    }
  }
  return null;
}

/**
 * Build a Date for the wedding day at the parsed time. Uses:
 *   1. Wedding.weddingDate (when set) — the canonical day component.
 *   2. Today (UTC) — fallback when the wedding has no date yet.
 *
 * Returns null when `time` cannot be parsed (caller sets scheduledAt=null).
 */
function buildScheduledAt(
  time: string,
  weddingDate: Date | null,
): Date | null {
  const parsed = parseTimeString(time);
  if (!parsed) return null;
  const base = weddingDate ?? new Date();
  // Construct in local time then convert — Date constructor interprets the
  // numeric args as LOCAL time which matches how weddingDate was authored.
  const dt = new Date(
    base.getFullYear(),
    base.getMonth(),
    base.getDate(),
    parsed.hour,
    parsed.minute,
    0,
    0,
  );
  return dt;
}

// ─── Icon mapping ────────────────────────────────────────────────────────────
//
// EventTimeline.icon is a free-form emoji or short string ("💍", "⛪", "wine",
// "church", etc.). ProgramItem.iconName is a Lucide icon name ("Heart",
// "Church", ...). We do a best-effort mapping; unmapped values fall through
// to the ProgramTimeline's default icon (Calendar).

const ICON_MAP: Record<string, string> = {
  // Emoji → Lucide name (Lucide has no "Ring" — use Heart as the closest
  // visual substitute; ProgramTimeline falls back to Calendar if a name
  // isn't in its registry, so an unmapped value is still safe.)
  '💍': 'Heart',
  '⛪': 'Church',
  '🏛️': 'Church',
  '🥂': 'Wine',
  '🍷': 'Wine',
  '🍽️': 'UtensilsCrossed',
  '🍴': 'UtensilsCrossed',
  '🎂': 'Cake',
  '🍰': 'Cake',
  '🎶': 'Music',
  '🎵': 'Music',
  '💃': 'Music',
  '🕺': 'Music',
  '📸': 'Camera',
  '📷': 'Camera',
  '🌸': 'Flower2',
  '💐': 'Flower2',
  '❤️': 'Heart',
  '💖': 'Heart',
  '💝': 'Gift',
  '🎁': 'Gift',
  '✨': 'Sparkles',
  '🎆': 'Sparkles',
  '🎇': 'Sparkles',
  '📍': 'MapPin',
  '🗺️': 'MapPin',
  // Lower-case keyword → Lucide name (EventTimeline.icon also stores text)
  church: 'Church',
  wine: 'Wine',
  utensils: 'UtensilsCrossed',
  cake: 'Cake',
  music: 'Music',
  camera: 'Camera',
  heart: 'Heart',
  flower: 'Flower2',
  gift: 'Gift',
  sparkles: 'Sparkles',
  mappin: 'MapPin',
  ring: 'Heart',
  clock: 'Clock',
};

function mapIconToName(icon: string | null | undefined): string | null {
  if (!icon) return null;
  const trimmed = icon.trim();
  if (!trimmed) return null;
  // Direct emoji match
  if (ICON_MAP[trimmed]) return ICON_MAP[trimmed];
  // Lower-case keyword match
  const lower = trimmed.toLowerCase();
  if (ICON_MAP[lower]) return ICON_MAP[lower];
  // Pass through any value that already looks like a PascalCase Lucide name
  // (e.g. "Heart", "UtensilsCrossed") — preserves values previously stored
  // by ProgramItem-aware clients writing into EventTimeline by mistake.
  if (/^[A-Z][a-zA-Z0-9]+$/.test(trimmed)) return trimmed;
  return null;
}

// ─── Migration entry point ───────────────────────────────────────────────────

/**
 * Migrate all unmigrated EventTimeline rows for a wedding into ProgramItem.
 *
 * Contract:
 *   • Idempotent — safe to call multiple times. Rows whose
 *     `migratedToProgramItemId` is already set are skipped.
 *   • Non-throwing — parse errors are returned in `errors[]` and the loop
 *     continues with the next row.
 *   • Atomic per-row — each (ProgramItem.create + EventTimeline.update) is
 *     wrapped in a $transaction so a failure on row N does not corrupt
 *     row N-1's back-link.
 *   • Preserves the legacy EventTimeline row (no deletes).
 *
 * @param weddingId  The wedding whose timeline should be migrated.
 * @param tenantDb   The Prisma client to use for the wedding-scoped writes.
 *                   Inside `runWithTenant()` pass the global `tenantDb`
 *                   (auto-scoped). Outside, pass `db` from `@/lib/db` — the
 *                   function explicitly filters by weddingId.
 */
export async function migrateEventTimelineToProgramItem(
  weddingId: string,
  tenantDb: ProgramMergeDb,
): Promise<MigrationResult> {
  const errors: string[] = [];
  let migrated = 0;

  // 1. Resolve the wedding's date (used as the day component for scheduledAt).
  //    Uses unsafePlatformDb because Wedding is a platform-level model
  //    (not tenant-scoped) and we want to read it regardless of the caller's
  //    tenant-context state.
  let weddingDate: Date | null = null;
  try {
    const wedding = await unsafePlatformDb.wedding.findUnique({
      where: { id: weddingId },
      select: { weddingDate: true },
    });
    weddingDate = wedding?.weddingDate ?? null;
  } catch (err) {
    // Non-fatal — we'll fall back to today's date for all rows.
    logger.warn('program-merge: could not load wedding date', {
      weddingId,
      errMessage: err instanceof Error ? err.message : String(err),
    });
  }

  // 2. Fetch all EventTimeline rows not yet migrated.
  let rows: Array<{
    id: string;
    time: string;
    activity: string;
    location: string | null;
    description: string | null;
    icon: string | null;
    order: number;
  }>;
  try {
    rows = await tenantDb.eventTimeline.findMany({
      where: {
        weddingId,
        migratedToProgramItemId: null,
      },
      orderBy: { order: 'asc' },
      select: {
        id: true,
        time: true,
        activity: true,
        location: true,
        description: true,
        icon: true,
        order: true,
      },
    });
  } catch (err) {
    logger.error('program-merge: failed to load EventTimeline rows', {
      weddingId,
      errMessage: err instanceof Error ? err.message : String(err),
    });
    return { migrated: 0, errors: ['Failed to load EventTimeline rows'] };
  }

  if (rows.length === 0) {
    return { migrated: 0, errors: [] };
  }

  // 3. Migrate each row in its own $transaction.
  for (const row of rows) {
    try {
      const scheduledAt = buildScheduledAt(row.time, weddingDate);
      if (!scheduledAt) {
        // Log + continue — the ProgramItem is still created with
        // scheduledAt=null so the entry is not lost.
        errors.push(
          `EventTimeline ${row.id}: could not parse time "${row.time}" — scheduledAt set to null`,
        );
      }

      const iconName = mapIconToName(row.icon);

      // Use $transaction so ProgramItem.create + EventTimeline.update are
      // atomic per row. If either fails, neither commits.
      const created = await tenantDb.$transaction(async (tx) => {
        const item = await tx.programItem.create({
          data: {
            weddingId,
            title: row.activity,
            description: row.description ?? null,
            location: row.location ?? null,
            iconName: iconName,
            scheduledAt: scheduledAt,
            sortOrder: row.order,
          },
          select: { id: true },
        });
        await tx.eventTimeline.update({
          where: { id: row.id },
          data: { migratedToProgramItemId: item.id },
          select: { id: true },
        });
        return item;
      });

      migrated++;
      logger.info('program-merge: migrated row', {
        weddingId,
        eventTimelineId: row.id,
        programItemId: created.id,
      });
    } catch (err) {
      const msg = `EventTimeline ${row.id}: ${err instanceof Error ? err.message : String(err)}`;
      errors.push(msg);
      logger.error('program-merge: row migration failed', {
        weddingId,
        eventTimelineId: row.id,
        errMessage: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { migrated, errors };
}

// ─── Canonical read helper ───────────────────────────────────────────────────
//
// All READ paths should use this helper (or fetch ProgramItem directly) —
// NEVER read EventTimeline for display. The legacy /api/timeline route still
// returns EventTimeline data for backward compatibility with old clients,
// but new UI components use ProgramItem.

export interface ProgramItemDto {
  id: string;
  scheduledAt: Date | null;
  title: string;
  description: string | null;
  location: string | null;
  iconName: string | null;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Get the ordered list of ProgramItem entries for a wedding.
 *
 * Ordering:
 *   1. sortOrder ASC (explicit manual ordering)
 *   2. scheduledAt ASC (within the same sortOrder, earliest first)
 *   3. createdAt ASC (stable tiebreaker for items at the same sort+time)
 *
 * @param weddingId  The wedding whose program to fetch.
 * @param tenantDb   Prisma client. Inside runWithTenant() pass the global
 *                   `tenantDb`. Otherwise pass `db` from `@/lib/db` (the
 *                   function explicitly filters by weddingId).
 */
export async function getProgramItemsForWedding(
  weddingId: string,
  tenantDb: ProgramMergeDb,
): Promise<ProgramItemDto[]> {
  const items = await tenantDb.programItem.findMany({
    where: { weddingId },
    orderBy: [
      { sortOrder: 'asc' },
      { scheduledAt: 'asc' },
      { createdAt: 'asc' },
    ],
    select: {
      id: true,
      scheduledAt: true,
      title: true,
      description: true,
      location: true,
      iconName: true,
      sortOrder: true,
      createdAt: true,
      updatedAt: true,
    },
    take: 500, // Defensive upper bound — no wedding should have >500 program items
  });
  return items;
}
