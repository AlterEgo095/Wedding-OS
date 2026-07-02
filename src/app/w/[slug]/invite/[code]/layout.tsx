// ══════════════════════════════════════════════════════════════════════════════
// /w/[slug]/invite/[code]/layout.tsx — P2-SEC-5
// ══════════════════════════════════════════════════════════════════════════════
// Server layout that emits a `Referrer-Policy: no-referrer` meta tag for the
// invite-landing page only. The page itself is a client component
// (`'use client'`) and therefore cannot export Next.js `metadata` directly.
// Wrapping it in a server layout lets us inject the meta tag without
// refactoring the page.
//
// Why: the invitation link token is passed in the URL (`?token=...` or as a
// path segment). Without `Referrer-Policy: no-referrer`, the token would be
// leaked to any third-party resource loaded on the page (e.g. fonts, images)
// via the `Referer` header. The /api/guest/invite route also sets this header
// on its responses, but defense-in-depth demands the page-level meta tag too.
//
// Future (P3): migrate invitation links fully off the URL — pass the token via
// a short-lived `invite_token` cookie set by this layout, then read it from
// the cookie in /api/guest/invite (which already supports that path).

import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Invitation — Validation en cours',
  // P2-SEC-5: prevent the URL token from leaking via the Referer header on
  // any sub-resource fetched from this page.
  other: { 'referrer-policy': 'no-referrer' },
};

export default function InviteCodeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
