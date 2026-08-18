// ══════════════════════════════════════════════════════════════════════════════
// src/lib/pricing-engine.ts — MISSION 5.9.5-A — Commercial Pricing Engine (LOCKED)
// ══════════════════════════════════════════════════════════════════════════════
//
// Tiered invitation pricing + customer-type pricing + DB-driven config.
//
// ══════════════════════════════════════════════════════════════════════════════
// PRICING RULES (VERROU COMMERCIAL — Mission 5.9.5-A, APPROVED Option A)
// ══════════════════════════════════════════════════════════════════════════════
//
// STANDARD (B2C couples) — FLAT_TIER SWITCH (NOT marginal tiering):
//   quantity <= 250  → unitPrice = 70 cents,  total = quantity × 70
//   quantity >= 251  → unitPrice = 50 cents,  total = quantity × 50
//
//   The 250→251 threshold is a HARD SWITCH. The entire quantity is billed at
//   the single tier's unit price. NOT "250 × 70 + surplus × 50".
//
//   Contractual examples (OFFICIAL COMMERCIAL REFERENCES):
//     250  → $175.00     (250 × 70 = 17500 cents)
//     251  → $125.50     (251 × 50 = 12550 cents)  ← inflection point
//     300  → $150.00     (300 × 50 = 15000 cents)
//     500  → $250.00     (500 × 50 = 25000 cents)
//     1000 → $500.00     (1000 × 50 = 50000 cents)
//     5000 → $2500.00    (5000 × 50 = 250000 cents)
//
// AGENCY / RESELLER / WEDDING_PLANNER — FLAT (unchanged):
//   any quantity → unitPrice = 50 cents,  total = quantity × 50
//
// ══════════════════════════════════════════════════════════════════════════════
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
export type PricingModelCode = 'FLAT' | 'TIERED' | 'FLAT_TIER'

export interface PricingTier {
  upTo: number | null // null = "and above" (the last tier must have upTo=null)
  priceCents: number // per-unit price in this tier (marginal for TIERED, selected for FLAT_TIER)
}

