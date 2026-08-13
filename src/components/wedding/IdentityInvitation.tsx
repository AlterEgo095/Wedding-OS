// ══════════════════════════════════════════════════════════════════════════════
// src/components/wedding/IdentityInvitation.tsx
// MISSION 5.9.2 P4-a — Invitation Experience Dispatcher.
// ══════════════════════════════════════════════════════════════════════════════
//
// The dispatcher reads an InvitationExperienceConfig (produced by
// `composeInvitationExperience()` in src/lib/invitations/index.ts) and routes
// to the right premium invitation component based on the template's style.
//
// Routing table (mirrors src/lib/invitations/variants.ts → STYLE_TO_RENDERER):
//
//   LuxuryInvitation    ← ROYAL_GOLD, ROYAL_BLACK, AFRICAN_LUXURY, SAPPHIRE_NIGHT
//   EditorialInvitation ← CHAMPAGNE_EDITORIAL, MODERN_MONOGRAM, BLACK_IVORY
//   BotanicalInvitation ← WHITE_ROMANCE, BOTANICAL_LOVE
//   CinematicInvitation ← SUNSET_ROMANCE
//   ChampagneInvitation ← (forward-compat alias for EditorialInvitation)
//
// The dispatcher ALSO:
//   1. Injects the invitation's CSS custom properties (`--inv-*` tokens) on
//      a wrapping <div> so the renderer components can consume them.
//   2. Applies the responsive rules (font scale, section padding, hide-on-mobile)
//      via a CSS class binding + data attributes.
//   3. Provides a `__DEBUG__` preview banner when `?preview=true` is present
//      (mirrors the existing theme/identity preview pattern in WeddingPageClient).
//
// BACKWARD COMPATIBILITY:
//   - When `config` is null/undefined (legacy wedding without an invitation
//     template), the dispatcher renders a default InvitationSection (the
//     existing simple wedding invitation card). This preserves the 7 existing
//     weddings (audit F10 + R6 mitigation).
//   - When `config` is present but the resolved renderer is unknown (defensive),
//     falls back to LuxuryInvitation (safest default — most-tested component).
//
// USAGE:
//   import { IdentityInvitation } from '@/components/wedding/IdentityInvitation';
//   <IdentityInvitation config={composedConfig} />
//
// OR with the legacy fallback (no invitation template selected):
//   <IdentityInvitation config={null} settings={legacySettings} />
// ══════════════════════════════════════════════════════════════════════════════

'use client';

import { useMemo, type CSSProperties } from 'react';
import dynamic from 'next/dynamic';
import {
  resolveRendererForStyle,
} from '@/lib/invitations/variants';
import type { InvitationExperienceConfig } from '@/lib/invitations/types';
import { cn } from '@/lib/utils';
import { logger } from '@/lib/logger';

// ─── Dynamic imports (code-split per renderer) ────────────────────────────────

const LuxuryInvitation = dynamic(
  () => import('@/components/premium/LuxuryInvitation').then((m) => m.LuxuryInvitation),
  { loading: () => <InvitationSkeleton /> },
);

const EditorialInvitation = dynamic(
  () => import('@/components/premium/EditorialInvitation').then((m) => m.EditorialInvitation),
  { loading: () => <InvitationSkeleton /> },
);

const BotanicalInvitation = dynamic(
  () => import('@/components/premium/BotanicalInvitation').then((m) => m.BotanicalInvitation),
  { loading: () => <InvitationSkeleton /> },
);

const CinematicInvitation = dynamic(
  () => import('@/components/premium/CinematicInvitation').then((m) => m.CinematicInvitation),
  { loading: () => <InvitationSkeleton /> },
);

const ChampagneInvitation = dynamic(
  () => import('@/components/premium/ChampagneInvitation').then((m) => m.ChampagneInvitation),
  { loading: () => <InvitationSkeleton /> },
);

// ─── Legacy fallback (existing weddings without invitation template) ─────────

const InvitationSection = dynamic(
  () => import('@/components/wedding/sections/InvitationSection'),
  { loading: () => <InvitationSkeleton /> },
);

// ─── Types ───────────────────────────────────────────────────────────────────

export interface IdentityInvitationProps {
  /**
   * The composed InvitationExperienceConfig. When null/undefined, the
   * dispatcher falls back to the legacy InvitationSection (backward-compat
   * for the 7 existing weddings without an invitationTemplateId).
   */
  config: InvitationExperienceConfig | null;

  /**
   * Legacy settings for the InvitationSection fallback. Required when
   * `config` is null. Optional when `config` is present.
   */
  settings?: {
    groom_name?: string;
    bride_name?: string;
    site_subtitle?: string;
    venue_name?: string;
    venue_city?: string;
    welcome_message?: string;
    [key: string]: string | undefined;
  } | null;

  /** Wedding slug (for the legacy share URL). */
  weddingSlug?: string;

  /** Optional invite token (for personalisation in legacy fallback). */
  inviteToken?: string;

  /** Optional className applied to the wrapper div. */
  className?: string;

