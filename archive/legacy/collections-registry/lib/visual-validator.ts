// ══════════════════════════════════════════════════════════════════════════════
// VISUAL VALIDATOR — graphic / UX checks on a Collection + its Penpot frames
// ══════════════════════════════════════════════════════════════════════════════
//
// The structural validator (validator.ts) only checks "are all required frames
// present?". This Visual Validator complements it by checking GRAPHIC / UX
// constraints:
//   ✓ contrast  (WCAG AA between text and background tokens)
//   ✓ responsive (frame dimensions match expected module breakpoints)
//   ✓ tokens    (design system has all required token slots, valid color formats)
//   ✓ components (semantic per-module visual checks: hero wide, qr square, etc.)
//   ✓ grid      (frame dimensions are multiples of 4px)
//   ✓ spacing   (frame width/height ratio is within module-type expected range)
//   ✓ fonts     (display + body fonts are non-empty + reasonably named)
//
// This module is SERVER-SIDE only. It's consumed by the Compiler (which embeds
// the VisualValidationSummary into the deployment manifest).
//
// NOTE on the `story` module ID collision:
//   `story` appears in BOTH the Website pack (horizontal timeline) and the
//   Communication pack (9:16 vertical story). Because ModuleId is a flat union,
//   MODULE_DIMENSION_SPEC['story'] can only hold ONE entry — we use the
//   Communication.story spec (vertical 9:16) because that's the more strongly
//   constrained shape. Website.story frames will flag as out-of-spec, which is
//   an acceptable known limitation (documented for the main agent).

import type {
  PremiumCollection,
  DesignSystem,
  PackId,
  ModuleId,
} from './types'
import type { PenpotFrame, DetectionResult } from './penpot-builder'
import { parseFrameName } from './naming-convention'

// ─── ManifestTokens — local alias structurally compatible with DesignSystem ────
// The Compiler (in parallel) defines its own ManifestTokens type for the
// deployment manifest. We accept either that shape or the richer DesignSystem.
// Both share the 6 color slots + 2 font slots we care about.
export type ManifestTokens = {
  primary: string
  secondary: string
  background: string
  surface: string
  text: string
  textMuted: string
  fontDisplay?: string
  fontBody?: string
}

// ─── Visual check + summary types ──────────────────────────────────────────────

export interface VisualCheck {
  code: string                          // e.g. 'WCAG_CONTRAST_TEXT_BG'
  level: 'ERROR' | 'WARNING' | 'INFO'
  message: string
  pack?: PackId
  module?: ModuleId
  metric?: { label: string; value: string | number; threshold?: string | number }
}

export interface VisualValidationSummary {
  passes: boolean                       // true if 0 ERROR-level checks fail
  score: number                         // 0-100 (100 = all checks pass)
  checks: number                        // total checks run
  failedChecks: number                  // ERROR + WARNING count
  issues: VisualCheck[]
  ranAt: string                         // ISO
}

// ─── Module-type → expected dimensions + aspect-ratio constraints ──────────────
// Used by the responsive + grid + spacing checks. Covers all ModuleId values
// across all 5 packs. aspectRange is width/height. gridMultiple is usually 4px.
export interface ModuleDimensionSpec {
  minWidth: number
  maxWidth: number
  minHeight: number
  maxHeight: number
  aspectRange?: [number, number]        // [min, max] width/height
  gridMultiple: number                  // pixel grid (usually 4)
}

