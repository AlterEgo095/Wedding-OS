// ══════════════════════════════════════════════════════════════════════════════
// src/components/wedding/WhatsAppShare.tsx — Phase 4D (MISSION 5.9.0 §20.6)
// ══════════════════════════════════════════════════════════════════════════════
//
// WhatsApp share button. Builds a pre-filled `wa.me/?text=…` link with the
// wedding's identity (couple names + date + venue) and a public shareable URL.
// On click, fires-and-forgets a POST to /api/w/share-event so the platform
// can audit who shared what (privacy-preserving — the share event is logged
// with weddingSlug + channel + IP only, never the WhatsApp message body).
//
// Mobile-first: WhatsApp is primarily mobile, so the button is prominent on
// small screens (full-width below the parent CTA, gold-gradient fill, 44×44
// min touch target via the shared Button component).
//
// Privacy:
//   - The `inviteToken` is only included in the share URL when the guest is
//     viewing via `?invite=xxx` (i.e., they have a legitimate personalized
//     invitation). Without a token, the share URL is the bare public URL.
//   - The WhatsApp message is constructed CLIENT-side and sent straight to
//     `wa.me` — it never touches our servers. Only the share EVENT (slug +
//     channel + timestamp) is logged server-side.
//
// Audit:
//   - The POST to /api/w/share-event is best-effort. If the network fails or
//     the API returns an error, the share still opens WhatsApp — the user
//     experience is never degraded by audit-logging failures.
//
// Rate limiting:
//   - The /api/w/share-event endpoint enforces 10 share events per IP per
//     minute server-side. The button does NOT disable itself client-side —
//     a determined user could click 100×, but the audit log will only record
//     the first 10. The 11th click still opens WhatsApp (UX > rigid limits)
//     but produces no audit row. This is the same pattern as /api/guest/rsvp.
// ══════════════════════════════════════════════════════════════════════════════

'use client';

import { useState } from 'react';
import { MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

export interface WhatsAppShareProps {
  /** Wedding slug — used to build the shareable URL: /w/{slug}?invite={token}. */
  weddingSlug: string;
  /** Display label for the couple, e.g. "Josué & Hornella". */
  weddingNames: string;
  /** Optional pre-formatted date display, e.g. "26 juin 2026". */
  weddingDate?: string;
  /** Optional venue line, e.g. "Kinshasa" or "Hôtel Pullman • Kinshasa". */
  venue?: string;
  /**
   * Optional encrypted invite token. When present (i.e. the guest is viewing
   * via `?invite=xxx`), the share URL becomes /w/{slug}?invite={token} so the
   * recipient gets a personalized invitation. When absent, the share URL is
   * the bare public URL `/w/{slug}`.
   */
  inviteToken?: string;
  /** Visual variant — defaults to the prominent gold-gradient CTA.
   *  - 'primary': gold-gradient fill (public-facing CTAs).
   *  - 'outline': glass-card + gold border (secondary CTAs next to a primary).
   *  - 'ghost': transparent text-gold (sidebar / dense UI like the admin). */
  variant?: 'primary' | 'outline' | 'ghost';
  /** Optional size override — defaults to lg (44×44 touch target). */
  size?: 'default' | 'lg' | 'sm';
  /** Optional extra className for layout overrides. */
  className?: string;
  /** Optional accessible label override (defaults to "Partager sur WhatsApp"). */
  label?: string;
}

const SHARE_BASE_URL = 'https://wedding.aenews.store/w';

export function WhatsAppShare({
  weddingSlug,
  weddingNames,
  weddingDate,
  venue,
  inviteToken,
  variant = 'primary',
  size = 'lg',
  className,
  label = 'Partager sur WhatsApp',
}: WhatsAppShareProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  // ─── Build the shareable URL ────────────────────────────────────────────────
  // The token is only included when present. A guest who landed via direct
  // navigation (no ?invite=xxx) shares the bare public URL — no token leak.
  const shareUrl = inviteToken
    ? `${SHARE_BASE_URL}/${weddingSlug}?invite=${encodeURIComponent(inviteToken)}`
    : `${SHARE_BASE_URL}/${weddingSlug}`;

  // ─── Build the WhatsApp message body ────────────────────────────────────────
  // French copy. Emoji prefixes (📅 📍) are widely used in French WhatsApp
  // messages and improve scannability on mobile. Trailing newline + URL on its
  // own line so the URL is tappable on most WhatsApp clients.
  const message =
    `Vous êtes invités au mariage de ${weddingNames} !\n` +
    (weddingDate ? `📅 ${weddingDate}\n` : '') +
    (venue ? `📍 ${venue}\n` : '') +
    `\nDécouvrez l'invitation et confirmez votre présence :\n${shareUrl}`;

  const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(message)}`;

  // ─── Click handler: audit-log + open WhatsApp ───────────────────────────────
  const handleShare = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);

    // Fire-and-forget audit log. Never blocks the WhatsApp open.
    try {
      await fetch('/api/w/share-event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          weddingSlug,
          channel: 'whatsapp',
          inviteToken: inviteToken ?? undefined,
        }),
        // Use keepalive so the request survives even if the tab navigates
        // away to wa.me (e.g. on mobile where wa.me redirects to the app).
        keepalive: true,
      });
    } catch {
      // Audit-log failure must NOT block the share.
    } finally {
      setIsSubmitting(false);
    }

    // Open WhatsApp in a new tab. On mobile, wa.me triggers the WhatsApp app
    // (or the WhatsApp Web install prompt). On desktop, it opens WhatsApp Web.
    if (typeof window !== 'undefined') {
      window.open(whatsappUrl, '_blank', 'noopener,noreferrer');
    }
  };

  const buttonVariant =
    variant === 'outline' || variant === 'ghost' ? 'ghost' : 'default';

  const buttonClassName =
    variant === 'outline'
      ? // Outline: glass-card + gold border (matches CtaSection's secondary CTA style).
        'glass-card gold-border text-foreground hover:bg-gold/10 font-display tracking-wide w-full sm:w-auto'
      : variant === 'ghost'
        ? // Ghost: transparent — gold text on hover-gold surface (admin sidebar
          // style). Caller typically overrides w-full + justify-start.
          'text-gold hover:text-gold hover:bg-gold/10 font-medium'
        : // Primary: gold gradient + shadow (matches the "Confirmer ma présence" CTA).
          'bg-gradient-gold text-white hover:opacity-90 shadow-xl shadow-gold/25 font-display tracking-wide w-full sm:w-auto';

  return (
    <Button
      type="button"
      variant={buttonVariant}
      size={size}
      onClick={handleShare}
      disabled={isSubmitting}
      aria-label={label}
      className={`${buttonClassName}${className ? ` ${className}` : ''}`}
    >
      <MessageCircle className="size-4" aria-hidden="true" />
      {label}
    </Button>
  );
}

export default WhatsAppShare;
