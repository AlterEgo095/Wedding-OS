'use client'

import { motion } from 'framer-motion'
import type { ThemePackage } from '@/lib/aenws/theme-system'

interface VariantProps {
  theme: ThemePackage
  variant: 'compact' | 'full'
}

const EASING = [0.25, 0.46, 0.45, 0.94] as const

// ══════════════════════════════════════════════════════════════════════════════
// HERO VARIANT 1: CINEMATIC PARALLAX — dark luxury themes
// (Royal Gold, Royal Black, Sapphire Noir)
// ══════════════════════════════════════════════════════════════════════════════
export function HeroCinematic({ theme, variant }: VariantProps) {
  const d = theme.demo
  const i = theme.identity
  const h = variant === 'compact' ? 'h-full' : 'min-h-screen'

  return (
    <section className={`relative ${h} flex items-center justify-center overflow-hidden`} style={{ background: i.ambiance }}>
      {/* Glow with theme primary color */}
      <motion.div
        initial={{ opacity: 0, scale: 0.5 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 1.5, ease: EASING }}
        className="absolute inset-0 z-0 flex items-center justify-center"
      >
        <div className="w-48 h-48 md:w-96 md:h-96 rounded-full blur-3xl" style={{ background: `radial-gradient(circle, ${i.primary}50, transparent 70%)` }} />
      </motion.div>
      {/* Decorative pattern */}
      <div className="absolute inset-0 z-[1] pointer-events-none" style={{ backgroundImage: i.pattern, backgroundSize: 'auto' }} />

      <div className="relative z-10 text-center px-4 max-w-4xl">
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3, duration: 1 }} className="flex items-center justify-center gap-3 mb-4 md:mb-6">
          <motion.div initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ delay: 0.4, duration: 0.8 }} className="w-12 md:w-16 h-px origin-right" style={{ background: `linear-gradient(to right, transparent, ${i.primary})` }} />
          <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.5, type: 'spring', stiffness: 200 }} style={{ color: i.primary }}>✦</motion.span>
          <motion.div initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ delay: 0.4, duration: 0.8 }} className="w-12 md:w-16 h-px origin-left" style={{ background: `linear-gradient(to left, transparent, ${i.primary})` }} />
        </motion.div>

        <motion.p initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5, duration: 0.8 }} className="text-[10px] md:text-xs tracking-[0.35em] uppercase mb-3 md:mb-4" style={{ color: i.textMuted }}>
          Nous nous marions
        </motion.p>

        <motion.h1 initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.7, duration: 1, ease: EASING }} className="text-3xl md:text-7xl font-bold mb-1 md:mb-2" style={{ fontFamily: `'${i.fontDisplay}'`, fontWeight: i.displayWeight as any, color: i.primary, textShadow: `0 0 40px ${i.primary}40` }}>
          {d.groomName}
        </motion.h1>
        <motion.div initial={{ opacity: 0, scale: 0 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.9, type: 'spring', stiffness: 200 }} className="my-1">
          <span className="text-xl md:text-3xl font-light" style={{ color: i.primary, opacity: 0.5 }}>&</span>
        </motion.div>
        <motion.h1 initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 1, duration: 1, ease: EASING }} className="text-3xl md:text-7xl font-bold mb-4 md:mb-6" style={{ fontFamily: `'${i.fontDisplay}'`, fontWeight: i.displayWeight as any, color: i.primary, textShadow: `0 0 40px ${i.primary}40` }}>
          {d.brideName}
        </motion.h1>

        <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.3, duration: 0.8 }} className="text-xs md:text-base tracking-wider" style={{ color: i.text }}>
          {d.weddingDate}
        </motion.div>
        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.5, duration: 0.8 }} className="text-[10px] md:text-sm italic mt-1" style={{ color: i.primary, opacity: 0.8 }}>
          {d.venue} · {d.venueCity}
        </motion.p>
      </div>
    </section>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// HERO VARIANT 2: SPLIT OVERLAY — classic themes (light backgrounds)
