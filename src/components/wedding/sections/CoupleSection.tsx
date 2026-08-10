// ══════════════════════════════════════════════════════════════════════════════
// src/components/wedding/sections/CoupleSection.tsx
// Phase 1E (MISSION 5.9.0) — Couple spotlight section.
// ══════════════════════════════════════════════════════════════════════════════
//
// Narrative beat #2 — COUPLE. Renders a centered spotlight of the bride and
// groom: gold initials medallions, couple photos (settings-driven), and names
// in font-display. Pairs with the Hero (which already shows couple photos)
// but is intentionally richer on biographical detail: this is where couples
// would add a short "meet the couple" bio when the hero is photo-only.
//
// Settings consumed (all optional, fail-safe to empty state):
//   - groom_name, bride_name           → display names + initials
//   - couple_photo_1, couple_photo_2   → optional photos (groom / bride)
//   - welcome_message                  → optional sub-heading
//   - hashtag                          → optional hashtag chip
//
// Multi-tenant safety: every field defaults to empty so an unconfigured
// wedding renders the graceful empty-state card instead of leaking the
// default-wedding couple's identity (Phase 1E audit §20.3 — no first-paint
// asset leak allowed).
//
// Reduced motion: respects prefers-reduced-motion via framer-motion's
// `useReducedMotion()` hook — animations are disabled when the user opts out.
// ══════════════════════════════════════════════════════════════════════════════

'use client';

import { useRef } from 'react';
import Image from 'next/image';
import { motion, useInView, useReducedMotion } from 'framer-motion';
import { Heart, Sparkles } from 'lucide-react';
import { MotionReveal } from '@/components/premium/MotionReveal';

/** Shared venue-settings shape (mirror of SectionRendererData.settings). */
export interface CoupleSettings {
  groom_name?: string;
  bride_name?: string;
  couple_photo_1?: string;
  couple_photo_2?: string;
  welcome_message?: string;
  hashtag?: string;
  [key: string]: string | undefined;
}

export interface CoupleSectionProps {
  settings: CoupleSettings | null;
  /** Reserved for future loading skeletons. Currently unused — kept for
   *  interface symmetry with MapSection/EventTimeline. */
  loading?: boolean;
}

/** Build a single uppercase initial from a name. Returns empty string when
 *  the input is empty/whitespace so we never render a stray "?" medallion. */
function initialOf(name: string): string {
  const trimmed = (name || '').trim();
  if (!trimmed) return '';
  return trimmed.charAt(0).toUpperCase();
}

