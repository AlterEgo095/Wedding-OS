// ══════════════════════════════════════════════════════════════════════════════
// src/components/premium/LuxuryInvitation.tsx
// MISSION 5.9.2 P4-b — Luxury invitation renderer (4 styles).
// ══════════════════════════════════════════════════════════════════════════════
//
// Renders the luxury/ceremonial invitation experience for the 4 LUXURY
// category templates (per src/lib/invitations/variants.ts STYLE_TO_RENDERER):
//
//   - ROYAL_GOLD      (royal-gold) — Free default, gold on black
//   - ROYAL_BLACK     (royal-black) — Premium, black tie cinematic
//   - AFRICAN_LUXURY   (african-luxury) — Premium, kente wax collage
//   - SAPPHIRE_NIGHT   (sapphire-night) — Exclusive, deep blue + champagne gold
//
// The LuxuryInvitation renderer applies its signature visual elements:
//   1. Gold ornamental dividers between sections
//   2. Premium serif typography (Cormorant Garamond / Playfair Display)
//   3. Subtle gold dust texture overlay (decorative SVG)
//   4. Dark ambient background with radial gradient
//
// All section rendering is delegated to InvitationSections (shared) —
// this component only adds the luxury-specific wrapper + decorative layers.
// The renderer is layout-agnostic: it works for FULL_BLEED_IMAGE,
// CINEMATIC_HERO, and PHOTO_COLLAGE layouts.
//
// All visual customization (colors, fonts, padding) comes from the
// InvitationExperienceConfig.tokens (--inv-* CSS variables) which are
// injected by the IdentityInvitation dispatcher wrapper.
// ══════════════════════════════════════════════════════════════════════════════

'use client';

import { useEffect, useState } from 'react';
import type { InvitationExperienceConfig } from '@/lib/invitations/types';
import {
  InvitationSectionRenderer,
} from './invitation/InvitationSections';

export interface LuxuryInvitationProps {
  config: InvitationExperienceConfig;
  mobileHiddenSections: string[];
}

/**
 * LuxuryInvitation — premium invitation renderer for the 4 LUXURY templates.
 *
 * Wraps the shared InvitationSectionRenderer with luxury-specific decorative
 * layers: gold ornamental dividers, ambient radial gradient, gold dust SVG
 * texture overlay.
 *
 * The renderer is layout-agnostic — it adapts to FULL_BLEED_IMAGE,
 * CINEMATIC_HERO, and PHOTO_COLLAGE layouts via the config.tokens.
 */
export function LuxuryInvitation({ config, mobileHiddenSections }: LuxuryInvitationProps) {
  // Track scroll progress for the ambient gradient intensity
  const [scrollProgress, setScrollProgress] = useState(0);

  useEffect(() => {
    if (config.animationRules.reveal === 'none') return;
    const handler = () => {
      const scrolled = window.scrollY;
      const max = document.body.scrollHeight - window.innerHeight;
      setScrollProgress(max > 0 ? Math.min(1, scrolled / max) : 0);
    };
    window.addEventListener('scroll', handler, { passive: true });
    handler();
    return () => window.removeEventListener('scroll', handler);
  }, [config.animationRules.reveal]);

  return (
    <div
      className="luxury-invitation relative w-full"
      style={{
        background: 'var(--inv-bg, #0a0a0a)',
        color: 'var(--inv-text, #FAF8F5)',
        fontFamily: 'var(--inv-font-body, sans-serif)',
      }}
    >
      {/* Ambient radial gradient overlay (decorative) */}
      <div
        className="fixed inset-0 pointer-events-none z-0"
        aria-hidden="true"
        style={{
          background:
            'radial-gradient(ellipse at top, color-mix(in srgb, var(--inv-accent, #D4AF37) 8%, transparent), transparent 60%)',
          opacity: 0.4 + scrollProgress * 0.4,
        }}
      />

      {/* Gold dust SVG texture overlay (decorative) */}
      <div
        className="fixed inset-0 pointer-events-none z-0 opacity-[0.03]"
        aria-hidden="true"
        dangerouslySetInnerHTML={{
          __html: `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%"><filter id="gold-noise"><feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" stitchTiles="stitch"/><feColorMatrix values="0 0 0 0 0.83 0 0 0 0 0.69 0 0 0 0 0.22 0 0 0 0.5 0"/></filter><rect width="100%" height="100%" filter="url(#gold-noise)"/></svg>`,
        }}
      />

      {/* Sections */}
      <div className="relative z-10">
        <InvitationSectionRenderer
          config={config}
          mobileHiddenSections={mobileHiddenSections}
          className="luxury-invitation__sections"
        />
      </div>

      {/* Gold ornamental divider (fixed between sections via CSS) */}
      <div
        className="luxury-invitation__ornament pointer-events-none fixed top-0 left-1/2 -translate-x-1/2 w-px h-full z-0"
        aria-hidden="true"
        style={{
          background:
            'linear-gradient(to bottom, transparent, var(--inv-accent, #D4AF37) 50%, transparent)',
          opacity: 0.05,
        }}
      />
    </div>
  );
}

export default LuxuryInvitation;
