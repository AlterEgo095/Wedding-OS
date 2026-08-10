// ══════════════════════════════════════════════════════════════════════════════
// src/components/wedding/sections/CtaSection.tsx
// Phase 1E (MISSION 5.9.0) — Final call-to-action section.
// Phase 4D (MISSION 5.9.0 §20.6) — WhatsApp share button alongside existing CTAs.
// Phase 4 (MISSION 5.9.1 P4-1) — Primary CTA uses <LuxuryButton> (was <Button>).
// ══════════════════════════════════════════════════════════════════════════════
//
// Narrative beat #13 — FINAL CTA. A premium 3-action closing card:
//   1. "Partagez vos photos"   → anchor #galerie (Photo gallery)
//   2. "Laissez un message"    → anchor #guestbook (or #guestbook-section)
//   3. "Partager sur WhatsApp" → opens wa.me with pre-filled invite text (Phase 4D)
//   4. A thank-you message     → centered celebratory paragraph
//
// Styling: gold gradient backdrop, font-display heading, 3-button row that
// collapses to a vertical stack on mobile.
//
// Settings consumed:
//   - groom_name, bride_name     → personalized "Merci de {groom} & {bride}"
//   - welcome_message            → optional override for the thank-you line
//   - hashtag                    → optional hashtag chip at the bottom
//   - site_subtitle              → date display (passed to WhatsAppShare)
//   - venue_name, venue_city     → venue line (passed to WhatsAppShare)
//
// The first two buttons are pure anchor links — no JS handlers, no state —
// so the section is SSR-friendly and works without client hydration. The
// WhatsApp button (Phase 4D) is the only interactive element (a client-side
// fetch to /api/w/share-event + window.open to wa.me). If the referenced
// sections (#galerie / #guestbook) aren't in the manifest, the browser just
// doesn't scroll (no error).
//
// ─── Phase 4 (P4-1) — LuxuryButton wiring ─────────────────────────────────────
// The primary CTA ("Partagez vos photos") now uses the premium <LuxuryButton
// variant="gold-gradient" size="lg"> component (previously zero-import dead
// code per audit §20.4). LuxuryButton is a `<button>` element (not an anchor),
// so the in-page navigation to #galerie is handled by an onClick that calls
// `scrollIntoView({ behavior: 'smooth' })`. The original anchor-as-Button
// element is kept as a defensive fallback inside a small ErrorBoundary so
// any future runtime regression in LuxuryButton doesn't break the CTA —
// visitors still get a working "Partagez vos photos" button.
// ══════════════════════════════════════════════════════════════════════════════

'use client';

