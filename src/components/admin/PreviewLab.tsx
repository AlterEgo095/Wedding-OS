// ══════════════════════════════════════════════════════════════════════════════
// src/components/admin/PreviewLab.tsx
// Phase 4A (MISSION 5.9.0 audit §20.6) — Interactive Preview Lab client island
// ══════════════════════════════════════════════════════════════════════════════
//
// Renders the interactive multi-device + multi-identity preview lab for the
// platform admin. Mounted by /platform/admin/preview/[weddingSlug]/page.tsx.
//
// FEATURES:
//   - Device selector (4 presets): Mobile 375×667, Tablet 768×1024,
//     Desktop 1280×800, Large 1920×1080. The iframe is scaled to fit the
//     available width while preserving the device's aspect ratio.
//   - Identity selector (6 buttons): 5 identity presets (royal-luxury,
//     minimal-editorial, botanical-romance, cinematic-dark, modern-champagne)
//     + "Current theme" (the wedding's actual published theme — no
//     ?identity= query param on the iframe src).
//   - Compare mode: shows 2 iframes side-by-side with independently
//     selectable identities (A/B compare). Useful for comparing the
//     current theme against a candidate identity.
//   - Share button: generates a deep link
//     /platform/admin/preview/${slug}?identity=${id}&device=${device}
//     that pre-selects the current identity + device on load. Copies to
//     clipboard with a toast confirmation.
//   - Device frame: mobile gets a phone bezel (rounded corners + notch),
//     tablet gets a thin tablet frame, desktop/large get a plain browser
//     chrome border. Pure CSS — no asset dependencies.
//
// ─── MISSION 5.9.2 P2-5 — DB theme selector (?theme=<slug>) ───────────────────
// EXTENSION: in addition to the 5 identity presets, the admin can now preview
// ANY of the 21 DB-backed PlatformThemes via a separate <ThemeSelector>
// dropdown (shadcn Select component, next to the identity selector).
//
//   When "Courant" is selected (default) → no ?theme= param on the iframe
//     URL. The identity selector stays enabled. Behavior matches Phase 4A.
//
//   When a DB theme is selected → the iframe URL gets `?theme=<slug>`
//     INSTEAD of `?identity=<id>` (theme wins over identity per the
//     <WeddingPageClient> resolvedTheme precedence). The identity selector
//     is disabled (greyed out) + a small note "Thème sélectionné — identité
//     désactivée" is shown. Switching back to "Courant" re-enables it.
//
//   Compare mode supports INDEPENDENT theme selection per pane (themeA +
//     themeB). If compare mode is toggled ON while a global theme is
//     selected, the theme is applied to pane A by default + pane B stays
//     on "Courant" (so the admin sees the candidate theme next to the
//     current theme — the most common comparison use case).
//
//   The share deep-link round-trips ?theme= + ?themeB= so the admin can
//     share a specific theme comparison (e.g. "compare royal-gold vs the
//     current theme on mobile" → one URL).
//
// READ-ONLY:
//   The iframe loads /w/[slug]?identity=${id}&preview=true&token=${jwt}. The
//   ?preview=true query param triggers the wedding page's preview mode (see
//   WeddingPageClient.tsx): skips the guest auth gate (admin sees the full
//   page without logging in as a guest), skips the ?invite auto-login, and
//   does NOT call /api/guest/me (so no visit is logged, no analytics event
//   fires). The admin can SEE the page but cannot submit RSVPs or interact
//   with guest-only features (those require a guest session, which the
//   preview mode does NOT establish).
//
//   Phase 5.9.0 POST-PHASE-3 — SIGNED TOKEN GATE:
//   `?preview=true` alone is no longer sufficient. The /w/[slug] route now
//   verifies a 24h signed JWT (`?token=xxx`) BEFORE granting preview mode.
//   This component fetches a fresh token from /api/platform/preview-token/
//   {slug} on mount (PLATFORM_ADMIN auth cookie is sent automatically), then
//   appends it to every iframe URL. If the fetch fails (network error, 401,
//   429, 500), we fall back to `?preview=true` only — the iframe will then
//   redirect to the bare /w/[slug] URL (no preview mode) and show the guest
//   auth page. That's degraded UX (admin can't preview) but NOT a security
//   hole (no unauthorized access). The admin sees a warning toast explaining
//   the fallback.
//
//   TOKEN LIFECYCLE:
//   - Fetched on mount + whenever wedding.slug changes.
//   - 24h TTL (server-enforced). If the token expires mid-session, the
//     iframe will start getting redirected to the guest auth page — the
//     admin can refresh the page (or click Refresh) to trigger a new fetch.
//   - The expiry time is shown in the control bar ("Jeton valide 24h —
//     expiré à HH:MM") so the admin knows when to refresh.
//
//   P2-5 — THEME LIFECYCLE:
//   - The 21 PlatformThemes are fetched once on mount from
//     /api/platform/themes?limit=200 (PLATFORM_ADMIN auth cookie is sent
//     automatically). The fetch is independent of the preview token fetch
//     (they can run in parallel).
//   - If the themes fetch fails (401/403/429/500/network), the theme
//     selector is hidden (NOT shown empty). The admin can still use the
//     identity selector — only the DB theme preview is degraded.
//   - The themes are cached in component state for the lifetime of the
//     page (no TTL). If a new theme is published mid-session, the admin
//     can refresh the page to re-fetch.
//
// PERFORMANCE:
//   The iframe loads the actual /w/[slug] page (the route is now dynamic
//   since Phase 5.9.0 POST-PHASE-3 — the page reads searchParams to verify
//   the token). The ?identity= + ?preview= + ?token= query params are read
//   server-side by the page (token verification) and client-side by
//   <WeddingPageClient> (identity + preview-mode UI).

