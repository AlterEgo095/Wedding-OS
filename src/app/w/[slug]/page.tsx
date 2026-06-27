// ══════════════════════════════════════════════════════════════════════════════
// /w/[slug]/page.tsx — Phase 4 Full Per-Wedding Public UX
// ══════════════════════════════════════════════════════════════════════════════
// Renders the COMPLETE luxury invitation experience for any wedding by slug.
// Reuses ALL the rich components from the root "/" page (HeroSection, OurStory,
// PremiumGallery, EventTimeline, MapSection, GuestPersonalSpace, AmbientMusicPlayer,
// LuxuryVisualEngine, etc.) WITHOUT modifying them.
//
// How it works:
//   1. A GLOBAL window.fetch interceptor is installed on mount. It wraps the native
//      fetch and auto-adds the `X-Wedding-Slug` header to every /api/* request.
//   2. All existing components (HeroSection, GuestAuthProvider, PremiumGallery, etc.)
//      call fetch('/api/...') as usual — the interceptor transparently scopes them
//      to the current wedding.
//   3. The APIs are already tenant-aware (Phase 2): they read X-Wedding-Slug, resolve
//      the tenant, and auto-scope all Prisma queries via the tenant extension.
//
// This is the same proven pattern used by /w/[slug]/admin/page.tsx (Task 3-D).
// Zero changes to any child component → zero regression risk on the root "/" page.
//
// Differences from root "/":
//   - No AdminPanel / hidden admin trigger (admin lives at /w/[slug]/admin)
//   - No AENEWSBanner (marketing banner is platform-specific)
//   - coupleLabel / wedding identity comes from useWedding() (server-resolved)
//   - Guest auto-auth redirect stays within /w/[slug} (not root "/")

'use client';

import { useState, useEffect, useCallback, Suspense, useRef, useSyncExternalStore } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Navigation from '@/components/Navigation';
import HeroSection from '@/components/HeroSection';
import PremiumGallery from '@/components/PremiumGallery';
import OurStory from '@/components/OurStory';
import EventTimeline, { EventTimelineSkeleton } from '@/components/EventTimeline';
import MapSection, { MapSectionSkeleton } from '@/components/MapSection';
import Footer from '@/components/Footer';
import PWAInstall from '@/components/PWAInstall';
import { GuestAuthProvider, useGuestAuth } from '@/components/GuestAuthProvider';
import GuestAuthForm from '@/components/GuestAuthForm';
import GuestPersonalSpace from '@/components/GuestPersonalSpace';
import AmbientMusicPlayer from '@/components/AmbientMusicPlayer';
import VisualEffectsLayer from '@/components/effects/VisualEffectsLayer';
import LuxuryVisualEngine from '@/components/luxury/LuxuryVisualEngine';
import { useWedding } from './wedding-context';

// ─── Types (mirrored from root page.tsx) ──────────────────────────────────────

interface CoupleStory {
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

// ─── Hydration-safe mounted flag ──────────────────────────────────────────────
// useSyncExternalStore returns false on SSR + during hydration, true after.
// This avoids the react-hooks/set-state-in-effect lint error WITHOUT disabling
// the rule, and lets us render a stable loading screen during hydration.

const emptySubscribe = () => () => {};
const getTrue = () => true;
const getFalse = () => false;

// ══════════════════════════════════════════════════════════════════════════════
// WeddingPageContent — the actual page (must be inside GuestAuthProvider)
// ══════════════════════════════════════════════════════════════════════════════

function WeddingPageContent() {
  const wedding = useWedding();
  const router = useRouter();
  const searchParams = useSearchParams();
  const inviteParam = searchParams.get('invite');

  const { guest, authenticated, loading: authLoading, loginByLookupToken, loginWithLinkToken } = useGuestAuth();

  const [stories, setStories] = useState<CoupleStory[]>([]);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [settings, setSettings] = useState<VenueSettings | null>(null);
  const [musicSettings, setMusicSettings] = useState<{ file: string; volume: number; enabled: boolean; url: string }>({
    file: '', volume: 0.25, enabled: false, url: '',
  });
  const [loading, setLoading] = useState(true);

  // ─── GLOBAL FETCH INTERCEPTOR ──────────────────────────────────────────────
  // Wraps window.fetch so every /api/* call automatically gets the X-Wedding-Slug
  // header. This lets ALL existing luxury components (HeroSection, OurStory,
  // PremiumGallery, GuestAuthProvider, GuestPersonalSpace, etc.) work UNCHANGED
  // — they call fetch('/api/...') and the interceptor transparently scopes them
  // to the current wedding.
  //
  // Same pattern as /w/[slug]/admin/page.tsx (Task 3-D), proven to work for all
  // 10 admin components. Cleanup restores window.fetch on unmount.
  useEffect(() => {
    const originalFetch = window.fetch;
    const slug = wedding.slug;

    window.fetch = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      // Only intercept relative /api/ calls — leave absolute URLs (CDN, uploads) alone
      const url = typeof input === 'string' ? input : (input instanceof URL ? input.toString() : input.url);
      if (url.startsWith('/api/') || url.startsWith('api/')) {
        const headers = new Headers(init?.headers || (input instanceof Request ? input.headers : undefined));
        if (!headers.has('X-Wedding-Slug')) {
          headers.set('X-Wedding-Slug', slug);
        }
        return originalFetch(input, { ...init, headers });
      }
      return originalFetch(input, init);
    };

    return () => {
      window.fetch = originalFetch;
    };
  }, [wedding.slug]);

