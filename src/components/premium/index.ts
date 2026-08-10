// ══════════════════════════════════════════════════════════════════════════════
// src/components/premium/index.ts
// Phase 2D (MISSION 5.9.0) — Barrel file for the premium components.
// Phase 4 (MISSION 5.9.1 P4-1) — Removed dead Lightbox + MagneticButton exports.
// ══════════════════════════════════════════════════════════════════════════════
//
// Re-exports the premium components for clean imports:
//
//   import { GlassCard, LuxuryButton, MotionReveal } from '@/components/premium';
//
// All components are `'use client'` (they use framer-motion). Next.js 16
// will code-split them per route automatically.
//
// Each component is exported under its named identifier (preferred) AND as
// a default-flavored alias (for consumers using the `import X from '…'`
// form). Types are re-exported via `export type` so they don't add to the
// client bundle.
//
// ─── Phase 4 (MISSION 5.9.1 P4-1) — dead-code cleanup ─────────────────────────
// Two premium components were removed because they were zero-import dead code:
//   - Lightbox.tsx       — the codebase uses ImmersiveGallery + LuxuryGallery
//                           which ship their own internal lightbox
//                           implementations (see LuxuryGallery.tsx).
//   - MagneticButton.tsx — experimental, never wired into any page.
// The files themselves are deleted (see DELETE.txt). If a future feature
// needs a single-image lightbox or a magnetic-hover button, restore from
// git history (`git show HEAD~N:src/components/premium/Lightbox.tsx`).
// ══════════════════════════════════════════════════════════════════════════════

export { GlassCard } from './GlassCard';
export type { GlassCardProps, GlassCardVariant, GlassCardAs } from './GlassCard';

export { LuxuryButton } from './LuxuryButton';
export type {
  LuxuryButtonProps,
  LuxuryButtonVariant,
  LuxuryButtonSize,
} from './LuxuryButton';

export { MotionReveal } from './MotionReveal';
export type { MotionRevealProps, RevealPreset } from './MotionReveal';

export { SectionTransition } from './SectionTransition';
export type { SectionTransitionProps, TransitionPreset } from './SectionTransition';

export { CinematicHero } from './CinematicHero';
export type { CinematicHeroProps } from './CinematicHero';

export { EditorialHero } from './EditorialHero';
export type { EditorialHeroProps } from './EditorialHero';

export { LuxuryCountdown } from './LuxuryCountdown';
export type { LuxuryCountdownProps, LuxuryCountdownSettings } from './LuxuryCountdown';

export { LuxuryGallery } from './LuxuryGallery';
export type {
  LuxuryGalleryProps,
  LuxuryGalleryImage,
  GalleryImageSpan,
} from './LuxuryGallery';

export { ImmersiveGallery } from './ImmersiveGallery';
export type {
  ImmersiveGalleryProps,
  ImmersiveGalleryImage,
} from './ImmersiveGallery';

export { AmbientBackground } from './AmbientBackground';
export type {
  AmbientBackgroundProps,
  AmbientVariant,
  AmbientIntensity,
} from './AmbientBackground';
