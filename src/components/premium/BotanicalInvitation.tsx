// ══════════════════════════════════════════════════════════════════════════════
// src/components/premium/BotanicalInvitation.tsx
// MISSION 5.9.2 P4-d — Botanical invitation renderer (2 styles).
// ══════════════════════════════════════════════════════════════════════════════
//
// Renders the botanical/garden-style invitation experience for the 2
// BOTANICAL category templates (per src/lib/invitations/variants.ts):
//
//   - WHITE_ROMANCE (white-romance) — Premium, ivory + bronze
//   - BOTANICAL_LOVE (botanical-love) — Premium, garden green + cream
//
// The BotanicalInvitation renderer applies its signature visual elements:
//   1. Soft botanical SVG illustrations (leaves, branches) as section dividers
//   2. Light, airy background (cream/ivory, not dark)
//   3. Romantic serif typography (Cormorant Garamond)
//   4. Subtle watercolor texture overlay (very low opacity)
//   5. Symmetric centered layout for ceremony section (CENTERED_CEREMONY)
//
// All section rendering is delegated to InvitationSections (shared).
// All visual customization comes from config.tokens (--inv-* CSS vars).
// ══════════════════════════════════════════════════════════════════════════════

'use client';

import type { InvitationExperienceConfig } from '@/lib/invitations/types';
import { InvitationSectionRenderer } from './invitation/InvitationSections';

export interface BotanicalInvitationProps {
  config: InvitationExperienceConfig;
  mobileHiddenSections: string[];
}

/**
 * Inline SVG botanical branch (decorative, used as section divider).
 */
function BotanicalBranch({ color = '#8B6F47', opacity = 0.3 }: { color?: string; opacity?: number }) {
  return (
    <svg
      width="120"
      height="40"
      viewBox="0 0 120 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      style={{ opacity }}
    >
      <path
        d="M60 20 Q40 15 20 20 M60 20 Q80 15 100 20 M60 20 L60 5 M60 20 L60 35"
        stroke={color}
        strokeWidth="1"
        strokeLinecap="round"
      />
      <ellipse cx="35" cy="20" rx="4" ry="2" fill={color} transform="rotate(-30 35 20)" />
      <ellipse cx="85" cy="20" rx="4" ry="2" fill={color} transform="rotate(30 85 20)" />
      <ellipse cx="55" cy="10" rx="3" ry="1.5" fill={color} transform="rotate(-60 55 10)" />
      <ellipse cx="65" cy="30" rx="3" ry="1.5" fill={color} transform="rotate(60 65 30)" />
      <circle cx="60" cy="20" r="2" fill={color} />
    </svg>
  );
}

/**
 * BotanicalInvitation — garden-style invitation renderer for the 2
 * BOTANICAL templates.
 *
 * Wraps the shared InvitationSectionRenderer with botanical-specific
 * decorative elements: leaf SVG dividers, soft cream background, watercolor
 * texture overlay, and centered ceremony display.
 */
export function BotanicalInvitation({ config, mobileHiddenSections }: BotanicalInvitationProps) {
  const accentColor = config.tokens['--inv-accent'] ?? '#8B6F47';
  const isSplitScreen = config.layout === 'SPLIT_SCREEN';

  return (
    <div
      className={`botanical-invitation relative w-full ${isSplitScreen ? 'botanical-invitation--split' : ''}`}
      style={{
        background: 'var(--inv-bg, #FAF6F0)',
        color: 'var(--inv-text, #3D2B1F)',
        fontFamily: 'var(--inv-font-body, "Lato", sans-serif)',
      }}
    >
      {/* Top botanical header decoration */}
      <div className="botanical-invitation__header py-8 text-center" aria-hidden="true">
        <div className="flex items-center justify-center gap-4">
          <BotanicalBranch color={accentColor} opacity={0.4} />
          <span
            className="text-xs uppercase tracking-[0.4em]"
            style={{ color: accentColor }}
          >
            {config.templateSlug.replace(/-/g, ' ')}
          </span>
          <BotanicalBranch color={accentColor} opacity={0.4} />
        </div>
      </div>

      {/* Watercolor texture overlay (decorative, very subtle) */}
      <div
        className="fixed inset-0 pointer-events-none z-0 opacity-[0.02]"
        aria-hidden="true"
        style={{
          background:
            'radial-gradient(ellipse at 20% 30%, var(--inv-accent, #8B6F47) 0%, transparent 40%), radial-gradient(ellipse at 80% 70%, var(--inv-accent, #8B6F47) 0%, transparent 40%)',
        }}
      />

      {/* Sections */}
      <div className="relative z-10">
        <InvitationSectionRenderer
          config={config}
          mobileHiddenSections={mobileHiddenSections}
          className="botanical-invitation__sections"
        />
      </div>

      {/* Bottom botanical footer decoration */}
      <div className="botanical-invitation__footer py-8 text-center" aria-hidden="true">
        <BotanicalBranch color={accentColor} opacity={0.4} />
      </div>
    </div>
  );
}

export default BotanicalInvitation;
