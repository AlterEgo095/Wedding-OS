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
type SectionRenderFn = (
  section: ManifestSection,
  data: SectionRendererData,
  extras: {
    onLoginByLookupToken: (token: string) => Promise<{ success: boolean; error?: string }>;
    onLoginWithLinkToken: (token: string) => Promise<{ success: boolean; error?: string }>;
    initialInviteToken?: string;
  },
) => React.ReactNode;

const SECTION_REGISTRY: Record<SectionType, SectionRenderFn> = {
  hero: () => <HeroSection />,
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
  gallery: (section) => <PremiumGallery key={section.id} />,
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
  };
}

export function SectionRenderer({ manifest, data, extras }: SectionRendererProps) {
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
            {renderFn(section, data, extras)}
          </Fragment>
        );
      })}
    </>
  );
}
