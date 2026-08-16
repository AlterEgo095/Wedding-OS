// ══════════════════════════════════════════════════════════════════════════════
// src/app/charow/pay/page.tsx — Mission 5.9.4 — SANDBOX CHAROW PAYMENT PAGE
// ══════════════════════════════════════════════════════════════════════════════
// This page ONLY exists in SANDBOX mode. The CharowProvider.createCheckoutSandbox
// returns checkoutUrl = `/charow/pay?sale=<saleId>&ref=<reference>`.
//
// It mimics a real Charow hosted checkout page:
//   - shows the order summary (reference, amount)
//   - a fake card form (no real data collected)
//   - a "Payer" button that calls /api/simulate/charow-callback?sale=<saleId>
//   - the simulate callback flips the in-memory sale to PAID and redirects
//     to /api/payment/verify for server-side truth
//
// In PRODUCTION mode, the real Charow checkout_url is used and this page is
// never reached.
// ══════════════════════════════════════════════════════════════════════════════

'use client'

import { useSearchParams } from 'next/navigation'
import { Suspense, useState } from 'react'
import { ShieldCheck, Lock, CreditCard, Loader2 } from 'lucide-react'

function SandboxPayContent() {
  const params = useSearchParams()
  const saleId = params.get('sale') ?? ''
  const reference = params.get('ref') ?? ''

  const [status, setStatus] = useState<'idle' | 'paying' | 'redirecting'>('idle')
  const [error, setError] = useState<string | null>(null)

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

          {/* Order summary */}
          <div className="px-6 py-5 border-b border-slate-800">
            <p className="text-xs text-slate-400 uppercase tracking-wider mb-1">Référence</p>
            <p className="font-mono text-sm text-slate-200 mb-3 break-all">{reference || saleId}</p>
            <p className="text-xs text-slate-400 uppercase tracking-wider mb-1">Sale ID</p>
            <p className="font-mono text-xs text-slate-500 break-all">{saleId}</p>
          </div>

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
              disabled={status !== 'idle'}
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
