// ══════════════════════════════════════════════════════════════════════════════
// src/components/premium/CinematicInvitation.tsx
// MISSION 5.9.2 P4-e — Cinematic invitation renderer (1 style).
// ══════════════════════════════════════════════════════════════════════════════
//
// Renders the cinematic/destination-style invitation experience for the 1
// CINEMATIC category template (per src/lib/invitations/variants.ts):
//
//   - SUNSET_ROMANCE (sunset-romance) — Premium, warm golden hour
//
// The CinematicInvitation renderer applies its signature visual elements:
//   1. Full-viewport hero with Ken Burns parallax (cinematic hero animation)
//   2. Warm color grading (sunset orange + golden yellow)
//   3. Strong parallax scrolling effect (background moves slower than content)
//   4. Cinematic letterbox bars (top/bottom black bars on hero only)
//   5. Film grain texture overlay
//   6. Slow reveal animations (1100ms+, easing cubic-bezier(0.16,1,0.3,1))
//
// All section rendering is delegated to InvitationSections (shared).
// All visual customization comes from config.tokens (--inv-* CSS vars).
// ══════════════════════════════════════════════════════════════════════════════

'use client';

import { useEffect, useRef, useState } from 'react';
import type { InvitationExperienceConfig } from '@/lib/invitations/types';
import { useReducedMotion } from 'framer-motion';
import { InvitationSectionRenderer } from './invitation/InvitationSections';

export interface CinematicInvitationProps {
  config: InvitationExperienceConfig;
  mobileHiddenSections: string[];
}

/**
 * CinematicInvitation — destination/cinematic invitation renderer for the
 * SUNSET_ROMANCE template.
 *
 * Wraps the shared InvitationSectionRenderer with cinematic-specific
 * decorative elements: parallax scroll tracking, warm color grading overlay,
 * film grain texture, and letterbox bars on the hero section.
 */
export function CinematicInvitation({ config, mobileHiddenSections }: CinematicInvitationProps) {
  const prefersReducedMotion = useReducedMotion();
  const [parallaxY, setParallaxY] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (prefersReducedMotion || config.animationRules.heroAnimation !== 'parallax') return;
    const handler = () => {
      const scrolled = window.scrollY;
      // Parallax: background moves at 0.4x scroll speed
      setParallaxY(scrolled * 0.4);
    };
    window.addEventListener('scroll', handler, { passive: true });
    handler();
    return () => window.removeEventListener('scroll', handler);
  }, [prefersReducedMotion, config.animationRules.heroAnimation]);

  return (
    <div
      ref={containerRef}
      className="cinematic-invitation relative w-full"
      style={{
        background: 'var(--inv-bg, #FFF4E6)',
        color: 'var(--inv-text, #4A1A0A)',
        fontFamily: 'var(--inv-font-body, "Montserrat", sans-serif)',
      }}
    >
      {/* Cinematic color grading overlay (warm orange wash) */}
      <div
        className="fixed inset-0 pointer-events-none z-0 opacity-[0.04]"
        aria-hidden="true"
        style={{
          background:
            'linear-gradient(135deg, var(--inv-accent, #FF6B6B) 0%, var(--inv-primary, #FFD93D) 100%)',
          mixBlendMode: 'multiply',
        }}
      />

      {/* Film grain texture (decorative) */}
      <div
        className="fixed inset-0 pointer-events-none z-0 opacity-[0.04]"
        aria-hidden="true"
        dangerouslySetInnerHTML={{
          __html: `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%"><filter id="cinema-grain"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="3" stitchTiles="stitch"/><feColorMatrix values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.5 0"/></filter><rect width="100%" height="100%" filter="url(#cinema-grain)"/></svg>`,
        }}
      />

      {/* Parallax background layer (for non-hero sections) */}
      <div
        className="cinematic-invitation__parallax-bg fixed inset-0 pointer-events-none z-0"
        aria-hidden="true"
        style={{
          transform: prefersReducedMotion ? 'none' : `translate3d(0, ${parallaxY}px, 0)`,
          background:
            'radial-gradient(ellipse at top, color-mix(in srgb, var(--inv-accent, #FF6B6B) 12%, transparent), transparent 70%), radial-gradient(ellipse at bottom, color-mix(in srgb, var(--inv-primary, #FFD93D) 8%, transparent), transparent 60%)',
          opacity: 0.5,
        }}
      />

      {/* Sections */}
      <div className="relative z-10">
        <InvitationSectionRenderer
          config={config}
          mobileHiddenSections={mobileHiddenSections}
          className="cinematic-invitation__sections"
        />
      </div>

      {/* Cinematic letterbox bars (decorative, only on hero) */}
      <div
        className="cinematic-invitation__letterbox-top fixed top-0 left-0 right-0 h-8 md:h-12 pointer-events-none z-20"
        aria-hidden="true"
        style={{ background: 'var(--inv-text, #4A1A0A)', opacity: 0.85 }}
      />
      <div
        className="cinematic-invitation__letterbox-bottom fixed bottom-0 left-0 right-0 h-8 md:h-12 pointer-events-none z-20"
        aria-hidden="true"
        style={{ background: 'var(--inv-text, #4A1A0A)', opacity: 0.85 }}
      />
    </div>
  );
}

export default CinematicInvitation;
