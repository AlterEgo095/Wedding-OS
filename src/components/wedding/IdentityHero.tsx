// ══════════════════════════════════════════════════════════════════════════════
// src/components/wedding/IdentityHero.tsx
// Phase 2E (MISSION 5.9.0 §20.4) — Smart hero dispatcher per wedding identity.
// ══════════════════════════════════════════════════════════════════════════════
//
// Replaces the direct <HeroSection /> call in SectionRenderer when the wedding
// has opted into one of the 5 identity presets (themeConfig.identity). The
// dispatcher reads the identity's hero override (CinematicHero / EditorialHero
// / HeroSection) and renders the matching premium component.
//
// Backward compatibility: if no `identity` prop is passed (or the identity
// has no hero override), IdentityHero renders the default <HeroSection />.
// Existing weddings with no `identity` field in their themeConfig keep their
// current rendering — zero silent visual change.
//
// Reduced motion: all premium variants already respect prefers-reduced-motion
// (Phase 2D — verified). IdentityHero itself adds no animation layer, so the
// reduced-motion contract is preserved end-to-end.
//
// Data flow:
//   - For the default <HeroSection /> path: HeroSection fetches its own data
//     from /api/settings (unchanged behaviour).
//   - For the premium variants path: the caller MUST pass explicit data props
//     (coupleNames, groomName, brideName, …) — the premium components don't
//     fetch anything themselves. The wedding page integration (Phase 4A
//     Preview Lab) will pass these from the resolved wedding settings; the
//     showcase preview page passes placeholder demo data.
// ══════════════════════════════════════════════════════════════════════════════

'use client';

import { useMemo } from 'react';
import HeroSection from '@/components/HeroSection';
import { CinematicHero } from '@/components/premium/CinematicHero';
import { EditorialHero } from '@/components/premium/EditorialHero';
import {
  getIdentityPreset,
  getSectionOverride,
  isWeddingIdentity,
  type WeddingIdentity,
} from '@/lib/themes/identity-presets';

/**
 * Props for IdentityHero. Mirrors HeroSection's (empty) prop signature and
 * adds an optional `identity` override plus the data fields needed by the
 * premium hero variants.
 *
 * All data props are optional — they're only consumed when `identity` resolves
 * to a hero override that needs them. Callers that don't opt into an identity
 * can render <IdentityHero /> with no props at all (backward compatible with
 * the existing <HeroSection /> call sites).
 */
export interface IdentityHeroProps {
  /**
   * Wedding identity to dispatch on. Accepts:
   *   - a valid WeddingIdentity ('royal-luxury' | …) → dispatches to the
   *     identity's hero override if defined
   *   - undefined / null / '' → falls back to <HeroSection />
   *   - any other string → falls back to <HeroSection /> (defensive — logs a
   *     console.warn so misconfigured themeConfig.identity values are visible
   *     during development without crashing the page)
   */
  identity?: WeddingIdentity | string | null;

  // ─── Premium variant data (only consumed when identity has a hero override) ───

  /** Couple names display, e.g. "Josué & Hornella". CinematicHero only. */
  coupleNames?: string;
  /** Groom first name. EditorialHero only. */
  groomName?: string;
  /** Bride first name. EditorialHero only. */
  brideName?: string;
  /** Wedding date display, e.g. "26 juin 2026". Both premium variants. */
  weddingDate?: string;
  /** Venue display, e.g. "Kinshasa". Both premium variants. */
  venue?: string;
  /** Background image URL (root-relative or absolute). CinematicHero only. */
  backgroundImage?: string;
  /** Hashtag, e.g. "#JosuéEtHornella". CinematicHero only. */
  hashtag?: string;
  /** Welcome message — short paragraph. EditorialHero only. */
  welcomeMessage?: string;
}

/**
 * IdentityHero — smart hero dispatcher per wedding identity.
 *
 * @example Backward-compatible (no identity → default HeroSection):
 *   <IdentityHero />
 *
 * @example Royal Luxury identity with explicit data:
 *   <IdentityHero
 *     identity="royal-luxury"
 *     coupleNames="Josué & Hornella"
 *     weddingDate="26 juin 2026"
 *     venue="Kinshasa"
 *     backgroundImage="/photos/couple-bridge.jpeg"
 *     hashtag="#JosuéEtHornella"
 *   />
 *
 * @example Minimal Editorial identity:
 *   <IdentityHero
 *     identity="minimal-editorial"
 *     groomName="Josué"
 *     brideName="Hornella"
 *     weddingDate="26 juin 2026"
 *     venue="Kinshasa"
 *     welcomeMessage="Rejoignez-nous pour célébrer notre amour."
 *   />
 */
export function IdentityHero({
  identity,
  coupleNames,
  groomName,
  brideName,
  weddingDate,
  venue,
  backgroundImage,
  hashtag,
  welcomeMessage,
}: IdentityHeroProps): React.ReactNode {
  // ─── Resolve the identity preset (defensive against bad themeConfig values) ────
  const heroComponent = useMemo<React.ReactNode>(() => {
    // No identity → default HeroSection (backward compat).
    if (!identity) return null;
    // Validate the identity string against the known set.
    if (!isWeddingIdentity(identity)) {
      if (process.env.NODE_ENV !== 'production') {
        // eslint-disable-next-line no-console
        console.warn(
          `[IdentityHero] Identité inconnue "${identity}" — retour au HeroSection par défaut. ` +
            `Identités valides: royal-luxury, minimal-editorial, botanical-romance, cinematic-dark, modern-champagne.`,
        );
      }
      return null;
    }
    const preset = getIdentityPreset(identity);
    if (!preset) return null; // defensive — isWeddingIdentity already guarantees this
    const override = getSectionOverride(preset, 'hero');
    if (!override) return null; // identity exists but has no hero override → HeroSection
    return override;
  }, [identity]);

  // ─── No identity or no hero override → default HeroSection ────────────────────
  if (!heroComponent) {
    return <HeroSection />;
  }

  // ─── Dispatch to the premium variant ──────────────────────────────────────────
  // HeroComponent is a string literal union ('CinematicHero' | 'EditorialHero'),
  // narrowed by the getSectionOverride return type.
  if (heroComponent === 'CinematicHero') {
    // P0-QW3: previously fell back to '/couple-hero.jpeg' — leaked the default
    // wedding's photo into every tenant using the cinematic-dark identity.
    // Now we pass null and let CinematicHero render a CSS gradient placeholder.
    return (
      <CinematicHero
        coupleNames={coupleNames ?? 'Mariage'}
        weddingDate={weddingDate}
        venue={venue}
        backgroundImage={backgroundImage ?? null}
        hashtag={hashtag}
      />
    );
  }

  if (heroComponent === 'EditorialHero') {
    return (
      <EditorialHero
        groomName={groomName ?? ''}
        brideName={brideName ?? ''}
        weddingDate={weddingDate}
        venue={venue}
        welcomeMessage={welcomeMessage}
      />
    );
  }

  // Identity maps to 'HeroSection' explicitly → default renderer.
  return <HeroSection />;
}

export default IdentityHero;