// Note: we cannot use `Record<\`${PackId}.${ModuleId}\`, ...>` because that
// template-literal type expands to the cartesian product (5 packs × all 37
// module IDs = 185 keys). We want only the 38 ACTUAL pack/module combinations.
// `satisfies` lets TypeScript infer the exact 38-key union while still
// validating each entry's shape against ModuleDimensionSpec.
export const MODULE_DIMENSION_SPEC = {
  // ─── Website pack (desktop-first) ──────────────────────────────────────────
  'website.hero':       { minWidth: 1200, maxWidth: 1920, minHeight: 600,  maxHeight: 1080, aspectRange: [1.5, 3.2],   gridMultiple: 4 },
  'website.countdown':  { minWidth: 400,  maxWidth: 800,  minHeight: 200,  maxHeight: 400,  gridMultiple: 4 },
  'website.story':      { minWidth: 800,  maxWidth: 1920, minHeight: 400,  maxHeight: 800,  gridMultiple: 4 },
  'website.gallery':    { minWidth: 1200, maxWidth: 1920, minHeight: 600,  maxHeight: 1200, gridMultiple: 4 },
  'website.programme':  { minWidth: 800,  maxWidth: 1200, minHeight: 600,  maxHeight: 1200, gridMultiple: 4 },
  'website.rsvp':       { minWidth: 800,  maxWidth: 1200, minHeight: 400,  maxHeight: 800,  gridMultiple: 4 },
  'website.footer':     { minWidth: 1200, maxWidth: 1920, minHeight: 200,  maxHeight: 400,  gridMultiple: 4 },
  'website.loader':     { minWidth: 200,  maxWidth: 600,  minHeight: 200,  maxHeight: 600,  gridMultiple: 4 },
  'website.splash':     { minWidth: 800,  maxWidth: 1920, minHeight: 600,  maxHeight: 1080, gridMultiple: 4 },

  // ─── Invitations pack (portrait cards, A-series-ish) ───────────────────────
  'invitations.standard':   { minWidth: 600, maxWidth: 800,  minHeight: 800,  maxHeight: 1100, aspectRange: [0.65, 0.75], gridMultiple: 4 },
  'invitations.vip':        { minWidth: 600, maxWidth: 900,  minHeight: 800,  maxHeight: 1200, aspectRange: [0.65, 0.8],  gridMultiple: 4 },
  'invitations.famille':    { minWidth: 600, maxWidth: 800,  minHeight: 800,  maxHeight: 1100, aspectRange: [0.65, 0.75], gridMultiple: 4 },
  'invitations.couple':     { minWidth: 600, maxWidth: 800,  minHeight: 800,  maxHeight: 1100, aspectRange: [0.65, 0.75], gridMultiple: 4 },
  'invitations.sponsor':    { minWidth: 600, maxWidth: 900,  minHeight: 800,  maxHeight: 1200, aspectRange: [0.65, 0.8],  gridMultiple: 4 },
  'invitations.presse':     { minWidth: 800, maxWidth: 1200, minHeight: 600,  maxHeight: 800,  aspectRange: [1.2, 2.0],   gridMultiple: 4 },
  'invitations.numerique':  { minWidth: 600, maxWidth: 1200, minHeight: 800,  maxHeight: 1600, aspectRange: [0.5, 0.8],   gridMultiple: 4 },
  'invitations.impression': { minWidth: 600, maxWidth: 900,  minHeight: 800,  maxHeight: 1200, aspectRange: [0.65, 0.8],  gridMultiple: 4 },

  // ─── Print pack ────────────────────────────────────────────────────────────
  'print.badge':         { minWidth: 300, maxWidth: 500,  minHeight: 400,  maxHeight: 600,  aspectRange: [0.7, 0.9],   gridMultiple: 4 },
  'print.qr':            { minWidth: 200, maxWidth: 600,  minHeight: 200,  maxHeight: 600,  aspectRange: [0.95, 1.05], gridMultiple: 4 },
  'print.parking':       { minWidth: 200, maxWidth: 600,  minHeight: 100,  maxHeight: 300,  aspectRange: [1.5, 3.0],   gridMultiple: 4 },
  'print.table-number':  { minWidth: 400, maxWidth: 800,  minHeight: 600,  maxHeight: 1000, aspectRange: [0.6, 0.9],   gridMultiple: 4 },
  'print.place-card':    { minWidth: 200, maxWidth: 400,  minHeight: 100,  maxHeight: 300,  aspectRange: [1.2, 2.5],   gridMultiple: 4 },
  'print.menu':          { minWidth: 400, maxWidth: 800,  minHeight: 600,  maxHeight: 1000, aspectRange: [0.6, 0.85],  gridMultiple: 4 },
  'print.gift':          { minWidth: 300, maxWidth: 500,  minHeight: 400,  maxHeight: 600,  aspectRange: [0.7, 0.9],   gridMultiple: 4 },
  'print.remerciement':  { minWidth: 600, maxWidth: 800,  minHeight: 800,  maxHeight: 1100, aspectRange: [0.65, 0.75], gridMultiple: 4 },

  // ─── Communication pack (social-media formats) ─────────────────────────────
  'communication.facebook':   { minWidth: 1200, maxWidth: 1200, minHeight: 628,  maxHeight: 630,  aspectRange: [1.9, 1.91],  gridMultiple: 4 },
  'communication.instagram':  { minWidth: 800,  maxWidth: 1080, minHeight: 800,  maxHeight: 1080, aspectRange: [0.95, 1.05], gridMultiple: 4 },
  'communication.story':      { minWidth: 1080, maxWidth: 1080, minHeight: 1920, maxHeight: 1920, aspectRange: [0.5625, 0.5625], gridMultiple: 4 },
  'communication.email':      { minWidth: 600,  maxWidth: 800,  minHeight: 800,  maxHeight: 1200, aspectRange: [0.6, 0.8],   gridMultiple: 4 },
  'communication.banner':     { minWidth: 1200, maxWidth: 2400, minHeight: 300,  maxHeight: 400,  aspectRange: [3.0, 12.0],  gridMultiple: 4 },
  'communication.affiche':    { minWidth: 800,  maxWidth: 1200, minHeight: 1200, maxHeight: 1800, aspectRange: [0.55, 0.7],  gridMultiple: 4 },
  'communication.rollup':     { minWidth: 800,  maxWidth: 1000, minHeight: 2000, maxHeight: 2200, aspectRange: [0.4, 0.5],   gridMultiple: 4 },
  'communication.whatsapp':   { minWidth: 800,  maxWidth: 1080, minHeight: 800,  maxHeight: 1080, aspectRange: [0.95, 1.05], gridMultiple: 4 },

  // ─── Luxury pack (free-form — only loose bounds) ───────────────────────────
  'luxury.animations':  { minWidth: 100, maxWidth: 4000, minHeight: 100, maxHeight: 4000, gridMultiple: 4 },
  'luxury.transitions': { minWidth: 100, maxWidth: 4000, minHeight: 100, maxHeight: 4000, gridMultiple: 4 },
  'luxury.palette':     { minWidth: 100, maxWidth: 4000, minHeight: 100, maxHeight: 4000, gridMultiple: 4 },
  'luxury.typography':  { minWidth: 100, maxWidth: 4000, minHeight: 100, maxHeight: 4000, gridMultiple: 4 },
  'luxury.effects':     { minWidth: 100, maxWidth: 4000, minHeight: 100, maxHeight: 4000, gridMultiple: 4 },
} satisfies Record<string, ModuleDimensionSpec>