'use client';

import { useState, useCallback, useMemo, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import {
  Smartphone,
  Tablet,
  Monitor,
  Maximize,
  Share2,
  GitCompare,
  ExternalLink,
  RefreshCw,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
// P2-5 — shadcn Select for the DB theme dropdown (21 themes would be too
// many for the button-grid pattern used by the identity selector).
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

// ─── Types (mirrored from the server page, kept local for clarity) ────────────

export interface PreviewLabIdentity {
  id: string;
  label: string;
  description: string;
  preview: {
    bg: string;
    text: string;
    swatch: string[];
  };
}

export interface PreviewLabWedding {
  id: string;
  slug: string;
  coupleLabel: string;
  brideName: string;
  groomName: string;
  status: string;
  plan: string;
  weddingDate: string | null;
  venueName: string | null;
  venueCity: string | null;
  isDefault: boolean;
  currentThemeName: string;
}

/**
 * P2-5 — DB-backed PlatformTheme row (mirrors the API response shape).
 *
 * Fetched on mount from /api/platform/themes?limit=200. We keep only the
 * fields the selector UI needs (slug + display metadata) — the full
 * configJson is fetched server-side by /w/[slug]/page.tsx when the admin
 * actually previews the theme (so we don't bloat the client bundle with
 * 21 theme configs the user might never open).
 */
export interface PreviewLabPlatformTheme {
  id: string;
  slug: string;
  name: string;
  tier: string;          // FREE | STANDARD | PREMIUM | EXCLUSIVE
  category: string | null; // ROYAL | LUXURY | EDITORIAL | ...
  isPremium: boolean;
  isRecommended: boolean;
  isDefault: boolean;
  identity: string | null;
}

// ─── Device presets ──────────────────────────────────────────────────────────

type DeviceId = 'mobile' | 'tablet' | 'desktop' | 'large';

interface DevicePreset {
  id: DeviceId;
  label: string;
  width: number;
  height: number;
  icon: typeof Smartphone;
  /** Visual frame style applied to the iframe wrapper. */
  frame: 'phone' | 'tablet' | 'browser';
}

const DEVICE_PRESETS: DevicePreset[] = [
  { id: 'mobile',  label: 'Mobile',   width: 375,  height: 667,  icon: Smartphone, frame: 'phone' },
  { id: 'tablet',  label: 'Tablet',   width: 768,  height: 1024, icon: Tablet,      frame: 'tablet' },
  { id: 'desktop', label: 'Desktop',  width: 1280, height: 800,  icon: Monitor,     frame: 'browser' },
  { id: 'large',   label: 'Large',    width: 1920, height: 1080, icon: Maximize,    frame: 'browser' },
];

const DEVICE_LABELS: Record<DeviceId, string> = {
  mobile: 'Mobile 375',
  tablet: 'Tablet 768',
  desktop: 'Desktop 1280',
  large: 'Large 1920',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Build the iframe src URL for a given identity + wedding slug.
 * - identity='current' → no ?identity= param (uses the wedding's published theme)
 * - identity=<id>      → ?identity=<id> (overrides the theme via IdentityHero etc.)
 * Always includes ?preview=true so the wedding page renders in preview mode
 * (skips guest auth, no visit logged).
 * - token (optional)   → ?token=<jwt> — required by the /w/[slug] route's
 *   Phase 5.9.0 POST-PHASE-3 signed-token gate. If absent, the iframe will
 *   redirect to the bare /w/[slug] URL (no preview mode, guest auth shown).
 *
 * P2-5 — `themeSlug` param (optional):
 *   - 'current' (or null/undefined) → no ?theme= param (identity wins as before)
 *   - <slug>                        → ?theme=<slug> is set INSTEAD of ?identity=
 *     (theme > identity per <WeddingPageClient> resolvedTheme precedence).
 *     The identity param is dropped because the theme already encodes its
 *     own identity (PlatformTheme.identity column).
 */
function buildIframeSrc(
  slug: string,
  identity: string,
  token?: string | null,
  themeSlug?: string | null,
): string {
  const params = new URLSearchParams({ preview: 'true' });
  // P2-5 — theme wins over identity. Only ONE of the two is set on the URL
  // so the <WeddingPageClient> resolvedTheme precedence is unambiguous (the
  // Server Component only fetches the PlatformTheme when ?theme= is present,
  // so setting both would still work — but it's cleaner to drop ?identity=
  // when a theme is active).
  if (themeSlug && themeSlug !== 'current') {
    params.set('theme', themeSlug);
  } else if (identity !== 'current') {
    params.set('identity', identity);
  }
  if (token) {
    params.set('token', token);
  }
  return `/w/${slug}?${params.toString()}`;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

/**
 * Device selector — 4 buttons. Highlights the active device.
 */
function DeviceSelector({
  active,
  onSelect,
}: {
  active: DeviceId;
  onSelect: (id: DeviceId) => void;
}) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <span className="text-[10px] uppercase tracking-wider text-white/40 mr-1">
        Device
      </span>
      {DEVICE_PRESETS.map((d) => {
        const Icon = d.icon;
        const isActive = active === d.id;
        return (
          <Button
            key={d.id}
            size="sm"
            variant={isActive ? 'default' : 'outline'}
            className={`h-8 text-xs gap-1.5 ${
              isActive
                ? 'bg-gold text-black hover:bg-gold/90 border-gold'
                : 'border-white/15 text-white/70 hover:text-white hover:border-white/30 bg-white/[0.02]'
            }`}
            onClick={() => onSelect(d.id)}
          >
            <Icon className="size-3.5" />
            {d.label}
            <span className="text-[10px] opacity-60 ml-1 hidden sm:inline">
              {d.width}px
            </span>
          </Button>
        );
      })}
    </div>
  );
}

/**
 * Identity selector — N buttons (Current + N identities).
 * Used for both the primary (A) and secondary (B, compare mode) selectors.
 *
 * P2-5 — `disabled` prop: when a DB theme is active, the identity selector
 * is greyed out (the theme's identity takes over). The admin can still see
 * the current selection but cannot change it until they switch back to
 * "Courant" in the theme selector.
 */
function IdentitySelector({
  label,
  active,
  identities,
  currentThemeName,
  onSelect,
  disabled = false,
}: {
  label: string;
  active: string;
  identities: PreviewLabIdentity[];
  currentThemeName: string;
  onSelect: (id: string) => void;
  disabled?: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-1.5 flex-wrap ${
        disabled ? 'opacity-40 pointer-events-none' : ''
      }`}
    >
      <span className="text-[10px] uppercase tracking-wider text-white/40 mr-1">
        {label}
      </span>
      <Button
        size="sm"
        variant={active === 'current' ? 'default' : 'outline'}
        className={`h-8 text-xs gap-1.5 ${
          active === 'current'
            ? 'bg-white text-black hover:bg-white/90 border-white'
            : 'border-white/15 text-white/70 hover:text-white hover:border-white/30 bg-white/[0.02]'
        }`}
        onClick={() => onSelect('current')}
        title={currentThemeName}
        disabled={disabled}
      >
        <span className="size-2 rounded-full bg-gradient-to-br from-gold to-amber-300" />
        Thème actuel
      </Button>
      {identities.map((identity) => {
        const isActive = active === identity.id;
        return (
          <Button
            key={identity.id}
            size="sm"
            variant={isActive ? 'default' : 'outline'}
            className={`h-8 text-xs gap-1.5 ${
              isActive
                ? 'bg-gold text-black hover:bg-gold/90 border-gold'
                : 'border-white/15 text-white/70 hover:text-white hover:border-white/30 bg-white/[0.02]'
            }`}
            onClick={() => onSelect(identity.id)}
            title={identity.description}
            disabled={disabled}
          >
            {/* Swatch chip — 4 mini color squares from the identity's preview */}
            <span
              className="inline-flex size-3 rounded-sm overflow-hidden border border-white/20"
              style={{ background: identity.preview.bg }}
              aria-hidden
            >
              {identity.preview.swatch.slice(0, 4).map((c, i) => (
                <span
                  key={i}
                  className="flex-1"
                  style={{ background: c }}
                />
              ))}
            </span>
            <span className="truncate max-w-[120px]">{identity.label}</span>
          </Button>
        );
      })}
    </div>
  );
}

/**
 * P2-5 — DB theme selector (shadcn Select dropdown).
 *
 * Renders a compact dropdown listing all 21 DB-backed PlatformThemes,
 * grouped by tier (FREE / STANDARD / PREMIUM / EXCLUSIVE). When "Courant"
 * is selected (default), no ?theme= param is added to the iframe URL.
 *
 * The dropdown is shown NEXT TO the identity selector. Both selectors are
 * always rendered — when a theme is active, the identity selector is
 * greyed out (see IdentitySelector's `disabled` prop) and a small note
 * appears below.
 */
function ThemeSelector({
  label,
  active,
  themes,
  onSelect,
}: {
  label: string;
  active: string; // 'current' | <themeSlug>
  themes: PreviewLabPlatformTheme[];
  onSelect: (slug: string) => void;
}) {
  // Group themes by tier for the dropdown (FREE first, then STANDARD,
  // PREMIUM, EXCLUSIVE — matches the catalog ordering convention).
  const tierOrder = ['FREE', 'STANDARD', 'PREMIUM', 'EXCLUSIVE'] as const;
  const grouped = useMemo(() => {
    const map = new Map<string, PreviewLabPlatformTheme[]>();
    for (const t of themes) {
      const bucket = map.get(t.tier) ?? [];
      bucket.push(t);
      map.set(t.tier, bucket);
    }
    // Sort each bucket alphabetically by name (stable, predictable order).
    for (const bucket of map.values()) {
      bucket.sort((a, b) => a.name.localeCompare(b.name, 'fr'));
    }
    return tierOrder
      .map((tier) => ({ tier, themes: map.get(tier) ?? [] }))
      .filter((g) => g.themes.length > 0);
  }, [themes]);

  // The shadcn Select uses empty string as the "no value" sentinel — we
  // reserve 'current' for that purpose (matches the identity selector's
  // convention so the rest of the code is consistent).
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <span className="text-[10px] uppercase tracking-wider text-white/40 mr-1">
        {label}
      </span>
      <Select value={active} onValueChange={onSelect} disabled={themes.length === 0}>
        <SelectTrigger
          className="h-8 w-[240px] text-xs gap-1.5 border-white/15 bg-white/[0.02] text-white/80 hover:border-white/30"
          aria-label="Sélecteur de thème DB"
        >
          <SelectValue placeholder={themes.length === 0 ? 'Chargement…' : 'Sélectionner'} />
        </SelectTrigger>
        <SelectContent className="max-h-[400px]">
          <SelectGroup>
            <SelectLabel className="text-[10px] uppercase tracking-wider text-white/40">
              Courant
            </SelectLabel>
            <SelectItem value="current" className="text-xs">
              Thème actuel (pas d&apos;override)
            </SelectItem>
          </SelectGroup>
          {grouped.map((g, idx) => (
            <SelectGroup key={g.tier}>
              {/* Separator between groups (and after "Courant" for the first one) */}
              {idx === 0 && <SelectSeparator />}
              <SelectLabel className="text-[10px] uppercase tracking-wider text-white/40">
                {g.tier} — {g.themes.length} thème{g.themes.length > 1 ? 's' : ''}
              </SelectLabel>
              {g.themes.map((t) => (
                <SelectItem
                  key={t.slug}
                  value={t.slug}
                  className="text-xs"
                >
                  <span className="flex items-center gap-2">
                    {t.isDefault && (
                      <span className="size-1.5 rounded-full bg-emerald-400" aria-label="Défaut" />
                    )}
                    {!t.isDefault && t.isRecommended && (
                      <span className="size-1.5 rounded-full bg-amber-400" aria-label="Recommandé" />
                    )}
                    {!t.isDefault && !t.isRecommended && t.isPremium && (
                      <span className="size-1.5 rounded-full bg-violet-400" aria-label="Premium" />
                    )}
                    <span>{t.name}</span>
                    {t.category && (
                      <span className="text-[10px] uppercase tracking-wide text-white/30 ml-1">
                        {t.category}
                      </span>
                    )}
                  </span>
                </SelectItem>
              ))}
            </SelectGroup>
          ))}
        </SelectContent>
      </Select>
      {themes.length === 0 && (
        <span className="text-[10px] text-white/30 italic">
          (thèmes DB indisponibles)
        </span>
      )}
    </div>
  );
}

/**
 * Device frame — wraps the iframe with a CSS-only device frame.
 *   - phone: rounded corners, notch, aspect-ratio locked
 *   - tablet: thin rounded border, larger radius
 *   - browser: browser chrome (3 dots + URL bar) + plain border
 *
 * P2-5 — the `identity` prop (used for the iframe key + the DeviceLabel)
 * now reflects EITHER the active identity OR the active theme slug. The
 * caller passes whichever is currently active so the label below the
 * iframe shows the right identifier.
 */
function DeviceFrame({
  device,
  src,
  identity,
  onRefresh,
  refreshKey,
}: {
  device: DevicePreset;
  src: string;
  identity: string;
  onRefresh: () => void;
  refreshKey: number;
}) {
  const aspectRatio = `${device.width} / ${device.height}`;

  // The frame's max-width is the device's native width. The iframe inside
  // uses the device's width/height directly (so the rendered content is at
  // the device's true viewport — no DPR scaling). When the available
  // container is smaller than the device width, CSS scales the whole frame
  // down via `max-width: 100%` + `height: auto` (aspect-ratio preserved).
  const frameStyle: React.CSSProperties = {
    width: `${device.width}px`,
    maxWidth: '100%',
    aspectRatio,
  };

  // Inner iframe always renders at the device's native resolution. The
  // outer frame handles the visual scaling (transform: scale). For devices
  // larger than the available width, we use CSS `transform: scale()` via
  // a wrapper so the iframe content stays crisp at its native resolution.
  const iframeStyle: React.CSSProperties = {
    width: `${device.width}px`,
    height: `${device.height}px`,
    border: 'none',
    display: 'block',
    background: '#000',
  };

  if (device.frame === 'phone') {
    return (
      <div className="flex flex-col items-center gap-2">
        <div
          className="relative bg-black rounded-[2.5rem] p-3 shadow-2xl border border-white/10"
          style={frameStyle}
        >
          {/* Notch */}
          <div
            className="absolute top-3 left-1/2 -translate-x-1/2 w-24 h-5 bg-black rounded-b-2xl z-10 flex items-center justify-center"
            aria-hidden
          >
            <div className="size-1.5 rounded-full bg-white/20" />
          </div>
          {/* Iframe — scaled to fit the frame */}
          <div className="relative w-full h-full overflow-hidden rounded-[1.8rem] bg-black">
            <iframe
              key={`${identity}-${refreshKey}`}
              src={src}
              title={`Preview ${DEVICE_LABELS[device.id]} — ${identity}`}
              style={iframeStyle}
              className="origin-top-left"
              loading="lazy"
              sandbox="allow-same-origin allow-scripts allow-forms allow-popups"
            />
          </div>
        </div>
        <DeviceLabel device={device} identity={identity} onRefresh={onRefresh} />
      </div>
    );
  }

  if (device.frame === 'tablet') {
    return (
      <div className="flex flex-col items-center gap-2">
        <div
          className="relative bg-black rounded-2xl p-2 shadow-2xl border border-white/10"
          style={frameStyle}
        >
          <div className="relative w-full h-full overflow-hidden rounded-xl bg-black">
            <iframe
              key={`${identity}-${refreshKey}`}
              src={src}
              title={`Preview ${DEVICE_LABELS[device.id]} — ${identity}`}
              style={iframeStyle}
              className="origin-top-left"
              loading="lazy"
              sandbox="allow-same-origin allow-scripts allow-forms allow-popups"
            />
          </div>
        </div>
        <DeviceLabel device={device} identity={identity} onRefresh={onRefresh} />
      </div>
    );
  }

  // Browser frame
  return (
    <div className="flex flex-col items-center gap-2">
      <div
        className="relative bg-[#1a1a1a] rounded-lg shadow-2xl border border-white/10 overflow-hidden"
        style={frameStyle}
      >
        {/* Browser chrome */}
        <div className="flex items-center gap-2 px-3 py-2 bg-[#2a2a2a] border-b border-white/10">
          <div className="flex gap-1.5" aria-hidden>
            <span className="size-2.5 rounded-full bg-red-400/70" />
            <span className="size-2.5 rounded-full bg-yellow-400/70" />
            <span className="size-2.5 rounded-full bg-green-400/70" />
          </div>
          <div className="flex-1 mx-2 px-3 py-1 rounded bg-black/40 text-[10px] text-white/50 font-mono truncate">
            {src}
          </div>
          <button
            onClick={onRefresh}
            className="size-6 flex items-center justify-center rounded text-white/40 hover:text-white hover:bg-white/10 transition-colors"
            title="Recharger l'aperçu"
            aria-label="Recharger l'aperçu"
          >
            <RefreshCw className="size-3" />
          </button>
        </div>
        {/* Iframe */}
        <div className="relative bg-black" style={{ width: '100%', height: 'calc(100% - 36px)' }}>
          <iframe
            key={`${identity}-${refreshKey}`}
            src={src}
            title={`Preview ${DEVICE_LABELS[device.id]} — ${identity}`}
            style={iframeStyle}
            className="origin-top-left"
            loading="lazy"
            sandbox="allow-same-origin allow-scripts allow-forms allow-popups"
          />
        </div>
      </div>
      <DeviceLabel device={device} identity={identity} onRefresh={onRefresh} />
    </div>
  );
}

/**
 * Small label below each iframe — shows device + identity + refresh button.
 *
 * P2-5 — `identity` may now be a theme slug (prefixed with `theme:`) when a
 * DB theme is active. We render the slug verbatim (the caller already
 * formatted it) so the admin sees "theme:royal-gold" vs "royal-luxury"
 * (identity) at a glance.
 */
function DeviceLabel({
  device,
  identity,
  onRefresh,
}: {
  device: DevicePreset;
  identity: string;
  onRefresh: () => void;
}) {
  const identityLabel =
    identity === 'current' ? 'Thème actuel' : identity;
  return (
    <div className="flex items-center gap-2 text-[11px] text-white/50">
      <span className="font-mono">{DEVICE_LABELS[device.id]}</span>
      <span className="text-white/20">·</span>
      <span className="font-mono text-gold/80">{identityLabel}</span>
      <button
        onClick={onRefresh}
        className="ml-1 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-white/40 hover:text-white hover:bg-white/10 transition-colors"
        title="Recharger"
      >
        <RefreshCw className="size-3" />
      </button>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function PreviewLab({
  wedding,
  identities,
}: {
  wedding: PreviewLabWedding;
  identities: PreviewLabIdentity[];
}) {
  const searchParams = useSearchParams();

  // ─── Initial state from URL (deep-link support for share links) ──────────
  const initialDevice = ((): DeviceId => {
    const d = searchParams.get('device');
    if (d === 'mobile' || d === 'tablet' || d === 'desktop' || d === 'large') return d;
    return 'mobile';
  })();
  const initialIdentityA = ((): string => {
    const i = searchParams.get('identity');
    if (i && (i === 'current' || identities.some((x) => x.id === i))) return i;
    return 'current';
  })();
  const initialCompare = searchParams.get('compare') === 'true';
  const initialIdentityB = ((): string => {
    const i = searchParams.get('identityB');
    if (i && (i === 'current' || identities.some((x) => x.id === i))) return i;
    // Default B to the first identity (so compare mode shows something
    // different from A by default).
    return identities[0]?.id ?? 'current';
  })();

  // P2-5 — initial theme slugs from URL (?theme= + ?themeB=).
  // We accept ANY string here (no validation against the DB yet — the
  // themes list may not have loaded when this runs). The ThemeSelector
  // dropdown will display the active slug even if the themes list is
  // still loading. If the slug doesn't match a DB row when the list
  // loads, the Server Component will log "not-found" + fall through to
  // the published theme (the iframe will still render, just without the
  // override — graceful degradation).
  const initialThemeA = ((): string => {
    const t = searchParams.get('theme');
    return t && t.length > 0 ? t : 'current';
  })();
  const initialThemeB = ((): string => {
    const t = searchParams.get('themeB');
    return t && t.length > 0 ? t : 'current';
  })();

  const [device, setDevice] = useState<DeviceId>(initialDevice);
  const [identityA, setIdentityA] = useState<string>(initialIdentityA);
  const [identityB, setIdentityB] = useState<string>(initialIdentityB);
  // P2-5 — theme slugs (independent per pane). 'current' = no ?theme= param.
  const [themeA, setThemeA] = useState<string>(initialThemeA);
  const [themeB, setThemeB] = useState<string>(initialThemeB);
  const [compare, setCompare] = useState<boolean>(initialCompare);
  const [refreshKey, setRefreshKey] = useState<number>(0);

  // ─── P2-5 — DB themes state ─────────────────────────────────────────────
  // Fetched on mount from /api/platform/themes?limit=200. Stored as the
  // minimal subset needed by the selector (slug + display metadata). If the
  // fetch fails, `themes` stays empty + the ThemeSelector is hidden.
  const [themes, setThemes] = useState<PreviewLabPlatformTheme[]>([]);

  // ─── Phase 5.9.0 POST-PHASE-3 — Preview token state ─────────────────────
  // A 24h signed JWT fetched from /api/platform/preview-token/{slug} on mount
  // (and whenever the wedding slug changes). Appended to every iframe URL as
  // ?token=xxx so the /w/[slug] route's server-side gate grants preview mode.
  // If the fetch fails, we fall back to ?preview=true only (the iframe will
  // redirect to the guest auth page — degraded UX but no security hole).
  const [previewToken, setPreviewToken] = useState<string | null>(null);
  const [tokenExpiresAt, setTokenExpiresAt] = useState<string | null>(null);
  const [tokenFetching, setTokenFetching] = useState<boolean>(true);

  useEffect(() => {
    let cancelled = false;
    setPreviewToken(null);
    setTokenExpiresAt(null);
    setTokenFetching(true);

    fetch(`/api/platform/preview-token/${encodeURIComponent(wedding.slug)}`)
      .then(async (res) => {
        if (!res.ok) {
          // 401/403 → not authorized (shouldn't happen — page-level gate
          //   already redirected non-admins away).
          // 429 → rate limited (10 token requests per admin per minute).
          // 404 → wedding slug not found (shouldn't happen — the page-level
          //   gate already fetched the wedding).
          // 500 → server error (likely JWT_SECRET missing in dev).
          throw new Error(`HTTP ${res.status}`);
        }
        return res.json() as Promise<{
          token: string;
          expiresAt: string;
          weddingSlug: string;
          ttlSeconds: number;
        }>;
      })
      .then((data) => {
        if (cancelled) return;
        setPreviewToken(data.token);
        setTokenExpiresAt(data.expiresAt);
        setTokenFetching(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setPreviewToken(null);
        setTokenExpiresAt(null);
        setTokenFetching(false);
        const msg = err instanceof Error ? err.message : String(err);
        toast.warning("Jeton d'aperçu indisponible", {
          description:
            "Le mode aperçu nécessitera l'authentification invité. " +
            `(${msg}) — rechargement requis après correction.`,
        });
      });

    return () => {
      cancelled = true;
    };
  }, [wedding.slug]);

  // P2-5 — fetch the 21 DB-backed PlatformThemes on mount. The fetch is
  // independent of the preview token fetch (runs in parallel). If it fails,
  // we silently hide the theme selector (the admin can still use the
  // identity selector — only the DB theme preview is degraded).
  useEffect(() => {
    let cancelled = false;
    fetch('/api/platform/themes?limit=200', { credentials: 'include' })
      .then(async (res) => {
        if (!res.ok) {
          // 401/403 → not authorized (the page-level gate should have
          //   caught this — but defensive).
          // 429 → rate limited.
          // 500 → server error.
          throw new Error(`HTTP ${res.status}`);
        }
        return res.json() as Promise<{
          themes: PreviewLabPlatformTheme[];
          total: number;
          page: number;
          limit: number;
        }>;
      })
      .then((data) => {
        if (cancelled) return;
        // Defensive: the API may return extra fields — pick only the ones
        // we declared in PreviewLabPlatformTheme (avoid leaking e.g.
        // configJson into the client bundle).
        const themes = (data.themes ?? []).map((t) => ({
          id: t.id,
          slug: t.slug,
          name: t.name,
          tier: t.tier,
          category: t.category,
          isPremium: t.isPremium,
          isRecommended: t.isRecommended,
          isDefault: t.isDefault,
          identity: t.identity,
        }));
        setThemes(themes);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setThemes([]);
        const msg = err instanceof Error ? err.message : String(err);
        // Silent — the admin can still use the identity selector. We log
        // to console (not a toast) so it doesn't spam if the API is down.
        // eslint-disable-next-line no-console
        console.warn('[PreviewLab] themes fetch failed — selector hidden', { msg });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const activeDevice = useMemo(
    () => DEVICE_PRESETS.find((d) => d.id === device) ?? DEVICE_PRESETS[0],
    [device],
  );

  // ─── Handlers ────────────────────────────────────────────────────────────
  const handleRefresh = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  const handleShare = useCallback(async () => {
    const params = new URLSearchParams({
      device,
    });
    // P2-5 — include ?theme= + ?themeB= in the deep link (round-trip). We
    // include them BEFORE ?identity= so the share link's intent is clear:
    // a theme deep-link takes precedence over an identity deep-link.
    if (themeA !== 'current') {
      params.set('theme', themeA);
    } else {
      params.set('identity', identityA);
    }
    if (compare) {
      params.set('compare', 'true');
      if (themeB !== 'current') {
        params.set('themeB', themeB);
      } else {
        params.set('identityB', identityB);
      }
    }
    const url = `${window.location.origin}/platform/admin/preview/${wedding.slug}?${params.toString()}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Lien d&apos;aperçu copié dans le presse-papier', {
        description: 'Le lien expire quand la session admin expire.',
      });
    } catch {
      // Clipboard API can fail in non-secure contexts or with permissions.
      // Fallback: open a prompt with the URL.
      window.prompt('Copiez ce lien d&apos;aperçu :', url);
    }
  }, [identityA, identityB, themeA, themeB, device, compare, wedding.slug]);

  const handleOpenInNewTab = useCallback(() => {
    const src = buildIframeSrc(wedding.slug, identityA, previewToken, themeA);
    window.open(src, '_blank', 'noopener,noreferrer');
  }, [identityA, themeA, wedding.slug, previewToken]);

  // ─── Build iframe srcs ───────────────────────────────────────────────────
  // Both iframes share the same preview token (it's wedding-scoped, not
  // identity-scoped — the token's `wid` claim is the wedding slug, and the
  // `?identity=` param is a client-side override that doesn't affect token
  // verification). P2-5: the `?theme=` param is also wedding-scoped — same
  // token works for both panes regardless of which theme/identity is active.
  const srcA = buildIframeSrc(wedding.slug, identityA, previewToken, themeA);
  const srcB = buildIframeSrc(wedding.slug, identityB, previewToken, themeB);

  // P2-5 — when a theme is active, the identity selector is disabled. The
  // label below the iframe shows "theme:<slug>" so the admin can tell at a
  // glance which kind of override is active.
  const paneALabel = themeA !== 'current' ? `theme:${themeA}` : identityA;
  const paneBLabel = themeB !== 'current' ? `theme:${themeB}` : identityB;

  // ─── Render ──────────────────────────────────────────────────────────────
  return (
    <div className="max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-5">
      {/* ─── Control bar ─────────────────────────────────────────────────── */}
      <div className="space-y-3 rounded-xl border border-white/10 bg-white/[0.02] p-4">
        {/* Row 1: Device selector + Compare toggle + Share */}
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <DeviceSelector active={device} onSelect={setDevice} />
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant={compare ? 'default' : 'outline'}
              className={`h-8 text-xs gap-1.5 ${
                compare
                  ? 'bg-violet-500 text-white hover:bg-violet-600 border-violet-500'
                  : 'border-white/15 text-white/70 hover:text-white hover:border-white/30 bg-white/[0.02]'
              }`}
              onClick={() => setCompare((c) => !c)}
            >
              <GitCompare className="size-3.5" />
              {compare ? 'Comparer ON' : 'Comparer'}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-xs gap-1.5 border-white/15 text-white/70 hover:text-white hover:border-white/30 bg-white/[0.02]"
              onClick={handleOpenInNewTab}
            >
              <ExternalLink className="size-3.5" />
              <span className="hidden sm:inline">Ouvrir</span>
            </Button>
            <Button
              size="sm"
              className="h-8 text-xs gap-1.5 bg-gold text-black hover:bg-gold/90 border-gold"
              onClick={handleShare}
            >
              <Share2 className="size-3.5" />
              Partager
            </Button>
          </div>
        </div>

        {/* P2-5 — Row 2a: Theme selector A (always visible).
            Rendered ABOVE the identity selector so the visual hierarchy
            reflects the resolvedTheme precedence (theme > identity). */}
        {themes.length > 0 && (
          <ThemeSelector
            label={compare ? 'Thème A' : 'Thème'}
            active={themeA}
            themes={themes}
            onSelect={setThemeA}
          />
        )}

        {/* Row 2b: Identity selector A (always visible, disabled when a theme is active) */}
        <IdentitySelector
          label={compare ? 'Identité A' : 'Identité'}
          active={identityA}
          identities={identities}
          currentThemeName={wedding.currentThemeName}
          onSelect={setIdentityA}
          disabled={themeA !== 'current'}
        />
        {/* P2-5 — note when the identity selector is disabled due to a theme */}
        {themeA !== 'current' && (
          <div className="text-[10px] text-amber-300/70 -mt-2 italic">
            Thème sélectionné — identité désactivée (le thème encode sa propre identité).
          </div>
        )}

        {/* Row 3: Identity selector B (compare mode only) */}
        {compare && (
          <>
            {/* P2-5 — Theme selector B (compare mode only) */}
            {themes.length > 0 && (
              <ThemeSelector
                label="Thème B"
                active={themeB}
                themes={themes}
                onSelect={setThemeB}
              />
            )}
            <IdentitySelector
              label="Identité B"
              active={identityB}
              identities={identities}
              currentThemeName={wedding.currentThemeName}
              onSelect={setIdentityB}
              disabled={themeB !== 'current'}
            />
            {themeB !== 'current' && (
              <div className="text-[10px] text-amber-300/70 -mt-2 italic">
                Thème sélectionné — identité désactivée (le thème encode sa propre identité).
              </div>
            )}
          </>
        )}

        {/* Hint row */}
        <div className="flex items-center gap-2 text-[11px] text-white/40 pt-1 border-t border-white/5 flex-wrap">
          <span className="inline-flex items-center gap-1">
            <span className="size-1.5 rounded-full bg-emerald-400" />
            Mode aperçu (lecture seule)
          </span>
          <span className="text-white/20">·</span>
          {/* Phase 5.9.0 POST-PHASE-3 — token expiry indicator */}
          {tokenFetching ? (
            <span className="inline-flex items-center gap-1 text-white/30">
              <RefreshCw className="size-3 animate-spin" />
              Récupération du jeton…
            </span>
          ) : previewToken && tokenExpiresAt ? (
            <span className="inline-flex items-center gap-1 text-amber-300/80">
              <span className="size-1.5 rounded-full bg-amber-400" />
              Jeton valide 24h — expiré à{' '}
              {new Date(tokenExpiresAt).toLocaleTimeString('fr-FR', {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-rose-300/80">
              <span className="size-1.5 rounded-full bg-rose-400" />
              Jeton indisponible — auth invité requise
            </span>
          )}
          <span className="text-white/20">·</span>
          <span>
            Iframe: <code className="text-white/60 font-mono">{srcA}</code>
          </span>
        </div>
      </div>

      {/* ─── Iframe area ─────────────────────────────────────────────────── */}
      <div
        className={`grid gap-6 ${
          compare
            ? 'xl:grid-cols-2 lg:grid-cols-1'
            : 'grid-cols-1'
        }`}
      >
        {/* Iframe A */}
        <div className="flex flex-col items-center overflow-x-auto pb-4">
          <div className="flex items-center gap-2 mb-3">
            {compare && (
              <Badge
                variant="outline"
                className="text-[10px] uppercase tracking-wide bg-violet-500/15 text-violet-300 border-violet-500/30"
              >
                A
              </Badge>
            )}
          </div>
          <DeviceFrame
            device={activeDevice}
            src={srcA}
            identity={paneALabel}
            onRefresh={handleRefresh}
            refreshKey={refreshKey}
          />
        </div>

        {/* Iframe B (compare mode only) */}
        {compare && (
          <div className="flex flex-col items-center overflow-x-auto pb-4">
            <div className="flex items-center gap-2 mb-3">
              <Badge
                variant="outline"
                className="text-[10px] uppercase tracking-wide bg-violet-500/15 text-violet-300 border-violet-500/30"
              >
                B
              </Badge>
            </div>
            <DeviceFrame
              device={activeDevice}
              src={srcB}
              identity={paneBLabel}
              onRefresh={handleRefresh}
              refreshKey={refreshKey}
            />
          </div>
        )}
      </div>
    </div>
  );
}

export default PreviewLab;
