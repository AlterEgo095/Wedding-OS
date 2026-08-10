// ══════════════════════════════════════════════════════════════════════════════
// src/components/premium/EditorialHero.tsx
// Phase 2D (MISSION 5.9.0) — Minimal editorial hero.
// ══════════════════════════════════════════════════════════════════════════════
//
// Replaces HeroSection on the `minimal-editorial` theme. Split layout:
//   - LEFT: large couple initials (e.g. "J&H") in ultra-thin display font
//   - DIVIDER: thin gold vertical line (w-px h-32 bg-gold/40)
//   - RIGHT: date / venue / welcome message in clean sans-serif
//
// Cream background, charcoal text, no background image. Subtle entrance:
// fade-in stagger (initials → divider → date → venue → welcome message).
//
// Accessibility:
//   - The couple initials are rendered in an `<h1>` (decorative-ish but
//     still the page's primary heading — screen readers should announce
//     the couple names; we add an `sr-only` long-form version too so
//     "J&H" is contextualised).
//   - All entrance animations are skipped when prefers-reduced-motion.
// ══════════════════════════════════════════════════════════════════════════════

'use client';

import { useReducedMotion, motion } from 'framer-motion';
import { cn } from '@/lib/utils';

export interface EditorialHeroProps {
  /** Groom first name (e.g. "Josué"). */
  groomName: string;
  /** Bride first name (e.g. "Hornella"). */
  brideName: string;
  /** Wedding date display, e.g. "26 juin 2026". */
  weddingDate?: string;
  /** Venue display, e.g. "Kinshasa". */
  venue?: string;
  /** Welcome message — short paragraph. */
  welcomeMessage?: string;
}

/** Derive the couple's monogram initials from first names. */
function buildInitials(groom: string, bride: string): string {
  const g = groom.trim().charAt(0).toUpperCase();
  const b = bride.trim().charAt(0).toUpperCase();
  if (!g && !b) return '';
  if (!g) return b;
  if (!b) return g;
  return `${g}&${b}`;
}

/**
 * EditorialHero — minimal split-layout hero for the minimal-editorial theme.
 *
 * @example
 *   <EditorialHero
 *     groomName="Josué"
 *     brideName="Hornella"
 *     weddingDate="26 juin 2026"
 *     venue="Kinshasa"
 *     welcomeMessage="Rejoignez-nous pour célébrer notre amour."
 *   />
 */
export function EditorialHero({
  groomName,
  brideName,
  weddingDate,
  venue,
  welcomeMessage,
}: EditorialHeroProps) {
  const prefersReducedMotion = useReducedMotion();
  const initials = buildInitials(groomName, brideName);
  const fullNames = `${groomName} & ${brideName}`.trim();

  // Shared transition for the staggered entrance.
  const fadeTransition = (delay: number) =>
    prefersReducedMotion
      ? { duration: 0 }
      : { duration: 0.8, delay, ease: [0.25, 0.46, 0.45, 0.94] as const };

  const initialHidden = prefersReducedMotion
    ? { opacity: 1 }
    : { opacity: 0 };

  return (
    <section
      id="accueil"
      className="relative min-h-screen w-full overflow-hidden bg-[var(--cream)] text-foreground"
      aria-label="Accueil"
    >
      <div className="mx-auto flex min-h-screen max-w-7xl flex-col items-center justify-center gap-10 px-6 py-20 md:flex-row md:gap-16 md:px-12">
        {/* ─── LEFT: Large initials ──────────────────────────────────────── */}
        <motion.div
          initial={initialHidden}
          animate={{ opacity: 1 }}
          transition={fadeTransition(0.1)}
          className="flex flex-1 items-center justify-center"
        >
          <h1
            className="font-display text-[8rem] font-thin leading-none tracking-tight text-foreground sm:text-[10rem] md:text-[12rem]"
            aria-label={fullNames}
          >
            {initials}
          </h1>
          {/* sr-only long-form so screen readers announce full names */}
          <span className="sr-only">{fullNames}</span>
        </motion.div>

        {/* ─── DIVIDER: Thin gold vertical line ──────────────────────────── */}
        <motion.div
          initial={initialHidden}
          animate={{ opacity: 1 }}
          transition={fadeTransition(0.3)}
          className="h-32 w-px bg-[var(--gold-light)]/40 md:h-64"
          aria-hidden="true"
        />

        {/* ─── RIGHT: Date / venue / welcome message ─────────────────────── */}
        <div className="flex flex-1 flex-col items-start gap-6">
          {/* Pre-title */}
          <motion.p
            initial={initialHidden}
            animate={{ opacity: 1 }}
            transition={fadeTransition(0.5)}
            className="font-display text-xs uppercase tracking-[0.35em] text-muted-foreground"
          >
            Nous nous marions
          </motion.p>

          {/* Couple names (full form, for the right column) */}
          <motion.h2
            initial={initialHidden}
            animate={{ opacity: 1 }}
            transition={fadeTransition(0.6)}
            className="font-serif text-3xl font-light text-foreground md:text-4xl"
          >
            {fullNames}
          </motion.h2>

          {/* Wedding date */}
          {weddingDate && (
            <motion.p
              initial={initialHidden}
              animate={{ opacity: 1 }}
              transition={fadeTransition(0.75)}
              className="font-display text-base tracking-wide text-foreground/80"
            >
              {weddingDate}
            </motion.p>
          )}

          {/* Venue */}
          {venue && (
            <motion.p
              initial={initialHidden}
              animate={{ opacity: 1 }}
              transition={fadeTransition(0.9)}
              className="font-display text-base text-muted-foreground"
            >
              {venue}
            </motion.p>
          )}

          {/* Welcome message */}
          {welcomeMessage && (
            <motion.p
              initial={initialHidden}
              animate={{ opacity: 1 }}
              transition={fadeTransition(1.05)}
              className="font-display max-w-md text-sm leading-relaxed text-foreground/70"
            >
              {welcomeMessage}
            </motion.p>
          )}

          {/* Bottom gold flourish */}
          <motion.div
            initial={initialHidden}
            animate={{ opacity: 1 }}
            transition={fadeTransition(1.2)}
            className={cn(
              'mt-2 h-px w-24 bg-[var(--gold-light)]/60',
            )}
            aria-hidden="true"
          />
        </div>
      </div>
    </section>
  );
}

export default EditorialHero;