export default function CoupleSection({ settings }: CoupleSectionProps) {
  const sectionRef = useRef<HTMLElement>(null);
  const isInView = useInView(sectionRef, { once: true, margin: '-80px' });
  const prefersReducedMotion = useReducedMotion();

  const groomName = settings?.groom_name || '';
  const brideName = settings?.bride_name || '';
  const groomPhoto = settings?.couple_photo_1 || '';
  const bridePhoto = settings?.couple_photo_2 || '';
  const welcomeMessage = settings?.welcome_message || '';
  const hashtag = settings?.hashtag || '';

  const groomInitial = initialOf(groomName);
  const brideInitial = initialOf(brideName);
  const hasCouple = Boolean(groomName || brideName);

  // ─── Empty state — no couple data configured ────────────────────────────
  // Mirrors the pattern used by SectionRenderer's `story` empty state
  // (decorative ornament + muted explanation) so an unconfigured wedding
  // degrades gracefully instead of showing an empty shell.
  if (!hasCouple) {
    return (
      <section
        ref={sectionRef}
        id="couple"
        className="py-20 md:py-28 text-center"
        aria-label="Le couple — informations à venir"
      >
        <div className="max-w-xl mx-auto px-4">
          <span
            className="block mb-4 text-2xl text-muted-foreground/60"
            aria-hidden="true"
          >
            ✦
          </span>
          <p className="font-serif text-xl text-muted-foreground mb-1">
            Le couple sera bientôt présenté
          </p>
          <p className="font-display text-sm text-muted-foreground/70">
            Les mariés n&apos;ont pas encore partagé leur présentation.
          </p>
        </div>
      </section>
    );
  }

  // Animation variants — disabled (opacity-only) when prefers-reduced-motion.
  const fadeUp = prefersReducedMotion
    ? { initial: { opacity: 1 }, animate: { opacity: 1 } }
    : {
        initial: { opacity: 0, y: 30 },
        animate: isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 30 },
      };

  return (
    <section
      ref={sectionRef}
      id="couple"
      className="py-20 md:py-32 bg-gradient-warm relative overflow-hidden"
      aria-labelledby="couple-title"
    >
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-gold/20 to-transparent" />

      <MotionReveal preset="fade-up" className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* ─── Heading ─── */}
        <motion.div
          {...fadeUp}
          transition={{ duration: 0.8 }}
          className="text-center mb-16"
        >
          <h2 id="couple-title" className="font-serif text-3xl md:text-5xl font-bold mb-4">
            <span className="gold-gradient">Les Mariés</span>
          </h2>
          {welcomeMessage ? (
            <p className="font-display text-lg text-muted-foreground max-w-xl mx-auto leading-relaxed">
              {welcomeMessage}
            </p>
          ) : (
            <p className="font-display text-lg text-muted-foreground max-w-xl mx-auto">
              Deux chemins qui n&apos;en font plus qu&apos;un
            </p>
          )}
          <div className="section-divider max-w-xs mx-auto mt-6">
            <Heart className="size-4 text-gold/40" />
          </div>
        </motion.div>

        {/* ─── Couple cards ─── */}
        <div className="grid md:grid-cols-[1fr_auto_1fr] gap-8 md:gap-6 items-center max-w-4xl mx-auto">
          {/* Groom */}
          <motion.div
            {...fadeUp}
            transition={{ duration: 0.8, delay: 0.15 }}
            className="flex flex-col items-center text-center"
          >
            <CouplePortrait
              photo={groomPhoto}
              initial={groomInitial}
              accent="gold"
            />
            {groomName && (
              <h3 className="mt-6 font-serif text-2xl md:text-3xl font-bold gold-gradient">
                {groomName}
              </h3>
            )}
            <p className="mt-1 font-display text-xs tracking-[0.25em] uppercase text-muted-foreground/70">
              Le Marié
            </p>
          </motion.div>

          {/* Center ampersand medallion */}
          <motion.div
            {...fadeUp}
            transition={{ duration: 0.8, delay: 0.3 }}
            className="flex flex-col items-center justify-center"
          >
            <div className="relative w-16 h-16 md:w-20 md:h-20 rounded-full bg-gradient-to-br from-gold via-gold-light to-rose-gold flex items-center justify-center shadow-[0_0_30px_oklch(0.68_0.12_85/30%)]">
              <span className="font-serif text-2xl md:text-3xl font-bold text-white">
                &
              </span>
              <Sparkles
                className="absolute -top-1 -right-1 size-3.5 text-gold-light/70"
                aria-hidden="true"
              />
            </div>
          </motion.div>

          {/* Bride */}
          <motion.div
            {...fadeUp}
            transition={{ duration: 0.8, delay: 0.45 }}
            className="flex flex-col items-center text-center"
          >
            <CouplePortrait
              photo={bridePhoto}
              initial={brideInitial}
              accent="rose"
            />
            {brideName && (
              <h3 className="mt-6 font-serif text-2xl md:text-3xl font-bold gold-gradient">
                {brideName}
              </h3>
            )}
            <p className="mt-1 font-display text-xs tracking-[0.25em] uppercase text-muted-foreground/70">
              La Mariée
            </p>
          </motion.div>
        </div>

        {/* ─── Optional hashtag chip ─── */}
        {hashtag && (
          <motion.div
            {...fadeUp}
            transition={{ duration: 0.8, delay: 0.6 }}
            className="mt-14 text-center"
          >
            <span className="inline-flex items-center gap-2 px-5 py-2 rounded-full glass-card gold-border font-display text-sm tracking-wide text-foreground/80">
              <Sparkles className="size-3.5 text-gold/60" aria-hidden="true" />
              {hashtag}
            </span>
          </motion.div>
        )}
      </MotionReveal>
    </section>
  );
}

/** Internal portrait sub-component — renders either the configured photo or
 *  a gold-initial medallion fallback (so an unconfigured wedding still looks
 *  intentional, not broken). */
function CouplePortrait({
  photo,
  initial,
  accent,
}: {
  photo: string;
  initial: string;
  accent: 'gold' | 'rose';
}) {
  const ringGradient =
    accent === 'gold'
      ? 'from-gold via-gold-light to-rose-gold'
      : 'from-rose-gold via-gold-light to-gold';

  return (
    <div className="relative w-36 h-36 md:w-44 md:h-44">
      {/* Outer gold ring */}
      <div
        className={`absolute -inset-2 rounded-full bg-gradient-to-br ${ringGradient} p-[2.5px]`}
        aria-hidden="true"
      >
        <div className="w-full h-full rounded-full bg-black/30" />
      </div>

      <div className="relative w-full h-full rounded-full overflow-hidden border-[3px] border-gold/30 shadow-[0_0_40px_rgba(0,0,0,0.4),0_0_20px_oklch(0.68_0.12_85/15%)] bg-gradient-warm flex items-center justify-center">
        {photo ? (
          <Image
            src={photo}
            alt={initial ? `Photo — ${initial}` : 'Photo du couple'}
            fill
            className="object-cover object-top"
            sizes="(max-width: 768px) 144px, 176px"
          />
        ) : (
          <span className="font-serif text-5xl md:text-6xl font-bold gold-gradient">
            {initial || '✦'}
          </span>
        )}
      </div>
    </div>
  );
}
