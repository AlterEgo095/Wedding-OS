// ══════════════════════════════════════════════════════════════════════════════
// src/components/wedding/SectionRenderer.tsx — MANIFEST-DRIVEN PUBLIC RENDERER
// ══════════════════════════════════════════════════════════════════════════════
// Replaces the hardcoded JSX in /w/[slug]/page.tsx.
// Reads sections from the manifest, filters enabled, sorts by order, renders
// each via the section registry.
//
// The registry maps SectionType → React component. Adding a new section type
// means: (1) add it to manifest.ts SECTION_TYPES, (2) register it here.
// No other file needs to change.
//
// ─── Phase 4 (MISSION 5.9.1 P4-1) — LuxuryCountdown dispatcher ─────────────────
// The `countdown` renderer now reads the optional `identity` arg (4th param)
// and, when the identity preset declares `sectionOverrides.countdown ===
// 'LuxuryCountdown'` (royal-luxury + cinematic-dark), renders the premium
// <LuxuryCountdown> variant instead of the default <CountdownSection>.
// This wires the previously-dead LuxuryCountdown + GlassCard components
// (audit §20.4 dead-code list) into the live render path. Backward compatible:
// no identity / no countdown override → default <CountdownSection> (zero
// visual regression for the 3 identities that don't override countdown).
// ══════════════════════════════════════════════════════════════════════════════

'use client';

import type { SectionType, WeddingManifest, ManifestSection } from '@/lib/wedding/manifest';
import { Fragment } from 'react';
import HeroSection from '@/components/HeroSection';
import OurStory from '@/components/OurStory';
import PremiumGallery from '@/components/PremiumGallery';
import EventTimeline, { EventTimelineSkeleton } from '@/components/EventTimeline';
import MapSection, { MapSectionSkeleton } from '@/components/MapSection';
import GuestAuthForm from '@/components/GuestAuthForm';
// ─── Phase 1E (MISSION 5.9.0) — 8 new section renderers ───────────────────────
// Each new section type maps 1:1 to a renderer entry below. See
// src/components/wedding/sections/*.tsx for the per-section implementation.
import CoupleSection from '@/components/wedding/sections/CoupleSection';
import CountdownSection from '@/components/wedding/sections/CountdownSection';
import VenueSection from '@/components/wedding/sections/VenueSection';
import InvitationSection from '@/components/wedding/sections/InvitationSection';
import RsvpSection from '@/components/wedding/sections/RsvpSection';
import GuestExperienceSection from '@/components/wedding/sections/GuestExperienceSection';
import GuestbookSection from '@/components/wedding/sections/GuestbookSection';
import CtaSection from '@/components/wedding/sections/CtaSection';
// ─── Phase 4A (MISSION 5.9.0 §20.6) — Identity dispatchers ────────────────────
// When `identity` prop is set (preview lab or wedding's own themeConfig.identity),
// the hero + gallery renderers delegate to IdentityHero / IdentityGallery which
// dispatch to the identity's premium variants (CinematicHero, LuxuryGallery, …).
import { IdentityHero } from '@/components/wedding/IdentityHero';
import { IdentityGallery } from '@/components/wedding/IdentityGallery';
// ─── Phase 4 (MISSION 5.9.1 P4-1) — LuxuryCountdown dispatcher ────────────────
// Imported from the premium barrel so LuxuryCountdown + GlassCard become
// reachable from the live render path (previously zero-import dead code).
// The dispatcher uses getIdentityPreset + getSectionOverride below to decide
// whether the active identity has declared a `countdown → LuxuryCountdown`
// override (royal-luxury + cinematic-dark do; the other 3 identities don't).
import { LuxuryCountdown, type LuxuryCountdownSettings } from '@/components/premium';
import {
  getIdentityPreset,
  getSectionOverride,
  isWeddingIdentity,
  type WeddingIdentity,
} from '@/lib/themes/identity-presets';
import { SETTING_KEYS } from '@/lib/constants';

