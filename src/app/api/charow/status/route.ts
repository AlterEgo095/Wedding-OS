/**
 * Mission 5.9.4 — CHAROW STATUS (public config probe)
 * GET /api/charow/status
 *
 * Returns the Charow provider mode (SANDBOX/PRODUCTION) and credential
 * presence — WITHOUT ever exposing the actual keys.
 * Used by the frontend to show the correct checkout UX.
 */
import { NextResponse } from 'next/server'
import { charowProvider, charowCredentialStatus } from '@/lib/payment/charow'

export const dynamic = 'force-dynamic'

export async function GET() {
  const creds = charowCredentialStatus()
  return NextResponse.json({
    provider: 'CHAROW',
    mode: creds.mode,
    credentials: {
      apiKey: creds.apiKey,
      merchantId: creds.merchantId,
      webhookSecret: creds.webhookSecret,
    },
    apiBaseUrl: process.env.CHAROW_API_BASE_URL || 'https://api.chariow.com/v1',
    productsConfigured: {
      TRIAL: !!process.env.CHAROW_PRODUCT_TRIAL,
      ESSENTIEL: !!process.env.CHAROW_PRODUCT_ESSENTIEL,
      PREMIUM: !!process.env.CHAROW_PRODUCT_PREMIUM,
      ELITE: !!process.env.CHAROW_PRODUCT_ELITE,
    },
  })
}
