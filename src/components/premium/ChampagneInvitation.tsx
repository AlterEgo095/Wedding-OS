// ══════════════════════════════════════════════════════════════════════════════
// src/components/premium/ChampagneInvitation.tsx
// MISSION 5.9.2 P4-f — Champagne invitation renderer (alias of Editorial).
// ══════════════════════════════════════════════════════════════════════════════
//
// Renders the champagne-style invitation experience. This is a forward-
// compatibility alias for EditorialInvitation — reserved for future use
// when champagne-specific styling diverges from the editorial style.
//
// Per src/lib/invitations/variants.ts STYLE_TO_RENDERER, no canonical
// template currently routes to ChampagneInvitation (CHAMPAGNE category
// templates route to EditorialInvitation). This component is included so
// the IdentityInvitation dispatcher has a complete 5-component contract,
// and so future champagne-specific templates (e.g. a sparkling wine
// themed invitation) can be added without modifying the dispatcher.
//
// The current implementation re-exports EditorialInvitation — when the
// champagne style diverges (e.g. needs champagne flute iconography, pearl
// shimmer texture), this file will be the place to add those overrides
// without affecting the existing editorial templates.
// ══════════════════════════════════════════════════════════════════════════════

'use client';

import type { InvitationExperienceConfig } from '@/lib/invitations/types';
import { EditorialInvitation } from './EditorialInvitation';

export interface ChampagneInvitationProps {
  config: InvitationExperienceConfig;
  mobileHiddenSections: string[];
}

/**
 * ChampagneInvitation — champagne-style invitation renderer (alias).
 *
 * Currently delegates to EditorialInvitation. When champagne-specific
 * styling is needed (champagne flute iconography, pearl shimmer texture,
 * sparkling gold accent), this is the place to add overrides without
 * affecting the editorial templates.
 */
export function ChampagneInvitation({ config, mobileHiddenSections }: ChampagneInvitationProps) {
  // Apply a champagne-specific token override (shimmering gold)
  const champagneTokens = {
    ...config.tokens,
    '--inv-accent': config.tokens['--inv-accent'] ?? '#D4C4A8',
    '--inv-shadow': '0 8px 30px -8px rgba(212, 196, 168, 0.25)',
  };

  return (
    <div className="champagne-invitation-wrapper">
      <EditorialInvitation
        config={{ ...config, tokens: champagneTokens }}
        mobileHiddenSections={mobileHiddenSections}
      />
    </div>
  );
}

export default ChampagneInvitation;