// (White Romance, Elegant Beige)
// ══════════════════════════════════════════════════════════════════════════════
export function HeroSplit({ theme, variant }: VariantProps) {
  const d = theme.demo
  const i = theme.identity
  const h = variant === 'compact' ? 'h-full' : 'min-h-screen'

  return (
    <section className={`relative ${h} flex items-center overflow-hidden`} style={{ background: i.ambiance }}>
      <div className="absolute inset-0 z-[1] pointer-events-none" style={{ backgroundImage: i.pattern, backgroundSize: 'auto' }} />

      <div className="relative z-10 w-full grid md:grid-cols-2 gap-6 items-center px-6 md:px-12 py-8">
        <motion.div initial={{ opacity: 0, x: -30 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 1, ease: EASING }} className="text-center md:text-left">
          <div className="flex items-center gap-3 mb-3 md:justify-start justify-center">
            <div className="w-10 h-px" style={{ background: i.primary }} />
            <span style={{ color: i.primary }}>❦</span>
          </div>
          <p className="text-[9px] md:text-[10px] tracking-[0.3em] uppercase mb-2" style={{ color: i.textMuted, fontFamily: `'${i.fontBody}'` }}>
            {d.weddingDate}
          </p>
          <h1 className="text-3xl md:text-6xl font-bold mb-1" style={{ fontFamily: `'${i.fontDisplay}'`, fontWeight: i.displayWeight as any, color: i.text }}>
            {d.groomName}
          </h1>
          <p className="text-xl my-1" style={{ color: i.primary, fontFamily: `'${i.fontDisplay}'` }}>&</p>
          <h1 className="text-3xl md:text-6xl font-bold mb-3" style={{ fontFamily: `'${i.fontDisplay}'`, fontWeight: i.displayWeight as any, color: i.text }}>
            {d.brideName}
          </h1>
          <p className="text-xs italic" style={{ color: i.primary, opacity: 0.8, fontFamily: `'${i.fontBody}'` }}>
            {d.venue}
          </p>
          <p className="text-[10px] mt-1" style={{ color: i.textMuted, fontFamily: `'${i.fontBody}'` }}>
            {d.venueCity}
          </p>
        </motion.div>

        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.3, duration: 1, ease: EASING }} className="hidden md:flex justify-center">
          <div className="relative aspect-[3/4] w-full max-w-sm rounded-2xl overflow-hidden shadow-2xl" style={{ border: `2px solid ${i.primary}40`, background: i.accent }}>
            <div className="absolute inset-0 flex items-center justify-center" style={{ backgroundImage: i.pattern }}>
              <div className="text-center p-8">
                <div className="text-6xl font-bold mb-4" style={{ fontFamily: `'${i.fontDisplay}'`, color: i.primary, opacity: 0.4 }}>
                  {d.groomInitial}&{d.brideInitial}
                </div>
                <div className="w-16 h-px mx-auto mb-4" style={{ background: i.primary }} />
                <p className="text-xs tracking-[0.2em] uppercase" style={{ color: i.text, fontFamily: `'${i.fontBody}'` }}>
                  {d.weddingDateShort}
                </p>
                <p className="text-[10px] mt-2 italic" style={{ color: i.textMuted, fontFamily: `'${i.fontBody}'` }}>
                  {d.hashtag}
                </p>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// HERO VARIANT 3: MINIMAL CENTER — minimal themes (light/airy)
