/**
 * Luxury Engine Store — Zustand + localStorage persistence
 * Independent visual layer for cinematic ambiance.
 * Completely separate from the existing visual-effects-store.
 * When disabled, the site reverts to its exact current state.
 */

import { create } from 'zustand'

/**
 * Tenant-scoped storage key.
 *
 * Since Phase 3 ÉTAPE 4, the localStorage key is namespaced by the current
 * wedding slug so that toggling effects in wedding A's admin no longer
 * affects all other weddings on the same browser.
 *
 *   - On `/w/[slug]/...` → key = `wedding_luxury_engine_<slug>`
 *   - On root `/`         → key = `wedding_luxury_engine_default`
 *
 * Backward compatibility: for the default wedding only, on first load, if
 * the new namespaced key does not exist but the legacy un-namespaced key
 * (`wedding_luxury_engine`) does, the legacy data is copied to the new key
 * and the legacy key is removed. This preserves the existing settings for
 * the default wedding (josue-hornella).
 */
const LS_KEY_PREFIX = 'wedding_luxury_engine'
const LEGACY_LS_KEY = 'wedding_luxury_engine'

function getWeddingSlug(): string {
  if (typeof window === 'undefined') return 'default'
  const match = window.location.pathname.match(/^\/w\/([a-z0-9-]+)/i)
  return match?.[1] || 'default'
}

function lsKey(): string {
  return `${LS_KEY_PREFIX}_${getWeddingSlug()}`
}

export type LuxuryTheme = 'gold' | 'rose' | 'champagne' | 'midnight'
export type PerformanceTier = 'ultra' | 'high' | 'medium' | 'low' | 'minimal'

export interface LuxuryEngineState {
  // Master toggle
  enabled: boolean

  // Individual effect toggles
  starrySky: boolean
  goldenDust: boolean
  luminousHalos: boolean
  globalBreathing: boolean
  sectionAmbiance: boolean
  scrollReflections: boolean
  microSparkles: boolean

  // Intensity controls (0-100)
  intensity: number      // Global intensity multiplier
  density: number        // Particle density
  speed: number          // Animation speed multiplier
  haloCount: number      // Number of halos (2-8)

  // Theme
  theme: LuxuryTheme

  // Performance (auto-managed, but can be overridden)
  performanceTier: PerformanceTier
  autoPerformance: boolean  // Auto-detect and adjust

  // FPS tracking (internal, not persisted)
  currentFps: number

  // Actions
  toggle: (key: keyof LuxuryEngineState) => void
  setValue: (key: keyof LuxuryEngineState, value: boolean | number | string) => void
  setTheme: (theme: LuxuryTheme) => void
  setPerformanceTier: (tier: PerformanceTier) => void
  enableAll: () => void
  disableAll: () => void
  resetToDefaults: () => void
}

const defaultState = {
  enabled: true,

  starrySky: true,
  goldenDust: true,
  luminousHalos: true,
  globalBreathing: true,
  sectionAmbiance: true,
  scrollReflections: true,
  microSparkles: true,

  intensity: 60,
  density: 50,
  speed: 70,
  haloCount: 5,

  theme: 'gold' as LuxuryTheme,
  performanceTier: 'high' as PerformanceTier,
  autoPerformance: true,
  currentFps: 60,
}

const booleanKeys = [
  'enabled', 'starrySky', 'goldenDust', 'luminousHalos',
  'globalBreathing', 'sectionAmbiance', 'scrollReflections',
  'microSparkles', 'autoPerformance',
] as const

function loadFromStorage(): Partial<LuxuryEngineState> {
  if (typeof window === 'undefined') return {}
  try {
    const key = lsKey()
    // One-time backward-compat migration for the default wedding: if the
    // new slug-namespaced key does not exist yet but the legacy
    // (un-namespaced) key does, copy the data over and remove the legacy key.
    if (getWeddingSlug() === 'default' && localStorage.getItem(key) === null) {
      const legacy = localStorage.getItem(LEGACY_LS_KEY)
      if (legacy) {
        localStorage.setItem(key, legacy)
        localStorage.removeItem(LEGACY_LS_KEY)
      }
    }
    const saved = localStorage.getItem(key)
    if (saved) return JSON.parse(saved)
  } catch {}
  return {}
}

function saveToStorage(state: Partial<LuxuryEngineState>) {
  if (typeof window === 'undefined') return
  try {
    // Don't persist currentFps
    const toSave = { ...state }
    delete (toSave as Record<string, unknown>).currentFps
    localStorage.setItem(lsKey(), JSON.stringify(toSave))
  } catch {}
}

