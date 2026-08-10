// ══════════════════════════════════════════════════════════════════════════════
// src/components/premium/AmbientBackground.tsx
// Phase 2D (MISSION 5.9.0) — Consolidated ambient visual effects.
// ══════════════════════════════════════════════════════════════════════════════
//
// Consolidates VisualEffectsLayer + LuxuryVisualEngine into a single,
// token-driven component. Renders three ambient layers based on the
// `variant` prop:
//
//   - particles: floating gold dots (15-30 particles, slow drift).
//                Color: var(--theme-primary).
//                Drift animation disabled under prefers-reduced-motion
//                (static dots remain).
//   - glow:      radial gradient from var(--theme-ambiance), positioned
//                top-center, 40% opacity.
//   - pattern:   var(--theme-pattern) URL as a body::before-style overlay
//                at 5% opacity (e.g. Botanical Romance leaf pattern).
//   - all:       all three layered.
//
// The `--motion-tier` token (subtle | elegant | cinematic | none) controls
// particle drift speed:
//   - subtle:    slow drift (25s loops)
//   - elegant:   medium drift (18s loops)
//   - cinematic: fast drift (12s loops)
//   - none:      no animation (static dots, even without reduced-motion)
//
// Accessibility:
//   - The entire overlay is `aria-hidden="true"` and `pointer-events-none`
//     — it never intercepts clicks or screen-reader focus.
//   - Particle drift is suppressed when prefers-reduced-motion is set,
//     regardless of --motion-tier.
// ══════════════════════════════════════════════════════════════════════════════

'use client';

import { useMemo, useState, useEffect } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';

export type AmbientVariant = 'particles' | 'glow' | 'pattern' | 'all';
export type AmbientIntensity = 'subtle' | 'normal' | 'dramatic';

export interface AmbientBackgroundProps {
  /** Which ambient layer(s) to render. */
  variant?: AmbientVariant;
  /** Visual intensity (particle count + glow opacity multiplier). */
  intensity?: AmbientIntensity;
  /** Extra Tailwind classes on the overlay. */
  className?: string;
}

interface Particle {
  id: number;
  leftPct: number;
  topPct: number;
  size: number;
  duration: number;
  delay: number;
  drift: number;
}

/** Motion-tier → base duration (seconds) for drift loops. */
const MOTION_TIER_DURATION: Record<string, number> = {
  subtle: 25,
  elegant: 18,
  cinematic: 12,
  none: 0, // 0 means "no animation"
};

/** Intensity → particle count + glow opacity. */
const INTENSITY_CONFIG: Record<AmbientIntensity, { count: number; glowOpacity: number }> = {
  subtle: { count: 15, glowOpacity: 0.25 },
  normal: { count: 22, glowOpacity: 0.4 },
  dramatic: { count: 30, glowOpacity: 0.55 },
};

/**
 * AmbientBackground — token-driven ambient visual effects overlay.
 *
 * Reads `--theme-primary`, `--theme-ambiance`, `--theme-pattern`, and
 * `--motion-tier` from the document root to drive colors and motion.
 *
 * @example
 *   <AmbientBackground variant="all" intensity="normal" />
 */
export function AmbientBackground({
  variant = 'all',
  intensity = 'normal',
  className,
}: AmbientBackgroundProps) {
  const prefersReducedMotion = useReducedMotion();
  const [mounted, setMounted] = useState(false);
  const [motionTier, setMotionTier] = useState<string>('subtle');

  // Mount guard — render nothing on SSR pass to avoid hydration mismatch.
  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  // Read --motion-tier from :root (set by WeddingThemeInjector).
  useEffect(() => {
    if (!mounted) return;
    try {
      const value = getComputedStyle(document.documentElement)
        .getPropertyValue('--motion-tier')
        .trim() || 'subtle';
      setMotionTier(value);
    } catch {
      // Defensive: getComputedStyle is universally available, but we
      // silently fall back to 'subtle' if not.
      setMotionTier('subtle');
    }
  }, [mounted]);

  // Build particle list — stable per mount via useMemo.
  const { count, glowOpacity } = INTENSITY_CONFIG[intensity];
  const particles = useMemo<Particle[]>(() => {
    return Array.from({ length: count }, (_, i) => ({
      id: i,
      leftPct: Math.random() * 100,
      topPct: Math.random() * 100,
      size: 1 + Math.floor(Math.random() * 3),
      duration: 0,
      delay: 0,
      drift: 20 + Math.floor(Math.random() * 30),
    }));
  }, [count]);

  if (!mounted) return null;

  const showParticles = variant === 'particles' || variant === 'all';
  const showGlow = variant === 'glow' || variant === 'all';
  const showPattern = variant === 'pattern' || variant === 'all';

  const baseDuration = MOTION_TIER_DURATION[motionTier] ?? MOTION_TIER_DURATION.subtle;
  const animateParticles =
    !prefersReducedMotion && baseDuration > 0;

  return (
    <div
      className={cn(
        'pointer-events-none fixed inset-0 z-0 overflow-hidden',
        className,
      )}
      aria-hidden="true"
    >
      {/* ─── Glow layer ──────────────────────────────────────────────── */}
      {showGlow && (
        <div
          className="absolute inset-0"
          style={{
            background:
              'radial-gradient(ellipse at 50% 0%, var(--theme-ambiance, oklch(0.68 0.12 85 / 0.04)), transparent 70%)',
            opacity: glowOpacity,
          }}
        />
      )}

      {/* ─── Pattern layer ───────────────────────────────────────────── */}
      {showPattern && (
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: 'var(--theme-pattern, none)',
            backgroundRepeat: 'repeat',
            opacity: 0.05,
          }}
        />
      )}

      {/* ─── Particles layer ─────────────────────────────────────────── */}
      {showParticles && (
        <div className="absolute inset-0">
          {particles.map((p) => {
            // Static fallback when animation is disabled.
            if (!animateParticles) {
              return (
                <span
                  key={p.id}
                  className="absolute rounded-full"
                  style={{
                    left: `${p.leftPct}%`,
                    top: `${p.topPct}%`,
                    width: p.size,
                    height: p.size,
                    background: 'var(--theme-primary, oklch(0.68 0.12 85))',
                    opacity: 0.5,
                  }}
                />
              );
            }

            const dur = baseDuration + (p.id % 5);
            return (
              <motion.span
                key={p.id}
                className="absolute rounded-full"
                style={{
                  left: `${p.leftPct}%`,
                  top: `${p.topPct}%`,
                  width: p.size,
                  height: p.size,
                  background: 'var(--theme-primary, oklch(0.68 0.12 85))',
                }}
                animate={{
                  y: [-p.drift, p.drift, -p.drift],
                  opacity: [0.2, 0.6, 0.2],
                }}
                transition={{
                  duration: dur,
                  repeat: Infinity,
                  ease: 'easeInOut',
                  delay: (p.id % 7) * 0.5,
                }}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

export default AmbientBackground;
