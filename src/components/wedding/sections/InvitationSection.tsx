// ══════════════════════════════════════════════════════════════════════════════
// src/components/wedding/sections/InvitationSection.tsx
// Phase 1E (MISSION 5.9.0) — Formal invitation card with RSVP CTA.
// Phase 4D (MISSION 5.9.0 §20.6) — WhatsApp share button below the RSVP CTA.
// ══════════════════════════════════════════════════════════════════════════════
//
// Narrative beat #8 — INVITATION. A formal "Vous êtes invités au mariage de..."
// card. Renders couple names, date display, and venue summary, with a
// "Confirmer ma présence" CTA that scrolls to #rsvp (anchor link).
//
// Phase 4D — directly under the RSVP CTA, a secondary "Partager sur WhatsApp"
// button (rendered via <WhatsAppShare>). When the guest is viewing the page
// via `?invite=xxx`, the share URL includes the invite token so the recipient
// gets a personalized invitation. Otherwise, the share URL is the bare public
// URL `/w/{slug}`.
//
// Settings consumed:
//   - groom_name, bride_name           → "Vous êtes invités au mariage de X & Y"
//   - site_subtitle                    → date display string (e.g. "Vendredi 26 Juin 2026")
//   - venue_name, venue_city           → venue summary line
//   - welcome_message                  → optional secondary line (overrides default)
//
// The CTA is a soft anchor (no fetch, no state) — it just scrolls the page to
// #rsvp. If no RSVP section exists in the manifest, the link is a no-op
// (browsers won't error; the URL hash just doesn't match anything).
// ══════════════════════════════════════════════════════════════════════════════

'use client';

import { useRef } from 'react';
import { motion, useInView, useReducedMotion } from 'framer-motion';
import { MailOpen, Heart, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { WhatsAppShare } from '@/components/wedding/WhatsAppShare';

export interface InvitationSettings {
  groom_name?: string;
  bride_name?: string;
  site_subtitle?: string;
  venue_name?: string;
  venue_city?: string;
  welcome_message?: string;
  [key: string]: string | undefined;
}

export interface InvitationSectionProps {
  settings: InvitationSettings | null;
  /** Reserved for future loading skeletons (kept for interface symmetry). */
  loading?: boolean;
  /** Phase 4D — wedding slug, used by <WhatsAppShare> to build the share URL.
   *  Optional: when absent, the share button is not rendered (graceful
   *  degradation for any caller that pre-dates Phase 4D). */
  weddingSlug?: string;
  /** Phase 4D — encrypted invite token, only present when the guest is
   *  viewing via `?invite=xxx`. When set, the share URL becomes
   *  `/w/{slug}?invite={token}` so the recipient gets a personalized invite. */
  inviteToken?: string;
}

export default function InvitationSection({
  settings,
  weddingSlug,
  inviteToken,
}: InvitationSectionProps) {
  const sectionRef = useRef<HTMLElement>(null);
  const isInView = useInView(sectionRef, { once: true, margin: '-80px' });
  const prefersReducedMotion = useReducedMotion();

  const groomName = settings?.groom_name || '';
  const brideName = settings?.bride_name || '';
  const dateDisplay = settings?.site_subtitle || '';
  const venueName = settings?.venue_name || '';
  const venueCity = settings?.venue_city || '';
  const welcomeMessage = settings?.welcome_message || '';

  const coupleLabel = (groomName && brideName)
    ? `${groomName} & ${brideName}`
    : (groomName || brideName || 'Notre mariage');

  const venueLine = [venueName, venueCity].filter(Boolean).join(' • ');

  const fadeUp = prefersReducedMotion
    ? { initial: { opacity: 1 }, animate: { opacity: 1 } }
    : {
        initial: { opacity: 0, y: 30 },
        animate: isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 30 },
      };

  return (
    <section
      ref={sectionRef}
      id="invitation"
      className="py-20 md:py-32 relative overflow-hidden"
      aria-labelledby="invitation-title"
    >
      {/* Soft champagne gradient backdrop */}
      <div className="absolute inset-0 bg-gradient-to-br from-background via-champagne/5 to-background" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,oklch(0.68_0.12_85/0.04),transparent_60%)]" />

      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <motion.div
          {...fadeUp}
          transition={{ duration: 0.8 }}
        >
          <div className="glass-card gold-border rounded-2xl p-10 md:p-16 text-center">
            {/* Top ornament + envelope icon */}
            <div className="flex items-center justify-center gap-3 mb-8">
              <div className="w-12 sm:w-24 h-px bg-gradient-to-r from-transparent to-gold/60" />
              <MailOpen className="size-6 text-gold" />
              <div className="w-12 sm:w-24 h-px bg-gradient-to-l from-transparent to-gold/60" />
            </div>

            <p className="font-display text-sm md:text-base tracking-[0.3em] uppercase text-muted-foreground/80 font-semibold mb-6">
              Vous êtes invités
            </p>

            <h2
              id="invitation-title"
              className="font-serif text-3xl md:text-5xl lg:text-6xl font-bold mb-3 leading-tight"
            >
              <span className="gold-gradient">Au mariage de</span>
            </h2>

            <p className="font-serif text-3xl md:text-5xl lg:text-6xl font-bold mb-8">
              <span className="gold-gradient">{coupleLabel}</span>
            </p>

            {/* Date display */}
            {dateDisplay && (
              <div className="mb-6">
                <div className="flex items-center justify-center gap-3 mb-2">
                  <div className="w-10 h-px bg-gradient-to-r from-transparent to-gold/50" />
                  <span className="flourish text-xs">❧</span>
                  <div className="w-10 h-px bg-gradient-to-l from-transparent to-gold/50" />
                </div>
                <p className="font-display text-lg md:text-2xl tracking-[0.15em] text-foreground/85 font-semibold">
                  {dateDisplay}
                </p>
              </div>
            )}

            {/* Venue summary */}
            {venueLine && (
              <p className="font-display text-sm md:text-base text-muted-foreground/85 max-w-xl mx-auto mb-6">
                {venueLine}
              </p>
            )}

            {/* Optional welcome message */}
            {welcomeMessage && (
              <p className="font-serif text-base md:text-lg text-foreground/80 italic max-w-xl mx-auto mb-8 leading-relaxed">
                &laquo; {welcomeMessage} &raquo;
              </p>
            )}

            {/* CTA — anchor scroll to #rsvp */}
            <div className="mt-10">
              <Button
                asChild
                size="lg"
                className="bg-gradient-gold text-white hover:opacity-90 shadow-xl shadow-gold/25 font-display tracking-wide h-12 px-8"
              >
                <a href="#rsvp">
                  <Heart className="size-4" />
                  Confirmer ma présence
                  <ChevronDown className="size-4 opacity-70" />
                </a>
              </Button>
            </div>

            {/* Phase 4D — WhatsApp share button below the RSVP CTA.
                Renders only when weddingSlug is provided (the public page
                always passes it via SectionRenderer's extras). The button is
                full-width on mobile (matches the parent CTA stack),
                auto-width on >=sm screens. The outline variant keeps it as a
                secondary action — the primary CTA remains "Confirmer ma
                présence" so guests prioritize RSVPing before sharing. */}
            {weddingSlug && (
              <div className="mt-4 flex justify-center">
                <WhatsAppShare
                  weddingSlug={weddingSlug}
                  weddingNames={coupleLabel}
                  weddingDate={dateDisplay || undefined}
                  venue={venueLine || undefined}
                  inviteToken={inviteToken}
                  variant="outline"
                  size="lg"
                />
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </section>
  );
}
