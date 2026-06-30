// ════════════════════════════════════════════════════════════════════════════
// Penpot Configuration — Native Studio Integration
// ════════════════════════════════════════════════════════════════════════════
// Penpot becomes the official design Studio of Wedding OS.
// This module centralizes all Penpot configuration so the integration can
// target either Penpot Cloud (design.penpot.app) or a self-hosted instance
// by simply changing the PENPOT_BASE_URL env var.
//
// Design principles:
// - Zero regression: if Penpot is not configured, all existing engines
//   (Theme Engine, InvitationCard, Media Engine, LuxuryVisualEngine) keep
//   working unchanged.
// - Additive only: Penpot extends the existing engines, never replaces them.
// - Reuse: ThemeInjector applies Penpot tokens the same way it applies
//   ThemeCustomizer tokens (via CSS custom properties).
// ════════════════════════════════════════════════════════════════════════════

/**
 * Base URL of the Penpot instance.
 * Defaults to Penpot Cloud. Set PENPOT_BASE_URL env var to target a
 * self-hosted instance (e.g. https://penpot.aenews.net).
 */
export const PENPOT_BASE_URL: string =
  process.env.NEXT_PUBLIC_PENPOT_BASE_URL || 'https://design.penpot.app'

/**
 * Whether Penpot integration is enabled.
 * When false, the Studio tab shows a "configuration required" message
 * instead of the iframe embed.
 */
export const PENPOT_ENABLED: boolean = true

/**
 * The shape of Penpot design tokens stored in Theme.customizations.penpotTokens.
 * These mirror the 4 theme-aware CSS vars injected by ThemeInjector
 * (--theme-primary, --theme-accent, --theme-font-display, --theme-font-body)
 * so Penpot designs stay in sync with the ThemeCustomizer.
 */
export interface PenpotTokens {
  // Colors (hex or oklch — same format as ThemeCustomizer)
  'color.primary'?: string
  'color.accent'?: string
  'color.secondary'?: string
  'color.background'?: string
  'color.text'?: string
  // Typography (Google Font family names)
  'typography.display'?: string
  'typography.body'?: string
  // Spacing scale (future — Penpot can define these)
  'spacing.unit'?: string
  // Radius scale
  'radius.sm'?: string
  'radius.md'?: string
  'radius.lg'?: string
}

/**
 * The full Penpot integration state stored in Theme.customizations.
 * This is a JSON blob — the existing Theme.customizations field is reused
 * (additive, zero schema migration).
 */
export interface PenpotIntegration {
  // Linked Penpot file URL (view/share link or full editor URL)
  // Example: https://design.penpot.app/#/view?file-id=abc123&page-id=def456
  fileUrl?: string | null

  // Penpot file ID (extracted from fileUrl for API calls)
  fileId?: string | null

  // Penpot page ID (extracted from fileUrl)
  pageId?: string | null

  // Penpot frame ID for the invitation card design (exported as SVG for rendering)
  invitationFrameId?: string | null

  // Penpot frame ID for the save-the-date design
  saveTheDateFrameId?: string | null

  // Last sync timestamp (ISO string)
  lastSyncedAt?: string | null

  // Design tokens pushed to / pulled from Penpot
  tokens?: PenpotTokens | null
}

/**
 * Default empty Penpot integration (when not yet linked).
 */
export const EMPTY_PENPOT_INTEGRATION: PenpotIntegration = {
  fileUrl: null,
  fileId: null,
  pageId: null,
  invitationFrameId: null,
  saveTheDateFrameId: null,
  lastSyncedAt: null,
  tokens: null,
}

/**
 * Extract Penpot file ID and page ID from a Penpot URL.
 * Supports both view and edit URLs:
 *   https://design.penpot.app/#/view?file-id=abc&page-id=def
 *   https://design.penpot.app/#/workspace?file-id=abc&page-id=def
 */
