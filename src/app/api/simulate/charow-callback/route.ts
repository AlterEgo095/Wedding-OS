/**
 * Mission 5.9.4 — WAVE 14: SANDBOX SIMULATE CALLBACK
 * GET /api/simulate/charow-callback?sale=<saleId>
 *
 * SANDBOX ONLY — this route exists so the sandbox Charow "checkout URL"
 * can simulate a customer paying. In production (CHAROW_MODE=production)
 * this route refuses to run.
 *
 * Flow:
 *   1. Verify sandbox mode
 *   2. sandboxConfirmPayment(saleId) — flips the in-memory sale to PAID
 *   3. Internally invoke the webhook flow (same as a real Charow callback)
 *   4. Redirect to /api/payment/verify for final server-side verification
 */
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { charowProvider, sandboxConfirmPayment } from '@/lib/payment/charow'

export async function GET(req: NextRequest) {
  if (charowProvider.mode !== 'SANDBOX') {
    return NextResponse.json(
      { error: 'Route disponible uniquement en mode SANDBOX.' },
      { status: 403 }
    )
  }

  const url = new URL(req.url)
  const saleId = url.searchParams.get('sale') ?? ''
  if (!saleId) {
    return NextResponse.json({ error: 'saleId manquant.' }, { status: 400 })
  }

  // ── 1. Confirm the sandbox payment ──────────────────────────────────
  const confirmed = sandboxConfirmPayment(saleId)
  if (!confirmed) {
    return NextResponse.json(
      { error: 'Vente introuvable ou déjà payée.', saleId },
      { status: 400 }
    )
  }

  // ── 2. Return an HTML page that auto-submits to the verify route ────
  // This mimics the Charow redirect-after-payment behaviour.
  const html = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Charow Sandbox — Paiement simulé</title>
  <style>
    body { font-family: system-ui, sans-serif; background: #0f172a; color: #e2e8f0; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
    .card { background: #1e293b; border-radius: 16px; padding: 48px; text-align: center; max-width: 420px; }
    .icon { font-size: 56px; margin-bottom: 16px; }
    h1 { font-size: 22px; margin: 0 0 8px; }
    p { color: #94a3b8; margin: 0 0 24px; }
    .btn { display: inline-block; background: #10b981; color: white; text-decoration: none; padding: 12px 32px; border-radius: 8px; font-weight: 600; }
    .sale { font-family: monospace; color: #64748b; font-size: 12px; margin-top: 16px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">✅</div>
    <h1>Paiement simulé (Sandbox)</h1>
    <p>Le paiement a été confirmé dans le ledger sandbox. Cliquez pour vérifier côté serveur.</p>
    <a class="btn" href="/api/payment/verify?sale=${encodeURIComponent(saleId)}">Vérifier le paiement</a>
    <div class="sale">Sale ID: ${saleId}</div>
  </div>
  <script>
    // Auto-redirect after 2 seconds
    setTimeout(() => { window.location.href = '/api/payment/verify?sale=${encodeURIComponent(saleId)}'; }, 2000);
  </script>
</body>
</html>`

  return new NextResponse(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  })
}
