// ══════════════════════════════════════════════════════════════════════════════
// src/lib/pricing-engine.ts — MISSION 5.9.5 — Commercial Pricing Engine
// ══════════════════════════════════════════════════════════════════════════════
//
// Tiered invitation pricing + customer-type pricing + DB-driven config.
//
// PRICING RULES (per Mission 5.9.5 spec):
//   STANDARD (B2C couples):
//     - TIERED: $0.70/inv for the first 250, $0.50/inv above 250 (marginal)
//   AGENCY / RESELLER / WEDDING_PLANNER:
//     - FLAT: $0.50/inv for any quantity
//
// NO-CODE ADMIN: all prices live in the PricingConfig table. The admin can
// edit them via /api/admin/pricing (PUT) without a rebuild. The engine
// caches the active config in-memory for 60s to avoid hitting the DB on every
// invitation generation.
//
// SERVER IS SINGLE SOURCE OF TRUTH: the browser NEVER sends a price. The
// checkout + meterInvitationUsage flows call computePrice() server-side.
//
// IDEMPOTENCY: computePrice is a pure function of (customerType, creditType,
// quantity, config). Same inputs → same output. No side effects.
// ══════════════════════════════════════════════════════════════════════════════
import { db } from '@/lib/db'
import { logger } from '@/lib/logger'

// ─── Types ────────────────────────────────────────────────────────────────────
export type CustomerTier = 'STANDARD' | 'AGENCY' | 'RESELLER' | 'WEDDING_PLANNER'
export type CreditTypeCode = 'INVITATION' | 'SMS' | 'WHATSAPP' | 'QR' | 'EXPORT'
export type PricingModelCode = 'FLAT' | 'TIERED'

export interface PricingTier {
  upTo: number | null // null = "and above" (the last tier must have upTo=null)
  priceCents: number // per-unit price in this tier (marginal)
}

export interface PricingConfigRow {
  code: string
  name: string
  customerType: string
  creditType: string
  pricingModel: string // FLAT | TIERED
  flatPriceCents: number
  tiersJson: string // JSON-encoded PricingTier[]
  currency: string
  status: string
}

export interface PriceQuote {
  unitPriceCents: number // weighted average unit price (total/quantity)
  totalCents: number
  currency: string
  pricingModel: string
  customerType: string
  creditType: string
  breakdown: Array<{ tierIndex: number; fromQty: number; toQty: number | null; unitPriceCents: number; lineTotalCents: number }>
  configCode: string
}

// ─── Default config (fallback when DB is unreachable or unseeded) ──────────────
// Mirrors the spec exactly: $0.70 ≤250, $0.50 >250 for STANDARD; flat $0.50
// for AGENCY/RESELLER/WEDDING_PLANNER. These match the seeded values in
// /api/admin/pricing/seed — they're here as a safety net only.
const DEFAULT_TIERED_STANDARD: PricingTier[] = [
  { upTo: 250, priceCents: 70 }, // $0.70 for first 250
  { upTo: null, priceCents: 50 }, // $0.50 above 250
]

const DEFAULT_FLAT_RESELLER: PricingTier[] = [{ upTo: null, priceCents: 50 }]

const DEFAULT_CONFIG: Record<string, PricingTier[]> = {
  'STANDARD|INVITATION': DEFAULT_TIERED_STANDARD,
  'AGENCY|INVITATION': DEFAULT_FLAT_RESELLER,
  'RESELLER|INVITATION': DEFAULT_FLAT_RESELLER,
  'WEDDING_PLANNER|INVITATION': DEFAULT_FLAT_RESELLER,
}

// ─── In-memory cache (60s TTL) ────────────────────────────────────────────────
// Avoids a DB query on every invitation generation. Invalidated on PUT
// /api/admin/pricing via the invalidateCache() export.
interface CacheEntry {
  rows: Map<string, PricingTier[]> // key: `${customerType}|${creditType}`
  expiresAt: number
}
let _cache: CacheEntry | null = null
const CACHE_TTL_MS = 60_000 // 60 seconds

export function invalidatePricingCache(): void {
  _cache = null
}

// ─── Config loader ────────────────────────────────────────────────────────────
async function loadActiveConfig(): Promise<Map<string, PricingTier[]>> {
  if (_cache && _cache.expiresAt > Date.now()) {
    return _cache.rows
  }

  const rows: Map<string, PricingTier[]> = new Map()
  try {
    const dbRows = await db.pricingConfig.findMany({
      where: { status: 'ACTIVE' },
    })
    for (const r of dbRows) {
      const tiers = parseTiers(r)
      if (tiers.length > 0) {
        rows.set(`${r.customerType}|${r.creditType}`, tiers)
      }
    }
  } catch (err) {
    logger.error('pricing-engine: DB load failed, using defaults', { error: String(err) })
  }

  // Merge defaults for any (customerType, creditType) not in DB
  for (const [key, tiers] of Object.entries(DEFAULT_CONFIG)) {
    if (!rows.has(key)) rows.set(key, tiers)
  }

  _cache = { rows, expiresAt: Date.now() + CACHE_TTL_MS }
  return rows
}

