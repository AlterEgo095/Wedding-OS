// ══════════════════════════════════════════════════════════════════════════════
// src/components/marketing/CheckoutButton.tsx — Mission 5.9.5-B Phase 2.1
// ══════════════════════════════════════════════════════════════════════════════
// Client-side CTA that calls POST /api/checkout/charow and redirects the
// browser to the Charow checkoutUrl returned by the server.
//
// DESIGN RULES (Mission 5.9.5-B):
//   - The browser NEVER sends a price. The server resolves the price from the
//     DB (PLAN) or the pricing engine (INVITATION_PACK). This component only
//     sends mode + planId + quantity + currency — nothing else.
//   - On 200: read `checkoutUrl` from the JSON body and hard-redirect the
//     browser to it (no client-side routing — it's an external Charow URL).
//   - On 401: redirect to /platform/login?redirect=/pricing (the user must be
//     authenticated to checkout — the server creates an Order tied to user.id).
//   - On 400: surface the server-provided error message inline.
//   - On 502 (CHAROW_ERROR): show a friendly "Service de paiement indisponible.
//     Réessayez." message — the Charow adapter failed.
//
// This component renders a shadcn Button with a Loader2 spinner during the
// loading state. Visual styling (gold gradient vs outline) is controlled by
// the `variant` prop and matches the surrounding CtaLink used by PricingSection.
// ══════════════════════════════════════════════════════════════════════════════

'use client'

import { useState, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Loader2, ArrowRight } from 'lucide-react'
import { getCsrfToken } from '@/lib/csrf-client'

type CheckoutMode = 'PLAN' | 'INVITATION_PACK'

interface CheckoutButtonProps {
  /** PLAN = subscription plan; INVITATION_PACK = per-invitation credits. */
  mode: CheckoutMode
  /** Required for mode='PLAN'. One of 'ESSENTIEL' | 'PREMIUM' | 'ELITE'. */
  planId?: string
  /** Required for mode='INVITATION_PACK'. Number of invitations to buy. */
  quantity?: number
  /** Currency hint (cosmetic — server may override based on Customer.currency). */
  currency?: 'usd' | 'fcfa'
  /** Button label (already localized). */
  label: string
  /** 'default' = filled gold gradient (primary CTA); 'outline' = glass card. */
  variant?: 'default' | 'outline'
  /** Optional extra className. */
  className?: string
}

type Status = 'idle' | 'loading' | 'redirecting' | 'error'

export function CheckoutButton({
  mode,
  planId,
  quantity,
  currency = 'usd',
  label,
  variant = 'default',
  className,
}: CheckoutButtonProps) {
  const [status, setStatus] = useState<Status>('idle')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const handleClick = useCallback(async () => {
    setStatus('loading')
    setErrorMsg(null)

    // ── Fetch the CSRF token (cached by csrf-client after first call) ──
    const csrfToken = await getCsrfToken()

    let res: Response
    try {
      res = await fetch('/api/checkout/charow', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
        },
        body: JSON.stringify({ mode, planId, quantity, currency }),
      })
    } catch (err) {
      // Network error — likely offline or DNS failure.
      setStatus('error')
      setErrorMsg('Connexion au serveur impossible. Vérifiez votre réseau.')
      return
    }

    // ── 401: redirect to login (preserves /pricing as the redirect target) ──
    if (res.status === 401) {
      window.location.href = '/platform/login?redirect=/pricing'
      return
    }

    // ── 502: Charow adapter failure — show retry message ──
    if (res.status === 502) {
      setStatus('error')
      setErrorMsg('Service de paiement indisponible. Réessayez dans un instant.')
      return
    }

    // ── 400: validation error (missing planId, quantity<=0, free plan, etc.) ──
    if (res.status === 400) {
      let msg = 'Requête invalide. Vérifiez les informations saisies.'
      try {
        const data = await res.json()
        if (data?.error) msg = String(data.error)
      } catch {
        // ignore JSON parse error — keep default msg
      }
      setStatus('error')
      setErrorMsg(msg)
      return
    }

    // ── 403: CSRF gate — most likely the cookie expired. Force a re-fetch
    //    by reloading the page (which re-establishes the session). ──
    if (res.status === 403) {
      setStatus('error')
      setErrorMsg('Session expirée. Rechargez la page et réessayez.')
      return
    }

    // ── 200: read the checkoutUrl and hard-redirect ──
    if (res.ok) {
      let data: { checkoutUrl?: string } = {}
      try {
        data = await res.json()
      } catch {
        setStatus('error')
        setErrorMsg('Réponse du serveur illisible. Réessayez.')
        return
      }
      if (!data?.checkoutUrl || typeof data.checkoutUrl !== 'string') {
        setStatus('error')
        setErrorMsg('URL de paiement manquante. Réessayez.')
        return
      }
      setStatus('redirecting')
      // Hard navigate to Charow's hosted checkout page.
      window.location.href = data.checkoutUrl
      return
    }

    // ── Any other status: generic error ──
    setStatus('error')
    setErrorMsg('Erreur inattendue. Réessayez ou contactez le support.')
  }, [mode, planId, quantity, currency])

  const isLoading = status === 'loading' || status === 'redirecting'

  // Visual styling — mirrors the CtaLink helper used elsewhere in PricingSection.
  // `variant=default` → filled gold gradient (primary). `variant=outline` →
  // glass card with gold border (secondary). The shadcn Button base classes
  // are overridden by the more specific className passed below.
  const visualClassName =
    variant === 'default'
      ? 'bg-gradient-to-r from-gold to-gold-dark hover:from-gold-dark hover:to-gold text-white shadow-lg shadow-gold/30 hover:shadow-xl hover:shadow-gold/40 btn-premium'
      : 'glass-card gold-border text-foreground/90 hover:bg-gold/10'

  return (
    <div className="w-full">
      <Button
        type="button"
        // Use shadcn's `default` variant so the base button styles (size,
        // focus ring, disabled state) are applied; our className overrides
        // the colors to match PricingSection's gold theme.
        variant="default"
        disabled={isLoading}
        onClick={handleClick}
        aria-busy={isLoading}
        className={`
          inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full
          font-display text-sm font-semibold tracking-wide transition-all duration-300
          w-full h-auto
          ${visualClassName}
          ${className ?? ''}
        `}
      >
        {isLoading ? (
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        ) : (
          <>
            <span>{label}</span>
            <ArrowRight className="size-4" aria-hidden="true" />
          </>
        )}
      </Button>
      {errorMsg && status === 'error' && (
        <p
          role="alert"
          className="mt-2 text-xs text-red-500 dark:text-red-400 text-center"
        >
          {errorMsg}
        </p>
      )}
    </div>
  )
}

export default CheckoutButton
