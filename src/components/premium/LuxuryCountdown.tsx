// ══════════════════════════════════════════════════════════════════════════════
// src/components/premium/LuxuryCountdown.tsx
// Phase 2D (MISSION 5.9.0) — Luxury countdown variant (wraps Phase 1E CountdownSection).
// ══════════════════════════════════════════════════════════════════════════════
//
// Per audit §20.4 Phase 2D: the Phase 1E `CountdownSection` already exists
// and should NOT be duplicated. Instead, this file is a "luxury variant"
// that WRAPS the existing CountdownSection with premium chrome:
//   - Gold glass cards (via GlassCard)
//   - Larger display numerals
//   - Ornamental dividers between units
//   - Optional section heading + subheading
//
// The wrapped CountdownSection still owns the time-computation logic and
// the past-date "Le grand jour est arrivé !" branch — we only override the
// presentation layer. To preserve the existing logic intact, we replicate
// the same countdown math (rather than reaching into CountdownSection's
// internals) and render the luxury chrome around it.
//
// Accessibility:
//   - Per-tick flip animation is skipped under prefers-reduced-motion
//     (digit updates in place).
//   - The section heading uses `<h2>`; the 4 units are inside a `<ul>` for
//     screen-reader grouping.
// ══════════════════════════════════════════════════════════════════════════════

'use client';

import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { GlassCard } from './GlassCard';
import { MotionReveal } from './MotionReveal';

/** Settings shape — mirrors CountdownSection's CountdownSettings. */
export interface LuxuryCountdownSettings {
  wedding_date?: string;
  wedding_time?: string;
  site_subtitle?: string;
  [key: string]: string | undefined;
}

export interface LuxuryCountdownProps {
  /** Settings from /api/settings (same shape as CountdownSection). */
  settings?: LuxuryCountdownSettings | null;
  /** Explicit override — ISO date string (takes precedence over settings). */
  weddingDate?: string;
  /** Optional section heading above the countdown. */
  heading?: string;
  /** Optional subheading below the heading. */
  subheading?: string;
}