import { Component, useRef, useCallback, type ReactNode } from 'react';
import { motion, useInView, useReducedMotion } from 'framer-motion';
import { Camera, BookHeart, Sparkles, Heart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { WhatsAppShare } from '@/components/wedding/WhatsAppShare';
// Phase 4 (P4-1) — premium button variant (gold-gradient) replaces the
// ad-hoc bg-gradient-gold Button for the primary CTA. The barrel re-export
// resolves to @/components/premium/LuxuryButton.
import { LuxuryButton } from '@/components/premium';

export interface CtaSettings {
  groom_name?: string;
  bride_name?: string;
  welcome_message?: string;
  hashtag?: string;
  [key: string]: string | undefined;
}

export interface CtaSectionProps {
  /** Reserved for future props (e.g. section.props.ctaLabel override). */
  settings?: CtaSettings | null;
  /** Phase 4D — wedding slug, used by <WhatsAppShare> to build the share URL.
   *  Optional: when absent, the share button is not rendered (graceful
   *  degradation for any caller that pre-dates Phase 4D). */
  weddingSlug?: string;
  /** Phase 4D — encrypted invite token, only present when the guest is
   *  viewing via `?invite=xxx`. When set, the share URL becomes
   *  `/w/{slug}?invite={token}` so the recipient gets a personalized invite. */
  inviteToken?: string;
}

// ─── Phase 4 (P4-1) — Defensive ErrorBoundary for <LuxuryButton> ──────────────
// If LuxuryButton ever throws during render (bad prop, internal bug, future
// refactor regression), the boundary catches it and renders the original
// `<Button asChild><a href="#galerie">` element so the CTA stays functional.
// componentDidCatch is intentionally silent (no console.log — the project
// uses the existing logger elsewhere when surfacing client errors). The
// state machine is one-shot: once the boundary has fallen back, it stays
// in the fallback state until the parent remounts it (acceptable because
// the original CTA element is fully functional on its own).
interface LuxuryButtonBoundaryProps {
  fallback: ReactNode;
  children: ReactNode;
}
interface LuxuryButtonBoundaryState {
  failed: boolean;
}
class LuxuryButtonBoundary extends Component<
  LuxuryButtonBoundaryProps,
  LuxuryButtonBoundaryState
> {
  state: LuxuryButtonBoundaryState = { failed: false };

  static getDerivedStateFromError(): LuxuryButtonBoundaryState {
    return { failed: true };
  }

  componentDidCatch(): void {
    // Silent — the fallback is rendered automatically. No console.log
    // (per project conventions; the existing logger module is the channel
    // for surfaced client errors if/when one is added).
  }

  render(): ReactNode {
    if (this.state.failed) {
      return this.props.fallback;
    }
    return this.props.children;
  }
}

export default function CtaSection({
  settings,
  weddingSlug,
  inviteToken,
}: CtaSectionProps) {
  const sectionRef = useRef<HTMLElement>(null);
  const isInView = useInView(sectionRef, { once: true, margin: '-80px' });
  const prefersReducedMotion = useReducedMotion();

  const groomName = settings?.groom_name || '';
  const brideName = settings?.bride_name || '';
  const welcomeMessage = settings?.welcome_message || '';
  const hashtag = settings?.hashtag || '';
  // Phase 4D — date + venue for the WhatsApp message body.
  const dateDisplay = settings?.site_subtitle || '';
  const venueName = settings?.venue_name || '';
  const venueCity = settings?.venue_city || '';
  const venueLine = [venueName, venueCity].filter(Boolean).join(' • ');

  const coupleLabel = (groomName && brideName)
    ? `${groomName} & ${brideName}`
    : (groomName || brideName || 'des mariés');

  const thankYouLine = welcomeMessage ||
    'Merci d\'être à nos côtés pour ce jour unique. Chaque sourire, chaque mot, chaque présence compte à nos yeux.';

  const fadeUp = prefersReducedMotion
    ? { initial: { opacity: 1 }, animate: { opacity: 1 } }
    : {
        initial: { opacity: 0, y: 30 },
        animate: isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 30 },
      };

  // ─── Phase 4 (P4-1) — primary CTA onClick handler ────────────────────────
  // LuxuryButton is a `<button>` element (not an `<a>`), so the anchor-link
  // navigation to #galerie is replicated via scrollIntoView. This preserves
  // the visual + behavioural intent of the original `<a href="#galerie">`:
  // click → smooth-scroll to the gallery section. If #galerie isn't in the
  // DOM (gallery not in the manifest), the call is a no-op (matches the
  // anchor's "no-op if target missing" behaviour).
  const handlePrimaryCtaClick = useCallback(() => {
    if (typeof document === 'undefined') return;
    const target = document.getElementById('galerie');
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, []);

  // The original anchor-based primary CTA, kept as the ErrorBoundary fallback.
  // Rendered as a stable node so React doesn't rebuild it on every render
  // (matters for the boundary — once the fallback is shown, we want it to
  // stay mounted and interactive).
  const primaryCtaFallback = (
    <Button
      asChild
      size="lg"
      className="bg-gradient-gold text-white hover:opacity-90 shadow-lg shadow-gold/25 font-display tracking-wide h-12"
    >
      <a href="#galerie">
        <Camera className="size-4" />
        Partagez vos photos
      </a>
    </Button>
  );

  return (
    <section
      ref={sectionRef}
      id="cta"
      className="py-20 md:py-32 relative overflow-hidden"
      aria-labelledby="cta-title"
    >
      {/* Gold gradient backdrop with subtle radial highlight */}
      <div className="absolute inset-0 bg-gradient-to-br from-gold/8 via-rose-gold/5 to-gold/8" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,oklch(0.68_0.12_85/0.06),transparent_60%)]" />

      {/* Top ornamental divider */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-gold/40 to-transparent" />

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <motion.div
          {...fadeUp}
          transition={{ duration: 0.8 }}
          className="glass-card gold-border rounded-3xl p-10 md:p-16 text-center"
        >
          {/* Top flourish */}
          <div className="flex items-center justify-center gap-3 mb-8">
            <div className="w-16 sm:w-28 h-px bg-gradient-to-r from-transparent via-gold/60 to-transparent" />
            <Sparkles className="size-5 text-gold" />
            <div className="w-16 sm:w-28 h-px bg-gradient-to-r from-transparent via-gold/60 to-transparent" />
          </div>

          <h2 id="cta-title" className="font-serif text-3xl md:text-5xl lg:text-6xl font-bold mb-6">
            <span className="gold-gradient">Merci de {coupleLabel}</span>
          </h2>

          <p className="font-display text-base md:text-lg text-foreground/80 max-w-2xl mx-auto mb-12 leading-relaxed">
            {thankYouLine}
          </p>

          {/* 3-action row (collapses to vertical stack on mobile).
              Phase 4D — the WhatsApp share button joins the existing 2-button
              row, making it a 3-button grid on sm+ screens (the grid auto-
              wraps to 1 column on mobile thanks to `sm:grid-cols-2` — the
              third button takes the first column on the second row).

              Phase 4 (P4-1) — the primary CTA is now <LuxuryButton>
              (gold-gradient variant, size lg) wrapped in a defensive
              ErrorBoundary that falls back to the original anchor-based
              <Button> if LuxuryButton ever fails to render. The two secondary
              CTAs (Laissez un message + WhatsApp) are unchanged. */}
          <div className="grid sm:grid-cols-2 gap-4 max-w-2xl mx-auto mb-10">
            <LuxuryButtonBoundary fallback={primaryCtaFallback}>
              <LuxuryButton
                variant="gold-gradient"
                size="lg"
                icon={<Camera className="size-4" />}
                iconPosition="left"
                onClick={handlePrimaryCtaClick}
                className="shadow-lg shadow-gold/25 font-display tracking-wide"
              >
                Partagez vos photos
              </LuxuryButton>
            </LuxuryButtonBoundary>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="glass-card gold-border text-foreground hover:bg-gold/10 font-display tracking-wide h-12"
            >
              <a href="#guestbook">
                <BookHeart className="size-4" />
                Laissez un message
              </a>
            </Button>
            {weddingSlug && (
              <WhatsAppShare
                weddingSlug={weddingSlug}
                weddingNames={coupleLabel}
                weddingDate={dateDisplay || undefined}
                venue={venueLine || undefined}
                inviteToken={inviteToken}
                variant="primary"
                size="lg"
                // Span both columns on sm+ so the share button sits centered
                // under the 2-button row, matching the wedding hero CTA rhythm.
                className="sm:col-span-2"
              />
            )}
          </div>

          {/* Hashtag chip */}
          {hashtag && (
            <div className="flex items-center justify-center">
              <span className="inline-flex items-center gap-2 px-5 py-2 rounded-full glass-card gold-border font-display text-sm tracking-wide text-foreground/80">
                <Heart className="size-3.5 text-rose-gold/60" aria-hidden="true" />
                {hashtag}
              </span>
            </div>
          )}

          {/* Bottom flourish */}
          <div className="flex items-center justify-center gap-3 mt-10">
            <div className="w-16 sm:w-28 h-px bg-gradient-to-r from-transparent via-gold/40 to-transparent" />
            <span className="flourish text-sm text-gold/60">✦</span>
            <div className="w-16 sm:w-28 h-px bg-gradient-to-l from-transparent via-gold/40 to-transparent" />
          </div>
        </motion.div>
      </div>
    </section>
  );
}