// Pack-qualified module ID — the 38 ACTUAL pack/module combinations present
// in MODULE_DIMENSION_SPEC. Disambiguates the `story` collision (which appears
// in both the Website and Communication packs).
export type ModuleDimensionKey = keyof typeof MODULE_DIMENSION_SPEC

// Reverse lookup table: ModuleId → list of pack-qualified keys (handles `story`).
const MODULE_KEY_INDEX: Record<string, ModuleDimensionKey[]> = (() => {
  const idx: Record<string, ModuleDimensionKey[]> = {}
  for (const key of Object.keys(MODULE_DIMENSION_SPEC) as ModuleDimensionKey[]) {
    // Each key is `${PackId}.${ModuleId}` — split once from the left so module
    // IDs containing '-' (e.g. 'table-number', 'place-card') parse correctly.
    const dot = key.indexOf('.')
    const mod = key.slice(dot + 1) as ModuleId
    ;(idx[mod] ||= []).push(key)
  }
  return idx
})()

function getSpecForModule(module: ModuleId, pack?: PackId): ModuleDimensionSpec | null {
  const keys = MODULE_KEY_INDEX[module]
  if (!keys || keys.length === 0) return null
  if (pack) {
    const exact = keys.find((k) => k.startsWith(`${pack}.`))
    if (exact) return MODULE_DIMENSION_SPEC[exact]
  }
  // Fallback: first matching key (deterministic — first by insertion order).
  return MODULE_DIMENSION_SPEC[keys[0]]
}

