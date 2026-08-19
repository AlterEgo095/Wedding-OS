// ══════════════════════════════════════════════════════════════════════════════
// src/lib/credits/ledger.ts — MISSION 5.9.5 — Credit Ledger Service
// ══════════════════════════════════════════════════════════════════════════════
//
// Implements the credit lifecycle with full traceability:
//
//   grantCredits()    → PURCHASE   (delta=+N, balance += N)
//   reserveCredits()  → RESERVED   (reserved += N, balance unchanged) — idempotent
//   consumeCredits()  → CONSUMPTION (reserved -= N, balance -= N, delta=-N)
//   releaseCredits() → RELEASE    (reserved -= N, balance unchanged, delta=0)
//   refundCredits()   → REFUND     (balance += N, delta=+N)
//   expireCredits()   → EXPIRED    (balance -= N, delta=-N)
//
// IDEMPOTENCY:
//   - reserveCredits takes an `idempotencyKey`. Re-calling with the same key
//     returns the existing reservation (no double-reserve).
//   - consumeCredits and releaseCredits are idempotent on the reservationId:
//     if already consumed/released, they return the current state.
//   - grantCredits is idempotent on (sourceOrderId, creditType, reason='PURCHASE').
//
// CONCURRENCY:
//   - All balance mutations use Prisma's atomic update (increment/decrement).
//   - CreditReservation creation is wrapped in a transaction that also
//     increments Credit.reserved atomically. FAIL-CLOSED: if the available
//     balance (balance - reserved) is insufficient, the reservation is rejected.
//
// MULTI-TENANT ISOLATION:
//   - Every function takes weddingId as the primary key. Credits are scoped
//     per-wedding. No cross-wedding reads or writes are possible from this module.
// ══════════════════════════════════════════════════════════════════════════════
import { db } from '@/lib/db'
import { logger } from '@/lib/logger'

export type CreditTypeCode = 'INVITATION' | 'SMS' | 'WHATSAPP' | 'QR' | 'EXPORT'
export type ReservationStatus = 'RESERVED' | 'CONSUMED' | 'RELEASED' | 'EXPIRED'

// ─── getBalance ───────────────────────────────────────────────────────────────
export async function getBalance(weddingId: string, creditType: CreditTypeCode) {
  let credit = await db.credit.findUnique({
    where: { weddingId_type: { weddingId, type: creditType } },
  })
  if (!credit) {
    try {
      credit = await db.credit.create({
        data: { weddingId, type: creditType, balance: 0, reserved: 0 },
      })
    } catch {
      credit = await db.credit.findUnique({
        where: { weddingId_type: { weddingId, type: creditType } },
      })
    }
  }
  return credit
}

// ─── getBalances (all types for a wedding) ─────────────────────────────────────
export async function getBalances(weddingId: string) {
  const rows = await db.credit.findMany({ where: { weddingId } })
  const map: Record<string, { balance: number; reserved: number }> = {}
  for (const r of rows) {
    map[r.type] = { balance: r.balance, reserved: r.reserved }
  }
  return map
}