  // ─── Fetch this wedding's data (stories, timeline, settings, music) ────────
  // The fetch interceptor will auto-add X-Wedding-Slug, so plain fetch() works.
  useEffect(() => {
    async function fetchData() {
      try {
        const [storiesRes, timelineRes, settingsRes, musicRes] = await Promise.all([
          fetch('/api/couple-story'),
          fetch('/api/timeline'),
          fetch('/api/settings'),
          fetch('/api/music'),
        ]);

        if (storiesRes.ok) {
          const data = await storiesRes.json();
          setStories(data.stories || data || []);
        }
        if (timelineRes.ok) {
          const data = await timelineRes.json();
          setTimeline(data.events || data || []);
        }
        if (settingsRes.ok) {
          const data = await settingsRes.json();
          if (data.settings && typeof data.settings === 'object') {
            if (Array.isArray(data.settings)) {
              const obj: Record<string, string> = {};
              data.settings.forEach((s: { key: string; value: string }) => {
                obj[s.key] = s.value;
              });
              setSettings(obj as VenueSettings);
            } else {
              setSettings(data.settings as VenueSettings);
            }
          } else if (Array.isArray(data)) {
            const obj: Record<string, string> = {};
            data.forEach((s: { key: string; value: string }) => {
              obj[s.key] = s.value;
            });
            setSettings(obj as VenueSettings);
          }
        }
        if (musicRes.ok) {
          const musicData = await musicRes.json();
          if (musicData.music) {
            setMusicSettings({
              file: musicData.music.music_file || '',
              volume: parseFloat(musicData.music.music_volume) || 0.25,
              enabled: musicData.music.music_enabled === 'true',
              url: musicData.music_url || musicData.music.music_file || '',
            });
          }
        }
      } catch (error) {
        console.error('Error fetching wedding data:', error);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  // ─── Auto-login with encrypted invite link token (?invite=xxx) ──────────────
  useEffect(() => {
    if (inviteParam && !authenticated && !authLoading) {
      loginWithLinkToken(inviteParam);
    }
  }, [inviteParam, authenticated, authLoading, loginWithLinkToken]);

  // ─── Regular landing content (shown when guest is not authenticated) ───────
  const regularContent = (
    <>
      <OurStory stories={stories} />
      <PremiumGallery />
      {loading ? <EventTimelineSkeleton /> : <EventTimeline events={timeline} />}
      {loading ? <MapSectionSkeleton /> : <MapSection settings={settings} />}
      <GuestAuthForm
        onLoginByLookupToken={loginByLookupToken}
        onLoginWithLinkToken={loginWithLinkToken}
        initialInviteToken={inviteParam || undefined}
      />
    </>
  );

  return (
    <div className="min-h-screen flex flex-col">
      {/* Global visual effects layer — sparkles, particles, bokeh */}
      <VisualEffectsLayer />

      {/* Luxury cinematic ambiance engine — independent layer */}
      <LuxuryVisualEngine />

      <Navigation />

      <main className="flex-1">
        {/* ─── Hero: Always visible ─── */}
        <HeroSection />

        {authLoading ? (
          <div className="flex items-center justify-center py-32">
            <div className="shimmer w-full max-w-2xl h-64 rounded-2xl mx-4" />
          </div>
        ) : authenticated && guest ? (
          /* ─── AUTHENTICATED: Show personal space with envelope reveal ─── */
          <GuestPersonalSpace
            guest={guest}
            settings={settings || {}}
            onLogout={async () => {
              await fetch('/api/guest/logout', { method: 'POST' });
              // Stay on the same wedding page after logout
              router.refresh();
            }}
          />
        ) : (
          /* ─── NOT AUTHENTICATED: Full premium experience ─── */
          regularContent
        )}
      </main>

      <Footer />

      {/* Ambient Music Player — per-wedding music settings */}
      <AmbientMusicPlayer
        musicFile={musicSettings.url || musicSettings.file}
        defaultVolume={musicSettings.volume}
        enabled={musicSettings.enabled}
      />

      <PWAInstall />
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// Loading screen — shown during SSR + hydration to avoid mismatches
// ══════════════════════════════════════════════════════════════════════════════

function WeddingLoadingScreen() {
  return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={{
        background:
          'linear-gradient(135deg, oklch(0.12 0.02 270), oklch(0.16 0.02 270), oklch(0.14 0.02 240))',
      }}
    >
      <div className="text-center space-y-4">
        <div className="shimmer w-full h-full fixed inset-0 opacity-30" />
        <div className="relative z-10">
          <div
            className="inline-block w-16 h-16 rounded-full bg-gradient-gold mb-4 animate-pulse"
            aria-hidden
          />
          <p className="text-amber-200/70 text-sm tracking-widest uppercase">
            Chargement de l&apos;invitation…
          </p>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// Default export — wraps content in Suspense + GuestAuthProvider
// ══════════════════════════════════════════════════════════════════════════════

export default function WeddingLandingPage() {
  const mounted = useSyncExternalStore(emptySubscribe, getTrue, getFalse);

  if (!mounted) {
    return <WeddingLoadingScreen />;
  }

  return (
    <Suspense fallback={<WeddingLoadingScreen />}>
      <GuestAuthProvider>
        <WeddingPageContent />
      </GuestAuthProvider>
    </Suspense>
  );
}