// ══════════════════════════════════════════════════════════════════════════════
// COLOR PARSING + WCAG CONTRAST
// ══════════════════════════════════════════════════════════════════════════════

export function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  let h = hex.trim().toLowerCase()
  if (!h.startsWith('#')) return null
  h = h.slice(1)
  if (h.length === 3) h = h.split('').map((c) => c + c).join('')
  if (h.length !== 6) return null
  if (!/^[0-9a-f]{6}$/.test(h)) return null
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  }
}

function hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
  const hue = ((h % 360) + 360) % 360
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1))
  const m = l - c / 2
  let r = 0, g = 0, b = 0
  if (hue < 60) { r = c; g = x; b = 0 }
  else if (hue < 120) { r = x; g = c; b = 0 }
  else if (hue < 180) { r = 0; g = c; b = x }
  else if (hue < 240) { r = 0; g = x; b = c }
  else if (hue < 300) { r = x; g = 0; b = c }
  else { r = c; g = 0; b = x }
  return {
    r: Math.round((r + m) * 255),
    g: Math.round((g + m) * 255),
    b: Math.round((b + m) * 255),
  }
}

/**
 * Parse any supported CSS color format into RGB.
 * Supports: #RGB, #RRGGBB, rgb(), rgba(), hsl(), hsla().
 * Returns null for invalid formats or out-of-range values.
 */
export function parseColor(input: string): { r: number; g: number; b: number } | null {
  if (typeof input !== 'string') return null
  const s = input.trim().toLowerCase()
  if (!s) return null
  if (s.startsWith('#')) return hexToRgb(s)

  const rgbMatch = s.match(/^rgba?\(([^)]+)\)$/)
  if (rgbMatch) {
    const parts = rgbMatch[1].split(',').map((p) => p.trim())
    if (parts.length < 3) return null
    const r = parseInt(parts[0], 10)
    const g = parseInt(parts[1], 10)
    const b = parseInt(parts[2], 10)
    if ([r, g, b].some((n) => Number.isNaN(n) || n < 0 || n > 255)) return null
    return { r, g, b }
  }

  const hslMatch = s.match(/^hsla?\(([^)]+)\)$/)
  if (hslMatch) {
    const parts = hslMatch[1].split(',').map((p) => p.trim())
    if (parts.length < 3) return null
    const h = parseFloat(parts[0])
    const sat = parseFloat(parts[1])
    const lig = parseFloat(parts[2])
    if ([h, sat, lig].some((n) => Number.isNaN(n))) return null
    return hslToRgb(h, sat / 100, lig / 100)
  }

  return null
}

/** Validate a color string is one of the accepted formats. */
export function validateColorFormat(color: string): boolean {
  return parseColor(color) !== null
}