// (Pure White, Nordic)
// ══════════════════════════════════════════════════════════════════════════════
export function HeroMinimal({ theme, variant }: VariantProps) {
  const d = theme.demo
  const i = theme.identity
  const h = variant === 'compact' ? 'h-full' : 'min-h-screen'

  return (
    <section className={`relative ${h} flex items-center justify-center overflow-hidden`} style={{ background: i.ambiance }}>
      <div className="absolute inset-0 z-[1] pointer-events-none" style={{ backgroundImage: i.pattern, backgroundSize: 'auto' }} />

      <div className="relative z-10 text-center px-4 max-w-2xl">
        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 1 }} className="text-[10px] md:text-[10px] tracking-[0.4em] uppercase mb-6 md:mb-8" style={{ color: i.textMuted, fontFamily: `'${i.fontBody}'` }}>
          {d.weddingDate}
        </motion.p>

        <motion.h1 initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3, duration: 1 }} className="text-3xl md:text-6xl font-light mb-1" style={{ fontFamily: `'${i.fontDisplay}'`, fontWeight: i.displayWeight as any, color: i.text }}>
          {d.groomName}
        </motion.h1>
        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5, duration: 0.8 }} className="text-xs tracking-[0.3em] uppercase my-2" style={{ color: i.primary, fontFamily: `'${i.fontBody}'` }}>
          &
        </motion.p>
        <motion.h1 initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6, duration: 1 }} className="text-3xl md:text-6xl font-light mb-6 md:mb-8" style={{ fontFamily: `'${i.fontDisplay}'`, fontWeight: i.displayWeight as any, color: i.text }}>
          {d.brideName}
        </motion.h1>

        <motion.div initial={{ opacity: 0, scaleX: 0 }} animate={{ opacity: 1, scaleX: 1 }} transition={{ delay: 0.9, duration: 0.8 }} className="w-20 md:w-24 h-px mx-auto mb-4 md:mb-6" style={{ background: i.primary }} />

        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.1, duration: 0.8 }} className="text-xs md:text-sm" style={{ color: i.textMuted, fontFamily: `'${i.fontBody}'` }}>
          {d.venue} · {d.venueCity}
        </motion.p>
      </div>
    </section>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// HERO VARIANT 4: DESTINATION FULL — destination themes (vibrant)
// (Beach, Garden, Sunset)
// ══════════════════════════════════════════════════════════════════════════════
export function HeroDestination({ theme, variant }: VariantProps) {
  const d = theme.demo
  const i = theme.identity
  const h = variant === 'compact' ? 'h-full' : 'min-h-screen'

  return (
    <section className={`relative ${h} flex items-end justify-center overflow-hidden`} style={{ background: i.ambiance }}>
      <div className="absolute inset-0 z-[1] pointer-events-none" style={{ backgroundImage: i.pattern, backgroundSize: 'auto' }} />

      {/* Sun/glow decoration with theme primary */}
      <motion.div initial={{ opacity: 0, scale: 0.3 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.4, duration: 1.5 }} className="absolute top-1/4 left-1/2 -translate-x-1/2 w-32 h-32 md:w-48 md:h-48 rounded-full blur-2xl" style={{ background: `radial-gradient(circle, ${i.primary}60, transparent 70%)` }} />

      <div className="relative z-10 w-full text-center px-4 pb-8 md:pb-20">
        <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.7, duration: 1 }}>
          <p className="text-[10px] md:text-xs tracking-[0.3em] uppercase mb-2" style={{ color: i.text, opacity: 0.7, fontFamily: `'${i.fontBody}'` }}>
            Bienvenue à
          </p>
          <h1 className="text-3xl md:text-7xl font-bold mb-2" style={{ fontFamily: `'${i.fontDisplay}'`, fontWeight: i.displayWeight as any, color: i.primary, textShadow: `0 0 30px ${i.primary}40` }}>
            {d.groomName} & {d.brideName}
          </h1>
          <div className="flex items-center justify-center gap-3 my-3">
            <div className="w-8 md:w-10 h-px" style={{ background: i.primary }} />
            <span style={{ color: i.primary }}>~</span>
            <div className="w-8 md:w-10 h-px" style={{ background: i.primary }} />
          </div>
          <p className="text-xs md:text-base" style={{ color: i.text, fontFamily: `'${i.fontBody}'` }}>
            {d.weddingDate}
          </p>
          <p className="text-[10px] md:text-sm italic mt-1" style={{ color: i.primary, fontFamily: `'${i.fontDisplay}'` }}>
            {d.venue} · {d.venueCity}
          </p>
        </motion.div>
      </div>
    </section>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// HERO VARIANT 5: AFRICAN REGAL — African themes (vibrant, geometric)
