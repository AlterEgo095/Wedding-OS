// ══════════════════════════════════════════════════════════════════════════════
// /w/[slug]/page.tsx — MANIFEST-DRIVEN PUBLIC WEDDING PAGE (Slice 1)
// ══════════════════════════════════════════════════════════════════════════════
// Renders the wedding experience from the published manifest.
// The section tree is NO LONGER hardcoded — it comes from the manifest which
// is resolved server-side in layout.tsx and passed via WeddingContext.
//
// The manifest controls:
//   - which sections are enabled
//   - their order
//   - the theme (colors, fonts)
//
// The fetch interceptor auto-adds X-Wedding-Slug to all /api/* calls AND
// uses cache: 'no-store' to prevent cross-wedding data leaks (§11 fix).

'use client';

import { useState, useEffect, useLayoutEffect, useCallback, Suspense, useSyncExternalStore } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Navigation from '@/components/Navigation';
import Footer from '@/components/Footer';
import PWAInstall from '@/components/PWAInstall';
import { GuestAuthProvider, useGuestAuth } from '@/components/GuestAuthProvider';
import GuestPersonalSpace from '@/components/GuestPersonalSpace';
import { GuestbookWidget } from '@/components/GuestbookWidget';
import AmbientMusicPlayer from '@/components/AmbientMusicPlayer';
import VisualEffectsLayer from '@/components/effects/VisualEffectsLayer';
import LuxuryVisualEngine from '@/components/luxury/LuxuryVisualEngine';
import { ThemeInjector } from '@/components/wedding/ThemeInjector';
import { SectionRenderer } from '@/components/wedding/SectionRenderer';
import { useWedding } from './wedding-context';

// P2-PERF-10: ISR — revalidate public wedding page every 60 seconds
export const revalidate = 60;

// ─── Types ────────────────────────────────────────────────────────────────────

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
  const isPreviewDraft = searchParams.get('preview') === 'draft';

  const { guest, authenticated, loading: authLoading, loginByLookupToken, loginWithLinkToken } = useGuestAuth();

  // Slice 2: Draft preview manifest (admin-only). When ?preview=draft is set,
  // fetch the draft manifest from the design API and use it instead of the
  // published manifest from context. This lets the admin see their changes
  // before publishing.
  const [previewManifest, setPreviewManifest] = useState<typeof wedding.manifest | null>(null);
  useEffect(() => {
    if (!isPreviewDraft) { setPreviewManifest(null); return; }
    fetch(`/api/weddings/${wedding.id}/design`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.draftManifest) setPreviewManifest(d.draftManifest); })
      .catch(() => {});
  }, [isPreviewDraft, wedding.id]);

  // CONS-6-PIPELINE: prefer the published config's manifest (deployment
  // snapshot) over the binding-based manifest. Preview draft still wins.
  const activeManifest =
    previewManifest || wedding.publishedConfig?.manifest || wedding.manifest;

  const [stories, setStories] = useState<CoupleStory[]>([]);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [settings, setSettings] = useState<VenueSettings | null>(null);
  const [musicSettings, setMusicSettings] = useState<{ file: string; volume: number; enabled: boolean; url: string }>({
    file: '', volume: 0.25, enabled: false, url: '',
  });
  const [loading, setLoading] = useState(true);

  // ─── GLOBAL FETCH INTERCEPTOR (§11 cross-wedding leak fix) ────────────────
  // Wraps window.fetch so every /api/* call gets the X-Wedding-Slug header
  // for tenant scoping. The API routes use dynamic = 'force-dynamic' to
  // prevent server-side ISR caching (the root cause of the cross-wedding
  // data leak). No client-side cache manipulation needed.
  useLayoutEffect(() => {
    const originalFetch = window.fetch;
    const slug = wedding.slug;

    window.fetch = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
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

  // ─── Fetch this wedding's data ─────────────────────────────────────────────
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

  const sectionData = { stories, timeline, settings, loading };
  const sectionExtras = {
    onLoginByLookupToken: loginByLookupToken,
    onLoginWithLinkToken: loginWithLinkToken,
    initialInviteToken: inviteParam || undefined,
  };

  return (
    <div className="min-h-screen flex flex-col">
      <VisualEffectsLayer />
      <LuxuryVisualEngine />
      <ThemeInjector theme={wedding.publishedConfig?.theme ?? null} />

      <Navigation />

      {/* Slice 2: Preview banner */}
      {isPreviewDraft && (
        <div className="bg-amber-500 text-white text-center py-2 px-4 text-sm font-medium sticky top-0 z-50">
          Mode aperçu — modifications non publiées.{' '}
          <a href={`?`} className="underline">Quitter l'aperçu</a>
        </div>
      )}

      <main className="flex-1">
        {/* ─── Manifest-driven rendering (Slice 1) ─────────────────────────── */}
        {/* The section tree comes from the published manifest, NOT hardcoded JSX */}
        {authLoading ? (
          <div className="flex items-center justify-center py-32">
            <div className="shimmer w-full max-w-2xl h-64 rounded-2xl mx-4" />
          </div>
        ) : authenticated && guest ? (
          /* ─── AUTHENTICATED: Hero (from manifest) + personal space ─── */
          <>
            <SectionRenderer
              manifest={activeManifest}
              data={sectionData}
              extras={sectionExtras}
            />
            <GuestPersonalSpace
              guest={guest}
              settings={settings || {}}
              onLogout={async () => {
                await fetch('/api/guest/logout', { method: 'POST' });
                router.refresh();
              }}
            />
          </>
        ) : (
          /* ─── NOT AUTHENTICATED: full manifest-driven experience ─── */
          <SectionRenderer
            manifest={activeManifest}
            data={sectionData}
            extras={sectionExtras}
          />
        )}

        {/* P4.1 — Public Livre d'Or widget (visible to all visitors) */}
        <GuestbookWidget weddingId={wedding.id} slug={wedding.slug} />
      </main>

      <Footer />

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