// ─── Section Component Types ──────────────────────────────────────────────────
interface StoryEvent {
  id: string;
  title: string;
  description: string;
  date?: string | null;
  imageUrl?: string | null;
  order: number;
}

interface TimelineEvent {
  id: string;
  time: string;
  activity: string;
  location?: string | null;
  description?: string | null;
  icon?: string | null;
  order: number;
}

interface VenueSettings {
  venue_name?: string;
  venue_address?: string;
  venue_city?: string;
  venue_lat?: string;
  venue_lng?: string;
  venue_parking?: string;
  venue_time?: string;
  groom_name?: string;
  bride_name?: string;
  site_subtitle?: string;
  welcome_message?: string;
  hashtag?: string;
  venue_reference?: string;
  [key: string]: string | undefined;
}

export interface SectionRendererData {
  stories: StoryEvent[];
  timeline: TimelineEvent[];
  settings: VenueSettings | null;
  loading: boolean;
}

// ─── Section Registry ─────────────────────────────────────────────────────────
// Phase 4A: the render fn now also receives an optional `identity` arg used
// by the hero + gallery renderers to dispatch to IdentityHero / IdentityGallery
// when the wedding has opted into an identity preset (preview lab or
// themeConfig.identity). All other renderers ignore the 4th arg.
//
// Phase 4 (P4-1): the `countdown` renderer also reads `identity` to dispatch
// to <LuxuryCountdown> when the identity has a countdown override.
type SectionRenderFn = (
  section: ManifestSection,
  data: SectionRendererData,
  extras: {
    onLoginByLookupToken: (token: string) => Promise<{ success: boolean; error?: string }>;
    onLoginWithLinkToken: (token: string) => Promise<{ success: boolean; error?: string }>;
    initialInviteToken?: string;
    /** Phase 4D — wedding slug, used by InvitationSection + CtaSection to
     *  build the WhatsApp share URL. Optional for backward compat with any
     *  caller that pre-dates Phase 4D (renders the share button as a no-op
     *  link if absent — handled by WhatsAppShare). */
    weddingSlug?: string;
  },
  identity?: WeddingIdentity | null,
) => React.ReactNode;

/**
 * Phase 4A — Builds the IdentityHero data props from the wedding settings map.
 * Maps SETTING_KEYS → IdentityHero's prop names so the premium hero variants
 * (CinematicHero / EditorialHero) get the couple names, date, venue, etc.
 * without the caller needing to know which setting key maps to which prop.
 */
function identityHeroPropsFromSettings(settings: SectionRendererData['settings']): {
  coupleNames?: string;
  groomName?: string;
  brideName?: string;
  weddingDate?: string;
  venue?: string;
  backgroundImage?: string;
  hashtag?: string;
  welcomeMessage?: string;
} {
  if (!settings) return {};
  const get = (k: string): string | undefined => {
    const v = settings[k];
    return typeof v === 'string' && v.length > 0 ? v : undefined;
  };
  const groomName = get(SETTING_KEYS.GROOM_NAME);
  const brideName = get(SETTING_KEYS.BRIDE_NAME);
  // coupleNames fallback: "Groom & Bride" if neither is empty.
  const coupleNames = groomName && brideName ? `${groomName} & ${brideName}` : undefined;
  return {
    coupleNames,
    groomName,
    brideName,
    weddingDate: get(SETTING_KEYS.SITE_SUBTITLE) ?? get(SETTING_KEYS.WEDDING_DATE),
    venue: get(SETTING_KEYS.VENUE_NAME) ?? get(SETTING_KEYS.VENUE_CITY),
    backgroundImage: get('couple_photo_1'),
    hashtag: get(SETTING_KEYS.HASHTAG),
    welcomeMessage: get(SETTING_KEYS.WELCOME_MESSAGE),
  };
}

