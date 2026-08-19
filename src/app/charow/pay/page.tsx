// ══════════════════════════════════════════════════════════════════════════════
// src/app/charow/pay/page.tsx — Mission 5.9.4 — SANDBOX CHAROW PAYMENT PAGE
// ══════════════════════════════════════════════════════════════════════════════
// This page ONLY exists in SANDBOX mode. The CharowProvider.createCheckoutSandbox
// returns checkoutUrl = `/charow/pay?sale=<saleId>&ref=<reference>`.
//
// It mimics a real Charow hosted checkout page:
//   - shows the order summary (reference, amount, currency, description, status)
//   - a fake card form (no real data collected)
//   - a "Payer" button that calls /api/simulate/charow-callback?sale=<saleId>
//   - the simulate callback flips the in-memory sale to PAID and redirects
//     to /api/payment/verify for server-side truth
//
// In PRODUCTION mode, the real Charow checkout_url is used and this page is
// never reached. As defence-in-depth (Mission 5.9.5-B Phase 2.6), this page
// now ALSO guards against rendering in PRODUCTION: on mount it fetches
// /api/charow/status. If mode === 'PRODUCTION', it renders a 404-style
// "Page non disponible en production" panel instead of the fake card form.
//
// Mission 5.9.5-B Phase 2.5 — amount + status display:
//   On mount (in SANDBOX mode), the page fetches /api/charow/sandbox-sale
//   to display the order amount, currency, description and status. If the
//   sale is already PAID, the fake card form is replaced by a "Paiement
//   déjà effectué — Redirection..." panel that auto-redirects to the
//   verify endpoint.
// ══════════════════════════════════════════════════════════════════════════════

'use client'

import { useSearchParams } from 'next/navigation'
import { Suspense, useEffect, useState } from 'react'
import { ShieldCheck, Lock, CreditCard, Loader2, CheckCircle2 } from 'lucide-react'

interface SandboxSaleInfo {
  saleId: string
  reference: string | null
  amount: number // cents
  currency: string
  description: string
  status: 'PENDING' | 'PAID' | 'CANCELLED' | 'FAILED'
  paidAt: string | null
  createdAt: string
}

function formatAmount(cents: number, currency: string): string {
  if (currency.toLowerCase() === 'fcfa') {
    return `${(cents).toLocaleString('fr-FR')} FCFA`
  }
  return `$${(cents / 100).toFixed(2)}`
}

