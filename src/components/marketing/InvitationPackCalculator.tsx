// ══════════════════════════════════════════════════════════════════════════════
// src/components/marketing/InvitationPackCalculator.tsx — Mission 5.9.5-B Phase 2.2
// ══════════════════════════════════════════════════════════════════════════════
// Interactive invitation-pack calculator with a live total preview.
//
// WHAT THE USER DOES:
//   1. Types a quantity (or picks a preset: 100, 250, 251, 500, 1000).
//   2. The component fetches a live price quote from the server-side pricing
//      engine (POST /api/platform/pricing/compute — server-authoritative).
//   3. The total is displayed in real time.
//   4. Clicking "Payer ..." calls <CheckoutButton> which POSTs to
//      /api/checkout/charow and redirects to Charow's hosted checkout.
//
// NON-GOALS (Mission 5.9.5-B rules):
//   - The browser NEVER computes a price. The unit price + total come from
//     the server's pricing engine (FLAT_TIER rule preserved — Mission 5.9.5-A).
//   - The browser NEVER sends a price field to /api/checkout/charow. Only
//     `quantity` is sent; the server resolves the price at checkout time.
//   - If the live-preview call fails (e.g. /api/admin/pricing/compute is
//     PLATFORM_ADMIN-gated and the customer is not an admin), the calculator
//     degrades gracefully: the quantity selector still works, the live total
//     is hidden, and the actual total is computed server-side at checkout.
//
// NOTE ON CSRF: the live-preview call is a POST (state-changing by HTTP
// method), so the middleware CSRF gate applies. We use the existing
// `getCsrfToken()` helper from `@/lib/csrf-client` (P1-SEC-7).
// ══════════════════════════════════════════════════════════════════════════════

'use client'

import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Loader2, Info } from 'lucide-react'
import { CheckoutButton } from './CheckoutButton'
import { getCsrfToken } from '@/lib/csrf-client'

// Preset quantities — the 250→251 inflection point is intentionally
// represented twice so users see the tier boundary in the UI itself.
const PRESETS: readonly number[] = [100, 250, 251, 500, 1000]

const MIN_QTY = 1
const MAX_QTY = 100_000 // matches the pricing-engine Infinity cap (Mission Phase 1.7)

interface Quote {
  unitPriceCents: number
  totalCents: number
  currency: string
}

/**
 * Format a USD amount in cents as a human-readable string.
 * Used for the live total + the "Payer $X" button label.
 */
function formatUSD(cents: number): string {
  if (!Number.isFinite(cents) || cents < 0) return '$0.00'
  return `$${(cents / 100).toFixed(2)}`
}