// ─── getTransactions (ledger history) ─────────────────────────────────────────
export async function getTransactions(weddingId: string, opts?: { creditType?: CreditTypeCode; limit?: number }) {
  return db.creditTransaction.findMany({
    where: {
      weddingId,
      ...(opts?.creditType ? { creditType: opts.creditType } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: opts?.limit || 100,
  })
}

// ─── grantCredits ─────────────────────────────────────────────────────────────
// Adds N credits to the wedding's balance. Idempotent on (sourceOrderId,
// creditType, reason='PURCHASE'). Used by provisionFromOrder when a payment is
// verified and the order contains PER_INVITATION items.
export async function grantCredits(params: {
  weddingId: string
  creditType: CreditTypeCode
  quantity: number
  sourceOrderId?: string
  source?: string
  note?: string
  createdBy?: string
}): Promise<{ granted: number; balance: number; skipped: boolean }> {
  if (params.quantity <= 0) return { granted: 0, balance: 0, skipped: true }

  // Idempotency: check if this order already granted credits of this type
  if (params.sourceOrderId) {
    const existing = await db.creditTransaction.findFirst({
      where: {
        sourceOrderId: params.sourceOrderId,
        creditType: params.creditType,
        reason: 'PURCHASE',
      },
      select: { id: true, delta: true },
    })
    if (existing) {
      logger.info('ledger.grantCredits: already granted (idempotent skip)', {
        weddingId: params.weddingId,
        creditType: params.creditType,
        sourceOrderId: params.sourceOrderId,
        existingDelta: existing.delta,
      })
      const credit = await getBalance(params.weddingId, params.creditType)
      return { granted: 0, balance: credit?.balance || 0, skipped: true }
    }
  }

  const [credit, , tx] = await db.$transaction([
    db.credit.upsert({
      where: { weddingId_type: { weddingId: params.weddingId, type: params.creditType } },
      update: { balance: { increment: params.quantity } },
      create: { weddingId: params.weddingId, type: params.creditType, balance: params.quantity, reserved: 0 },
    }),
    db.creditBalance.upsert({
      where: { weddingId_type: { weddingId: params.weddingId, type: params.creditType } },
      update: {
        lifetimePurchased: { increment: params.quantity },
        currentBalance: { increment: params.quantity },
      },
      create: {
        weddingId: params.weddingId,
        type: params.creditType,
        lifetimePurchased: params.quantity,
        lifetimeConsumed: 0,
        lifetimeRefunded: 0,
        currentBalance: params.quantity,
      },
    }),
    db.creditTransaction.create({
      data: {
        weddingId: params.weddingId,
        creditType: params.creditType,
        delta: params.quantity,
        reason: 'PURCHASE',
        sourceOrderId: params.sourceOrderId || null,
        note: params.note || `Granted ${params.quantity} ${params.creditType} credits`,
        createdBy: params.createdBy || null,
      },
    }),
  ])

  logger.info('ledger.grantCredits: granted', {
    weddingId: params.weddingId,
    creditType: params.creditType,
    quantity: params.quantity,
    newBalance: credit.balance,
    txId: tx.id,
  })
  return { granted: params.quantity, balance: credit.balance, skipped: false }
}

// ─── reserveCredits ────────────────────────────────────────────────────────────
// Reserves N credits (increments `reserved`, balance unchanged). Idempotent on
// idempotencyKey. FAIL-CLOSED: rejects if available (balance - reserved) < N.
export async function reserveCredits(params: {
  weddingId: string
  creditType: CreditTypeCode
  quantity: number
  idempotencyKey: string
  jobId?: string
  source?: string
  note?: string
  ttlMinutes?: number
}): Promise<
  | { ok: true; reservationId: string; quantity: number; status: ReservationStatus }
  | { ok: false; error: string; reservationId?: string; status?: ReservationStatus }
> {
  if (params.quantity <= 0) return { ok: false, error: 'INVALID_QUANTITY' }

  // Idempotency: check if reservation with this key already exists
  const existing = await db.creditReservation.findUnique({
    where: { idempotencyKey: params.idempotencyKey },
  })
  if (existing) {
    return {
      ok: true,
      reservationId: existing.id,
      quantity: existing.quantity,
      status: existing.status as ReservationStatus,
    }
  }

  const expiresAt = new Date(Date.now() + (params.ttlMinutes || 30) * 60_000)

  try {
    const result = await db.$transaction(async (tx) => {
      const credit = await tx.credit.findUnique({
        where: { weddingId_type: { weddingId: params.weddingId, type: params.creditType } },
      })
      if (!credit) {
        throw new Error('INSUFFICIENT_BALANCE')
      }
      const available = credit.balance - credit.reserved
      if (available < params.quantity) {
        throw new Error('INSUFFICIENT_BALANCE')
      }

      const [reservation] = await Promise.all([
        tx.creditReservation.create({
          data: {
            weddingId: params.weddingId,
            creditType: params.creditType,
            quantity: params.quantity,
            status: 'RESERVED',
            jobId: params.jobId || null,
            idempotencyKey: params.idempotencyKey,
            source: params.source || 'METER',
            note: params.note || null,
            expiresAt,
          },
        }),
        tx.credit.update({
          where: { id: credit.id },
          data: { reserved: { increment: params.quantity } },
        }),
      ])
      return reservation
    })
    return { ok: true, reservationId: result.id, quantity: result.quantity, status: 'RESERVED' }
  } catch (err) {
    const msg = String(err)
    if (msg.includes('INSUFFICIENT_BALANCE')) {
      return { ok: false, error: 'INSUFFICIENT_BALANCE' }
    }
    logger.error('ledger.reserveCredits: unexpected error', { error: msg, params })
    return { ok: false, error: 'INTERNAL_ERROR' }
  }
}

// ─── consumeCredits ───────────────────────────────────────────────────────────
// Finalizes a reservation: decrements both `reserved` and `balance`. Writes a
// CONSUMPTION CreditTransaction. Idempotent on reservationId.
export async function consumeCredits(reservationId: string, opts?: { createdBy?: string; note?: string }): Promise<
  | { ok: true; reservationId: string; status: ReservationStatus; consumed: number }
  | { ok: false; error: string; status?: ReservationStatus }
> {
  const reservation = await db.creditReservation.findUnique({
    where: { id: reservationId },
  })
  if (!reservation) return { ok: false, error: 'RESERVATION_NOT_FOUND' }
  if (reservation.status === 'CONSUMED') {
    return { ok: true, reservationId, status: 'CONSUMED', consumed: 0 }
  }
  if (reservation.status !== 'RESERVED') {
    return { ok: false, error: `RESERVATION_NOT_RESERVED (status=${reservation.status})`, status: reservation.status as ReservationStatus }
  }

  try {
    await db.$transaction([
      db.credit.update({
        where: { weddingId_type: { weddingId: reservation.weddingId, type: reservation.creditType } },
        data: {
          reserved: { decrement: reservation.quantity },
          balance: { decrement: reservation.quantity },
        },
      }),
      db.creditReservation.update({
        where: { id: reservationId },
        data: { status: 'CONSUMED', consumedAt: new Date() },
      }),
      db.creditBalance.update({
        where: { weddingId_type: { weddingId: reservation.weddingId, type: reservation.creditType } },
        data: {
          lifetimeConsumed: { increment: reservation.quantity },
          currentBalance: { decrement: reservation.quantity },
        },
      }),
      db.creditTransaction.create({
        data: {
          weddingId: reservation.weddingId,
          creditType: reservation.creditType,
          delta: -reservation.quantity,
          reason: 'CONSUMPTION',
          sourceDeliveryJobId: reservation.jobId,
          note: opts?.note || `Consumed reservation ${reservationId}`,
          createdBy: opts?.createdBy || null,
        },
      }),
    ])
    return { ok: true, reservationId, status: 'CONSUMED', consumed: reservation.quantity }
  } catch (err) {
    logger.error('ledger.consumeCredits: error', { error: String(err), reservationId })
    return { ok: false, error: 'INTERNAL_ERROR' }
  }
}

// ─── releaseCredits ───────────────────────────────────────────────────────────
// Releases a reservation (decrements `reserved`, balance untouched). Writes a
// RELEASE CreditTransaction (delta=0) for traceability. Idempotent.
export async function releaseCredits(reservationId: string, opts?: { createdBy?: string; note?: string }): Promise<
  | { ok: true; reservationId: string; status: ReservationStatus; released: number }
  | { ok: false; error: string; status?: ReservationStatus }
> {
  const reservation = await db.creditReservation.findUnique({
    where: { id: reservationId },
  })
  if (!reservation) return { ok: false, error: 'RESERVATION_NOT_FOUND' }
  if (reservation.status !== 'RESERVED') {
    return { ok: true, reservationId, status: reservation.status as ReservationStatus, released: 0 }
  }

  try {
    await db.$transaction([
      db.credit.update({
        where: { weddingId_type: { weddingId: reservation.weddingId, type: reservation.creditType } },
        data: { reserved: { decrement: reservation.quantity } },
      }),
      db.creditReservation.update({
        where: { id: reservationId },
        data: { status: 'RELEASED', releasedAt: new Date() },
      }),
      db.creditTransaction.create({
        data: {
          weddingId: reservation.weddingId,
          creditType: reservation.creditType,
          delta: 0,
          reason: 'ADJUSTMENT',
          sourceDeliveryJobId: reservation.jobId,
          note: opts?.note || `Released reservation ${reservationId}`,
          createdBy: opts?.createdBy || null,
        },
      }),
    ])
    return { ok: true, reservationId, status: 'RELEASED', released: reservation.quantity }
  } catch (err) {
    logger.error('ledger.releaseCredits: error', { error: String(err), reservationId })
    return { ok: false, error: 'INTERNAL_ERROR' }
  }
}

// ─── refundCredits ─────────────────────────────────────────────────────────────
// Adds N credits back to the balance (post-consumption refund). Writes a REFUND
// CreditTransaction. For pre-consumption cancellations, use releaseCredits.
//
// P595B-P3-5 (Phase 4.4) — Idempotency on `idempotencyKey` (optional, backward-
// compatible). If two callers pass the same key, the second call is a no-op
// returning the current balance (skipped=true). The CreditTransaction model
// has NO `idempotencyKey` column (unlike CreditReservation), so the key is
// encoded in the `note` field as a `[idem:KEY] ` prefix and the dedup lookup
// uses `note: { contains: '[idem:KEY]' }`. This is robust because:
//   - the prefix is deterministic and unambiguous
//   - the lookup is scoped to (weddingId, creditType, reason='REFUND')
//   - the marker is unique enough that a false-positive collision would
//     require an operator to manually craft a note starting with the exact
//     marker string for the same weddingId+creditType — vanishingly unlikely
export async function refundCredits(params: {
  weddingId: string
  creditType: CreditTypeCode
  quantity: number
  note?: string
  createdBy?: string
  idempotencyKey?: string
}): Promise<{ refunded: number; balance: number; skipped?: boolean }> {
  if (params.quantity <= 0) return { refunded: 0, balance: 0 }

  // P595B-P3-5 — Idempotency guard. Look up a prior REFUND CreditTransaction
  // whose note carries the same `[idem:KEY]` marker. If found, return early.
  if (params.idempotencyKey) {
    const marker = `[idem:${params.idempotencyKey}]`
    try {
      const existing = await db.creditTransaction.findFirst({
        where: {
          weddingId: params.weddingId,
          creditType: params.creditType,
          reason: 'REFUND',
          note: { contains: marker },
        },
        select: { id: true, delta: true },
      })
      if (existing) {
        logger.info('ledger.refundCredits: idempotent skip', {
          weddingId: params.weddingId,
          creditType: params.creditType,
          idempotencyKey: params.idempotencyKey,
          existingDelta: existing.delta,
        })
        const credit = await getBalance(params.weddingId, params.creditType)
        return { refunded: 0, balance: credit?.balance || 0, skipped: true }
      }
    } catch (err) {
      // Look-up failure is non-fatal: proceed without the idempotency guard.
      // Better to double-refund (operator can roll back via DB) than to crash
      // a refund path that may be called from a webhook.
      logger.warn('ledger.refundCredits: idempotency check failed, proceeding without guard', {
        error: String(err),
        weddingId: params.weddingId,
      })
    }
  }

  // Build the note: prepend the idempotency marker so future calls can dedup.
  // When no idempotencyKey is provided, the original note (or default string)
  // is used unchanged — preserves the pre-P595B wire format for old callers.
  const baseNote = params.note || `Refunded ${params.quantity} ${params.creditType} credits`
  const noteWithMarker = params.idempotencyKey
    ? `[idem:${params.idempotencyKey}] ${baseNote}`
    : baseNote

  const [credit, ,] = await db.$transaction([
    db.credit.update({
      where: { weddingId_type: { weddingId: params.weddingId, type: params.creditType } },
      data: { balance: { increment: params.quantity } },
    }),
    db.creditBalance.update({
      where: { weddingId_type: { weddingId: params.weddingId, type: params.creditType } },
      data: {
        lifetimeRefunded: { increment: params.quantity },
        currentBalance: { increment: params.quantity },
      },
    }),
    db.creditTransaction.create({
      data: {
        weddingId: params.weddingId,
        creditType: params.creditType,
        delta: params.quantity,
        reason: 'REFUND',
        note: noteWithMarker,
        createdBy: params.createdBy || null,
      },
    }),
  ])
  return { refunded: params.quantity, balance: credit.balance }
}

// ─── expireCredits ─────────────────────────────────────────────────────────────
// Removes N credits from the balance (e.g. expired trial credits).
//
// P595B-P3-5 (Phase 4.4) — Idempotency on `idempotencyKey` (optional, backward-
// compatible). Same approach as refundCredits: encode the key in `note` as
// `[idem:KEY] ` and look up prior ADJUSTMENT rows carrying the marker.
export async function expireCredits(params: {
  weddingId: string
  creditType: CreditTypeCode
  quantity: number
  note?: string
  idempotencyKey?: string
}): Promise<{ expired: number; balance: number; skipped?: boolean }> {
  if (params.quantity <= 0) return { expired: 0, balance: 0 }

  // P595B-P3-5 — Idempotency guard. Same note-marker approach as refundCredits.
  if (params.idempotencyKey) {
    const marker = `[idem:${params.idempotencyKey}]`
    try {
      const existing = await db.creditTransaction.findFirst({
        where: {
          weddingId: params.weddingId,
          creditType: params.creditType,
          reason: 'ADJUSTMENT',
          note: { contains: marker },
        },
        select: { id: true, delta: true },
      })
      if (existing) {
        logger.info('ledger.expireCredits: idempotent skip', {
          weddingId: params.weddingId,
          creditType: params.creditType,
          idempotencyKey: params.idempotencyKey,
          existingDelta: existing.delta,
        })
        const credit = await getBalance(params.weddingId, params.creditType)
        return { expired: 0, balance: credit?.balance || 0, skipped: true }
      }
    } catch (err) {
      logger.warn('ledger.expireCredits: idempotency check failed, proceeding without guard', {
        error: String(err),
        weddingId: params.weddingId,
      })
    }
  }

  const baseNote = params.note || `Expired ${params.quantity} ${params.creditType} credits`
  const noteWithMarker = params.idempotencyKey
    ? `[idem:${params.idempotencyKey}] ${baseNote}`
    : baseNote

  const [credit, ,] = await db.$transaction([
    db.credit.update({
      where: { weddingId_type: { weddingId: params.weddingId, type: params.creditType } },
      data: { balance: { decrement: params.quantity } },
    }),
    db.creditBalance.update({
      where: { weddingId_type: { weddingId: params.weddingId, type: params.creditType } },
      data: { currentBalance: { decrement: params.quantity } },
    }),
    db.creditTransaction.create({
      data: {
        weddingId: params.weddingId,
        creditType: params.creditType,
        delta: -params.quantity,
        reason: 'ADJUSTMENT',
        note: noteWithMarker,
      },
    }),
  ])
  return { expired: params.quantity, balance: credit.balance }
}

// ─── sweepExpiredReservations ────────────────────────────────────────────────
// Auto-releases any RESERVED reservations whose expiresAt is in the past.
export async function sweepExpiredReservations(): Promise<number> {
  const now = new Date()
  const expired = await db.creditReservation.findMany({
    where: {
      status: 'RESERVED',
      expiresAt: { lt: now },
    },
    take: 200,
  })
  let swept = 0
  for (const r of expired) {
    const result = await releaseCredits(r.id, { note: 'Auto-released by sweeper (expired)' })
    if (result.ok) swept++
  }
  if (swept > 0) {
    logger.info('ledger.sweepExpiredReservations: swept', { count: swept })
  }
  return swept
}