function SandboxPayContent() {
  const params = useSearchParams()
  const saleId = params.get('sale') ?? ''
  const reference = params.get('ref') ?? ''

  const [status, setStatus] = useState<'idle' | 'paying' | 'redirecting'>('idle')
  const [error, setError] = useState<string | null>(null)

  // Mission 5.9.5-B Phase 2.6 — production mode guard.
  // 'checking'  → still fetching /api/charow/status
  // 'sandbox'   → SANDBOX mode → render the existing UI
  // 'production' → PRODUCTION mode → render the "not available" panel
  const [modeState, setModeState] = useState<'checking' | 'sandbox' | 'production'>('checking')

  // Mission 5.9.5-B Phase 2.5 — sale info (amount, currency, description, status).
  const [saleInfo, setSaleInfo] = useState<SandboxSaleInfo | null>(null)
  const [saleInfoError, setSaleInfoError] = useState<string | null>(null)

  // ── Mount: fetch the Charow provider mode (public endpoint) ──
  useEffect(() => {
    let cancelled = false
    fetch('/api/charow/status', { method: 'GET', credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled) return
        if (data?.mode === 'PRODUCTION') {
          setModeState('production')
        } else {
          setModeState('sandbox')
        }
      })
      .catch(() => {
        // Network failure — fail-safe: assume sandbox (so the existing UI
        // still renders; in production the URL is never reached anyway).
        if (!cancelled) setModeState('sandbox')
      })
    return () => {
      cancelled = true
    }
  }, [])

  // ── Mount (sandbox only): fetch the sale info for the order summary ──
  useEffect(() => {
    if (modeState !== 'sandbox' || !saleId) return
    let cancelled = false
    fetch(`/api/charow/sandbox-sale?sale=${encodeURIComponent(saleId)}`, {
      method: 'GET',
      credentials: 'include',
    })
      .then((r) => {
        if (!r.ok) return null
        return r.json()
      })
      .then((data) => {
        if (cancelled) return
        if (data && typeof data.amount === 'number') {
          setSaleInfo(data as SandboxSaleInfo)
        } else {
          setSaleInfoError('Sale introuvable.')
        }
      })
      .catch(() => {
        if (!cancelled) setSaleInfoError('Impossible de charger le détail de la commande.')
      })
    return () => {
      cancelled = true
    }
  }, [modeState, saleId])

  // ── Mission 5.9.5-B Phase 2.5: if already PAID, auto-redirect to verify ──
  // The GET /api/payment/verify is idempotent — if the sale is already
  // VERIFIED server-side, it returns 200 idempotent. Otherwise it re-runs
  // the verification + provisioning.
  useEffect(() => {
    if (!saleInfo || saleInfo.status !== 'PAID' || !saleId) return
    const t = setTimeout(() => {
      window.location.href = `/api/payment/verify?sale=${encodeURIComponent(saleId)}`
    }, 1500)
    return () => clearTimeout(t)
  }, [saleInfo, saleId])

  async function handlePay() {
    if (!saleId) {
      setError('Sale ID manquant. Impossible de simuler le paiement.')
      return
    }
    setStatus('paying')
    setError(null)

    // Call the simulate-callback GET endpoint. It returns an HTML page that
    // auto-redirects to /api/payment/verify. We navigate the browser there.
    try {
      // Use window.location so the browser follows the HTML redirect
      window.location.href = `/api/simulate/charow-callback?sale=${encodeURIComponent(saleId)}`
      setStatus('redirecting')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur inconnue')
      setStatus('idle')
    }
  }

  // ── Missing saleId — show the empty-state panel (existing behaviour) ──
  if (!saleId) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-100 p-4">
        <div className="max-w-md w-full bg-slate-900 rounded-2xl p-8 text-center border border-slate-800">
          <p className="text-amber-400 font-medium">Paramètre &quot;sale&quot; manquant.</p>
          <p className="text-slate-400 text-sm mt-2">Cette page est uniquement accessible via un checkout sandbox.</p>
        </div>
      </div>
    )
  }

  // ── Production guard — Mission 5.9.5-B Phase 2.6 ──
  if (modeState === 'production') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-100 p-4">
        <div className="max-w-md w-full bg-slate-900 rounded-2xl p-8 text-center border border-slate-800">
          <div className="w-12 h-12 rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center mx-auto mb-4">
            <Lock className="w-6 h-6 text-amber-400" />
          </div>
          <h1 className="font-semibold text-lg mb-2">Page non disponible en production</h1>
          <p className="text-slate-400 text-sm mb-4">
            Cette page est uniquement accessible en mode Sandbox. En
            production, vous serez automatiquement redirigé vers la page de
            paiement sécurisée de notre prestataire Charow.
          </p>
          <a
            href="/?view=plans"
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-100 text-sm font-medium transition-colors"
          >
            Retour à l&apos;accueil
          </a>
        </div>
      </div>
    )
  }

  // ── Still checking mode (initial spinner) ──
  if (modeState === 'checking') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-400">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    )
  }

  // ── SANDBOX mode — main UI ──
  // If the sale is already PAID, show a "payment already done" panel and
  // auto-redirect to the verify endpoint so the provisioning fires.
  const isAlreadyPaid = saleInfo?.status === 'PAID'

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Sandbox banner */}
        <div className="mb-4 flex items-center justify-center gap-2 px-4 py-2 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-semibold uppercase tracking-wider">
          <span className="inline-block w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
          Mode Sandbox — Aucun paiement réel
        </div>

        {/* Card */}
        <div className="bg-slate-900 rounded-2xl shadow-2xl border border-slate-800 overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-br from-slate-800 to-slate-900 px-6 py-5 border-b border-slate-800">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-emerald-500/20 flex items-center justify-center">
                <ShieldCheck className="w-5 h-5 text-emerald-400" />
              </div>
              <div>
                <p className="font-semibold text-sm">Charow Checkout</p>
                <p className="text-xs text-slate-400">Paiement sécurisé</p>
              </div>
            </div>
          </div>

          {/* Order summary — Mission 5.9.5-B Phase 2.5: amount + description + status */}
          <div className="px-6 py-5 border-b border-slate-800">
            {saleInfo ? (
              <div className="space-y-3">
                <div>
                  <p className="text-xs text-slate-400 uppercase tracking-wider mb-1">Description</p>
                  <p className="text-sm text-slate-200">{saleInfo.description || 'Commande Wedding OS'}</p>
                </div>
                <div className="flex items-baseline justify-between pt-2 border-t border-slate-800/60">
                  <p className="text-xs text-slate-400 uppercase tracking-wider">Montant total</p>
                  <p className="font-serif text-2xl font-bold text-emerald-300">
                    {formatAmount(saleInfo.amount, saleInfo.currency)}
                  </p>
                </div>
                <div className="flex items-baseline justify-between">
                  <p className="text-xs text-slate-400 uppercase tracking-wider">Statut</p>
                  <p className={`text-sm font-mono ${
                    saleInfo.status === 'PAID' ? 'text-emerald-400' :
                    saleInfo.status === 'PENDING' ? 'text-amber-400' :
                    'text-red-400'
                  }`}>
                    {saleInfo.status}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-400 uppercase tracking-wider mb-1">Référence</p>
                  <p className="font-mono text-sm text-slate-200 break-all">{saleInfo.reference || reference || saleId}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400 uppercase tracking-wider mb-1">Sale ID</p>
                  <p className="font-mono text-xs text-slate-500 break-all">{saleId}</p>
                </div>
              </div>
            ) : saleInfoError ? (
              <div className="space-y-2">
                <div>
                  <p className="text-xs text-slate-400 uppercase tracking-wider mb-1">Référence</p>
                  <p className="font-mono text-sm text-slate-200 mb-3 break-all">{reference || saleId}</p>
                  <p className="text-xs text-slate-400 uppercase tracking-wider mb-1">Sale ID</p>
                  <p className="font-mono text-xs text-slate-500 break-all">{saleId}</p>
                </div>
                <p className="text-xs text-amber-400/80 italic mt-2">{saleInfoError}</p>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-sm text-slate-400">
                <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                Chargement du détail de la commande…
              </div>
            )}
          </div>

          {/* Mission 5.9.5-B Phase 2.5: if already PAID, no fake card form. */}
          {isAlreadyPaid ? (
            <div className="px-6 py-8 text-center">
              <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto mb-3" />
              <p className="font-semibold text-emerald-300 mb-1">Paiement déjà effectué</p>
              <p className="text-slate-400 text-sm mb-4">
                Cette commande a déjà été payée. Redirection vers la
                vérification serveur…
              </p>
              {/* The auto-redirect to /api/payment/verify?sale=<saleId> is
                  triggered by the useEffect above (no in-render side effect). */}
            </div>
          ) : (
            <>
              {/* Fake card form (sandbox only — no real data collected) */}
              <div className="px-6 py-5 space-y-4">
                <div>
                  <label className="text-xs text-slate-400 mb-1.5 block">Numéro de carte (pré-rempli)</label>
                  <div className="relative">
                    <CreditCard className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                    <input
                      type="text"
                      value="4242 4242 4242 4242"
                      readOnly
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-9 pr-3 py-2.5 text-sm font-mono text-slate-300 focus:outline-none"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-slate-400 mb-1.5 block">Expiration</label>
                    <input
                      type="text"
                      value="12/28"
                      readOnly
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-sm font-mono text-slate-300 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 mb-1.5 block">CVC</label>
                    <input
                      type="text"
                      value="123"
                      readOnly
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-sm font-mono text-slate-300 focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* Pay button */}
              <div className="px-6 pb-6">
                {error && (
                  <p className="text-red-400 text-xs mb-3 text-center">{error}</p>
                )}
                <button
                  onClick={handlePay}
                  disabled={status !== 'idle' || !saleInfo}
                  className="w-full bg-emerald-500 hover:bg-emerald-400 disabled:opacity-60 disabled:cursor-not-allowed text-slate-950 font-semibold py-3 rounded-lg transition-colors flex items-center justify-center gap-2"
                >
                  {status === 'idle' && (
                    <>
                      <Lock className="w-4 h-4" />
                      Payer maintenant
                    </>
                  )}
                  {status === 'paying' && (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Traitement...
                    </>
                  )}
                  {status === 'redirecting' && (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Redirection...
                    </>
                  )}
                </button>
                <p className="text-center text-xs text-slate-500 mt-3">
                  En sandbox, le paiement est automatiquement confirmé.
                </p>
              </div>
            </>
          )}
        </div>

        <p className="text-center text-xs text-slate-600 mt-6">
          powered by <span className="font-semibold text-slate-400">Charow</span> · sandbox simulation
        </p>
      </div>
    </div>
  )
}

export default function SandboxPayPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-400">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      }
    >
      <SandboxPayContent />
    </Suspense>
  )
}
