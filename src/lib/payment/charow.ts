/**
 * Mission 5.9.4 — WAVE 2: CHAROW PAYMENT PROVIDER (REAL API INTEGRATION)
 *
 * Implements the PaymentProvider interface for Charow (https://chariow.com).
 *
 * ┌──────────────────────────────────────────────────────────────────────┐
 * │  SECURITY: credentials are read ONLY from process.env.              │
 * │  No key is ever hard-coded, logged, persisted to DB or sent to the  │
 * │  browser. The adapter reports only FOUND/MISSING/CONFIGURED for     │
 * │  credential presence — never the value.                              │
 * └──────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────┐
 * │  REAL API (production): https://api.chariow.com/v1                  │
 * │  - POST /checkout  → create a checkout session                      │
 * │  - GET  /sales/{id} → verify a sale                                 │
 * │  - GET  /sales?product_id=X → list recent sales (fallback)          │
 * │  - GET  /products → list products (admin sync)                      │
 * │                                                                      │
 * │  SANDBOX MODE: when CHAROW_API_KEY is absent OR                      │
 * │  CHAROW_MODE=sandbox, the adapter runs in a clearly-identified       │
 * │  MOCK mode. The mock simulates the full Charow lifecycle locally     │
 * │  so the commercial flow is fully exercisable without real money.     │
 * └──────────────────────────────────────────────────────────────────────┘
 *
 * The real API is product-based: each checkout requires a `product_id`
 * (created in the Charow dashboard). Wedding OS maps each Plan to a
 * Charow product via env vars (CHAROW_PRODUCT_<CODE>).
 */

import { createHmac } from 'crypto'
import type {
  PaymentProvider,
  CheckoutRequest,
  CheckoutResult,
  SaleVerification,
  NormalizedPaymentStatus,
} from './provider'

// ─── In-memory sandbox ledger (cleared on server restart) ────────────────────
interface SandboxSale {
  saleId: string
  reference: string
  amount: number
  currency: string
  description: string
  customerEmail: string
  customerName: string
  status: 'PENDING' | 'PAID' | 'CANCELLED' | 'FAILED'
  paidAt: string | null
  createdAt: string
  confirmations: number
}

const sandboxLedger = new Map<string, SandboxSale>()

/** Credential presence probe — reports FOUND / MISSING, never the value. */
export function charowCredentialStatus(): {
  apiKey: 'FOUND' | 'MISSING'
  merchantId: 'FOUND' | 'MISSING'
  webhookSecret: 'FOUND' | 'MISSING'
  mode: 'SANDBOX' | 'PRODUCTION'
} {
  const hasKey = !!process.env.CHAROW_API_KEY
  const hasMerchant = !!process.env.CHAROW_MERCHANT_ID
  const hasWebhookSecret = !!process.env.CHAROW_WEBHOOK_SECRET
  const forceSandbox = process.env.CHAROW_MODE === 'sandbox'
  const mode: 'SANDBOX' | 'PRODUCTION' =
    hasKey && !forceSandbox ? 'PRODUCTION' : 'SANDBOX'
  return {
    apiKey: hasKey ? 'FOUND' : 'MISSING',
    merchantId: hasMerchant ? 'FOUND' : 'MISSING',
    webhookSecret: hasWebhookSecret ? 'FOUND' : 'MISSING',
    mode,
  }
}

function baseUrl(): string {
  // Real Charow API — https://api.chariow.com/v1
  return process.env.CHAROW_API_BASE_URL ?? 'https://api.chariow.com/v1'
}

function apiKey(): string {
  return process.env.CHAROW_API_KEY ?? ''
}

