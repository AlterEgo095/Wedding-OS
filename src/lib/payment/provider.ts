/**
 * Mission 5.9.4 — WAVE 2: PAYMENT PROVIDER ABSTRACTION
 *
 * The business logic (checkout, verification, provisioning) NEVER depends
 * directly on Charow specifics. It talks to this interface.
 *
 *   PaymentProvider
 *   ├── StripeProvider  (existing, reserved — NOT replaced, NOT removed)
 *   └── CharowProvider  (new — added as an additional provider)
 *
 * This is the Adapter Pattern boundary described in the mission.
 */

export type PaymentProviderCode = 'STRIPE' | 'CHAROW'

export type NormalizedPaymentStatus =
  | 'PENDING'
  | 'PROCESSING'
  | 'PAID'
  | 'FAILED'
  | 'CANCELLED'
  | 'EXPIRED'
  | 'REFUNDED'
  | 'UNKNOWN'

export interface CheckoutRequest {
  /** Unique Wedding OS reference for this payment (idempotency key). */
  reference: string
  /** Amount in MINOR units (cents). Determined SERVER-SIDE from the DB Plan. */
  amount: number
  currency: string // "usd" | "fcfa"
  description: string
  /** Customer email for the provider's receipt. */
  customerEmail: string
  /** Display name shown on the provider's checkout page. */
  customerName: string
  /** Customer phone (E.164 or local format) — required by Charow checkout. */
  customerPhone?: string
  /** ISO country code for the phone (default "CD" = Congo-Kinshasa). */
  customerCountryCode?: string
  /**
   * Charow product ID (from the Charow dashboard / /v1/products).
   * REQUIRED for PRODUCTION mode — the real Charow API is product-based.
   * In SANDBOX mode this is ignored.
   */
  productId?: string
  /** Absolute URL the provider redirects to after the customer pays. */
  successUrl: string
  /** Absolute URL the provider redirects to if the customer cancels. */
  cancelUrl: string
  /** Absolute URL the provider sends server-to-server webhook callbacks to. */
  webhookUrl: string
}

export interface CheckoutResult {
  /** Provider-specific sale/session id. Stored on Payment.reference. */
  saleId: string
  /** Absolute URL the browser must redirect to in order to pay. */
  checkoutUrl: string
  /** Provider echo of the amount (for server-side cross-check). */
  amount: number
  currency: string
  /** Raw provider response (for audit — secrets stripped by the adapter). */
  raw: unknown
}

export interface SaleVerification {
  saleId: string
  reference: string | null
  status: NormalizedPaymentStatus
  amount: number
  currency: string
  paidAt: string | null
  customerEmail: string | null
  /** Provider signature of the raw sale object (for audit). */
  raw: unknown
}

export interface PaymentProvider {
  code: PaymentProviderCode
  /** Human-readable mode banner: "SANDBOX" | "PRODUCTION". */
  mode: 'SANDBOX' | 'PRODUCTION'
  /**
   * Create a checkout session at the provider. Returns ONLY the checkout URL
   * + sale id. Never returns sensitive keys.
   */
  createCheckout(req: CheckoutRequest): Promise<CheckoutResult>
  /**
   * Query the provider server-side for the current status of a sale.
   * This is the SOURCE OF TRUTH — never trust the browser redirect.
   */
  verifyPayment(saleId: string): Promise<SaleVerification>
  /** Fetch the full sale object (used for webhook reconciliation). */
  getSale(saleId: string): Promise<SaleVerification>
  /** Normalize a provider-specific status string into our canonical enum. */
  normalizePaymentStatus(rawStatus: string): NormalizedPaymentStatus
}