/**
 * Phase 4 (P4-1) — Returns true when the active identity declares a `countdown`
 * section override pointing to the premium <LuxuryCountdown> variant.
 *
 * Defensive against:
 *   - missing identity (no override → false → default CountdownSection)
 *   - invalid identity strings (isWeddingIdentity narrows the union)
 *   - identities without a countdown override (3 of 5 don't override countdown)
 *
 * Reads the same `sectionOverrides` array that IdentityHero / IdentityGallery
 * consume — single source of truth for identity → component mapping.
 */
function identityHasLuxuryCountdown(identity: WeddingIdentity | null | undefined): boolean {
  if (!identity) return false;
  if (!isWeddingIdentity(identity)) return false;
  const preset = getIdentityPreset(identity);
  if (!preset) return false;
  const override = getSectionOverride(preset, 'countdown');
  return override === 'LuxuryCountdown';
}

const SECTION_REGISTRY: Record<SectionType, SectionRenderFn> = {
  // ─── Phase 4A — hero dispatches to IdentityHero when identity is set ─────
  // IdentityHero internally falls back to <HeroSection /> when identity has
  // no hero override (e.g. botanical-romance), so this is fully backward
  // compatible: no identity / unknown identity / no override → HeroSection.
  hero: (_section, data, _extras, identity) => {
    if (identity) {
      return <IdentityHero identity={identity} {...identityHeroPropsFromSettings(data.settings)} />;
    }
    return <HeroSection />;
  },
  // ─── Phase 1E (MISSION 5.9.0) — new renderers ────────────────────────────
  // Each renderer is intentionally minimal: it pulls the data it needs from
  // the shared `data` payload (settings/stories/timeline) or from the
  // section's `props` field. The renderer functions themselves stay dumb so
  // all the visual logic lives in the dedicated section component.
  couple: (section, data) => (
    <CoupleSection key={section.id} settings={data.settings} loading={data.loading} />
  ),
  // ─── Phase 4 (P4-1) — countdown dispatches to LuxuryCountdown ────────────
  // When the active identity preset declares `sectionOverrides.countdown ===
  // 'LuxuryCountdown'` (royal-luxury + cinematic-dark), render the premium
  // <LuxuryCountdown> variant (gold glass cards via <GlassCard>, larger
  // display numerals, ornamental dividers). Otherwise fall back to the
  // default <CountdownSection>. Both variants consume the same settings
  // shape (wedding_date / wedding_time / site_subtitle) so the data path
  // is unchanged.
  countdown: (section, data, _extras, identity) => {
    const sectionProps = section.props as { weddingDate?: string } | undefined;
    if (identityHasLuxuryCountdown(identity)) {
      // The settings map is structurally compatible with LuxuryCountdownSettings
      // (both are {[key: string]: string | undefined} + specific optional fields).
      // We cast through unknown to satisfy TS without leaking the internal
      // VenueSettings type into the premium component's prop signature.
      const luxurySettings =
        (data.settings as unknown as LuxuryCountdownSettings | null) ?? null;
      return (
        <LuxuryCountdown
          key={section.id}
          settings={luxurySettings}
          weddingDate={sectionProps?.weddingDate}
        />
      );
    }
    return (
      <CountdownSection
        key={section.id}
        settings={data.settings}
        {...sectionProps}
      />
    );
  },
  venue: (section, data) => (
    <VenueSection key={section.id} settings={data.settings} loading={data.loading} />
  ),
  invitation: (section, data, extras) => (
    <InvitationSection
      key={section.id}
      settings={data.settings}
      loading={data.loading}
      weddingSlug={extras.weddingSlug}
      inviteToken={extras.initialInviteToken}
    />
  ),
  rsvp: (section) => <RsvpSection key={section.id} />,
  'guest-experience': (section) => <GuestExperienceSection key={section.id} />,
  guestbook: (section) => <GuestbookSection key={section.id} />,
  cta: (section, data, extras) => (
    <CtaSection
      key={section.id}
      settings={data.settings}
      weddingSlug={extras.weddingSlug}
      inviteToken={extras.initialInviteToken}
    />
  ),
  // ─── Existing renderers (unchanged behaviour) ────────────────────────────
  story: (section, data) => {
    if (!data.loading && data.stories.length === 0) {
      return (
        <section
          key={section.id}
          id={section.id}
          className="py-20 md:py-28 text-center"
          aria-label="Notre histoire — aucune histoire à raconter"
        >
          <div className="max-w-xl mx-auto px-4">
            <span className="block mb-4 text-2xl text-muted-foreground/60" aria-hidden="true">✦</span>
            <p className="font-serif text-xl text-muted-foreground mb-1">
              Aucune histoire à raconter pour le moment
            </p>
            <p className="font-display text-sm text-muted-foreground/70">
              Le couple n&apos;a pas encore partagé les chapitres de son histoire.
            </p>
          </div>
        </section>
      );
    }
    return <OurStory key={section.id} stories={data.stories} />;
  },
  // ─── Phase 4A — gallery dispatches to IdentityGallery when identity is set ──
  // IdentityGallery internally falls back to <PremiumGallery /> when identity
  // has no gallery override. When identity HAS an override (LuxuryGallery /
  // ImmersiveGallery) and no explicit images are passed, it renders an empty
  // LuxuryGallery shell — acceptable for the preview lab (the admin sees the
  // premium grid layout even without images).
  gallery: (section, _data, _extras, identity) => {
    if (identity) {
      return <IdentityGallery key={section.id} identity={identity} />;
    }
    return <PremiumGallery key={section.id} />;
  },
  timeline: (section, data) =>
    data.loading ? <EventTimelineSkeleton key={section.id} /> : <EventTimeline key={section.id} events={data.timeline} />,
  map: (section, data) =>
    data.loading ? <MapSectionSkeleton key={section.id} /> : <MapSection key={section.id} settings={data.settings} />,
  'guest-auth': (section, _data, extras) => (
    <GuestAuthForm
      key={section.id}
      onLoginByLookupToken={extras.onLoginByLookupToken}
      onLoginWithLinkToken={extras.onLoginWithLinkToken}
      initialInviteToken={extras.initialInviteToken}
    />
  ),
};

