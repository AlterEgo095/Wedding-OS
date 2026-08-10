import React from 'react';
// ══════════════════════════════════════════════════════════════════════════════
// <ThemeInjector> — P1.10 White Label org-level branding (Server Component)
// ══════════════════════════════════════════════════════════════════════════════
//
// Renders a `<style>` tag that overrides the platform's default --primary CSS
// variable (and the related --gold / --ring family) with the Organization's
// brandColor, but ONLY when:
//   1. The request arrived via a custom domain (white-label mode), AND
//   2. The custom domain resolves to an ACTIVE Organization, AND
//   3. That Organization has a brandColor set (hex string), AND
//   4. The brandColor passes a strict hex regex (defence vs CSS injection).
//
// When ANY of these conditions is false, the component renders nothing — the
// platform default theme wins (graceful degradation). This means:
//   - On the default platform domain (wedding.hpph.net): no <style> rendered,
//     AENEWS branding stays visible, default gold theme applies. ✅ backward compat
//   - On a custom domain bound to a Wedding (not an Org): no <style> rendered,
//     the wedding-level <ThemeInjector> (client component, see
//     src/components/wedding/ThemeInjector.tsx) still applies the wedding's
//     published theme. ✅ Slice 5 backward compat
//   - On a custom domain bound to an Org with no brandColor: no <style> rendered,
//     default theme wins. ✅ graceful degradation
//   - On a custom domain bound to an Org WITH brandColor: <style> rendered,
//     --primary is overridden with the org's brand color. ✅ white label
//
// Interaction with the wedding-level client <ThemeInjector>:
//   The client ThemeInjector (src/components/wedding/ThemeInjector.tsx) sets
//   `--theme-primary` via `document.documentElement.style.setProperty(...)` after
//   hydration. The original CSS resolves `--primary` to `var(--theme-primary, ...)`,
//   so the client's value would normally win.
//
//   This server component breaks that dependency by setting `--primary` (and the
//   --gold family) to a direct hex value, NOT a `var(--theme-primary, ...)` reference.
//   After this override, `--primary` no longer transitively depends on
//   `--theme-primary`, so the client ThemeInjector's `--theme-primary` becomes a
//   no-op for --primary. The wedding's accent color (--theme-accent) and fonts
//   (--theme-font-display / --theme-font-body) are NOT touched by this component
//   and continue to apply — so the wedding retains its typographic identity while
//   the org's brand color takes precedence for the primary palette.
//
// CSS variable scope:
//   The `<style>` targets `:root` (light mode) and `.dark` (dark mode) — the
//   same selectors used by globals.css for the default theme. This guarantees
//   the override applies document-wide (not just inside a wrapper div), which
//   is what white-label branding requires. The override is confined to:
//     --primary, --gold, --gold-light, --gold-dark, --ring
//   It does NOT leak into --accent, --background, --foreground, --chart-*,
//   --sidebar-* etc — those keep their platform defaults (or wedding overrides).
//
// Security:
//   brandColor is read from the DB (Organization.brandColor, set by an
//   ORG_ADMIN via P1.6/P1.7 routes). Before injection into the `<style>` tag,
//   it's validated against a strict hex regex: /^#[0-9a-fA-F]{3,8}$/.
//   This confines the value to a valid CSS hex color (3, 4, 6, or 8 digits
//   with leading #), preventing CSS injection attacks like:
//     brandColor: "#FF0000; } </style><script>..."
//   If the regex fails, the component renders nothing (graceful degradation).
//
// Performance:
//   - Server Component: zero client JS shipped.
//   - The DB lookup is cached 5 min via getOrgThemeByHost (see theme-injector.ts).
//   - `headers()` is a dynamic API — using it opts the layout out of full
//     static prerendering for custom-domain requests only. The default-domain
//     path returns early (before any DB lookup) so ISR is preserved there.

import { headers } from 'next/headers';
import { getOrgThemeByHost, type OrgTheme } from '@/lib/wedding/theme-injector';
import { isCustomDomainRequest } from '@/lib/custom-domains';

// ─── Brand color validation ──────────────────────────────────────────────────
// Strict hex regex: #RGB, #RGBA, #RRGGBB, or #RRGGBBAA.
// Anything else (named colors, rgb()/hsl()/oklch() functions, CSS expressions)
// is rejected — the org admin can only set a hex color via the P1.7 UI.
const HEX_COLOR_RE = /^#[0-9a-fA-F]{3,8}$/;

