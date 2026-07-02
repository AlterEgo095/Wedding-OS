// P1-SEC-9: Referrer-Policy metadata for the reset-password page.
// The reset token is passed in the URL (`?token=...`); without this meta tag,
// the token would leak to any third-party resource (fonts, analytics) via the
// Referer header. The /api/platform/password-reset/confirm endpoint also
// sets this header on its responses, but defense-in-depth demands the
// page-level meta tag too.

import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Réinitialisation du mot de passe',
  other: { 'referrer-policy': 'no-referrer' },
};

export default function ResetPasswordLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