  /** When true, renders a debug preview banner (top-right). */
  __debug__?: boolean;
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function InvitationSkeleton() {
  return (
    <div
      className="min-h-[60vh] flex items-center justify-center bg-[var(--inv-bg,theme(colors.stone.50))] animate-pulse"
      role="status"
      aria-label="Chargement de l'invitation"
    >
      <div className="text-center">
        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-foreground/10" />
        <div className="h-4 w-48 mx-auto bg-foreground/10 rounded mb-2" />
        <div className="h-3 w-32 mx-auto bg-foreground/10 rounded" />
      </div>
    </div>
  );
}

// ─── Debug preview banner ────────────────────────────────────────────────────

function PreviewBanner({ config }: { config: InvitationExperienceConfig }) {
  return (
    <div className="fixed top-4 right-4 z-[100] px-3 py-2 rounded-md bg-amber-100 text-amber-900 text-xs font-mono shadow-lg border border-amber-300">
      <div className="font-bold">INVITATION PREVIEW</div>
      <div>template: <span className="font-semibold">{config.templateSlug}</span> v{config.templateVersion}</div>
      <div>style: {config.style} · category: {config.category}</div>
      <div>layout: {config.layout}</div>
      {config.identity && <div>identity: {config.identity}</div>}
      <div>sections: {config.sections.filter((s) => s.enabled).length}/{config.sections.length}</div>
      <div>composer: v{config.composerVersion}</div>
    </div>
  );
}

// ─── Dispatcher ──────────────────────────────────────────────────────────────

/**
 * IdentityInvitation — invitation experience dispatcher.
 *
 * Reads the composed InvitationExperienceConfig and renders the matching
 * premium invitation component. Falls back to the legacy InvitationSection
 * when no config is provided (backward compat).
 */
export function IdentityInvitation({
  config,
  settings,
  weddingSlug,
  inviteToken,
  className,
  __debug__ = false,
}: IdentityInvitationProps) {
  // ─── Legacy fallback: no invitation template selected ──────────────────────
  if (!config) {
    return (
      <InvitationSection
        settings={settings ?? null}
        weddingSlug={weddingSlug}
        inviteToken={inviteToken}
      />
    );
  }

  // ─── Resolve the renderer component ────────────────────────────────────────
  const renderer = useMemo(
    () => resolveRendererForStyle(config.style, config.category),
    [config.style, config.category],
  );

  // ─── Build the CSS custom properties from the resolved tokens ──────────────
  // The wrapper applies --inv-* CSS variables that the renderer + its
  // child sections consume. This mirrors the ThemeInjector pattern.
  const tokenStyle = useMemo<CSSProperties>(() => {
    const style: Record<string, string> = {};
    for (const [k, v] of Object.entries(config.tokens)) {
      if (v !== undefined && v !== null) {
        style[k] = v;
      }
    }
    // Computed wrapper vars
    style['--invitation-template-slug'] = config.templateSlug;
    style['--invitation-style'] = config.style;
    style['--invitation-category'] = config.category;
    return style as CSSProperties;
  }, [config.tokens, config.templateSlug, config.style, config.category]);

  // ─── Responsive rules: hide-on-mobile sections + font scale ─────────────────
  const mobileHiddenSections = config.responsiveRules.mobile.hideSections ?? [];
  const wrapperClassName = useMemo(() => {
    return cn(
      'identity-invitation',
      `identity-invitation--${config.style.toLowerCase()}`,
      `identity-invitation--${config.category.toLowerCase()}`,
      className,
    );
  }, [config.style, config.category, className]);

  // ─── Dispatch to the renderer ─────────────────────────────────────────────
  let rendered: React.ReactNode;
  switch (renderer) {
    case 'LuxuryInvitation':
      rendered = <LuxuryInvitation config={config} mobileHiddenSections={mobileHiddenSections} />;
      break;
    case 'EditorialInvitation':
      rendered = <EditorialInvitation config={config} mobileHiddenSections={mobileHiddenSections} />;
      break;
    case 'BotanicalInvitation':
      rendered = <BotanicalInvitation config={config} mobileHiddenSections={mobileHiddenSections} />;
      break;
    case 'CinematicInvitation':
      rendered = <CinematicInvitation config={config} mobileHiddenSections={mobileHiddenSections} />;
      break;
    case 'ChampagneInvitation':
      rendered = <ChampagneInvitation config={config} mobileHiddenSections={mobileHiddenSections} />;
      break;
    default:
      // Defensive — should never happen since resolveRendererForStyle always returns a valid component
      logger.warn('IdentityInvitation: unknown renderer, falling back to LuxuryInvitation', {
        style: config.style,
        category: config.category,
        renderer,
      });
      rendered = <LuxuryInvitation config={config} mobileHiddenSections={mobileHiddenSections} />;
  }

  return (
    <div
      className={wrapperClassName}
      style={tokenStyle}
      data-template={config.templateSlug}
      data-style={config.style}
      data-category={config.category}
      data-layout={config.layout}
      data-composer-version={config.composerVersion}
    >
      {__debug__ && <PreviewBanner config={config} />}
      {rendered}
    </div>
  );
}

export default IdentityInvitation;
