// ══════════════════════════════════════════════════════════════════════════════
// /w/[slug]/WeddingPageClient.tsx — Phase 2A (MISSION 5.9.0 audit §20.4)
// ══════════════════════════════════════════════════════════════════════════════
// Client-side interactive shell for the public wedding page.
//
// Phase 2A refactor: the 4 API calls that this component used to issue on
// mount (`/api/couple-story`, `/api/timeline`, `/api/settings`, `/api/music`)
// have been moved server-side into `getCachedWeddingPageData(slug)` (see
// `src/lib/wedding/cache.ts`). The async Server Component page (`page.tsx`)
// now awaits that cached function and passes the 4 datasets as serializable
// props to this client component.
//
// What stays client-side (the interactive islands):
//   - <GuestAuthProvider>          — guest session check via /api/guest/me
//   - <GuestAuthForm>              — name / code / link-token login (rendered
//                                    via SectionRenderer's `guest-auth` slot)
//   - <RsvpSection>                — RSVP form (Phase 1E, rendered via the
//                                    `rsvp` manifest slot)
//   - <CountdownSection>           — setInterval-based live countdown
//   - <GuestExperienceSection>     — wraps <GuestPersonalSpace>
//   - <AmbientMusicPlayer>         — HTMLAudioElement playback control
//   - <AmbientBackground>           — token-driven ambient effects overlay
//                                    (Phase 4 P4-1: replaces the legacy
//                                    VisualEffectsLayer + LuxuryVisualEngine
//                                    — those files are kept but no longer
//                                    imported here).
//   - <SectionTransition>           — decorative dividers between manifest
//                                    sections (Phase 4 P4-1 — 'line' preset).
//   - <PWAInstall>                 — beforeinstallprompt event listener
//   - <GuestbookWidget>            — public Livre d'Or form + list
//   - The fetch interceptor below  — adds X-Wedding-Slug to all /api/* calls
//   - ?preview=draft manifest fetch — admin-only draft preview (?preview=draft)
//   - ?invite=xxx auto-login       — encrypted link-token auto-login
//
// What moved server-side (no longer client-fetched):
//   - stories   (was: GET /api/couple-story)
//   - timeline  (was: GET /api/timeline)
//   - settings  (was: GET /api/settings)
//   - music     (was: GET /api/music)
//
// The wedding identity + manifest + publishedConfig are still provided by
// the layout via <WeddingContextProvider> (unchanged). This component reads
// them via useWedding().

'use client';

