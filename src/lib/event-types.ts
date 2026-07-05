// ══════════════════════════════════════════════════════════════════════════════
// src/lib/event-types.ts — Event OS Abstraction (Mission 4.0 Phase 7)
// ══════════════════════════════════════════════════════════════════════════════
//
// Additive layer that lets the platform evolve from "Wedding OS" to
// "Event Experience OS" WITHOUT a risky rename of the Wedding model.
//
// The Wedding model remains the canonical tenant entity (backward compat).
// This module introduces an `EventType` concept that:
//   - lives in the Settings table (key='event_type', value=one of EVENT_TYPES)
//   - controls UI labels (bride/groom → hosts, guest → participant, etc.)
//   - is read by the renderer via the manifest 'props' field (future)
//
// This is purely additive: existing weddings default to 'WEDDING' and behave
// exactly as before. New event types can be created by setting the Settings
// key — no schema migration, no code change to the Wedding model.
//
// Future migration path (NOT in this mission):
//   1. Add `eventType String @default("WEDDING")` column to Wedding (migration)
//   2. Backfill from Settings
//   3. Rename Wedding → Event in a separate, tested migration
// For now, Settings-based is the safe, reversible choice.
// ══════════════════════════════════════════════════════════════════════════════

export type EventType =
  | 'WEDDING'
  | 'BIRTHDAY'
  | 'CONFERENCE'
  | 'CORPORATE'
  | 'PRIVATE_EVENT';

export const EVENT_TYPES: EventType[] = [
  'WEDDING',
  'BIRTHDAY',
  'CONFERENCE',
  'CORPORATE',
  'PRIVATE_EVENT',
];

export function isEventType(value: unknown): value is EventType {
  return typeof value === 'string' && (EVENT_TYPES as string[]).includes(value);
}

// ─── Terminology per event type ───────────────────────────────────────────────
// The renderer uses these labels instead of hardcoded "bride"/"groom"/"guest".
// For a WEDDING: hostLabels = ['Marié', 'Mariée'], guestTerm = 'Invité'
// For a CONFERENCE: hostLabels = ['Intervenant principal', 'Organisateur'], guestTerm = 'Participant'
// This lets the same components render correctly for any event type.

export interface EventTerminology {
  /** The event type identifier */
  type: EventType;
  /** Human-readable label, e.g. "Mariage", "Anniversaire", "Conférence" */
  eventLabel: string;
  /** Labels for the 1-2 main hosts, in order. For weddings: ['Marié', 'Mariée']. */
  hostLabels: [string, string];
  /** Singular term for a guest/participant. */
  guestTerm: string;
  /** Plural term. */
  guestTermPlural: string;
  /** The verb for the main ceremony action. "célébrer" / "fêter" / "assister à". */
  ceremonyVerb: string;
  /** Whether this event type typically has a "couple" (2 hosts) or a single host. */
  hasCouple: boolean;
}

export const EVENT_TERMINOLOGY: Record<EventType, EventTerminology> = {
  WEDDING: {
    type: 'WEDDING',
    eventLabel: 'Mariage',
    hostLabels: ['Marié', 'Mariée'],
    guestTerm: 'Invité',
    guestTermPlural: 'Invités',
    ceremonyVerb: 'célébrer',
    hasCouple: true,
  },
  BIRTHDAY: {
    type: 'BIRTHDAY',
    eventLabel: 'Anniversaire',
    hostLabels: ['Personne fêtée', ''],
    guestTerm: 'Invité',
    guestTermPlural: 'Invités',
    ceremonyVerb: 'fêter',
    hasCouple: false,
  },
  CONFERENCE: {
    type: 'CONFERENCE',
    eventLabel: 'Conférence',
    hostLabels: ['Organisateur', 'Intervenant principal'],
    guestTerm: 'Participant',
    guestTermPlural: 'Participants',
    ceremonyVerb: 'assister à',
    hasCouple: false,
  },
  CORPORATE: {
    type: 'CORPORATE',
    eventLabel: "Événement d'entreprise",
    hostLabels: ['Entreprise', 'Responsable'],
    guestTerm: 'Collaborateur',
    guestTermPlural: 'Collaborateurs',
    ceremonyVerb: 'participer à',
    hasCouple: false,
  },
  PRIVATE_EVENT: {
    type: 'PRIVATE_EVENT',
    eventLabel: 'Événement privé',
    hostLabels: ['Hôte', ''],
    guestTerm: 'Invité',
    guestTermPlural: 'Invités',
    ceremonyVerb: 'rejoindre',
    hasCouple: false,
  },
};

// ─── Settings key ─────────────────────────────────────────────────────────────
export const EVENT_TYPE_SETTINGS_KEY = 'event_type';

/**
 * Resolve the event type for a wedding from its Settings rows.
 * Defaults to 'WEDDING' when not set (backward compat — existing weddings
 * are unchanged). This is the single read-path the renderer should use.
 */
export async function resolveEventType(weddingId: string): Promise<EventType> {
  const { db } = await import('@/lib/db');
  const setting = await db.settings.findUnique({
    where: { weddingId_key: { weddingId, key: EVENT_TYPE_SETTINGS_KEY } },
    select: { value: true },
  });
  if (setting && isEventType(setting.value)) {
    return setting.value;
  }
  return 'WEDDING';
}

/**
 * Get the terminology for a wedding (defaults to WEDDING).
 * Convenience wrapper for components that need labels.
 */
export async function resolveEventTerminology(weddingId: string): Promise<EventTerminology> {
  const type = await resolveEventType(weddingId);
  return EVENT_TERMINOLOGY[type];
}
