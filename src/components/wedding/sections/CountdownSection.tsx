// ══════════════════════════════════════════════════════════════════════════════
// src/components/wedding/sections/CountdownSection.tsx
// Phase 1E (MISSION 5.9.0) — Live countdown section.
// ══════════════════════════════════════════════════════════════════════════════
//
// Narrative beat #3 — COUNTDOWN. A standalone countdown to the wedding date
// (separate from the hero's inline countdown). 4 cards: Days / Hours /
// Minutes / Seconds, gold numerals on glass-card tiles.
//
// Date resolution order:
//   1. `weddingDate` prop (from section.props.weddingDate — explicit override)
//   2. settings.wedding_date + settings.wedding_time (canonical Settings keys,
//      defined in src/lib/constants.ts SETTING_KEYS)
//   3. fallback: null (no countdown). When no date is configured, the
//      section renders a "Date à définir" placeholder instead of counting
//      down to a fake date. P0-QW3: previously fell back to
//      '2026-06-26T21:30:00' (the default wedding's date), leaking that
//      date into every tenant's countdown.
//
// Reduced motion: framer-motion's `useReducedMotion()` disables the per-tick
// flip animation (AnimatePresence). When reduced motion is preferred, the
// digits update in place (no enter/exit transition). The 1-second interval
// still runs — only the visual transition is suppressed.
//
// Past-date handling: when the wedding date has already passed, the 4 cards
// collapse into a single "Le grand jour est arrivé !" celebratory banner so
// guests arriving late don't see a frozen 00:00:00.
// ══════════════════════════════════════════════════════════════════════════════

'use client';

import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';

/** Settings shape — accepts the canonical SETTING_KEYS date/time fields. */
export interface CountdownSettings {
  wedding_date?: string;
  wedding_time?: string;
  site_subtitle?: string;
  [key: string]: string | undefined;
}

export interface CountdownSectionProps {
  /** Settings from /api/settings (passed by SectionRenderer). */
  settings?: CountdownSettings | null;
  /** Explicit override — set via section.props.weddingDate (ISO string).
   *  Takes precedence over settings to let designers pin a specific date
   *  for a section without editing the wedding Settings table. */
  weddingDate?: string;
}