export const useLuxuryEngine = create<LuxuryEngineState>((set, get) => {
  const saved = loadFromStorage()
  const initial = { ...defaultState, ...saved }

  return {
    ...initial,

    toggle: (key) => {
      const current = get()[key]
      if (typeof current === 'boolean') {
        const update = { [key]: !current }
        set(update)
        saveToStorage({ ...get(), ...update })
      }
    },

    setValue: (key, value) => {
      const update = { [key]: value }
      set(update)
      saveToStorage({ ...get(), ...update })
    },

    setTheme: (theme) => {
      set({ theme })
      saveToStorage({ ...get(), theme })
    },

    setPerformanceTier: (tier) => {
      set({ performanceTier: tier })
      saveToStorage({ ...get(), performanceTier: tier })
    },

    enableAll: () => {
      const update: Record<string, boolean> = { enabled: true }
      booleanKeys.forEach(k => { update[k] = true })
      set(update as Partial<LuxuryEngineState>)
      saveToStorage({ ...get(), ...update })
    },

    disableAll: () => {
      const update: Record<string, boolean> = {}
      booleanKeys.forEach(k => { update[k] = false })
      update.enabled = false
      set(update as Partial<LuxuryEngineState>)
      saveToStorage({ ...get(), ...update })
    },

    resetToDefaults: () => {
      set(defaultState)
      saveToStorage(defaultState as Partial<LuxuryEngineState>)
    },
  }
})

/** Theme color palettes */
export const LUXURY_THEMES: Record<LuxuryTheme, {
  primary: string
  secondary: string
  tertiary: string
  halo: string
  dust: string[]
  star: string
  breath: string
}> = {
  gold: {
    primary: '#C4A265',
    secondary: '#D4B87A',
    tertiary: '#8B6914',
    halo: 'rgba(196, 162, 101, 0.04)',
    dust: ['#C4A265', '#D4B87A', '#8B6914', '#E8D5A3'],
    star: 'rgba(196, 162, 101, 0.6)',
    breath: 'rgba(196, 162, 101, 0.03)',
  },
  rose: {
    primary: '#B05A5A',
    secondary: '#C47A7A',
    tertiary: '#8B3A3A',
    halo: 'rgba(176, 90, 90, 0.04)',
    dust: ['#B05A5A', '#C47A7A', '#D4A87A', '#E8C0A0'],
    star: 'rgba(176, 90, 90, 0.6)',
    breath: 'rgba(176, 90, 90, 0.03)',
  },
  champagne: {
    primary: '#D4B87A',
    secondary: '#E8D5A3',
    tertiary: '#C4A265',
    halo: 'rgba(212, 184, 122, 0.04)',
    dust: ['#D4B87A', '#E8D5A3', '#C4A265', '#F0E6CC'],
    star: 'rgba(212, 184, 122, 0.5)',
    breath: 'rgba(212, 184, 122, 0.03)',
  },
  midnight: {
    primary: '#6B7FA0',
    secondary: '#8B9DB8',
    tertiary: '#4A5D78',
    halo: 'rgba(107, 127, 160, 0.04)',
    dust: ['#6B7FA0', '#8B9DB8', '#A0B4CC', '#C4D0E0'],
    star: 'rgba(160, 180, 204, 0.7)',
    breath: 'rgba(107, 127, 160, 0.03)',
  },
}

/** Performance tier configurations */
export const TIER_CONFIG: Record<PerformanceTier, {
  maxStars: number
  maxDust: number
  maxSparkles: number
  maxHalos: number
  enableBreathing: boolean
  enableSectionAmbiance: boolean
  enableScrollReflections: boolean
  canvasPixelRatio: number
}> = {
  ultra: {
    maxStars: 800,
    maxDust: 150,
    maxSparkles: 40,
    maxHalos: 8,
    enableBreathing: true,
    enableSectionAmbiance: true,
    enableScrollReflections: true,
    canvasPixelRatio: 1,
  },
  high: {
    maxStars: 500,
    maxDust: 100,
    maxSparkles: 25,
    maxHalos: 6,
    enableBreathing: true,
    enableSectionAmbiance: true,
    enableScrollReflections: true,
    canvasPixelRatio: 1,
  },
  medium: {
    maxStars: 250,
    maxDust: 60,
    maxSparkles: 15,
    maxHalos: 4,
    enableBreathing: true,
    enableSectionAmbiance: false,
    enableScrollReflections: false,
    canvasPixelRatio: 0.75,
  },
  low: {
    maxStars: 100,
    maxDust: 30,
    maxSparkles: 8,
    maxHalos: 2,
    enableBreathing: false,
    enableSectionAmbiance: false,
    enableScrollReflections: false,
    canvasPixelRatio: 0.5,
  },
  minimal: {
    maxStars: 50,
    maxDust: 15,
    maxSparkles: 4,
    maxHalos: 1,
    enableBreathing: false,
    enableSectionAmbiance: false,
    enableScrollReflections: false,
    canvasPixelRatio: 0.5,
  },
}
