// ══════════════════════════════════════════════════════════════════════════════
// src/lib/motion/useMotionTier.ts
// Phase 3A (MISSION 5.9.0) — React hook for the motion tier system.
// ══════════════════════════════════════════════════════════════════════════════
//
// A small hook that exposes the current motion tier + config + the user's
// reduced-motion preference to React components. The tier is read once on
// mount (after hydration — `getMotionTier()` reads the DOM) and is intentionally
// NOT re-read on every render: identity-preset changes trigger a full navigation
// (the wedding page is server-rendered with the new identity), so a per-mount
// snapshot is sufficient and avoids layout thrash.
//
// The hook is SSR-safe: on the server it returns the `subtle` preset (matches
// the SSR fallback inside `getMotionTier()`). `reduced` defaults to `false`
// during SSR and is updated to the user's `prefers-reduced-motion` setting
// after hydration.
//
// Usage:
//   const { tier, config, reduced } = useMotionTier();
//   if (reduced || tier === 'none') return <Static />;
//   return <motion.div transition={{ duration: config.duration, ease: config.ease }} />;
// ══════════════════════════════════════════════════════════════════════════════

'use client';

import { useEffect, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import {
  MOTION_TIERS,
  getMotionTier,
  type MotionTier,
  type MotionTierConfig,
} from './tiers';

export interface UseMotionTierResult {
  /** Active motion tier (defaults to `'subtle'` on the server / before mount). */
  tier: MotionTier;
  /** Resolved config for the active tier (duration / stagger / ease / etc.). */
  config: MotionTierConfig;
  /** True when the user has `prefers-reduced-motion: reduce` set. */
  reduced: boolean;
}

/**
 * useMotionTier — read the active motion tier + config + reduced-motion flag.
 *
 * Returns a stable object shape; `tier` and `reduced` may change after the
 * first effect runs (post-hydration DOM read + framer-motion media-query
 * subscription). Components should branch on `reduced || tier === 'none'` to
 * decide whether to render an animated or static variant.
 */
export function useMotionTier(): UseMotionTierResult {
  const [tier, setTier] = useState<MotionTier>('subtle');
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    setTier(getMotionTier());
  }, []);

  return { tier, config: MOTION_TIERS[tier], reduced: reducedMotion ?? false };
}

export default useMotionTier;