interface TimeLeft {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

/** Compute the remaining TimeLeft for a target date, or all-zeros if past. */
function computeTimeLeft(target: Date): TimeLeft {
  const now = Date.now();
  const diff = target.getTime() - now;
  if (diff <= 0) return { days: 0, hours: 0, minutes: 0, seconds: 0 };
  return {
    days: Math.floor(diff / (1000 * 60 * 60 * 24)),
    hours: Math.floor((diff / (1000 * 60 * 60)) % 24),
    minutes: Math.floor((diff / 1000 / 60) % 60),
    seconds: Math.floor((diff / 1000) % 60),
  };
}

export default function CountdownSection({
  settings,
  weddingDate,
}: CountdownSectionProps) {
  const prefersReducedMotion = useReducedMotion();

  // Build the ISO target string once per render cycle — useMemo so the
  // useEffect dependency array stays a list of simple primitives.
  // P0-QW3: when no wedding_date is configured, return null instead of the
  // previous '2026-06-26T21:30:00' fallback (the default wedding's date).
  // The component renders a "Date à définir" placeholder in that case.
  const targetIso = useMemo(() => {
    if (weddingDate) return weddingDate;
    const date = settings?.wedding_date;
    const time = settings?.wedding_time;
    if (date) return `${date}T${time || '21:30:00'}`;
    return null;
  }, [weddingDate, settings?.wedding_date, settings?.wedding_time]);

  const targetDate = useMemo(
    () => (targetIso ? new Date(targetIso) : null),
    [targetIso],
  );

  const [timeLeft, setTimeLeft] = useState<TimeLeft>(() =>
    targetDate ? computeTimeLeft(targetDate) : { days: 0, hours: 0, minutes: 0, seconds: 0 },
  );

  // Tick every 1000ms. The effect re-subscribes whenever the target date
  // changes (e.g. admin updates settings.wedding_date). When targetDate is
  // null (no wedding date configured), the effect no-ops — no ticking
  // against a fake date.
  useEffect(() => {
    if (!targetDate) return;
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
        className="py-20 md:py-32 bg-gradient-warm relative overflow-hidden"
        aria-label="Date à définir"
      >
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-gold/20 to-transparent" />
        <div className="max-w-3xl mx-auto px-4 text-center">
          <div className="glass-card gold-border rounded-2xl p-10 md:p-14">
            <span
              className="block mb-4 text-3xl text-gold/60"
              aria-hidden="true"
            >
              ✦
            </span>
            <h2 className="font-serif text-3xl md:text-5xl font-bold mb-4">
              <span className="gold-gradient">Date à définir</span>
            </h2>
            <p className="font-display text-lg text-muted-foreground max-w-xl mx-auto leading-relaxed">
              Le compte à rebours sera disponible dès que la date du mariage
              sera annoncée.
            </p>
          </div>
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

  // ─── Past-date celebratory state ────────────────────────────────────────
  if (isPast) {
    return (
      <section
        id="countdown"
        className="py-20 md:py-32 bg-gradient-warm relative overflow-hidden"
        aria-label="Le grand jour est arrivé"
      >
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-gold/20 to-transparent" />
        <div className="max-w-3xl mx-auto px-4 text-center">
          <div className="glass-card gold-border rounded-2xl p-10 md:p-14">
            <span
              className="block mb-4 text-3xl text-gold/60"
              aria-hidden="true"
            >
              ✦
            </span>
            <h2 className="font-serif text-3xl md:text-5xl font-bold mb-4">
              <span className="gold-gradient">Le grand jour est arrivé !</span>
            </h2>
            <p className="font-display text-lg text-muted-foreground max-w-xl mx-auto leading-relaxed">
              Merci d&apos;être à nos côtés pour ce moment unique. Vivons
              ensemble chaque instant de cette belle journée.
            </p>
          </div>
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
      className="py-20 md:py-32 bg-gradient-warm relative overflow-hidden"
      aria-label="Compte à rebours du mariage"
    >
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-gold/20 to-transparent" />

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={prefersReducedMotion ? { opacity: 1 } : { opacity: 0, y: 30 }}
          whileInView={prefersReducedMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8 }}
          className="text-center mb-14"
        >
          <p className="font-display text-sm md:text-base tracking-[0.3em] uppercase text-muted-foreground/70 font-semibold mb-3">
            Compte à rebours
          </p>
          <h2 className="font-serif text-3xl md:text-5xl font-bold">
            <span className="gold-gradient">Le grand jour approche</span>
          </h2>
        </motion.div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6 max-w-4xl mx-auto">
          {units.map((unit) => (
            <CountdownCard
              key={unit.label}
              value={unit.value}
              label={unit.label}
              reducedMotion={prefersReducedMotion}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

/** Single countdown tile — glass-card with the digit(s) and a label. */
function CountdownCard({
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
    <div className="glass-card gold-border rounded-2xl p-6 md:p-8 text-center flex flex-col items-center justify-center min-h-[140px] md:min-h-[180px]">
      {/* AnimatePresence flip — disabled when prefers-reduced-motion.
          When disabled, we render a plain <span> so the digit still
          updates every second without the enter/exit transition. */}
      <div className="relative font-serif text-4xl md:text-6xl font-black tabular-nums leading-none">
        {reducedMotion ? (
          <span className="gold-gradient">{padded}</span>
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
      <span className="mt-3 font-display text-[10px] md:text-xs tracking-[0.25em] uppercase text-muted-foreground/80 font-bold">
        {label}
      </span>
    </div>
  );
}