// (Kente, Congo Prestige)
// ══════════════════════════════════════════════════════════════════════════════
export function HeroAfrican({ theme, variant }: VariantProps) {
  const d = theme.demo
  const i = theme.identity
  const h = variant === 'compact' ? 'h-full' : 'min-h-screen'

  return (
    <section className={`relative ${h} flex items-center justify-center overflow-hidden`} style={{ background: i.ambiance }}>
      {/* Kente-inspired geometric bands top/bottom */}
      <div className="absolute top-0 left-0 right-0 h-2 md:h-3 z-[2] flex">
        {[i.primary, i.accent, i.primary, i.accent].map((c, idx) => (
          <div key={idx} className="flex-1" style={{ background: c, opacity: 0.7 }} />
        ))}
      </div>
      <div className="absolute bottom-0 left-0 right-0 h-2 md:h-3 z-[2] flex">
        {[i.accent, i.primary, i.accent, i.primary].map((c, idx) => (
          <div key={idx} className="flex-1" style={{ background: c, opacity: 0.7 }} />
        ))}
      </div>
      <div className="absolute inset-0 z-[1] pointer-events-none" style={{ backgroundImage: i.pattern, backgroundSize: 'auto' }} />

      {/* Glow */}
      <motion.div initial={{ opacity: 0, scale: 0.3 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.3, duration: 1.5 }} className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48 md:w-80 md:h-80 rounded-full blur-3xl" style={{ background: `radial-gradient(circle, ${i.primary}40, transparent 70%)` }} />

      <div className="relative z-10 text-center px-4 max-w-3xl">
        <motion.div initial={{ opacity: 0, scale: 0 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.5, type: 'spring', stiffness: 150 }} className="inline-block mb-4 md:mb-6">
          <div className="flex items-center gap-2 px-3 md:px-4 py-1.5 md:py-2 rounded-full" style={{ border: `1px solid ${i.primary}60`, background: `${i.primary}20` }}>
            <span style={{ color: i.primary }}>◆</span>
            <span className="text-[8px] md:text-[10px] tracking-[0.25em] uppercase" style={{ color: i.primary, fontFamily: `'${i.fontBody}'` }}>
              Célébration Royale
            </span>
            <span style={{ color: i.primary }}>◆</span>
          </div>
        </motion.div>

        <motion.h1 initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.7, duration: 1 }} className="text-3xl md:text-8xl font-bold mb-2" style={{ fontFamily: `'${i.fontDisplay}'`, fontWeight: i.displayWeight as any, color: i.primary, textShadow: `0 0 40px ${i.primary}50` }}>
          {d.groomName}
        </motion.h1>
        <motion.div initial={{ opacity: 0, scale: 0 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.9, type: 'spring', stiffness: 200 }} className="my-1 md:my-2">
          <div className="inline-flex items-center justify-center w-10 h-10 md:w-14 md:h-14 rounded-full" style={{ background: i.primary }}>
            <span className="text-lg md:text-2xl" style={{ color: i.surface }}>&</span>
          </div>
        </motion.div>
        <motion.h1 initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1, duration: 1 }} className="text-3xl md:text-8xl font-bold mb-4 md:mb-6" style={{ fontFamily: `'${i.fontDisplay}'`, fontWeight: i.displayWeight as any, color: i.primary, textShadow: `0 0 40px ${i.primary}50` }}>
          {d.brideName}
        </motion.h1>

        <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.3, duration: 0.8 }}>
          <div className="flex items-center justify-center gap-3 mb-2">
            <div className="w-10 md:w-12 h-px" style={{ background: i.primary }} />
            <span style={{ color: i.primary }}>✦</span>
            <div className="w-10 md:w-12 h-px" style={{ background: i.primary }} />
          </div>
          <p className="text-xs md:text-base tracking-wider" style={{ color: i.text, fontFamily: `'${i.fontBody}'` }}>
            {d.weddingDate}
          </p>
          <p className="text-[10px] md:text-sm italic mt-1" style={{ color: i.primary, fontFamily: `'${i.fontDisplay}'` }}>
            {d.venue} · {d.venueCity}
          </p>
        </motion.div>
      </div>
    </section>
  )
}
