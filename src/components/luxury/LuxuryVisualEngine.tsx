'use client'

/**
 * LuxuryVisualEngine — Cinematic ambiance overlay
 * 
 * Independent visual layer that adds immersive effects:
 * - Starry sky (Canvas)
 * - Golden dust (Canvas)
 * - Micro sparkles (Canvas)
 * - Luminous halos (DOM)
 * - Global breathing (CSS)
 * - Section ambiance (scroll-aware)
 * 
 * When disabled, the site reverts to its exact current state.
 * Zero modification to existing components.
 */

import { useEffect, useRef, useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useLuxuryEngine, LUXURY_THEMES, TIER_CONFIG, type PerformanceTier } from '@/lib/luxury-engine-store'
import { LuxuryParticleEngine, type EngineConfig } from './particle-engine'
import { useTheme } from 'next-themes'
import { useMotionTier } from '@/lib/motion/useMotionTier'

// ─── Luminous Halo Component (DOM-based, very lightweight) ───
const Halo = memo(function Halo({
  index,
  theme,
  speedMultiplier
}: {
  index: number
  theme: string
  speedMultiplier: number
}) {
  const { reduced: prefersReducedMotion, tier } = useMotionTier()
  const isStatic = prefersReducedMotion || tier === 'none'
  // Stable random values via useMemo
  const props = useMemo(() => ({
    size: 150 + Math.random() * 250,
    startX: Math.random() * 100,
    startY: Math.random() * 100,
    duration: (25 + Math.random() * 20) / speedMultiplier,
  }), [speedMultiplier])

  return (
    <motion.div
      className="absolute rounded-full pointer-events-none will-change-transform"
      style={{
        width: props.size,
        height: props.size,
        left: `${props.startX}%`,
        top: `${props.startY}%`,
        background: `radial-gradient(circle, ${theme} 0%, transparent 70%)`,
        filter: 'blur(60px)',
        ...(isStatic ? { opacity: 0.4 } : {}),
      }}
      animate={isStatic ? undefined : {
        x: [0, 30, -20, 15, 0],
        y: [0, -25, 15, -30, 0],
        opacity: [0.3, 0.6, 0.4, 0.5, 0.3],
      }}
      transition={isStatic ? undefined : {
        duration: props.duration,
        delay: index * 3 + Math.random() * 5,
        repeat: Infinity,
        ease: 'easeInOut',
      }}
    />
  )
})

import { memo } from 'react'

// ─── Global Breathing Effect ───
function GlobalBreathing({ color, enabled }: { color: string; enabled: boolean }) {
  const { reduced: prefersReducedMotion, tier } = useMotionTier()
  const isStatic = prefersReducedMotion || tier === 'none'
  if (!enabled || isStatic) return null

  return (
    <motion.div
      className="absolute inset-0 pointer-events-none will-change-opacity"
      style={{
        background: `radial-gradient(ellipse at 50% 50%, ${color}, transparent 70%)`,
      }}
      animate={{
        opacity: [0, 0.4, 0],
      }}
      transition={{
        duration: 25,
        repeat: Infinity,
        ease: 'easeInOut',
        repeatDelay: 5,
      }}
    />
  )
}