function parseTiers(row: { pricingModel: string; flatPriceCents: number; tiersJson: string }): PricingTier[] {
  if (row.pricingModel === 'FLAT') {
    return [{ upTo: null, priceCents: row.flatPriceCents }]
  }
  try {
    const parsed = JSON.parse(row.tiersJson || '[]') as PricingTier[]
    if (!Array.isArray(parsed) || parsed.length === 0) {
      // fall back to flat
      return [{ upTo: null, priceCents: row.flatPriceCents }]
    }
    return parsed
  } catch {
    return [{ upTo: null, priceCents: row.flatPriceCents }]
  }
}

// ─── Tiered computation (MARGINAL — each tier applies to the slice) ───────────
// Example (STANDARD, 300 invitations):
//   tier 0: upTo=250, price=70 → 250 × 70 = 17500 cents
//   tier 1: upTo=null, price=50 → 50 × 50 = 2500 cents  (only the 50 above 250)
//   total = 20000 cents = $200.00
//   unitPrice = 20000/300 = 66.67 cents/inv (weighted average)
function computeTiered(quantity: number, tiers: PricingTier[]): PriceQuote['breakdown'] {
  const breakdown: PriceQuote['breakdown'] = []
  let remaining = quantity
  let cursor = 0
  for (let i = 0; i < tiers.length && remaining > 0; i++) {
    const tier = tiers[i]
    const tierCapacity = tier.upTo === null ? Infinity : Math.max(0, tier.upTo - cursor)
    const taken = Math.min(remaining, tierCapacity)
    if (taken > 0) {
      breakdown.push({
        tierIndex: i,
        fromQty: cursor,
        toQty: tier.upTo,
        unitPriceCents: tier.priceCents,
        lineTotalCents: taken * tier.priceCents,
      })
      cursor += taken
      remaining -= taken
    }
  }
  return breakdown
}

// ─── Main entry: computePrice ─────────────────────────────────────────────────
export async function computePrice(params: {
  customerType?: CustomerTier
  creditType?: CreditTypeCode
  quantity: number
}): Promise<PriceQuote> {
  const customerType = (params.customerType || 'STANDARD') as CustomerTier
  const creditType = (params.creditType || 'INVITATION') as CreditTypeCode
  const quantity = Math.max(0, Math.floor(params.quantity))

  const config = await loadActiveConfig()
  const tiers = config.get(`${customerType}|${creditType}`) || DEFAULT_CONFIG[`${customerType}|${creditType}`] || DEFAULT_TIERED_STANDARD

  const breakdown = computeTiered(quantity, tiers)
  const totalCents = breakdown.reduce((sum, b) => sum + b.lineTotalCents, 0)
  const unitPriceCents = quantity > 0 ? Math.round(totalCents / quantity) : 0
  const isFlat = tiers.length === 1

  return {
    unitPriceCents,
    totalCents,
    currency: 'usd',
    pricingModel: isFlat ? 'FLAT' : 'TIERED',
    customerType,
    creditType,
    breakdown,
    configCode: `${creditType}_${customerType}`,
  }
}

// ─── Helper: resolve customer tier from Customer row ─────────────────────────
// Maps the Customer.type enum (INDIVIDUAL/COUPLE/BUSINESS/AGENCY/ORGANIZATION)
// to a pricing tier (STANDARD/AGENCY/RESELLER/WEDDING_PLANNER).
//
//   INDIVIDUAL | COUPLE | BUSINESS  → STANDARD (tiered)
//   AGENCY                       → AGENCY (flat $0.50)
//   ORGANIZATION                 → RESELLER (flat $0.50)
//
// A wedding_planner flag can be set on Customer.notes (e.g. "WEDDING_PLANNER=1")
// to opt into the WEDDING_PLANNER tier. This is a soft convention; the admin
// can also override the tier per-call via the API.
export function resolveCustomerTier(customer: { type: string; notes?: string | null } | null): CustomerTier {
  if (!customer) return 'STANDARD'
  if (customer.notes && customer.notes.includes('WEDDING_PLANNER=1')) return 'WEDDING_PLANNER'
  switch (customer.type) {
    case 'AGENCY': return 'AGENCY'
    case 'ORGANIZATION': return 'RESELLER'
    default: return 'STANDARD'
  }
}

// ─── Helper: resolve the active customer for a wedding ────────────────────────
// Returns the Customer row (or null) linked to the wedding, so the caller can
// resolve the tier without an extra DB round-trip in the hot path.
export async function getWeddingCustomer(weddingId: string) {
  const wedding = await db.wedding.findUnique({
    where: { id: weddingId },
    select: { id: true, customerId: true, slug: true, organizationId: true },
  })
  if (!wedding) return null
  if (wedding.customerId) {
    return db.customer.findUnique({ where: { id: wedding.customerId } })
  }
  return null
}

// ─── Health check ─────────────────────────────────────────────────────────────
export async function pricingEngineStatus(): Promise<{
  ok: boolean
  cacheValid: boolean
  rulesLoaded: number
  defaultsActive: boolean
}> {
  const config = await loadActiveConfig()
  return {
    ok: true,
    cacheValid: !!(_cache && _cache.expiresAt > Date.now()),
    rulesLoaded: config.size,
    defaultsActive: config.size <= Object.keys(DEFAULT_CONFIG).length,
  }
}