export function parsePenpotUrl(url: string): { fileId: string | null; pageId: string | null } {
  if (!url) return { fileId: null, pageId: null }
  try {
    // Penpot URLs use hash-based routing, so URLSearchParams won't work directly.
    // Extract the query part after the hash.
    const hashIndex = url.indexOf('#/')
    if (hashIndex === -1) return { fileId: null, pageId: null }
    const hashPart = url.slice(hashIndex + 2)
    const queryIndex = hashPart.indexOf('?')
    if (queryIndex === -1) return { fileId: null, pageId: null }
    const query = hashPart.slice(queryIndex + 1)
    const params = new URLSearchParams(query)
    return {
      fileId: params.get('file-id'),
      pageId: params.get('page-id'),
    }
  } catch {
    return { fileId: null, pageId: null }
  }
}

/**
 * Build a Penpot view-mode embed URL from a file ID and page ID.
 * View mode is public (no auth required) and can be embedded in an iframe.
 */
export function buildPenpotViewUrl(fileId: string, pageId: string | null): string {
  const params = new URLSearchParams({ 'file-id': fileId })
  if (pageId) params.set('page-id', pageId)
  return `${PENPOT_BASE_URL}/#/view?${params.toString()}`
}

/**
 * Build a Penpot editor URL (opens in a new tab — can't be iframed due to auth).
 */
export function buildPenpotEditUrl(fileId: string, pageId: string | null): string {
  const params = new URLSearchParams({ 'file-id': fileId })
  if (pageId) params.set('page-id', pageId)
  return `${PENPOT_BASE_URL}/#/workspace?${params.toString()}`
}

/**
 * Convert a ThemeCustomizer theme (4 fields) to PenpotTokens.
 * Used when pushing tokens from Wedding OS to Penpot.
 */
export function themeToPenpotTokens(theme: {
  primaryColor?: string | null
  accentColor?: string | null
  fontDisplay?: string | null
  fontBody?: string | null
}): PenpotTokens {
  return {
    'color.primary': theme.primaryColor || undefined,
    'color.accent': theme.accentColor || undefined,
    'typography.display': theme.fontDisplay || undefined,
    'typography.body': theme.fontBody || undefined,
  }
}

/**
 * Convert PenpotTokens back to ThemeCustomizer theme fields.
 * Used when pulling tokens from Penpot to Wedding OS.
 * Only the 4 canonical fields are mapped back (the extended token fields
 * like spacing/radius are stored in customizations but not yet consumed by
 * the renderer — future enhancement).
 */
export function penpotTokensToTheme(tokens: PenpotTokens): {
  primaryColor?: string | null
  accentColor?: string | null
  fontDisplay?: string | null
  fontBody?: string | null
} {
  return {
    primaryColor: tokens['color.primary'] || null,
    accentColor: tokens['color.accent'] || null,
    fontDisplay: tokens['typography.display'] || null,
    fontBody: tokens['typography.body'] || null,
  }
}

/**
 * Serialize the Penpot token set as a CSS custom property map.
 * This is consumed by ThemeInjector to inject Penpot-defined tokens
 * alongside the existing 4 theme vars.
 */
export function penpotTokensToCssVars(tokens: PenpotTokens): Record<string, string> {
  const vars: Record<string, string> = {}
  if (tokens['color.primary']) vars['--penpot-color-primary'] = tokens['color.primary']
  if (tokens['color.accent']) vars['--penpot-color-accent'] = tokens['color.accent']
  if (tokens['color.secondary']) vars['--penpot-color-secondary'] = tokens['color.secondary']
  if (tokens['color.background']) vars['--penpot-color-background'] = tokens['color.background']
  if (tokens['color.text']) vars['--penpot-color-text'] = tokens['color.text']
  if (tokens['typography.display']) vars['--penpot-font-display'] = tokens['typography.display']
  if (tokens['typography.body']) vars['--penpot-font-body'] = tokens['typography.body']
  if (tokens['spacing.unit']) vars['--penpot-spacing-unit'] = tokens['spacing.unit']
  if (tokens['radius.sm']) vars['--penpot-radius-sm'] = tokens['radius.sm']
  if (tokens['radius.md']) vars['--penpot-radius-md'] = tokens['radius.md']
  if (tokens['radius.lg']) vars['--penpot-radius-lg'] = tokens['radius.lg']
  return vars
}