// ─── Main Component ───
export default function LuxuryVisualEngine() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const engineRef = useRef<LuxuryParticleEngine | null>(null)
  const [mounted, setMounted] = useState(false)
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 })
  const scrollYRef = useRef(0)
  const { reduced: prefersReducedMotion, tier } = useMotionTier()
  // Static path: skip the motion-based DOM layers (halos, breathing) when the
  // user prefers reduced motion or the wedding's tier is 'none'. The Canvas
  // particle engine continues to run (it's not framer-motion-based) — it has
  // its own internal performance gating via the luxury engine store.
  const isStatic = prefersReducedMotion || tier === 'none'

  const {
    enabled,
    starrySky,
    goldenDust,
    microSparkles,
    luminousHalos,
    globalBreathing,
    intensity,
    density,
    speed,
    haloCount,
    theme,
    performanceTier,
    autoPerformance,
    currentFps,
    setValue,
    setPerformanceTier,
  } = useLuxuryEngine()

  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === 'dark'
  const themeColors = LUXURY_THEMES[theme]
  const tierConfig = TIER_CONFIG[performanceTier]

  // Mount guard (prevent SSR hydration issues)
  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true))
    return () => cancelAnimationFrame(id)
  }, [])

  // Mission 5.7 B10: read luxuryPreset from Theme.customizations.luxury (DB)
  // and apply it as the default luxury theme. Previously this was a ghost
  // field — applyCollection wrote it but LuxuryVisualEngine never read it.
  // We only apply the DB preset if the user hasn't explicitly overridden
  // the theme via the admin UI (tracked via a localStorage flag).
  useEffect(() => {
    if (!mounted) return
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/theme')
        if (!res.ok) return
        const data = await res.json()
        const themeRow = data.theme || data
        if (!themeRow.customizations) return
        const customizations = typeof themeRow.customizations === 'string'
          ? JSON.parse(themeRow.customizations)
          : themeRow.customizations
        const luxury = customizations.luxury
        if (!luxury || typeof luxury !== 'object') return
        // Apply the DB luxury theme if it specifies a theme key AND the user
        // hasn't explicitly overridden via the admin UI.
        if (luxury.theme && LUXURY_THEMES[luxury.theme]) {
          const userOverrideKey = `wedding_luxury_engine_${(window.location.pathname.match(/^\/w\/([a-z0-9-]+)/i)?.[1]) || 'default'}_user_override`
          const userOverride = localStorage.getItem(userOverrideKey)
          if (!userOverride) {
            useLuxuryEngine.getState().setValue('theme', luxury.theme)
          }
        }
      } catch {
        // Silent — luxury preset is optional, don't crash the page
      }
    })()
    return () => { cancelled = true }
  }, [mounted])

  // Track dimensions
  useEffect(() => {
    if (!mounted) return

    const updateDimensions = () => {
      setDimensions({
        width: window.innerWidth,
        height: window.innerHeight,
      })
    }

    updateDimensions()
    window.addEventListener('resize', updateDimensions)
    return () => window.removeEventListener('resize', updateDimensions)
  }, [mounted])

  // Track scroll
  useEffect(() => {
    if (!mounted) return

    const handleScroll = () => {
      scrollYRef.current = window.scrollY
    }

    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [mounted])

  // Auto-detect initial performance tier
  useEffect(() => {
    if (!mounted || !autoPerformance) return

    const cores = navigator.hardwareConcurrency || 4
    const memory = (navigator as { deviceMemory?: number }).deviceMemory || 4

    let tier: PerformanceTier = 'high'
    if (cores <= 2 || memory <= 1) tier = 'low'
    else if (cores <= 4 || memory <= 2) tier = 'medium'
    else tier = 'high'

    // Mobile detection
    const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
    if (isMobile && tier === 'high') tier = 'medium'

    setPerformanceTier(tier)
  }, [mounted, autoPerformance, setPerformanceTier])

  // FPS-based auto performance adjustment (with hysteresis)
  const fpsLowCountRef = useRef(0)
  const fpsHighCountRef = useRef(0)

  useEffect(() => {
    if (!autoPerformance || !enabled) return

    if (currentFps < 25) {
      fpsLowCountRef.current++
      fpsHighCountRef.current = 0
      // Need 3 consecutive low FPS readings before downgrading
      // Never auto-downgrade below "low" tier — always keep some particles
      if (fpsLowCountRef.current >= 3 && performanceTier !== 'low' && performanceTier !== 'minimal') {
        const tiers: PerformanceTier[] = ['ultra', 'high', 'medium', 'low', 'minimal']
        const currentIdx = tiers.indexOf(performanceTier)
        if (currentIdx < 3) { // Only downgrade to 'low' at most
          setPerformanceTier(tiers[currentIdx + 1])
          fpsLowCountRef.current = 0
        }
      }
    } else if (currentFps > 50) {
      fpsHighCountRef.current++
      fpsLowCountRef.current = 0
      // Need 5 consecutive high FPS readings before upgrading
      if (fpsHighCountRef.current >= 5 && performanceTier !== 'ultra') {
        const tiers: PerformanceTier[] = ['ultra', 'high', 'medium', 'low', 'minimal']
        const currentIdx = tiers.indexOf(performanceTier)
        if (currentIdx > 0) {
          setPerformanceTier(tiers[currentIdx - 1])
          fpsHighCountRef.current = 0
        }
      }
    } else {
      fpsLowCountRef.current = 0
      fpsHighCountRef.current = 0
    }
  }, [currentFps, autoPerformance, enabled, performanceTier, setPerformanceTier])

  // Initialize and manage particle engine
  useEffect(() => {
    if (!mounted || !canvasRef.current || !enabled || dimensions.width === 0) return

    const canvas = canvasRef.current

    const config: EngineConfig = {
      maxStars: starrySky ? tierConfig.maxStars : 0,
      maxDust: goldenDust ? tierConfig.maxDust : 0,
      maxSparkles: microSparkles ? tierConfig.maxSparkles : 0,
      speedMultiplier: speed / 100,
      intensityMultiplier: intensity / 100,
      densityMultiplier: density,
      colors: {
        dust: themeColors.dust,
        star: themeColors.star,
      },
      width: dimensions.width,
      height: dimensions.height,
      pixelRatio: tierConfig.canvasPixelRatio,
      darkMode: isDark,
      scrollY: scrollYRef.current,
    }

    if (!engineRef.current) {
      engineRef.current = new LuxuryParticleEngine(canvas, config)
      engineRef.current.setOnFpsUpdate((fps) => {
        useLuxuryEngine.getState().setValue('currentFps', fps)
      })
      engineRef.current.start()
    } else {
      // Full reinitialize when particle counts change
      const needsReinit = 
        engineRef.current.getConfig().maxStars !== config.maxStars ||
        engineRef.current.getConfig().maxDust !== config.maxDust ||
        engineRef.current.getConfig().maxSparkles !== config.maxSparkles
      
      if (needsReinit) {
        engineRef.current.destroy()
        engineRef.current = new LuxuryParticleEngine(canvas, config)
        engineRef.current.setOnFpsUpdate((fps) => {
          useLuxuryEngine.getState().setValue('currentFps', fps)
        })
        engineRef.current.start()
      } else {
        engineRef.current.updateConfig(config)
      }
    }

    return () => {
      // Cleanup only when disabled or unmounted
    }
  }, [mounted, enabled, dimensions, starrySky, goldenDust, microSparkles, 
      intensity, density, speed, theme, performanceTier, isDark, tierConfig, themeColors])

  // Cleanup on disable or unmount
  useEffect(() => {
    if (!enabled && engineRef.current) {
      engineRef.current.destroy()
      engineRef.current = null
    }
    return () => {
      if (engineRef.current) {
        engineRef.current.destroy()
        engineRef.current = null
      }
    }
  }, [enabled])

  // Scroll update loop
  useEffect(() => {
    if (!enabled) return

    const interval = setInterval(() => {
      if (engineRef.current) {
        engineRef.current.updateConfig({ scrollY: scrollYRef.current })
      }
    }, 100)

    return () => clearInterval(interval)
  }, [enabled])

  if (!mounted || !enabled) return null

  const halos = luminousHalos ? Math.min(haloCount, tierConfig.maxHalos) : 0

  return (
    <div
      className="fixed inset-0 pointer-events-none overflow-hidden"
      style={{ zIndex: 0 }}
      aria-hidden="true"
    >
      {/* Canvas layer: Stars + Dust + Sparkles */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0"
        style={{
          width: dimensions.width || '100%',
          height: dimensions.height || '100%',
        }}
      />

      {/* DOM layer: Luminous Halos */}
      {!isStatic && halos > 0 && Array.from({ length: halos }, (_, i) => (
        <Halo
          key={`halo-${i}`}
          index={i}
          theme={themeColors.halo}
          speedMultiplier={speed / 100}
        />
      ))}

      {/* DOM layer: Global Breathing */}
      <GlobalBreathing
        color={themeColors.breath}
        enabled={globalBreathing && tierConfig.enableBreathing && !isStatic}
      />
    </div>
  )
}