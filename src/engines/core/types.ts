// ══════════════════════════════════════════════════════════════════════════════
// CORE ENGINE — Types & Interfaces
// ══════════════════════════════════════════════════════════════════════════════
// Phase 0 ÉTAPE 6 — Foundation for the Core Engine.
// The Core Engine manages wedding lifecycle, guest operations, tables,
// timeline, couple story — all business-domain operations.
//
// This file defines the INTERFACES only. Implementation comes in Phase 1+.
// Existing routes continue to use `tenantDb` directly; future refactors
// will migrate them to call Core Engine services.
// ══════════════════════════════════════════════════════════════════════════════

import type { PlanId } from '@/lib/config/plans';

/**
 * A wedding tenant — the root entity of the Core domain.
 */
export interface WeddingEntity {
  id: string;
  slug: string;
  brideName: string;
  groomName: string;
  coupleLabel: string;
  weddingDate: Date | null;
  timezone: string;
  venueName: string | null;
  venueCity: string | null;
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED' | 'SUSPENDED';
  plan: PlanId;
  customDomain: string | null;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
  publishedAt: Date | null;
}

/**
 * Result of a Core Engine operation.
 * Unified shape for success/error propagation.
 */
export interface EngineResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
}

/**
 * Core Engine — wedding lifecycle operations.
 * Future implementation will wrap tenantDb calls with validation,
 * audit logging, cache invalidation, and event emission.
 */
export interface ICoreEngine {
  // ── Wedding lifecycle ──
  createWedding(input: CreateWeddingInput): Promise<EngineResult<WeddingEntity>>;
  publishWedding(weddingId: string): Promise<EngineResult<WeddingEntity>>;
  suspendWedding(weddingId: string, reason?: string): Promise<EngineResult<WeddingEntity>>;
  archiveWedding(weddingId: string): Promise<EngineResult<WeddingEntity>>;

  // ── Guest operations ──
  addGuest(weddingId: string, input: GuestInput): Promise<EngineResult>;
  bulkImportGuests(weddingId: string, guests: GuestInput[]): Promise<EngineResult<{ imported: number; failed: number }>>;
  checkInGuest(weddingId: string, guestId: string): Promise<EngineResult>;

  // ── Stats ──
  getWeddingStats(weddingId: string): Promise<EngineResult<WeddingStats>>;
}

export interface CreateWeddingInput {
  slug: string;
  brideName: string;
  groomName: string;
  weddingDate?: Date;
  venueName?: string;
  venueCity?: string;
  plan?: PlanId;
}

export interface GuestInput {
  firstName: string;
  lastName: string;
  phone?: string;
  email?: string;
  category?: string;
  invitationType?: string;
  seats?: number;
  tableId?: string;
}

export interface WeddingStats {
  totalGuests: number;
  confirmed: number;
  pending: number;
  declined: number;
  checkedIn: number;
  totalTables: number;
  totalMedia: number;
}

/**
 * Engine event — emitted after a domain operation.
 * Future Analytics/Automation engines will subscribe to these events.
 */
export type EngineEvent =
  | { type: 'wedding.created'; weddingId: string; slug: string }
  | { type: 'wedding.published'; weddingId: string }
  | { type: 'wedding.suspended'; weddingId: string; reason?: string }
  | { type: 'guest.added'; weddingId: string; guestId: string }
  | { type: 'guest.checkedIn'; weddingId: string; guestId: string }
  | { type: 'guest.rsvp'; weddingId: string; guestId: string; status: string };

/**
 * Event subscriber — engines can register to receive domain events.
 * This is the foundation for the future Automation Engine.
 */
export type EventSubscriber = (event: EngineEvent) => void | Promise<void>;
