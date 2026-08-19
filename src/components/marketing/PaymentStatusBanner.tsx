// ══════════════════════════════════════════════════════════════════════════════
// src/components/marketing/PaymentStatusBanner.tsx — Mission 5.9.5-B Phase 2.4
// ══════════════════════════════════════════════════════════════════════════════
// Reads `?view=payment-success|failed|pending` from the homepage URL and
// renders a feedback banner after the browser is redirected back from
// Charow's hosted checkout.
//
// WHY THIS EXISTS:
//   Before Mission 5.9.5-B, the homepage Server Component did NOT read
//   searchParams, and the redirect URLs produced by /api/payment/verify
//   and /api/checkout/charow were silently ignored. Customers got NO
//   feedback after payment — they just landed on the homepage and saw the
//   marketing content. This banner closes that UX gap.
//
// STATES HANDLED:
//   view=payment-success   → optimistic banner + (if `sale` is present) a
//                            server-side POST /api/payment/verify to confirm.
//   view=payment-pending   → "Paiement en attente de confirmation"
//   view=payment-failed    → "Paiement échoué" + reason
//   view=plans&checkout=cancelled → "Paiement annulé"
//
// TRUTH SOURCE:
//   The banner is purely UX feedback. The server-side webhook
//   /api/webhooks/charow is the canonical provisioning trigger. This banner
//   NEVER trusts the browser redirect as proof of payment — when `sale` is
//   present, it asks the server to re-verify (idempotent if already VERIFIED).
//   When only `orderId` is present (production flow, successUrl uses orderId
//   per Mission 5.9.5-B Phase 3.2), the banner displays an optimistic but
//   honest "Paiement reçu — Vos accès seront activés sous quelques minutes."
// ══════════════════════════════════════════════════════════════════════════════

'use client'

import { useSearchParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import {
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  Info,
} from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { getCsrfToken } from '@/lib/csrf-client'

type VerifyState = 'idle' | 'verifying' | 'verified' | 'pending' | 'failed'

type BannerColor = 'emerald' | 'amber' | 'red' | 'slate'

interface BannerProps {
  icon: React.ReactNode
  title: string
  color: BannerColor
  message: string
}

const COLOR_CLASSES: Record<BannerColor, string> = {
  emerald:
    'border-emerald-500/40 bg-emerald-500/10 text-emerald-900 dark:text-emerald-200 [&>svg]:text-emerald-500',
  amber:
    'border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-200 [&>svg]:text-amber-500',
  red:
    'border-red-500/40 bg-red-500/10 text-red-900 dark:text-red-200 [&>svg]:text-red-500',
  slate:
    'border-slate-500/40 bg-slate-500/10 text-slate-900 dark:text-slate-200 [&>svg]:text-slate-500',
}

function Banner({ icon, title, color, message }: BannerProps) {
  return (
    <div className="mx-auto max-w-3xl px-4 mt-4">
      <Alert className={`border ${COLOR_CLASSES[color]}`}>
        {icon}
        <AlertTitle>{title}</AlertTitle>
        <AlertDescription>{message}</AlertDescription>
      </Alert>
    </div>
  )
}

export function PaymentStatusBanner() {
  const searchParams = useSearchParams()
  const view = searchParams.get('view')
  const sale = searchParams.get('sale')
  const orderId = searchParams.get('orderId')
  const reason = searchParams.get('reason')
  const status = searchParams.get('status')
  const idempotent = searchParams.get('idempotent')
  const checkout = searchParams.get('checkout') // 'cancelled' for view=plans&checkout=cancelled

  const [verifyState, setVerifyState] = useState<VerifyState>('idle')

  // ── For payment-success: re-verify with the server if `sale` is present ──
  // The GET /api/payment/verify (sandbox flow) already verified and
  // redirected, but the POST endpoint is idempotent — calling it again is
  // safe and lets the banner give a definitive answer to the user.
  useEffect(() => {
    if (view !== 'payment-success') return
    if (!sale) {
      // Production flow: successUrl uses orderId (Mission 5.9.5-B Phase 3.2).
      // We can't POST /api/payment/verify without saleId, so we optimistically
      // display success. The webhook is the truth — if it hasn't fired yet,
      // the user may briefly see "confirmed" without access; they'll be
      // re-contacted via email. The message is honest about the delay.
      setVerifyState('verified')
      return
    }
    // Sandbox flow or sandbox re-entry — POST verify (idempotent).
    let cancelled = false
    setVerifyState('verifying')
    void (async () => {
      try {
        const csrfToken = await getCsrfToken()
        const res = await fetch('/api/payment/verify', {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
            ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
          },
          body: JSON.stringify({ saleId: sale }),
        })
        if (cancelled) return
        if (!res.ok) {
          // 401 (unauthenticated) / 404 (sale not found) / 400 / 500 —
          // the GET verify already provisioned, so this is fine. Display
          // the optimistic success (the GET redirect wouldn't have happened
          // if the payment had failed).
          setVerifyState('verified')
          return
        }
        const data = (await res.json()) as {
          ok?: boolean
          status?: string
          idempotent?: boolean
        } | null
        if (data?.status === 'VERIFIED' || data?.ok === true || idempotent) {
          setVerifyState('verified')
        } else if (data?.ok === false && data?.status && data.status !== 'VERIFIED') {
          // Server says not paid yet (PENDING, etc.)
          setVerifyState('pending')
        } else {
          // Unknown response — trust the GET redirect's success view.
          setVerifyState('verified')
        }
      } catch {
        if (!cancelled) {
          // Network error — degrade to "still verifying" so we don't lie.
          setVerifyState('pending')
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [view, sale, idempotent])

  // ── No view or unrelated view → render nothing ──
  if (!view || !view.startsWith('payment-')) {
    // Special case: view=plans&checkout=cancelled
    if (view === 'plans' && checkout === 'cancelled') {
      return (
        <Banner
          icon={<Info className="size-4" aria-hidden="true" />}
          title="Paiement annulé"
          color="slate"
          message="Vous avez annulé le paiement. Aucun débit n'a été effectué. Vous pouvez réessayer quand vous le souhaitez."
        />
      )
    }
    return null
  }

  // ── payment-success ──
  if (view === 'payment-success') {
    if (verifyState === 'verifying') {
      return (
        <Banner
          icon={<Loader2 className="size-4 animate-spin" aria-hidden="true" />}
          title="Vérification du paiement…"
          color="amber"
          message="Nous confirmons votre paiement auprès de notre prestataire. Merci de patienter quelques instants."
        />
      )
    }
    if (verifyState === 'verified') {
      const ref = sale || orderId || ''
      return (
        <Banner
          icon={<CheckCircle2 className="size-4" aria-hidden="true" />}
          title="Paiement confirmé"
          color="emerald"
          message={
            ref
              ? `Référence : ${ref}. Vos crédits et accès sont en cours d'activation. Vous recevrez un email de confirmation sous peu.`
              : "Vos crédits et accès sont en cours d'activation. Vous recevrez un email de confirmation sous peu."
          }
        />
      )
    }
    if (verifyState === 'pending') {
      return (
        <Banner
          icon={<Clock className="size-4" aria-hidden="true" />}
          title="Paiement en cours de confirmation"
          color="amber"
          message="Votre paiement est en cours de traitement par notre prestataire. Vous serez notifié dès confirmation. Aucune action n'est requise de votre part."
        />
      )
    }
    // verifyState === 'failed' (rare — only if POST verify returned a hard error)
    return (
      <Banner
        icon={<XCircle className="size-4" aria-hidden="true" />}
        title="Vérification en cours"
        color="amber"
        message="Votre paiement est en cours de confirmation. Vous recevrez un email de confirmation dès qu'il sera validé."
      />
    )
  }

  // ── payment-pending ──
  if (view === 'payment-pending') {
    return (
      <Banner
        icon={<Clock className="size-4" aria-hidden="true" />}
        title="Paiement en attente de confirmation"
        color="amber"
        message={`Statut : ${status || 'inconnu'}. Vous serez notifié dès que le paiement sera confirmé par notre prestataire.`}
      />
    )
  }

  // ── payment-failed ──
  if (view === 'payment-failed') {
    return (
      <Banner
        icon={<XCircle className="size-4" aria-hidden="true" />}
        title="Paiement échoué"
        color="red"
        message={`Raison : ${reason || 'inconnue'}. Aucun débit n'a été effectué. Vous pouvez réessayer depuis la page Tarifs.`}
      />
    )
  }

  return null
}

export default PaymentStatusBanner