export function InvitationPackCalculator() {
  const [quantity, setQuantity] = useState<number>(250)
  const [quote, setQuote] = useState<Quote | null>(null)
  const [loading, setLoading] = useState<boolean>(false)
  const [unavailable, setUnavailable] = useState<boolean>(false)

  // ── Live preview: call the server-side pricing engine ──
  // NOTE: /api/platform/pricing/compute is PLATFORM_ADMIN-gated. For non-admin
  // authenticated customers, this will return 401. We degrade gracefully:
  // hide the live total; the real total is computed at checkout time.
  const fetchQuote = useCallback(async (qty: number) => {
    if (!Number.isFinite(qty) || qty < MIN_QTY) {
      setQuote(null)
      setUnavailable(false)
      return
    }
    setLoading(true)
    setUnavailable(false)
    try {
      const csrfToken = await getCsrfToken()
      const res = await fetch('/api/platform/pricing/compute', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
        },
        body: JSON.stringify({
          // The "couple" buyer is the STANDARD customer tier (not INDIVIDUAL).
          // AGENCY/RESELLER/WEDDING_PLANNER tiers are not selectable here —
          // resellers go through the manual /onboarding lead-gen path.
          customerType: 'STANDARD',
          creditType: 'INVITATION',
          quantity: qty,
        }),
      })
      if (!res.ok) {
        // 401 (not admin) / 403 (CSRF) / 400 (validation) / 500 — degrade.
        setQuote(null)
        setUnavailable(true)
        return
      }
      const data = (await res.json()) as { quote?: Quote } | null
      if (data?.quote && typeof data.quote.totalCents === 'number') {
        setQuote({
          unitPriceCents: data.quote.unitPriceCents,
          totalCents: data.quote.totalCents,
          currency: data.quote.currency || 'usd',
        })
        setUnavailable(false)
      } else {
        setQuote(null)
        setUnavailable(true)
      }
    } catch {
      // Network error or JSON parse error — degrade.
      setQuote(null)
      setUnavailable(true)
    } finally {
      setLoading(false)
    }
  }, [])

  // Re-fetch on quantity change. Debounced via a small timer so users can
  // type without hammering the API on every keystroke.
  useEffect(() => {
    const t = setTimeout(() => {
      void fetchQuote(quantity)
    }, 250)
    return () => clearTimeout(t)
  }, [quantity, fetchQuote])

  // Show the tier-boundary education callout ONLY at the 250/251 inflection.
  // This is purely educational UX copy — the actual price is server-resolved.
  const showTierMessage = quantity === 250 || quantity === 251

  // The "Payer $X" button label. When no live quote is available, fall back
  // to a neutral label so we don't lie about the price.
  const checkoutLabel = quote
    ? `Payer ${formatUSD(quote.totalCents)}`
    : `Payer ${quantity} invitations`

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = Number(e.target.value)
    if (!Number.isFinite(raw)) {
      setQuantity(MIN_QTY)
      return
    }
    const clamped = Math.max(MIN_QTY, Math.min(MAX_QTY, Math.floor(raw)))
    setQuantity(clamped)
  }

  return (
    <div className="w-full max-w-md mx-auto rounded-2xl border border-gold/20 bg-card/40 backdrop-blur-sm p-6 md:p-8 flex flex-col gap-5">
      {/* ── Quantity selector ── */}
      <div>
        <label
          htmlFor="invitation-quantity"
          className="block text-xs tracking-wider uppercase text-muted-foreground/70 mb-2"
        >
          Nombre d&apos;invitations
        </label>
        <Input
          id="invitation-quantity"
          type="number"
          min={MIN_QTY}
          max={MAX_QTY}
          inputMode="numeric"
          value={quantity}
          onChange={handleInputChange}
          className="font-mono text-lg"
          aria-describedby="invitation-quantity-help"
        />
        <p
          id="invitation-quantity-help"
          className="mt-1.5 text-[11px] text-muted-foreground/60"
        >
          1 à 100 000 invitations. Tarif calculé en direct côté serveur.
        </p>
      </div>

      {/* ── Preset chips ── */}
      <div className="flex flex-wrap gap-2">
        {PRESETS.map((preset) => (
          <Button
            key={preset}
            type="button"
            size="sm"
            variant={quantity === preset ? 'default' : 'outline'}
            onClick={() => setQuantity(preset)}
            className={
              quantity === preset
                ? 'bg-gradient-to-r from-gold to-gold-dark text-white border-transparent'
                : 'border-gold/30 text-foreground/80 hover:bg-gold/10'
            }
          >
            {preset.toLocaleString('fr-FR')}
          </Button>
        ))}
      </div>

      {/* ── Live total preview ── */}
      <div className="rounded-xl bg-gold/5 border border-gold/15 px-4 py-3 min-h-[88px] flex flex-col justify-center">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            Calcul du tarif…
          </div>
        ) : quote ? (
          <div className="space-y-1">
            <div className="flex items-baseline justify-between text-sm">
              <span className="text-muted-foreground">Prix unitaire</span>
              <span className="font-mono text-foreground/90">
                {formatUSD(quote.unitPriceCents)}
              </span>
            </div>
            <div className="flex items-baseline justify-between">
              <span className="text-sm text-muted-foreground">Total</span>
              <span className="font-serif text-2xl font-bold gold-gradient">
                {formatUSD(quote.totalCents)}
              </span>
            </div>
            <div className="flex items-baseline justify-between text-xs text-muted-foreground/70">
              <span>Crédits obtenus</span>
              <span className="font-mono">
                {quantity.toLocaleString('fr-FR')} invitations
              </span>
            </div>
          </div>
        ) : unavailable ? (
          <p className="text-xs text-muted-foreground/80 italic">
            Tarif en ligne indisponible. Le total exact sera calculé au
            moment du paiement (côté serveur).
          </p>
        ) : null}
      </div>

      {/* ── Tier change education (boundary case) ── */}
      {showTierMessage && (
        <p className="text-[11px] text-muted-foreground/80 bg-gold/5 border border-gold/15 rounded-lg px-3 py-2 italic flex items-start gap-2">
          <Info className="size-3.5 text-gold shrink-0 mt-0.5" aria-hidden="true" />
          <span>
            À partir de 251 invitations, le tarif passe à $0.50 par invitation.
          </span>
        </p>
      )}

      {/* ── Checkout ── */}
      <CheckoutButton
        mode="INVITATION_PACK"
        quantity={quantity}
        currency="usd"
        label={checkoutLabel}
        variant="default"
      />

      <p className="text-center text-[11px] text-muted-foreground/60 mt-1">
        Paiement sécurisé via Charow. Vous serez redirigé vers la page de
        paiement.
      </p>
    </div>
  )
}

export default InvitationPackCalculator
