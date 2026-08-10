// ══════════════════════════════════════════════════════════════════════════════
// src/components/wedding/RsvpConfetti.tsx
// Phase 3D (MISSION 5.9.0) — Micro-interaction #5: RSVP confetti burst.
// ══════════════════════════════════════════════════════════════════════════════
//
// A burst of 30 gold particles that fires when an RSVP submission succeeds.
// Luxury-tier gating: ONLY renders when the wedding's `--motion-tier` CSS
// variable is `elegant` or `cinematic` (the "luxury" tiers). Subtle / none
// tiers get nothing (or a static "Merci !" text fallback under reduced
// motion).
//
// Lifecycle:
//   - Mounts when `trigger === true` (parent controls the trigger).
//   - Particles burst outward from centre, then fall (gravity), then fade.
//   - Auto-cleans after 3s via a parent-side state reset (the component
//     itself uses `AnimatePresence` so the exit is smooth — but the parent
//     should set `trigger` back to false after 3s so the component unmounts).
//
// Implementation notes:
//   - Uses framer-motion's `motion.div` per particle (30 particles = 30
//     motion nodes — fine for a one-shot 3s burst, not a sustained loop).
//   - Each particle gets a deterministic random angle + distance (seeded
//     by index so the burst is consistent across re-renders within the
//     same trigger).
//   - Particle colour is gold (var(--gold-light)) with a hint of rose-gold
//     on ~25% of particles for variety.
//   - Position: `fixed inset-0 pointer-events-none z-[100]` so the burst
//     overlays the entire viewport regardless of where the RSVP form sits
//     in the page. The burst origin is centred on the viewport (not the
//     form) — this is intentional: the visual focus should be the
//     celebration, not the form's coordinates.
//
// Accessibility:
//   - `prefers-reduced-motion: reduce` → renders NOTHING (no static fallback
//     text — the parent already shows a toast.success on RSVP, so the
//     confetti is purely decorative). Returns `null` so the DOM stays clean.
//   - `aria-hidden="true"` on the particle container (decorative, no
//     semantic value).
//   - Tier check: reads `--motion-tier` once on mount via `getMotionTier()`.
//     `subtle` and `none` tiers → return null. `elegant` / `cinematic` →
//     render the burst (with `elegant`'s shorter duration than `cinematic`).
// ══════════════════════════════════════════════════════════════════════════════

'use client';

import { useMemo } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import type { Easing } from 'framer-motion';
import { type MotionTier } from '@/lib/motion/tiers';
import { useMotionTier } from '@/lib/motion/useMotionTier';

export interface RsvpConfettiProps {
  /** When true AND luxury-tier AND not reduced-motion → render the burst. */
  trigger: boolean;
}

/** Luxury tiers — the only tiers where the confetti renders. */
const LUXURY_TIERS: ReadonlySet<MotionTier> = new Set<MotionTier>(['elegant', 'cinematic']);

/** Number of particles per burst. */
const PARTICLE_COUNT = 30;

interface Particle {
  /** Horizontal offset from centre at burst peak (vw units, -45..+45). */
  x: number;
  /** Vertical offset at peak (vh, -40..-10 — always upward initially). */
  y: number;
  /** Rotation in degrees during the fall. */
  rotate: number;
  /** Burst duration in seconds. */
  duration: number;
  /** Fall distance after the peak (vh, 40..80). */
  fallDistance: number;
  /** Particle colour — gold or rose-gold. */
  colour: string;
  /** Size in px. */
  size: number;
}

/**
 * Generate a deterministic-ish set of particles for the burst. Seeded by index
 * so the spread is consistent across re-renders within the same trigger
 * (avoids a "different burst every frame" jitter).
 */
function buildParticles(tier: MotionTier): Particle[] {
  // Use a simple LCG seeded by tier for reproducibility within a trigger.
  // (Math.random would also be fine — particles are decorative — but a
  // seeded generator avoids hydration mismatches if SSR ever renders this.)
  const seed = tier === 'cinematic' ? 1 : 2;
  let s = seed;
  const rand = () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };

  return Array.from({ length: PARTICLE_COUNT }, () => {
    const angle = rand() * Math.PI * 2; // full 360° spread
    const distance = 20 + rand() * 25; // 20..45 vh
    const isRoseGold = rand() < 0.25; // ~25% rose-gold accents
    return {
      x: Math.cos(angle) * distance,
      y: Math.sin(angle) * distance * 0.6 - 15, // bias upward
      rotate: (rand() - 0.5) * 720, // ±360° spin
      duration: 1.4 + rand() * 0.6, // 1.4..2.0s
      fallDistance: 40 + rand() * 40, // 40..80vh fall
      colour: isRoseGold ? 'var(--rose-gold)' : 'var(--gold-light)',
      size: 6 + rand() * 6, // 6..12px
    };
  });
}

export function RsvpConfetti({ trigger }: RsvpConfettiProps) {
  const prefersReducedMotion = useReducedMotion();
  // Read the active motion tier + config via the React hook (re-renders when
  // the tier changes — see useMotionTier.ts). `tier` and `config` are stable
  // for a given mount since identity-preset changes trigger a full navigation.
  // NOTE: hooks MUST be called before any early return (Rules of Hooks).
  // buildParticles is cheap (30 iterations of math) so calling it
  // unconditionally is fine — the early return below prevents rendering,
  // which is the expensive part.
  const { tier, config: motionCfg } = useMotionTier();
  const particles = useMemo(() => buildParticles(tier), [tier]);

  // Gate 1: reduced motion → no confetti (parent toast.success still fires).
  // Gate 2: tier must be a luxury tier (elegant / cinematic).
  if (prefersReducedMotion || !LUXURY_TIERS.has(tier)) return null;

  // The burst envelope duration — slightly longer than the longest particle
  // so all particles finish their fall before the component unmounts.
  const envelopeDuration = motionCfg.duration * 2 + 2.2; // ~3.6s elegant, ~4.2s cinematic

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-[100] overflow-hidden"
    >
      <AnimatePresence>
        {trigger && (
          <motion.div
            key="rsvp-confetti-burst"
            className="absolute inset-0"
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            {particles.map((p, i) => (
              <motion.span
                key={i}
                className="absolute left-1/2 top-1/2 rounded-full"
                style={{
                  width: p.size,
                  height: p.size,
                  backgroundColor: p.colour,
                  // Subtle inner glow so particles shimmer against any bg.
                  boxShadow: `0 0 ${p.size}px ${p.colour}`,
                  marginLeft: -p.size / 2,
                  marginTop: -p.size / 2,
                }}
                initial={{ x: 0, y: 0, opacity: 1, rotate: 0, scale: 0 }}
                animate={{
                  // Phase 1: burst outward + spin + grow.
                  // Phase 2: fall + fade.
                  x: [0, p.x, p.x * 0.6],
                  y: [0, p.y, p.y + p.fallDistance],
                  rotate: [0, p.rotate / 2, p.rotate],
                  scale: [0, 1, 0.6],
                  opacity: [1, 1, 0],
                }}
                transition={{
                  duration: p.duration,
                  ease: motionCfg.ease as Easing,
                  delay: 0,
                }}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
      {/* Auto-clean signal — the parent should set trigger=false after ~3s.
          This <style> is a no-op in terms of rendering; it's here only as a
          documentation marker. The parent (RsvpSection) owns the timeout. */}
      <span className="sr-only" aria-live="off" data-confetti-duration={envelopeDuration} />
    </div>
  );
}

export default RsvpConfetti;