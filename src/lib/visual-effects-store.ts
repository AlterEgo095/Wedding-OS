/**
 * Visual Effects Store — Zustand + localStorage persistence
 * Controls all premium visual effects on the wedding platform.
 * Each effect can be individually toggled from the admin panel.
 */

import { create } from 'zustand'

const LS_KEY = 'wedding_visual_effects'

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
    const saved = localStorage.getItem(LS_KEY)
    if (saved) return JSON.parse(saved)
  } catch {}
  return {}
}

function saveToStorage(state: Partial<VisualEffectsState>) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(state))
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