/** WCAG relative luminance for an sRGB color. */
export function relativeLuminance(rgb: { r: number; g: number; b: number }): number {
  const toLin = (c: number) => {
    const sNorm = c / 255
    return sNorm <= 0.03928 ? sNorm / 12.92 : Math.pow((sNorm + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * toLin(rgb.r) + 0.7152 * toLin(rgb.g) + 0.0722 * toLin(rgb.b)
}

/** WCAG contrast ratio between two colors (>=1, 21 max for black/white). */
export function contrastRatio(a: { r: number; g: number; b: number }, b: { r: number; g: number; b: number }): number {
  const l1 = relativeLuminance(a)
  const l2 = relativeLuminance(b)
  const lighter = Math.max(l1, l2)
  const darker = Math.min(l1, l2)
  return (lighter + 0.05) / (darker + 0.05)
}

// ══════════════════════════════════════════════════════════════════════════════
// 1. CONTRAST CHECKS
// ══════════════════════════════════════════════════════════════════════════════

interface ContrastPair {
  code: string
  label: string
  fgKey: keyof Pick<ManifestTokens, 'text' | 'textMuted' | 'primary'>
  bgKey: keyof Pick<ManifestTokens, 'background' | 'surface'>
  threshold: number
}

const CONTRAST_PAIRS: ContrastPair[] = [
  { code: 'WCAG_CONTRAST_TEXT_BG',        label: 'text vs background',         fgKey: 'text',      bgKey: 'background', threshold: 4.5 },
  { code: 'WCAG_CONTRAST_TEXTMUTED_BG',   label: 'textMuted vs background',    fgKey: 'textMuted', bgKey: 'background', threshold: 3.0 },
  { code: 'WCAG_CONTRAST_PRIMARY_SURFACE',label: 'primary vs surface',         fgKey: 'primary',   bgKey: 'surface',    threshold: 3.0 },
]

export function validateContrast(tokens: ManifestTokens | DesignSystem): VisualCheck[] {
  const out: VisualCheck[] = []
  for (const pair of CONTRAST_PAIRS) {
    const fgRaw = tokens[pair.fgKey]
    const bgRaw = tokens[pair.bgKey]
    if (!fgRaw || !bgRaw) {
      out.push({
        code: pair.code,
        level: 'ERROR',
        message: `Missing color token for contrast check: ${pair.fgKey} or ${pair.bgKey}.`,
      })
      continue
    }
    const fg = parseColor(fgRaw)
    const bg = parseColor(bgRaw)
    if (!fg || !bg) {
      out.push({
        code: pair.code,
        level: 'ERROR',
        message: `Invalid color format for contrast check: ${pair.fgKey}="${fgRaw}" or ${pair.bgKey}="${bgRaw}".`,
        metric: { label: 'contrast', value: 'N/A', threshold: pair.threshold },
      })
      continue
    }
    const ratio = contrastRatio(fg, bg)
    const rounded = Math.round(ratio * 100) / 100
    const borderlineCeil = pair.threshold + 0.5
    let level: VisualCheck['level']
    if (ratio < pair.threshold) level = 'ERROR'
    else if (ratio < borderlineCeil) level = 'WARNING'
    else level = 'INFO'
    out.push({
      code: pair.code,
      level,
      message:
        level === 'INFO'
          ? `Contrast OK for ${pair.label}: ${rounded}:1 (≥ ${pair.threshold}:1 required).`
          : `Contrast ${level === 'ERROR' ? 'FAIL' : 'borderline'} for ${pair.label}: ${rounded}:1 (threshold ${pair.threshold}:1).`,
      metric: { label: 'contrast', value: rounded, threshold: pair.threshold },
    })
  }
  return out
}

// ══════════════════════════════════════════════════════════════════════════════
// 3. TOKENS CHECKS
// ══════════════════════════════════════════════════════════════════════════════

const REQUIRED_COLOR_SLOTS = ['primary', 'secondary', 'background', 'surface', 'text', 'textMuted'] as const
const FONT_BLACKLIST = new Set(['todo', 'lorem', 'placeholder', 'tbd', 'none', 'null', 'undefined', 'x', '-'])

function isPlausibleFontName(name: string): boolean {
  if (!name || typeof name !== 'string') return false
  const trimmed = name.trim()
  if (trimmed.length < 2) return false
  if (!/[a-zA-Z]/.test(trimmed)) return false
  return !FONT_BLACKLIST.has(trimmed.toLowerCase())
}

export function validateTokens(tokens: ManifestTokens | DesignSystem): VisualCheck[] {
  const out: VisualCheck[] = []

  // 1. Presence + format of all 6 color slots
  for (const slot of REQUIRED_COLOR_SLOTS) {
    const value = tokens[slot]
    if (!value || typeof value !== 'string' || value.trim() === '') {
      out.push({
        code: 'TOKEN_MISSING',
        level: 'ERROR',
        message: `Required color slot "${slot}" is missing or empty.`,
      })
      continue
    }
    if (!validateColorFormat(value)) {
      out.push({
        code: 'TOKEN_INVALID_FORMAT',
        level: 'ERROR',
        message: `Color slot "${slot}" has invalid format: "${value}". Accept #RGB, #RRGGBB, rgb(), rgba(), hsl(), hsla().`,
      })
    }
  }

  // 2. Distinctness: primary !== background, text !== background
  const distinctPairs: [string, keyof ManifestTokens, keyof ManifestTokens][] = [
    ['primary should differ from background', 'primary', 'background'],
    ['text should differ from background',    'text',    'background'],
    ['primary should differ from secondary',  'primary', 'secondary'],
    ['text should differ from textMuted',     'text',    'textMuted'],
  ]
  for (const [label, a, b] of distinctPairs) {
    const va = tokens[a]
    const vb = tokens[b]
    if (va && vb && va.trim().toLowerCase() === vb.trim().toLowerCase()) {
      out.push({
        code: 'TOKEN_NOT_DISTINCT',
        level: 'WARNING',
        message: `${label} (both = "${va}"). Tokens should be visually distinguishable.`,
      })
    }
  }

  // 3. Fonts non-empty + plausible
  const fontDisplay = (tokens as ManifestTokens).fontDisplay
  const fontBody = (tokens as ManifestTokens).fontBody
  if (!fontDisplay || !isPlausibleFontName(fontDisplay)) {
    out.push({
      code: 'TOKEN_FONT_DISPLAY_INVALID',
      level: 'WARNING',
      message: `Display font is empty or implausible: "${fontDisplay ?? ''}".`,
    })
  }
  if (!fontBody || !isPlausibleFontName(fontBody)) {
    out.push({
      code: 'TOKEN_FONT_BODY_INVALID',
      level: 'WARNING',
      message: `Body font is empty or implausible: "${fontBody ?? ''}".`,
    })
  }

  return out
}

// ══════════════════════════════════════════════════════════════════════════════
// Helpers shared by responsive / grid / spacing / components checks
// ══════════════════════════════════════════════════════════════════════════════

interface ParsedFrame {
  frame: PenpotFrame
  pack: PackId
  module: ModuleId
  variant: string
}

function parseFrames(frames: PenpotFrame[]): ParsedFrame[] {
  const out: ParsedFrame[] = []
  for (const frame of frames) {
    const parsed = parseFrameName(frame.name)
    if (!parsed) continue
    if (typeof frame.width !== 'number' || typeof frame.height !== 'number') continue
    if (frame.width <= 0 || frame.height <= 0) continue
    out.push({ frame, pack: parsed.pack, module: parsed.module, variant: parsed.variant })
  }
  return out
}

// Borderline threshold: within 5% of the bound.
const BORDERLINE_TOLERANCE = 0.05
function borderline(value: number, min: number, max: number): boolean {
  const range = max - min
  const tol = range * BORDERLINE_TOLERANCE
  return value >= min - tol && value <= max + tol
    && (value < min + tol || value > max - tol)
}

// ══════════════════════════════════════════════════════════════════════════════
// 2. RESPONSIVE CHECKS — frame dimensions within module spec range
// ══════════════════════════════════════════════════════════════════════════════

export function validateResponsive(
  frames: PenpotFrame[],
  spec: Record<ModuleDimensionKey, ModuleDimensionSpec> = MODULE_DIMENSION_SPEC,
): VisualCheck[] {
  const out: VisualCheck[] = []
  const parsed = parseFrames(frames)
  for (const { frame, pack, module } of parsed) {
    const s = getSpecForModule(module, pack)
    if (!s) continue
    // Skip spec checks for luxury/free-form modules — only grid applies.
    if (pack === 'luxury') continue

    const w = frame.width as number
    const h = frame.height as number
    const wIn = w >= s.minWidth && w <= s.maxWidth
    const hIn = h >= s.minHeight && h <= s.maxHeight
    const wBorder = borderline(w, s.minWidth, s.maxWidth)
    const hBorder = borderline(h, s.minHeight, s.maxHeight)

    if (!wIn || !hIn) {
      // Out of bounds — ERROR or WARNING depending on severity
      const wOff = !wIn && Math.abs(w < s.minWidth ? w - s.minWidth : w - s.maxWidth) > (s.maxWidth - s.minWidth) * 0.5
      const hOff = !hIn && Math.abs(h < s.minHeight ? h - s.minHeight : h - s.maxHeight) > (s.maxHeight - s.minHeight) * 0.5
      const level: VisualCheck['level'] = (wOff || hOff) ? 'ERROR' : 'WARNING'
      out.push({
        code: 'RESPONSIVE_OUT_OF_SPEC',
        level,
        pack,
        module,
        message: `Frame "${frame.name}" dimensions ${w}×${h} outside spec ${s.minWidth}-${s.maxWidth}×${s.minHeight}-${s.maxHeight}.`,
        metric: { label: 'dimensions', value: `${w}x${h}`, threshold: `${s.minWidth}-${s.maxWidth}x${s.minHeight}-${s.maxHeight}` },
      })
    } else if (wBorder || hBorder) {
      out.push({
        code: 'RESPONSIVE_BORDERLINE',
        level: 'WARNING',
        pack,
        module,
        message: `Frame "${frame.name}" dimensions ${w}×${h} are borderline (within 5% of spec bounds).`,
      })
    }
  }
  return out
}

// ══════════════════════════════════════════════════════════════════════════════
// 5. GRID CHECKS — dimensions are multiples of gridMultiple
// ══════════════════════════════════════════════════════════════════════════════

export function validateGrid(
  frames: PenpotFrame[],
  spec: Record<ModuleDimensionKey, ModuleDimensionSpec> = MODULE_DIMENSION_SPEC,
): VisualCheck[] {
  const out: VisualCheck[] = []
  const parsed = parseFrames(frames)
  for (const { frame, pack, module } of parsed) {
    const s = getSpecForModule(module, pack)
    const multiple = s?.gridMultiple ?? 4
    const w = frame.width as number
    const h = frame.height as number
    const wOk = w % multiple === 0
    const hOk = h % multiple === 0
    if (!wOk || !hOk) {
      out.push({
        code: 'GRID_NON_MULTIPLE',
        level: 'INFO',
        pack,
        module,
        message: `Frame "${frame.name}" dimensions ${w}×${h} not on ${multiple}px grid (w%${multiple}=${w % multiple}, h%${multiple}=${h % multiple}).`,
        metric: { label: 'grid', value: `${multiple}px`, threshold: multiple },
      })
    }
  }
  return out
}

// ══════════════════════════════════════════════════════════════════════════════
// 6. SPACING CHECKS — aspect ratio within expected range per module type
// ══════════════════════════════════════════════════════════════════════════════

export function validateSpacing(
  frames: PenpotFrame[],
  spec: Record<ModuleDimensionKey, ModuleDimensionSpec> = MODULE_DIMENSION_SPEC,
): VisualCheck[] {
  const out: VisualCheck[] = []
  const parsed = parseFrames(frames)
  for (const { frame, pack, module } of parsed) {
    const s = getSpecForModule(module, pack)
    if (!s?.aspectRange) continue
    const w = frame.width as number
    const h = frame.height as number
    const aspect = w / h
    const [min, max] = s.aspectRange
    if (aspect < min || aspect > max) {
      out.push({
        code: 'SPACING_ASPECT_OUT_OF_RANGE',
        level: 'ERROR',
        pack,
        module,
        message: `Frame "${frame.name}" aspect ${aspect.toFixed(3)} outside expected range [${min}, ${max}] (${w}×${h}).`,
        metric: { label: 'aspect', value: Math.round(aspect * 1000) / 1000, threshold: `${min}-${max}` },
      })
    }
  }
  return out
}

// ══════════════════════════════════════════════════════════════════════════════
// 7. COMPONENTS CHECKS — semantic per-module-type rules
// ══════════════════════════════════════════════════════════════════════════════

interface ComponentRule {
  pack: PackId
  module: ModuleId
  code: string
  description: string
  level: VisualCheck['level']
  check: (w: number, h: number) => boolean
}

const COMPONENT_RULES: ComponentRule[] = [
  {
    pack: 'website', module: 'hero', code: 'COMPONENT_HERO_DESKTOP_WIDTH',
    description: 'Hero should be ≥1200px wide for desktop layouts',
    level: 'INFO',
    check: (w) => w >= 1200,
  },
  {
    pack: 'invitations', module: 'standard', code: 'COMPONENT_INVITATION_PORTRAIT',
    description: 'Invitation standard should be portrait (aspect 0.65-0.75)',
    level: 'WARNING',
    check: (_w, h) => false, // replaced by aspect logic below
  },
  {
    pack: 'print', module: 'qr', code: 'COMPONENT_QR_SQUARE',
    description: 'QR code should be square (aspect 0.95-1.05)',
    level: 'WARNING',
    check: (w, h) => {
      const a = w / h
      return a >= 0.95 && a <= 1.05
    },
  },
  {
    pack: 'communication', module: 'story', code: 'COMPONENT_STORY_VERTICAL_9_16',
    description: 'Communication story should be 9:16 vertical (aspect 0.5625)',
    level: 'WARNING',
    check: (w, h) => {
      const a = w / h
      return a >= 0.555 && a <= 0.575
    },
  },
  {
    pack: 'communication', module: 'banner', code: 'COMPONENT_BANNER_WIDE',
    description: 'Communication banner should be wide (aspect ≥3.0)',
    level: 'WARNING',
    check: (w, h) => w / h >= 3.0,
  },
]

export function validateComponents(
  collection: PremiumCollection,
  detection: DetectionResult,
): VisualCheck[] {
  const out: VisualCheck[] = []
  const frames = detection.registry.frames
  const parsed = parseFrames(frames)

  for (const rule of COMPONENT_RULES) {
    const matching = parsed.filter((p) => p.pack === rule.pack && p.module === rule.module)
    if (matching.length === 0) continue // no detected frame for this module → structural validator handles it
    for (const { frame } of matching) {
      const w = frame.width as number
      const h = frame.height as number

      // Special-case the invitation aspect rule (uses aspect range explicitly).
      if (rule.code === 'COMPONENT_INVITATION_PORTRAIT') {
        const a = w / h
        const ok = a >= 0.65 && a <= 0.75
        if (!ok) {
          out.push({
            code: rule.code,
            level: rule.level,
            pack: rule.pack,
            module: rule.module,
            message: `${rule.description}. Frame "${frame.name}" aspect ${a.toFixed(3)} (${w}×${h}).`,
            metric: { label: 'aspect', value: Math.round(a * 1000) / 1000, threshold: '0.65-0.75' },
          })
        }
        continue
      }

      const ok = rule.check(w, h)
      if (!ok) {
        out.push({
          code: rule.code,
          level: rule.level,
          pack: rule.pack,
          module: rule.module,
          message: `${rule.description}. Frame "${frame.name}" = ${w}×${h}.`,
        })
      }
    }
  }

  // Sanity: warn if the Collection's own designSystem fonts are missing
  // (cross-check tokens against the detected file — informational only here,
  // the validateTokens() function does the deeper check).
  if (collection.designSystem.fontDisplay === collection.designSystem.fontBody) {
    out.push({
      code: 'COMPONENT_FONT_DISPLAY_EQUALS_BODY',
      level: 'WARNING',
      message: `Display font equals body font ("${collection.designSystem.fontDisplay}"). Collections should use a contrasting display face.`,
    })
  }

  return out
}

// ══════════════════════════════════════════════════════════════════════════════
// 8. MAIN — run all visual validators + aggregate summary
// ══════════════════════════════════════════════════════════════════════════════

export function runVisualValidation(
  collection: PremiumCollection,
  detection: DetectionResult,
): VisualValidationSummary {
  const issues: VisualCheck[] = []

  // Tokens + contrast run against the Collection's design system.
  issues.push(...validateTokens(collection.designSystem))
  issues.push(...validateContrast(collection.designSystem))

  // Frame-based checks run against the detection result's frames.
  const frames = detection.registry.frames
  issues.push(...validateResponsive(frames))
  issues.push(...validateGrid(frames))
  issues.push(...validateSpacing(frames))

  // Component semantic checks (needs the Collection too for cross-checks).
  issues.push(...validateComponents(collection, detection))

  const errors = issues.filter((i) => i.level === 'ERROR').length
  const warnings = issues.filter((i) => i.level === 'WARNING').length
  const failedChecks = errors + warnings
  const checks = issues.length
  const score = Math.max(0, Math.min(100, 100 - failedChecks * 8))

  return {
    passes: errors === 0,
    score,
    checks,
    failedChecks,
    issues,
    ranAt: new Date().toISOString(),
  }
}