function isValidHexColor(value: unknown): value is string {
  return typeof value === 'string' && HEX_COLOR_RE.test(value.trim());
}

// ─── CSS generation ───────────────────────────────────────────────────────────
// Builds the CSS override string. The selector list mirrors globals.css so
// both light (`:root`) and dark (`.dark`) modes are covered. The dark-mode
// rule has higher specificity (class selector) and would otherwise override
// our `:root` rule in dark mode.
//
// The `data-wl-brand` attribute on the <style> tag is for ops/debuggability —
// it makes the injected rule easy to find in DevTools ("wl" = white label).
function buildBrandCss(brandColor: string): string {
  // Trim once — the regex already validated, but trimming makes the injection
  // safe even if the DB column has trailing whitespace.
  const color = brandColor.trim();
  // MISSION-5.9.0 Phase 1C: set --brand-primary instead of overriding --primary directly.
  // Previously this set `--primary: ${color}` which broke the 3-layer composition:
  //   --primary: var(--brand-primary, var(--theme-primary, ...))
  // By setting only --brand-primary, the wedding's --theme-primary (couple's choice)
  // still applies when no org brand is set, AND the org brand wins when it IS set
  // (correct white-label behavior). Both layers now coexist.
  return `:root,[data-wl-brand] { --brand-primary: ${color}; }
.dark { --brand-primary: ${color}; }`;
}

// ─── Component ────────────────────────────────────────────────────────────────
/**
 * <ThemeInjector /> — Server Component that injects org-level branding CSS
 * when the request is on a custom domain bound to an Organization.
 *
 * Renders `null` when:
 *   - Not on a custom domain (default platform domain → no white-label).
 *   - The custom domain doesn't resolve to an ACTIVE organization.
 *   - The org has no brandColor, or the brandColor fails hex validation.
 *   - The DB lookup throws (logged via getOrgThemeByHost, returns null).
 *
 * @example
 *   // In src/app/w/[slug]/layout.tsx:
 *   import { ThemeInjector } from '@/components/ThemeInjector';
 *   // ...
 *   return (
 *     <WeddingContextProvider ...>
 *       <ThemeInjector />
 *       {children}
 *     </WeddingContextProvider>
 *   );
 */
export async function ThemeInjector(): Promise<React.ReactElement | null> {
  // `headers()` is async in Next.js 15+ (returns a Promise<ReadonlyHeaders>).
  const h = await headers();
  const host = h.get('host') || '';

  // Fast path: not a custom domain → render nothing (no DB lookup, no SSR cost).
  // This preserves ISR for the default-domain wedding pages.
  if (!isCustomDomainRequest(host)) {
    return null;
  }

  // Resolve the org's branding theme (cached 5 min, see theme-injector.ts).
  let theme: OrgTheme | null;
  try {
    theme = await getOrgThemeByHost(host);
  } catch {
    // getOrgThemeByHost already logs internally — silent here to avoid
    // double-logging. Render nothing on failure.
    return null;
  }

  // No org bound to this custom domain, or org is not ACTIVE.
  if (!theme) return null;

  // Graceful degradation: no brandColor set → don't inject any CSS.
  if (!theme.brandColor) return null;

  // Security: validate the hex color before injecting into a <style> tag.
  if (!isValidHexColor(theme.brandColor)) {
    // An invalid brandColor suggests either a bug in the P1.7 admin UI or a
    // direct DB tampering. Either way, refuse to inject — the default theme
    // wins. Logged via logger for ops triage (not logged here to avoid
    // duplicating the import; getOrgThemeByHost logs at DB level).
    return null;
  }

  const css = buildBrandCss(theme.brandColor);

  return (
    <style
      data-wl-brand={theme.slug}
      data-wl-host={host}
      // eslint-disable-next-line react/no-danger -- css is regex-confined to
      // a strict hex color (HEX_COLOR_RE), so no user-controlled CSS can
      // escape the `--primary: <color>;` value position. No `</style>` can
      // appear in the output because the regex rejects any non-hex character.
      dangerouslySetInnerHTML={{ __html: css }}
    />
  );
}
