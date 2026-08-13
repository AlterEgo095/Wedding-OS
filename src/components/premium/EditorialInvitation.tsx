// ══════════════════════════════════════════════════════════════════════════════
// src/components/premium/EditorialInvitation.tsx
// MISSION 5.9.2 P4-c — Editorial invitation renderer (3 styles).
// ══════════════════════════════════════════════════════════════════════════════
//
// Renders the editorial/magazine-style invitation experience for the 3
// EDITORIAL category templates (per src/lib/invitations/variants.ts):
//
//   - CHAMPAGNE_EDITORIAL (champagne-editorial) — Standard, magazine chic
//   - MODERN_MONOGRAM     (modern-monogram)     — Standard, asymmetric typography
//   - BLACK_IVORY          (black-ivory)          — Premium, fashion-forward
//
// The EditorialInvitation renderer applies its signature visual elements:
//   1. Editorial grid layout (visible on desktop)
//   2. Magazine-style typography (large display + small caption tracking)
//   3. Minimal motion (no parallax — scroll-triggered reveals only)
//   4. Asymmetric column placement per layout (ASYMMETRIC/EDITORIAL_GRID/
//      TYPOGRAPHIC_HERO)
//
// All section rendering is delegated to InvitationSections (shared).
//
// All visual customization comes from config.tokens (--inv-* CSS vars)
// injected by the IdentityInvitation dispatcher wrapper.
// ══════════════════════════════════════════════════════════════════════════════

'use client';

import type { InvitationExperienceConfig } from '@/lib/invitations/types';
import { InvitationSectionRenderer } from './invitation/InvitationSections';

export interface EditorialInvitationProps {
  config: InvitationExperienceConfig;
  mobileHiddenSections: string[];
}

/**
 * EditorialInvitation — magazine-style invitation renderer for the 3
 * EDITORIAL templates.
 *
 * Wraps the shared InvitationSectionRenderer with editorial-specific
 * decorative elements: thin horizontal rules between sections, asymmetric
 * column placement via grid templates, and uppercase tracked-out captions.
 */
export function EditorialInvitation({ config, mobileHiddenSections }: EditorialInvitationProps) {
  const layoutGridClass =
    config.layout === 'ASYMMETRIC'
      ? 'editorial-invitation--asymmetric'
      : config.layout === 'TYPOGRAPHIC_HERO'
        ? 'editorial-invitation--typographic'
        : 'editorial-invitation--grid';

  return (
    <div
      className={`editorial-invitation relative w-full ${layoutGridClass}`}
      style={{
        background: 'var(--inv-bg, #F5F1EA)',
        color: 'var(--inv-text, #2D2418)',
        fontFamily: 'var(--inv-font-body, "Inter", sans-serif)',
      }}
    >
      {/* Top magazine masthead (decorative) */}
      <div
        className="editorial-invitation__masthead border-b"
        aria-hidden="true"
        style={{
          borderColor: 'color-mix(in srgb, var(--inv-text, #2D2418) 15%, transparent)',
          padding: '1.5rem 2rem',
        }}
      >
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <span
            className="text-[10px] uppercase tracking-[0.3em]"
            style={{ color: 'var(--inv-text, #2D2418)', opacity: 0.5 }}
          >
            Invitation
          </span>
          <span
            className="text-[10px] uppercase tracking-[0.3em]"
            style={{ color: 'var(--inv-accent, #B89968)' }}
          >
            {config.templateSlug}
          </span>
          <span
            className="text-[10px] uppercase tracking-[0.3em]"
            style={{ color: 'var(--inv-text, #2D2418)', opacity: 0.5 }}
          >
            Vol. {config.templateVersion}
          </span>
        </div>
      </div>

      {/* Sections */}
      <InvitationSectionRenderer
        config={config}
        mobileHiddenSections={mobileHiddenSections}
        className="editorial-invitation__sections"
      />

      {/* Bottom thin rule (decorative) */}
      <div
        className="editorial-invitation__footer-rule h-px w-full"
        aria-hidden="true"
        style={{
          background:
            'linear-gradient(to right, transparent, color-mix(in srgb, var(--inv-text, #2D2418) 30%, transparent), transparent)',
        }}
      />
    </div>
  );
}

export default EditorialInvitation;