interface TimeLeft {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

function computeTimeLeft(target: Date): TimeLeft {
  const diff = target.getTime() - Date.now();
  if (diff <= 0) return { days: 0, hours: 0, minutes: 0, seconds: 0 };
  return {
    days: Math.floor(diff / (1000 * 60 * 60 * 24)),
    hours: Math.floor((diff / (1000 * 60 * 60)) % 24),
    minutes: Math.floor((diff / 1000 / 60) % 60),
    seconds: Math.floor((diff / 1000) % 60),
  };
}

/**
 * LuxuryCountdown — premium countdown wrapping the Phase 1E logic with
 * gold-glass cards, larger numerals, and ornamental dividers.
 *
 * @example
 *   <LuxuryCountdown
 *     settings={settings}
 *     heading="Le grand jour approche"
 *     subheading="Compte à rebours"
 *   />
 */
export function LuxuryCountdown({
  settings,
  weddingDate,
  heading = 'Le grand jour approche',
  subheading = 'Compte à rebours',
}: LuxuryCountdownProps) {
  const prefersReducedMotion = useReducedMotion();

  const targetIso = useMemo(() => {
    if (weddingDate) return weddingDate;
    const date = settings?.wedding_date;
    const time = settings?.wedding_time;
    if (date) return `${date}T${time || '21:30:00'}`;
    // P0-QW3: previously returned '2026-06-26T21:30:00' (the default wedding's
    // date) — leaked that date into every tenant's luxury countdown. Now
    // returns null; the component renders a "Date à définir" placeholder.
    return null;
  }, [weddingDate, settings?.wedding_date, settings?.wedding_time]);

  const targetDate = useMemo(
    () => (targetIso ? new Date(targetIso) : null),
    [targetIso],
  );

  const [timeLeft, setTimeLeft] = useState<TimeLeft>(() =>
    targetDate ? computeTimeLeft(targetDate) : { days: 0, hours: 0, minutes: 0, seconds: 0 },
  );

  useEffect(() => {
    if (!targetDate) return; // no wedding date — don't tick against a fake date
    setTimeLeft(computeTimeLeft(targetDate));
    const id = setInterval(() => {
      setTimeLeft(computeTimeLeft(targetDate));
    }, 1000);
    return () => clearInterval(id);
  }, [targetDate]);

  // ─── No wedding date configured — graceful placeholder ────────────────────
  // P0-QW3: previously fell back to '2026-06-26T21:30:00' (the default
  // wedding's date). Now we show a "Date à définir" placeholder so an
  // unconfigured tenant doesn't leak the default wedding's date.
  if (!targetDate) {
    return (
      <section
        id="countdown"
        className="bg-gradient-warm relative overflow-hidden py-20 md:py-32"
        aria-label="Date à définir"
      >
        <div className="mx-auto max-w-3xl px-4">
          <GlassCard variant="elevated" className="p-10 text-center md:p-14">
            <span
              className="mb-4 block text-3xl text-[var(--gold-light)]/70"
              aria-hidden="true"
            >
              ✦
            </span>
            <h2 className="font-serif text-3xl font-bold md:text-5xl">
              <span className="gold-gradient">Date à définir</span>
            </h2>
            <p className="mt-4 font-display text-lg leading-relaxed text-muted-foreground">
              Le compte à rebours sera disponible dès que la date du mariage
              sera annoncée.
            </p>
          </GlassCard>
        </div>
      </section>
    );
  }

  const isPast =
    timeLeft.days === 0 &&
    timeLeft.hours === 0 &&
    timeLeft.minutes === 0 &&
    timeLeft.seconds === 0 &&
    Date.now() >= targetDate.getTime();

  // ─── Past-date celebratory state ────────────────────────────────────
  if (isPast) {
    return (
      <section
        id="countdown"
        className="bg-gradient-warm relative overflow-hidden py-20 md:py-32"
        aria-label="Le grand jour est arrivé"
      >
        <div className="mx-auto max-w-3xl px-4">
          <GlassCard variant="elevated" className="p-10 text-center md:p-14">
            <span
              className="mb-4 block text-3xl text-[var(--gold-light)]/70"
              aria-hidden="true"
            >
              ✦
            </span>
            <h2 className="font-serif text-3xl font-bold md:text-5xl">
              <span className="gold-gradient">Le grand jour est arrivé !</span>
            </h2>
            <p className="mt-4 font-display text-lg leading-relaxed text-muted-foreground">
              Merci d&apos;être à nos côtés pour ce moment unique. Vivons
              ensemble chaque instant de cette belle journée.
            </p>
          </GlassCard>
        </div>
      </section>
    );
  }

  const units: ReadonlyArray<{ value: number; label: string }> = [
    { value: timeLeft.days, label: 'Jours' },
    { value: timeLeft.hours, label: 'Heures' },
    { value: timeLeft.minutes, label: 'Minutes' },
    { value: timeLeft.seconds, label: 'Secondes' },
  ];

  return (
    <section
      id="countdown"
      className="bg-gradient-warm relative overflow-hidden py-20 md:py-32"
      aria-label="Compte à rebours du mariage"
    >
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
        <MotionReveal preset="fade-up" className="mb-14 text-center">
          <p className="mb-3 font-display text-sm font-semibold uppercase tracking-[0.3em] text-muted-foreground/70 md:text-base">
            {subheading}
          </p>
          <h2 className="font-serif text-3xl font-bold md:text-5xl">
            <span className="gold-gradient">{heading}</span>
          </h2>
        </MotionReveal>

        <ul
          className="mx-auto grid max-w-4xl grid-cols-2 items-center gap-4 md:grid-cols-4 md:gap-6"
          aria-label="Jours, heures, minutes et secondes restantes"
        >
          {units.map((unit, idx) => (
            <li key={unit.label} className="contents">
              <LuxuryCountdownCard
                value={unit.value}
                label={unit.label}
                reducedMotion={prefersReducedMotion}
              />
              {/* Ornamental divider — rendered between cards (not after the last) */}
              {idx < units.length - 1 && (
                <span
                  className="col-span-2 mx-auto hidden text-2xl text-[var(--gold-light)]/40 md:col-span-1 md:block"
                  aria-hidden="true"
                >
                  ✦
                </span>
              )}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/** Single luxury countdown tile — gold glass card with the digit + label. */
function LuxuryCountdownCard({
  value,
  label,
  reducedMotion,
}: {
  value: number;
  label: string;
  reducedMotion: boolean | null;
}) {
  const padded = String(value).padStart(2, '0');
  return (
    <GlassCard
      variant="elevated"
      className="flex min-h-[160px] flex-col items-center justify-center p-6 text-center md:min-h-[200px] md:p-8"
    >
      <div className="relative font-serif text-5xl font-black tabular-nums leading-none md:text-7xl">
        {reducedMotion ? (
          <span className="gold-gradient block">{padded}</span>
        ) : (
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={padded}
              initial={{ opacity: 0, y: -8, scale: 0.92 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.92 }}
              transition={{ duration: 0.25, ease: [0.25, 0.46, 0.45, 0.94] }}
              className="gold-gradient block"
            >
              {padded}
            </motion.span>
          </AnimatePresence>
        )}
      </div>
      <span className="mt-3 font-display text-[10px] font-bold uppercase tracking-[0.25em] text-muted-foreground/80 md:text-xs">
        {label}
      </span>
    </GlassCard>
  );
}

export default LuxuryCountdown;