export interface PricingConfigRow {
  code: string
  name: string
  customerType: string
  creditType: string
  pricingModel: string // FLAT | TIERED | FLAT_TIER
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

// ─── Loaded rule (tiers + pricingModel) ───────────────────────────────────────
// A rule is the combination of the tier list AND the pricingModel that
// determines how to apply those tiers (FLAT / TIERED / FLAT_TIER).
export interface LoadedRule {
  tiers: PricingTier[]
  pricingModel: PricingModelCode
}

// ─── Default config (fallback when DB is unreachable or unseeded) ──────────────
// Mirrors the spec exactly: FLAT_TIER for STANDARD (≤250 @ 70, >250 @ 50);
// FLAT $0.50 for AGENCY/RESELLER/WEDDING_PLANNER. These match the seeded
// values in /api/admin/pricing/seed — they're here as a safety net only.
const DEFAULT_TIERED_STANDARD: PricingTier[] = [
  { upTo: 250, priceCents: 70 }, // $0.70 for qty ≤ 250
  { upTo: null, priceCents: 50 }, // $0.50 for qty > 250
]

const DEFAULT_FLAT_RESELLER: PricingTier[] = [{ upTo: null, priceCents: 50 }]

const DEFAULT_CONFIG: Record<string, LoadedRule> = {
  'STANDARD|INVITATION':        { tiers: DEFAULT_TIERED_STANDARD, pricingModel: 'FLAT_TIER' },
  'AGENCY|INVITATION':          { tiers: DEFAULT_FLAT_RESELLER,   pricingModel: 'FLAT' },
  'RESELLER|INVITATION':       { tiers: DEFAULT_FLAT_RESELLER,   pricingModel: 'FLAT' },
  'WEDDING_PLANNER|INVITATION': { tiers: DEFAULT_FLAT_RESELLER,   pricingModel: 'FLAT' },
}

// ─── In-memory cache (60s TTL) ────────────────────────────────────────────────
// Avoids a DB query on every invitation generation. Invalidated on PUT
// /api/admin/pricing via the invalidateCache() export.
interface CacheEntry {
  rows: Map<string, LoadedRule> // key: `${customerType}|${creditType}`
  expiresAt: number
}
let _cache: CacheEntry | null = null
const CACHE_TTL_MS = 60_000 // 60 seconds

export function invalidatePricingCache(): void {
  _cache = null
}

// ─── Config loader ────────────────────────────────────────────────────────────
async function loadActiveConfig(): Promise<Map<string, LoadedRule>> {
  if (_cache && _cache.expiresAt > Date.now()) {
    return _cache.rows
  }

  const rows: Map<string, LoadedRule> = new Map()
  try {
    const dbRows = await db.pricingConfig.findMany({
      where: { status: 'ACTIVE' },
    })
    for (const r of dbRows) {
      const tiers = parseTiers(r)
      if (tiers.length > 0) {
        rows.set(`${r.customerType}|${r.creditType}`, {
          tiers,
          pricingModel: (r.pricingModel as PricingModelCode) || 'FLAT',
        })
      }
    }
  } catch (err) {
    logger.error('pricing-engine: DB load failed, using defaults', { error: String(err) })
  }

  // Merge defaults for any (customerType, creditType) not in DB
  for (const [key, rule] of Object.entries(DEFAULT_CONFIG)) {
    if (!rows.has(key)) rows.set(key, rule)
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

// ─── Marginal tiered computation (LEGACY — each tier applies to its slice) ───
// Used when pricingModel === 'TIERED'. NOT used for INVITATION_STANDARD
// (which is now FLAT_TIER per Mission 5.9.5-A). Kept for potential future
// use cases that genuinely need marginal tiering (e.g., bulk SMS).
//
// Example (TIERED, 300 invitations, tiers=[{upTo:250,70},{upTo:null,50}]):
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

// ─── FLAT_TIER computation (VERROU COMMERCIAL 5.9.5-A) ────────────────────────
// Selects ONE tier based on the quantity, then applies its priceCents to the
// ENTIRE quantity. This is a HARD SWITCH at the threshold, NOT marginal.
//
// Selection rule:
//   - Find the first tier where (upTo === null) OR (quantity <= upTo)
//   - If none matches (shouldn't happen if tiersJson ends with upTo:null),
//     fall back to the last tier.
//
// Examples (FLAT_TIER, tiers=[{upTo:250,70},{upTo:null,50}]):
//   qty=200: tier 0 matches (200 ≤ 250) → 200 × 70 = 14000 cents = $140.00
//   qty=250: tier 0 matches (250 ≤ 250) → 250 × 70 = 17500 cents = $175.00
//   qty=251: tier 0 doesn't match (251 > 250); tier 1 matches (upTo=null) → 251 × 50 = 12550 cents = $125.50
//   qty=500: tier 1 matches → 500 × 50 = 25000 cents = $250.00
//   qty=1000: tier 1 matches → 1000 × 50 = 50000 cents = $500.00
function computeFlatTier(quantity: number, tiers: PricingTier[]): PriceQuote['breakdown'] {
  let selectedTier: PricingTier | null = null
  let selectedIdx = 0
  for (let i = 0; i < tiers.length; i++) {
    const t = tiers[i]
    if (t.upTo === null || quantity <= t.upTo) {
      selectedTier = t
      selectedIdx = i
      break
    }
  }
  if (!selectedTier) {
    // Fallback: last tier (defensive — tiersJson should always end with upTo:null)
    selectedTier = tiers[tiers.length - 1]
    selectedIdx = tiers.length - 1
  }
  return [{
    tierIndex: selectedIdx,
    fromQty: 0,
    toQty: selectedTier.upTo,
    unitPriceCents: selectedTier.priceCents,
    lineTotalCents: quantity * selectedTier.priceCents,
  }]
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
  const rule: LoadedRule = config.get(`${customerType}|${creditType}`)
    || DEFAULT_CONFIG[`${customerType}|${creditType}`]
    || { tiers: DEFAULT_TIERED_STANDARD, pricingModel: 'FLAT_TIER' }
  const tiers = rule.tiers
  const pricingModel = rule.pricingModel

  // Branch on pricingModel:
  //   FLAT_TIER → computeFlatTier (select one tier, apply to entire quantity)
  //   TIERED    → computeTiered  (marginal — each tier applies to its slice)
  //   FLAT      → computeTiered with a single-tier config (equivalent to flat)
  let breakdown: PriceQuote['breakdown']
  if (pricingModel === 'FLAT_TIER') {
    breakdown = computeFlatTier(quantity, tiers)
  } else {
    // TIERED or FLAT → computeTiered (FLAT is just single-tier marginal = same as flat)
    breakdown = computeTiered(quantity, tiers)
  }

  const totalCents = breakdown.reduce((sum, b) => sum + b.lineTotalCents, 0)
  const unitPriceCents = quantity > 0 ? Math.round(totalCents / quantity) : 0
  const isFlat = pricingModel === 'FLAT' || pricingModel === 'FLAT_TIER' || tiers.length === 1

  return {
    unitPriceCents,
    totalCents,
    currency: 'usd',
    pricingModel: isFlat ? (pricingModel === 'FLAT_TIER' ? 'FLAT_TIER' : 'FLAT') : 'TIERED',
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
//   INDIVIDUAL | COUPLE | BUSINESS  → STANDARD (FLAT_TIER per 5.9.5-A)
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
