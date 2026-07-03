/**
 * Visual Effects Store — Zustand + localStorage persistence
 * Controls all premium visual effects on the wedding platform.
 * Each effect can be individually toggled from the admin panel.
 */

import { create } from 'zustand'

/**
 * Tenant-scoped storage key.
 *
 * Since Phase 3 ÉTAPE 4, the localStorage key is namespaced by the current
 * wedding slug so that toggling effects in wedding A's admin no longer
 * affects all other weddings on the same browser.
 *
 *   - On `/w/[slug]/...` → key = `wedding_visual_effects_<slug>`
 *   - On root `/`         → key = `wedding_visual_effects_default`
 *
 * Backward compatibility: for the default wedding only, on first load, if
 * the new namespaced key does not exist but the legacy un-namespaced key
 * (`wedding_visual_effects`) does, the legacy data is copied to the new key
 * and the legacy key is removed. This preserves the existing settings for
 * the default wedding (josue-hornella).
 */
const LS_KEY_PREFIX = 'wedding_visual_effects'
const LEGACY_LS_KEY = 'wedding_visual_effects'

function getWeddingSlug(): string {
  if (typeof window === 'undefined') return 'default'
  const match = window.location.pathname.match(/^\/w\/([a-z0-9-]+)/i)
  return match?.[1] || 'default'
}

function lsKey(): string {
  return `${LS_KEY_PREFIX}_${getWeddingSlug()}`
}

export interface VisualEffectsState {
  // Effect toggles
  sparkles: boolean        // Étincelles lumineuses
  particles: boolean       // Particules flottantes (golden dust)
  parallax: boolean        // Effet parallax
  dynamicLight: boolean    // Lumière dorée dynamique (luxury sweep)
  glowEffects: boolean     // Glow effects on buttons/cards
  bokeh: boolean           // Bokeh background effect
  floatingElements: boolean // Floating micro-animations
  microAnimations: boolean // Micro-animations (fade-in, slide-up, scale)
  glassmorphism: boolean   // Glassmorphism on cards/panels
  premiumButtons: boolean  // Premium button effects
  scrollReveal: boolean    // Scroll-triggered reveal animations
  music: boolean           // Ambient music (delegates to AmbientMusicPlayer)
  
  // Intensity controls (0-100)
  sparkleIntensity: number  // How many sparkles
  particleCount: number     // How many particles
  animationSpeed: number    // Global animation speed multiplier
  
  // Actions
  toggle: (key: keyof VisualEffectsState) => void
  setValue: (key: keyof VisualEffectsState, value: boolean | number) => void
  resetToDefaults: () => void
  enableAll: () => void
  disableAll: () => void
}

const defaultState = {
  sparkles: true,
  particles: true,
  parallax: true,
  dynamicLight: true,
  glowEffects: true,
  bokeh: true,
  floatingElements: true,
  microAnimations: true,
  glassmorphism: true,
  premiumButtons: true,
  scrollReveal: true,
  music: true,
  sparkleIntensity: 50,
  particleCount: 50,
  animationSpeed: 100,
}

function loadFromStorage(): Partial<VisualEffectsState> {
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

function saveToStorage(state: Partial<VisualEffectsState>) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(lsKey(), JSON.stringify(state))
  } catch {}
}

const booleanKeys = [
  'sparkles', 'particles', 'parallax', 'dynamicLight', 'glowEffects',
  'bokeh', 'floatingElements', 'microAnimations', 'glassmorphism',
  'premiumButtons', 'scrollReveal', 'music'
] as const

const numberKeys = [
  'sparkleIntensity', 'particleCount', 'animationSpeed'
] as const

export const useVisualEffects = create<VisualEffectsState>((set, get) => {
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
    
    resetToDefaults: () => {
      set(defaultState)
      saveToStorage(defaultState)
    },
    
    enableAll: () => {
      const update: Record<string, boolean> = {}
      booleanKeys.forEach(k => { update[k] = true })
      set(update as Partial<VisualEffectsState>)
      saveToStorage({ ...get(), ...update })
    },
    
    disableAll: () => {
      const update: Record<string, boolean> = {}
      booleanKeys.forEach(k => { update[k] = false })
      set(update as Partial<VisualEffectsState>)
      saveToStorage({ ...get(), ...update })
    },
  }
})

/** Hook to check if an effect is enabled */
export function useEffectEnabled(key: keyof VisualEffectsState): boolean {
  const state = useVisualEffects()
  const val = state[key]
  return typeof val === 'boolean' ? val : false
}