import {
  useState,
  useEffect,
  useLayoutEffect,
  Suspense,
} from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Navigation from '@/components/Navigation';
import Footer from '@/components/Footer';
import PWAInstall from '@/components/PWAInstall';
import { GuestAuthProvider, useGuestAuth } from '@/components/GuestAuthProvider';
import GuestPersonalSpace from '@/components/GuestPersonalSpace';
import { GuestbookWidget } from '@/components/GuestbookWidget';
import AmbientMusicPlayer from '@/components/AmbientMusicPlayer';
// ─── Phase 4 (MISSION 5.9.1 P4-1) — consolidated ambient effects + dividers ────
// AmbientBackground replaces the legacy VisualEffectsLayer + LuxuryVisualEngine.
// It is token-driven (reads --theme-primary, --theme-ambiance, --theme-pattern,
// --motion-tier from :root) and consolidates 3 layers into one overlay:
//   - particles (gold dots, drift speed = --motion-tier)
//   - glow (radial gradient from --theme-ambiance)
//   - pattern (--theme-pattern URL at 5% opacity)
// variant="all" renders all 3; intensity="normal" gives 22 particles + 40% glow.
//
// SectionTransition is the decorative scroll-triggered divider rendered between
// manifest sections ('line' preset — thin gold line that grows on reveal). Both
// components respect prefers-reduced-motion internally (no new animation layer
// added here). The legacy VisualEffectsLayer.tsx + LuxuryVisualEngine.tsx files
// are NOT deleted (other code may reference them) — just no longer imported.
import { AmbientBackground, SectionTransition } from '@/components/premium';
import { ThemeInjector } from '@/components/wedding/ThemeInjector';
import { SectionRenderer } from '@/components/wedding/SectionRenderer';
import type { SectionRendererData } from '@/components/wedding/SectionRenderer';
import { useWedding } from './wedding-context';
import type {
  CachedCoupleStory,
  CachedTimelineEvent,
  CachedSettings,
  CachedMusicSettings,
} from '@/lib/wedding/cache';
import type { WeddingManifest } from '@/lib/wedding/manifest';
// ─── Phase 4A (MISSION 5.9.0 §20.6) — Preview Lab + identity override ──────────
// `?preview=true`  → read-only preview mode (skips guest auth, no visit logged,
//                    shows a "Preview" banner). Used by the platform admin's
//                    /platform/admin/preview/[slug] iframe.
// `?identity=<id>` → overrides the wedding's theme + hero/gallery with one of
//                    the 5 identity presets (royal-luxury / minimal-editorial /
//                    botanical-romance / cinematic-dark / modern-champagne).
//                    The override is CLIENT-side only (no DB write) so the
//                    admin can preview an identity without committing it.
import {
  isWeddingIdentity,
  getIdentityPreset,
  identityPresetToThemePreset,
  type WeddingIdentity,
} from '@/lib/themes/identity-presets';
// ─── MISSION 5.9.2 P2-5 — DB theme preview (?theme=<slug>) ────────────────────
// safeJsonParse is used to defensively parse the themeOverride's configJson +
// paletteJson strings (passed from the Server Component). The Server Component
// pre-probes them too, but we re-parse here so the client can log per-field
// parse errors (surface missing → warn, primary missing → warn, etc.) without
// affecting the server render. Reused from the existing @/lib/safe-json helper.
import { safeJsonParse } from '@/lib/safe-json';

// ─── Props (all serializable — passed from the async Server Component page) ───

/**
 * P2-5 — Theme override blob (DB-backed PlatformTheme).
 *
 * Passed by the Server Component `/w/[slug]/page.tsx` ONLY when:
 *   1. The request is in preview mode (?preview=true + valid 24h signed token).
 *   2. The `?theme=<slug>` query param is present.
 *   3. A PlatformTheme row with that slug exists in the DB.
 *   4. Its `configJson` + `paletteJson` columns are parseable JSON.
 *
 * The raw JSON strings are passed AS-IS (not pre-parsed) so this client
 * component can log parse errors per-field without affecting the server
 * render. The fields map 1:1 to the PlatformTheme Prisma model:
 *   - slug, name       → display metadata
 *   - paletteJson      → "{primary, accent, background, surface, …}" (legacy palette)
 *   - configJson       → "{colors, fonts, pattern, ambiance, motionTier, …}" (full config)
 *   - fontDisplay, fontBody → nullable font family names (override the palette)
 *   - identity         → optional WeddingIdentity slug (for sectionOverrides)
 *
 * When null/absent, the client falls through to the identityOverride branch
 * (?identity=<id>) or the publishedConfig theme (default).
 */
export interface ThemeOverrideProp {
  slug: string;
  name: string;
  paletteJson: string;
  configJson: string;
  fontDisplay: string | null;
  fontBody: string | null;
  identity: string | null;
}

export interface WeddingPageClientProps {
  /** Server-fetched couple story chapters (was GET /api/couple-story). */
  stories: CachedCoupleStory[];
  /** Server-fetched event timeline (was GET /api/timeline). */
  timeline: CachedTimelineEvent[];
  /** Server-fetched settings map (was GET /api/settings). */
  settings: CachedSettings;
  /** Server-fetched ambient music settings (was GET /api/music). */
  music: CachedMusicSettings;
  /**
   * P2-5 — DB-backed theme override (passed by the Server Component when
   * `?theme=<slug>` is present AND the request is in preview mode). Optional
   * + defaults to null so the non-preview path (normal visitors) is fully
   * backward-compatible.
   */
  themeOverride?: ThemeOverrideProp | null;
}

// ─── Loading screen — shown inside Suspense while useSearchParams resolves ────

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
// WeddingPageContent — the actual page (must be inside GuestAuthProvider)
// ══════════════════════════════════════════════════════════════════════════════