// ─── SectionRenderer ──────────────────────────────────────────────────────────
interface SectionRendererProps {
  manifest: WeddingManifest;
  data: SectionRendererData;
  extras: {
    onLoginByLookupToken: (token: string) => Promise<{ success: boolean; error?: string }>;
    onLoginWithLinkToken: (token: string) => Promise<{ success: boolean; error?: string }>;
    initialInviteToken?: string;
    /** Phase 4D — wedding slug, passed to InvitationSection + CtaSection so
     *  their <WhatsAppShare> button can build the shareable URL. */
    weddingSlug?: string;
  };
  /**
   * Phase 4A — optional wedding identity for the hero + gallery dispatchers.
   * When set, the hero/gallery renderers delegate to IdentityHero /
   * IdentityGallery (which dispatch to the identity's premium variants).
   * When undefined / null, the default HeroSection / PremiumGallery are
   * used (existing behavior — zero regression).
   *
   * Phase 4 (P4-1) — also consumed by the `countdown` renderer to dispatch
   * to <LuxuryCountdown> when the identity has a countdown override.
   */
  identity?: WeddingIdentity | null;
}

export function SectionRenderer({ manifest, data, extras, identity }: SectionRendererProps) {
  const enabledSections = manifest.sections
    .filter((s) => s.enabled)
    .sort((a, b) => a.order - b.order);

  return (
    <>
      {enabledSections.map((section) => {
        const renderFn = SECTION_REGISTRY[section.type];
        if (!renderFn) {
          console.warn(`SectionRenderer: no renderer for type "${section.type}"`);
          return null;
        }
        return (
          <Fragment key={section.id}>
            {renderFn(section, data, extras, identity)}
          </Fragment>
        );
      })}
    </>
  );
}