/** Generate a deterministic-looking sale id for the sandbox. */
function newSaleId(): string {
  return `chr_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
}

/**
 * In SANDBOX mode, simulate a server-to-server callback that the customer
 * has paid. In PRODUCTION mode this is a no-op (Charow sends real webhooks).
 */
export function sandboxConfirmPayment(saleId: string): boolean {
  const sale = sandboxLedger.get(saleId)
  if (!sale) return false
  if (sale.status === 'PAID') return false // already paid — idempotent
  sale.status = 'PAID'
  sale.paidAt = new Date().toISOString()
  sale.confirmations += 1
  return true
}

// ─── Real Charow API response types ──────────────────────────────────────────
interface CharowCheckoutResponse {
  data?: {
    payment?: {
      checkout_url?: string
      transaction_id?: string
      status?: string
    }
    purchase?: {
      id?: string
      status?: string
    }
  }
  message?: string
}

interface CharowSaleResponse {
  data?: {
    id?: string
    status?: string // completed | awaiting_payment | failed | cancelled
    reference?: string
    created_at?: string
    paid_at?: string
    payment?: {
      status?: string // completed | succeeded | initiated | pending | failed | cancelled
      transaction_id?: string
    }
    amount?: {
      amount?: number
      formatted?: string
      currency?: string
    }
    customer?: {
      email?: string
      first_name?: string
      last_name?: string
    }
  }
  message?: string
}

interface CharowSalesListResponse {
  data?: CharowSaleResponse['data'][]
  message?: string
}

export class CharowProvider implements PaymentProvider {
  readonly code = 'CHAROW' as const
  readonly mode: 'SANDBOX' | 'PRODUCTION'

  constructor() {
    this.mode = charowCredentialStatus().mode
  }

  async createCheckout(req: CheckoutRequest): Promise<CheckoutResult> {
    if (this.mode === 'PRODUCTION') {
      // If no product ID is configured for this plan, fall back to sandbox
      // so the flow remains exercisable. Real checkout activates automatically
      // once CHAROW_PRODUCT_<CODE> env vars are set.
      if (!req.productId) {
        console.warn('[charow] No productId configured — falling back to sandbox checkout for reference:', req.reference)
        return this.createCheckoutSandbox(req)
      }
      return this.createCheckoutProduction(req)
    }
    return this.createCheckoutSandbox(req)
  }

  /**
   * PRODUCTION path — real fetch to Charow API.
   * POST https://api.chariow.com/v1/checkout
   */
  private async createCheckoutProduction(req: CheckoutRequest): Promise<CheckoutResult> {
    if (!req.productId) {
      throw new Error(
        'CHAROW_CHECKOUT_FAILED: productId is required in PRODUCTION mode. ' +
        'Set CHAROW_PRODUCT_<PLAN_CODE> env vars.'
      )
    }

    const key = apiKey()
    // Split customer name into first/last for the Charow API
    const nameParts = (req.customerName || 'Client').trim().split(/\s+/)
    const firstName = nameParts[0] || 'Client'
    const lastName = nameParts.slice(1).join(' ') || 'WeddingOS'
    const phoneDigits = (req.customerPhone || '').replace(/[^0-9]/g, '')

    const body: Record<string, unknown> = {
      product_id: req.productId,
      email: req.customerEmail || 'customer@wedding-os.local',
      first_name: firstName,
      last_name: lastName,
      redirect_url: req.successUrl,
      custom_metadata: {
        reference: req.reference,
        source: 'wedding-os',
        description: req.description,
        amount: req.amount,
        currency: req.currency,
      },
    }

    // Charow requires a phone number — only include if we have one
    if (phoneDigits) {
      body.phone = {
        number: phoneDigits,
        country_code: req.customerCountryCode || 'CD',
      }
    }

    const res = await fetch(`${baseUrl()}/checkout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    })

    const data = (await res.json().catch(() => ({}))) as CharowCheckoutResponse

    if (!res.ok || !data.data?.payment?.checkout_url) {
      // If the product type is unsupported (422), we get a message
      throw new Error(
        `CHAROW_CHECKOUT_FAILED: ${res.status} — ${data.message || 'No checkout URL returned'}`
      )
    }

    const saleId = data.data.purchase?.id || data.data.payment?.transaction_id || ''
    const checkoutUrl = data.data.payment.checkout_url

    return {
      saleId,
      checkoutUrl,
      amount: req.amount, // server-side truth (not from provider)
      currency: req.currency,
      raw: {
        sale_id: saleId,
        transaction_id: data.data.payment?.transaction_id,
        status: data.data.payment?.status,
      },
    }
  }

  private async createCheckoutSandbox(req: CheckoutRequest): Promise<CheckoutResult> {
    const saleId = newSaleId()
    const sale: SandboxSale = {
      saleId,
      reference: req.reference,
      amount: req.amount,
      currency: req.currency,
      description: req.description,
      customerEmail: req.customerEmail,
      customerName: req.customerName,
      status: 'PENDING',
      paidAt: null,
      createdAt: new Date().toISOString(),
      confirmations: 0,
    }
    sandboxLedger.set(saleId, sale)
    // The "checkout URL" in sandbox is an internal marker route the frontend
    // recognizes and shows a simulated Charow payment page for.
    const checkoutUrl = `/charow/pay?sale=${saleId}&ref=${encodeURIComponent(req.reference)}`
    return {
      saleId,
      checkoutUrl,
      amount: req.amount,
      currency: req.currency,
      raw: { mode: 'SANDBOX', sale_id: saleId, amount: req.amount },
    }
  }

  async verifyPayment(saleId: string): Promise<SaleVerification> {
    if (this.mode === 'PRODUCTION') {
      return this.verifyProduction(saleId)
    }
    return this.verifySandbox(saleId)
  }

  /**
   * PRODUCTION path — real fetch to Charow API.
   * GET https://api.chariow.com/v1/sales/{saleId}
   */
  private async verifyProduction(saleId: string): Promise<SaleVerification> {
    const key = apiKey()
    const res = await fetch(`${baseUrl()}/sales/${encodeURIComponent(saleId)}`, {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(10000),
    })

    if (!res.ok) {
      // Sale not found or API error
      return {
        saleId,
        reference: null,
        status: 'UNKNOWN',
        amount: 0,
        currency: 'usd',
        paidAt: null,
        customerEmail: null,
        raw: { error: `HTTP_${res.status}`, sale_id: saleId },
      }
    }

    const json = (await res.json().catch(() => ({}))) as CharowSaleResponse
    const sale = json.data
    if (!sale) {
      return {
        saleId,
        reference: null,
        status: 'UNKNOWN',
        amount: 0,
        currency: 'usd',
        paidAt: null,
        customerEmail: null,
        raw: { error: 'NO_DATA', sale_id: saleId },
      }
    }

    // The sale status is the primary signal; payment.status is secondary
    const rawStatus = sale.status || sale.payment?.status || 'unknown'
    const status = this.normalizePaymentStatus(rawStatus)
    const amount = sale.amount?.amount ?? 0
    const currency = sale.amount?.currency?.toLowerCase() ?? 'usd'

    return {
      saleId: sale.id || saleId,
      reference: sale.reference ?? null,
      status,
      amount,
      currency,
      paidAt: sale.paid_at ?? (status === 'PAID' ? sale.created_at ?? null : null),
      customerEmail: sale.customer?.email ?? null,
      raw: {
        sale_id: sale.id,
        status: sale.status,
        payment_status: sale.payment?.status,
        amount: sale.amount,
      },
    }
  }

  private async verifySandbox(saleId: string): Promise<SaleVerification> {
    const sale = sandboxLedger.get(saleId)
    if (!sale) {
      return {
        saleId,
        reference: null,
        status: 'UNKNOWN',
        amount: 0,
        currency: 'usd',
        paidAt: null,
        customerEmail: null,
        raw: { mode: 'SANDBOX', error: 'SALE_NOT_FOUND' },
      }
    }
    return {
      saleId: sale.saleId,
      reference: sale.reference,
      status: sale.status === 'PAID' ? 'PAID' : sale.status === 'CANCELLED' ? 'CANCELLED' : sale.status === 'FAILED' ? 'FAILED' : 'PENDING',
      amount: sale.amount,
      currency: sale.currency,
      paidAt: sale.paidAt,
      customerEmail: sale.customerEmail,
      raw: { mode: 'SANDBOX', sale_id: sale.saleId, status: sale.status },
    }
  }

  async getSale(saleId: string): Promise<SaleVerification> {
    return this.verifyPayment(saleId)
  }

  /**
   * Fallback verification: search recent sales for a product.
   * Used when the direct sale lookup fails or the sale ID wasn't stored.
   * Returns the first completed sale within the last 30 minutes.
   */
  async findRecentSale(
    productId: string,
    windowMinutes = 30
  ): Promise<SaleVerification | null> {
    if (this.mode === 'SANDBOX') {
      // In sandbox, search the ledger for a matching PENDING/PAID sale
      for (const sale of sandboxLedger.values()) {
        if (sale.status === 'PAID') {
          const ageMin = (Date.now() - new Date(sale.createdAt).getTime()) / 60000
          if (ageMin <= windowMinutes) {
            return this.verifySandbox(sale.saleId)
          }
        }
      }
      return null
    }

    const key = apiKey()
    const res = await fetch(
      `${baseUrl()}/sales?per_page=10&product_id=${encodeURIComponent(productId)}`,
      { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(10000) }
    )
    if (!res.ok) return null

    const json = (await res.json().catch(() => ({}))) as CharowSalesListResponse
    const sales = json.data || []
    const cutoff = Date.now() - windowMinutes * 60 * 1000

    for (const sale of sales) {
      const saleDate = new Date(sale?.created_at || 0).getTime()
      const rawStatus = sale?.status || sale?.payment?.status || ''
      if (this.normalizePaymentStatus(rawStatus) === 'PAID' && saleDate > cutoff) {
        return this.verifyProduction(sale?.id || '')
      }
    }
    return null
  }

  /**
   * List Charow products (admin sync).
   * GET https://api.chariow.com/v1/products
   */
  async listProducts(): Promise<Array<{ id: string; name: string; type: string }>> {
    if (this.mode === 'SANDBOX') {
      return [
        { id: 'sandbox-trial', name: 'Trial (sandbox)', type: 'service' },
        { id: 'sandbox-essentiel', name: 'Essentiel (sandbox)', type: 'service' },
        { id: 'sandbox-premium', name: 'Premium (sandbox)', type: 'service' },
        { id: 'sandbox-elite', name: 'Elite (sandbox)', type: 'service' },
      ]
    }
    const key = apiKey()
    const res = await fetch(`${baseUrl()}/products?per_page=100`, {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(10000),
    })
    if (!res.ok) return []
    const json = (await res.json().catch(() => ({}))) as {
      data?: Array<{ id: string; name: string; type: string }>
    }
    return json.data || []
  }

  normalizePaymentStatus(rawStatus: string): NormalizedPaymentStatus {
    const s = rawStatus.toLowerCase()
    // Real Charow statuses: completed, awaiting_payment, failed, cancelled
    // Payment sub-statuses: completed, succeeded, initiated, pending, failed, cancelled
    if (s === 'paid' || s === 'success' || s === 'completed' || s === 'succeeded' || s === 'paid_out') return 'PAID'
    if (s === 'pending' || s === 'waiting' || s === 'awaiting_customer' || s === 'awaiting_payment' || s === 'initiated') return 'PENDING'
    if (s === 'processing' || s === 'in_progress') return 'PROCESSING'
    if (s === 'failed' || s === 'error') return 'FAILED'
    if (s === 'cancelled' || s === 'canceled') return 'CANCELLED'
    if (s === 'expired' || s === 'timeout') return 'EXPIRED'
    if (s === 'refunded' || s === 'reversed') return 'REFUNDED'
    return 'UNKNOWN'
  }

  /**
   * Verify the HMAC signature of an incoming webhook.
   * Returns true only if the signature matches.
   * In SANDBOX mode the signature is optional (the internal simulate
   * callback route is trusted), but the function is fully implemented for
   * production.
   */
  verifyWebhookSignature(payload: string, signature: string): boolean {
    if (this.mode === 'SANDBOX') return true
    const secret = process.env.CHAROW_WEBHOOK_SECRET
    if (!secret) return false
    const expected = createHmac('sha256', secret).update(payload).digest('hex')
    // constant-time-ish comparison
    if (expected.length !== signature.length) return false
    let diff = 0
    for (let i = 0; i < expected.length; i++) {
      diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i)
    }
    return diff === 0
  }
}

/** Singleton — instantiated once per server. */
export const charowProvider = new CharowProvider()

/** Helper exposed for the sandbox simulate-callback API route. */
export { sandboxLedger }

/**
 * Resolve a Charow product ID for a Wedding OS plan code.
 * Reads from env vars: CHAROW_PRODUCT_TRIAL, CHAROW_PRODUCT_ESSENTIEL,
 * CHAROW_PRODUCT_PREMIUM, CHAROW_PRODUCT_ELITE.
 * Returns undefined if not configured (sandbox will be used).
 */
export function resolveCharowProductId(planCode: string): string | undefined {
  const envKey = `CHAROW_PRODUCT_${planCode.toUpperCase()}`
  return process.env[envKey] || undefined
}