function WeddingPageContent({
  stories,
  timeline,
  settings,
  music,
  themeOverride,
}: WeddingPageClientProps) {
  const wedding = useWedding();
  const router = useRouter();
  const searchParams = useSearchParams();
  const inviteParam = searchParams.get('invite');
  const isPreviewDraft = searchParams.get('preview') === 'draft';
  // ─── Phase 4A — read-only preview mode (?preview=true) ─────────────────────
  // Skips the guest auth gate (admin sees the full page without logging in),
  // does NOT call /api/guest/me (so no visit is logged, no analytics event
  // fires), and skips the ?invite auto-login. The admin can SEE the page but
  // cannot submit RSVPs or interact with guest-only features (no guest
  // session is established).
  const isPreviewTrue = searchParams.get('preview') === 'true';
  // ─── Phase 4A — identity override (?identity=<id>) ──────────────────────────
  // When the query param resolves to one of the 5 wedding identities, the
  // theme + hero/gallery are overridden with that identity's preset. The
  // override is CLIENT-side only (no DB write) so the admin can preview an
  // identity without committing it. Used by the Preview Lab iframe.
  const identityParam = searchParams.get('identity');
  const identityOverride: WeddingIdentity | null =
    identityParam !== null && isWeddingIdentity(identityParam) ? identityParam : null;

  const { guest, authenticated, loading: authLoading, loginByLookupToken, loginWithLinkToken } = useGuestAuth();

  // Slice 2: Draft preview manifest (admin-only). When ?preview=draft is set,
  // fetch the draft manifest from the design API and use it instead of the
  // published manifest from context. This lets the admin see their changes
  // before publishing.
  //
  // NOTE: this fetch stays client-side because it requires admin cookies
  // (admin session) and is per-user (the draft is visible only to admins).
  // It cannot be moved to the server page without breaking the admin-only
  // visibility invariant — and it would force the entire page to be
  // dynamically rendered (cookies() opt out of ISR).
  const [previewManifest, setPreviewManifest] = useState<WeddingManifest | null>(null);
  useEffect(() => {
    if (!isPreviewDraft) {
      setPreviewManifest(null);
      return;
    }
    fetch(`/api/weddings/${wedding.id}/design`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { draftManifest?: WeddingManifest } | null) => {
        if (d?.draftManifest) setPreviewManifest(d.draftManifest);
      })
      .catch(() => {});
  }, [isPreviewDraft, wedding.id]);

  // CONS-6-PIPELINE: prefer the published config's manifest (deployment
  // snapshot) over the binding-based manifest. Preview draft still wins.
  const activeManifest: WeddingManifest =
    previewManifest || wedding.publishedConfig?.manifest || wedding.manifest;

  // ─── GLOBAL FETCH INTERCEPTOR (§11 cross-wedding leak fix) ────────────────
  // Wraps window.fetch so every /api/* call gets the X-Wedding-Slug header
  // for tenant scoping. The API routes use dynamic = 'force-dynamic' to
  // prevent server-side ISR caching (the root cause of the cross-wedding
  // data leak). No client-side cache manipulation needed.
  //
  // This stays in the client shell because Footer / Navigation /
  // GuestbookWidget / GuestPersonalSpace still fetch their own /api/* data
  // after hydration (e.g. GET /api/settings for the footer's couple label).
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

  // ─── Auto-login with encrypted invite link token (?invite=xxx) ──────────────
  // Phase 4A — skip auto-login in read-only preview mode (?preview=true). The
  // admin viewing the preview should not be auto-logged-in as a guest (that
  // would defeat the read-only invariant and pollute the guest session).
  useEffect(() => {
    if (isPreviewTrue) return;
    if (inviteParam && !authenticated && !authLoading) {
      loginWithLinkToken(inviteParam);
    }
  }, [isPreviewTrue, inviteParam, authenticated, authLoading, loginWithLinkToken]);

  // The 4 datasets are now server-fetched — `loading` is always false here
  // (the page's <loading.tsx> shows the route-level skeleton while the
  // server fetches; by the time this client component renders, the data is
  // already in the props).
  const sectionData: SectionRendererData = {
    stories,
    timeline,
    settings,
    loading: false,
  };
  const sectionExtras = {
    onLoginByLookupToken: loginByLookupToken,
    onLoginWithLinkToken: loginWithLinkToken,
    initialInviteToken: inviteParam || undefined,
    // Phase 4D — wedding slug passed to InvitationSection + CtaSection so
    // their <WhatsAppShare> button can build the shareable URL. The slug
    // comes from the wedding context (resolved server-side in layout.tsx)
    // — never from the URL, so a guest can't spoof a cross-tenant share.
    weddingSlug: wedding.slug,
  };

  // ─── Phase 4A + 5.9.2 P0 (QW5) + P2-5 — compute the theme override ───────
  // The theme precedence (highest → lowest):
  //   1. P2-5 themeOverride (?theme=<slug>)  — DB-backed PlatformTheme
  //      resolved server-side. ONLY present in preview mode (token-gated).
  //      Lets the admin preview ANY of the 21 DB themes, not just the 5
  //      identity presets.
  //   2. identityOverride (?identity=<id>)   — 5 hardcoded identity presets
  //      resolved client-side. CLIENT-only (no DB write).
  //   3. publishedConfig.theme               — the wedding's saved theme
  //      (written by the QW6 apply endpoint). The customizations blob
  //      (if present) is passed through to ThemeInjector.
  //
  // The themeOverride branch MUST be checked BEFORE identityOverride so
  // that, if both `?theme=X` and `?identity=Y` are present in the URL
  // (unlikely but possible), the theme wins. The Preview Lab UI disables
  // the identity selector when a theme is selected, so the user shouldn't
  // be able to set both — but defense in depth.
  //
  // MISSION 5.9.2 P0 (QW5): The resolved theme now includes a `customizations`
  // blob with ALL 13 CSS tokens (surface, surfaceDeep, text, textMuted, pattern,
  // ambiance, primaryLight, primaryDark, accentLight, motionTier) so the
  // ThemeInjector (QW2) can set the full --theme-* variable set. Without this,
  // identity presets' dark surfaces, patterns, and ambiance gradients are dead
  // data on the render path (audit 5.9.1 P0-2).
  const resolvedTheme = (() => {
    // ─── P2-5 — DB theme override (?theme=<slug> resolved server-side) ─────
    // The Server Component already verified the preview token + fetched the
    // PlatformTheme row + pre-probed the JSON. We re-parse here so per-field
    // parse errors are surfaced in the browser console (not just server logs).
    if (themeOverride) {
      const cfg = safeJsonParse<Record<string, unknown>>(
        themeOverride.configJson,
        {},
      );
      const pal = safeJsonParse<Record<string, unknown>>(
        themeOverride.paletteJson,
        {},
      );
      // ── colors + fonts sub-objects (defensive — they may be missing) ────
      // configJson shape (from seed-platform-themes-phase1.cjs):
      //   { colors: { primary, primaryLight, primaryDark, accent, accentLight,
      //               surface, surfaceDeep, text, textMuted },
      //     fonts:  { display, body, displayWeight, bodyWeight },
      //     pattern, ambiance, motionTier, layout, features }
      // paletteJson (legacy field — fewer keys):
      //   { primary, accent, background, surface, surfaceDeep, text }
      const colorsRaw = cfg.colors;
      const colors =
        colorsRaw && typeof colorsRaw === 'object' ?
          (colorsRaw as Record<string, unknown>) :
          {};
      const fontsRaw = cfg.fonts;
      const fonts =
        fontsRaw && typeof fontsRaw === 'object' ?
          (fontsRaw as Record<string, unknown>) :
          {};
      // ── coerce values to strings (they may be unknown) ─────────────────
      // We only accept string values — non-strings (number, object, null)
      // are skipped so the ThemeInjector fallbacks take over. This is more
      // defensive than the identity preset path (which trusts its own
      // in-memory shape) because the DB JSON is user-editable.
      const str = (v: unknown): string | undefined =>
        typeof v === 'string' && v.length > 0 ? v : undefined;

      // Base merge — start from the published theme (so we keep layout +
      // any other fields the override doesn't touch). The published theme
      // is the wedding's saved Theme (already includes customizations from
      // the QW6 apply endpoint). We spread it first so the override wins.
      const merged =
        wedding.publishedConfig?.theme ?? null;

      // Build the merged theme object. We DON'T reuse the identity preset's
      // identityPresetToThemePreset helper because the DB theme has a
      // completely different shape (configJson with nested colors/fonts vs
      // a flat preset object). The 4 core fields are pulled from the override
      // first, then the customizations blob is built from the 9 extended
      // tokens (falling back to paletteJson or the merged base where needed).
      // P2-5 — `baseCustomizations` is the published theme's existing
      // customizations blob (if any). We spread it first so the override
      // wins, but inherited fields (e.g. sectionOverrides from QW6) survive.
      const baseCustomizations: Record<string, unknown> =
        (merged?.customizations as Record<string, unknown> | undefined) ?? {};
      return {
        primaryColor:
          str(colors.primary) ||
          str(pal.primary) ||
          merged?.primaryColor ||
          '#A8743D', // last-ditch fallback — Modern Champagne default
        accentColor:
          str(colors.accent) ||
          str(pal.accent) ||
          merged?.accentColor ||
          '#D9C3A1',
        fontDisplay:
          themeOverride.fontDisplay ||
          str(fonts.display) ||
          merged?.fontDisplay ||
          'Playfair Display',
        fontBody:
          themeOverride.fontBody ||
          str(fonts.body) ||
          merged?.fontBody ||
          'Inter',
        layout: merged?.layout ?? 'classic',
        // QW5: pass the full customizations blob so ThemeInjector can set
        // all 13 --theme-* CSS variables (not just the 4 core ones). For
        // the DB theme override, we read the 9 extended tokens from the
        // configJson.colors sub-object (falling back to paletteJson for
        // surface/surfaceDeep/text — those exist in both shapes).
        customizations: {
          ...baseCustomizations,
          identity: themeOverride.identity ?? undefined,
          surface: str(colors.surface) ?? str(pal.surface),
          surfaceDeep: str(colors.surfaceDeep) ?? str(pal.surfaceDeep),
          text: str(colors.text) ?? str(pal.text),
          textMuted: str(colors.textMuted),
          primaryLight: str(colors.primaryLight),
          primaryDark: str(colors.primaryDark),
          accentLight: str(colors.accentLight),
          pattern: str(cfg.pattern),
          ambiance: str(cfg.ambiance),
          motionTier: str(cfg.motionTier),
        },
      };
    }

    // ─── Phase 4A — identity preset override (?identity=<id>) ─────────────
    if (identityOverride) {
      const preset = getIdentityPreset(identityOverride);
      if (preset) {
        const merged = identityPresetToThemePreset(preset);
        return {
          primaryColor: merged.primaryColor,
          accentColor: merged.accentColor,
          fontDisplay: merged.fontDisplay,
          fontBody: merged.fontBody,
          layout: merged.layout,
          // QW5: pass the full customizations blob so ThemeInjector can set
          // all 13 --theme-* CSS variables (not just the 4 core ones).
          customizations: {
            identity: preset.id,
            surface: merged.surface ?? null,
            surfaceDeep: merged.surfaceDeep ?? null,
            text: merged.text ?? null,
            textMuted: merged.textMuted ?? null,
            primaryLight: merged.primaryLight ?? null,
            primaryDark: merged.primaryDark ?? null,
            accentLight: merged.accentLight ?? null,
            pattern: merged.pattern ?? null,
            ambiance: merged.ambiance ?? null,
            motionTier: merged.motionTier ?? null,
          },
        };
      }
    }
    // QW5: publishedConfig.theme may include customizations (when the wedding
    // was published after the apply endpoint QW6 was used). The customizations
    // blob (if present) is passed through to ThemeInjector which reads the
    // extended tokens (surface, pattern, ambiance, etc.) from it.
    return wedding.publishedConfig?.theme ?? null;
  })();

  return (
    <div className="min-h-screen flex flex-col">
      {/* Phase 4 (P4-1) — consolidated ambient effects overlay (token-driven).
          Replaces the previous <VisualEffectsLayer /> + <LuxuryVisualEngine />
          pair. variant="all" renders particles + glow + pattern layers.
          intensity="normal" matches the previous default density (22 dots). */}
      <AmbientBackground variant="all" intensity="normal" />
      <ThemeInjector theme={resolvedTheme} />

      <Navigation />

      {/* Slice 2: Preview banner — draft mode (existing, ?preview=draft) */}
      {isPreviewDraft && (
        <div className="bg-amber-500 text-white text-center py-2 px-4 text-sm font-medium sticky top-0 z-50">
          Mode aperçu — modifications non publiées.{' '}
          <a href={`?`} className="underline">Quitter l&apos;aperçu</a>
        </div>
      )}
      {/* Phase 4A — read-only preview banner (?preview=true, from the Preview
          Lab iframe). Distinct color from the draft banner so admins can
          tell the two modes apart. */}
      {isPreviewTrue && (
        <div className="bg-violet-600 text-white text-center py-2 px-4 text-sm font-medium sticky top-0 z-50 flex items-center justify-center gap-3">
          <span>
            🔒 Mode aperçu lecture seule
            {/* P2-5 — show the DB theme slug when a themeOverride is applied.
                Takes precedence over identityOverride (see resolvedTheme above). */}
            {themeOverride && (
              <span className="ml-2 opacity-80">— thème: {themeOverride.slug}</span>
            )}
            {!themeOverride && identityOverride && (
              <span className="ml-2 opacity-80">— identité: {identityOverride}</span>
            )}
          </span>
          <span className="text-[10px] uppercase tracking-wider bg-white/20 px-2 py-0.5 rounded-full">
            Pas de visite comptée
          </span>
        </div>
      )}

      <main id="main" className="flex-1">
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
              identity={identityOverride}
            />
            {/* Phase 4 (P4-1) — decorative divider between the manifest-driven
                section block and the guest personal space. 'line' preset =
                thin gold line that grows from 0→60% width on reveal. */}
            <SectionTransition preset="line" />
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
            identity={identityOverride}
          />
        )}

        {/* Phase 4 (P4-1) — decorative divider between the main content block
            (manifest + personal space when authenticated, or just manifest
            when not) and the public Livre d'Or widget. Visually separates the
            couple's curated narrative from the visitor-contributed messages. */}
        <SectionTransition preset="line" />

        {/* P4.1 — Public Livre d'Or widget (visible to all visitors) */}
        <GuestbookWidget weddingId={wedding.id} slug={wedding.slug} />
      </main>

      <Footer />

      <AmbientMusicPlayer
        musicFile={music.url || music.file}
        defaultVolume={music.volume}
        enabled={music.enabled}
      />

      <PWAInstall />
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// Default export — wraps content in Suspense + GuestAuthProvider
// ══════════════════════════════════════════════════════════════════════════════
//
// Suspense is required because <WeddingPageContent> uses useSearchParams()
// — Next.js 16 needs a Suspense boundary around any component that reads
// search params so the route can still be statically generated with ISR
// (the search params are resolved on the client at hydration time).
//
// Phase 4A — the `preview` flag is read at the root (inside Suspense) so
// GuestAuthProvider can skip the /api/guest/me session check when
// ?preview=true is set (read-only preview mode, no visit logged).

function WeddingPageRoot(props: WeddingPageClientProps) {
  const searchParams = useSearchParams();
  // Read-only preview mode (?preview=true) — passed to GuestAuthProvider so
  // it skips the session check. The same flag is also read inside
  // <WeddingPageContent> for the banner + ?invite auto-login skip.
  const isPreviewTrue = searchParams.get('preview') === 'true';
  return (
    <GuestAuthProvider preview={isPreviewTrue}>
      <WeddingPageContent {...props} />
    </GuestAuthProvider>
  );
}

export default function WeddingPageClient(props: WeddingPageClientProps) {
  return (
    <Suspense fallback={<WeddingLoadingScreen />}>
      <WeddingPageRoot {...props} />
    </Suspense>
  );
}
