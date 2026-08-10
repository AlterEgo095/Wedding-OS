'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import Image from 'next/image'
import { motion, useScroll, useTransform, AnimatePresence } from 'framer-motion'
import type { Easing } from 'framer-motion'
import { Search, MailOpen, ChevronDown, Sparkles } from 'lucide-react'
import { useVisualEffects } from '@/lib/visual-effects-store'
import { SETTING_KEYS } from '@/lib/constants'
import DynamicLightSweep from '@/components/effects/DynamicLightSweep'
import { useMotionTier } from '@/lib/motion/useMotionTier'

interface TimeLeft {
  days: number
  hours: number
  minutes: number
  seconds: number
}

function CountdownUnit({ value, label }: { value: number; label: string }) {
  const prevValueRef = useRef(value)
  const { config: motionCfg, reduced: prefersReducedMotion, tier } = useMotionTier()
  const isStatic = prefersReducedMotion || tier === 'none'

  useEffect(() => {
    prevValueRef.current = value
  }, [value])

  return (
    <div className="flex flex-col items-center">
      <div className="relative w-20 h-20 sm:w-28 sm:h-28 md:w-36 md:h-36 flex items-center justify-center countdown-halo">
        {/* Outermost glow ring */}
        <div className="absolute inset-0 rounded-full border-2 border-gold/10 dark:border-gold-light/10 animate-pulse-gold" />
        {/* Middle ornamental ring */}
        <div className="absolute inset-1.5 rounded-full border border-gold/20 dark:border-gold-light/15" />
        {/* Inner ornamental ring */}
        <div className="absolute inset-3 rounded-full border border-gold/30 dark:border-gold-light/25" />
        {/* Inner glass card with glow */}
        <div className="absolute inset-4 rounded-full bg-black/30 dark:bg-black/40 backdrop-blur-md flex items-center justify-center shadow-[0_0_30px_oklch(0.68_0.12_85/20%)]">
          {isStatic ? (
            <span
              className="font-serif text-3xl sm:text-5xl md:text-7xl font-black text-transparent bg-clip-text bg-gradient-to-b from-white via-gold-light to-gold drop-shadow-[0_0_20px_oklch(0.68_0.12_85/50%)]"
              style={{ WebkitTextStroke: '0.5px oklch(0.82 0.08 85 / 30%)' }}
            >
              {String(value).padStart(2, '0')}
            </span>
          ) : (
            <AnimatePresence mode="wait">
              <motion.span
                key={value}
                initial={{ opacity: 0, y: -10, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10, scale: 0.9 }}
                transition={{ duration: motionCfg.duration, ease: motionCfg.ease as Easing }}
                className="font-serif text-3xl sm:text-5xl md:text-7xl font-black text-transparent bg-clip-text bg-gradient-to-b from-white via-gold-light to-gold drop-shadow-[0_0_20px_oklch(0.68_0.12_85/50%)]"
                style={{ WebkitTextStroke: '0.5px oklch(0.82 0.08 85 / 30%)' }}
              >
                {String(value).padStart(2, '0')}
              </motion.span>
            </AnimatePresence>
          )}
        </div>
      </div>
      <span className="mt-3 text-xs sm:text-sm md:text-base font-bold tracking-[0.25em] uppercase text-white/80 drop-shadow-[0_0_10px_oklch(0.68_0.12_85/30%)]">
        {label}
      </span>
    </div>
  )
}

export default function HeroSection() {
  const [settings, setSettings] = useState<Record<string, string>>({})
  const [timeLeft, setTimeLeft] = useState<TimeLeft>({ days: 0, hours: 0, minutes: 0, seconds: 0 })
  const [currentBg, setCurrentBg] = useState(0)
  // Background photos for crossfade — settings-driven (couple_photo_1 +
  // couple_photo_2). Empty by default so an unconfigured wedding renders a
  // CSS gradient background instead of the default wedding's photos.
  // (P0-QW3 fix: previously a hardcoded ['/couple-hero.jpeg', …] leaked the
  // default wedding's photos into every tenant's hero.)
  const [bgPhotos, setBgPhotos] = useState<string[]>([])
  const { scrollY } = useScroll()
  const y = useTransform(scrollY, [0, 800], [0, 200])
  const bgScale = useTransform(scrollY, [0, 800], [1, 1.15])
  const contentOpacity = useTransform(scrollY, [0, 500], [1, 0])
  const contentY = useTransform(scrollY, [0, 500], [0, 80])
  const { config: motionCfg, reduced: prefersReducedMotion, tier } = useMotionTier()
  // Static path: render plain divs (no motion). Layout/className/children are
  // identical — only the animation layer is removed. Parallax transforms are
  // replaced with static identity values (y=0, scale=1, opacity=1).
  const isStatic = prefersReducedMotion || tier === 'none'

  const groomName = settings[SETTING_KEYS.GROOM_NAME] || ''
  const brideName = settings[SETTING_KEYS.BRIDE_NAME] || ''
  // P0-QW3: empty fallback — previously 'Vendredi 26 Juin 2026' leaked the
  // default wedding's date into every tenant. The date block below renders
  // conditionally so we never emit an empty <p> when no subtitle is set.
  const dateDisplay = settings[SETTING_KEYS.SITE_SUBTITLE] || ''
  // Couple portrait photos — settings-driven (couple_photo_1 = groom,
  // couple_photo_2 = bride). Empty fallback so the portrait frames render
  // a gradient placeholder instead of the default wedding's photos.
  // (P0-QW3 fix: previously '/couple-hero.jpeg' + '/couple-moment.jpeg' were
  // hardcoded.)
  const groomPhotoPath = settings[SETTING_KEYS.COUPLE_PHOTO_1] || ''
  const bridePhotoPath = settings[SETTING_KEYS.COUPLE_PHOTO_2] || ''

  // Read wedding_date / wedding_time into local consts so the useMemo deps
  // array stays a list of simple expressions (react-hooks/use-memo rule).
  // The SETTING_KEYS lookup is computed once per render; the memo recomputes
  // only when the underlying string values change.
  const weddingDateSetting = settings[SETTING_KEYS.WEDDING_DATE]
  const weddingTimeSetting = settings[SETTING_KEYS.WEDDING_TIME]
  // P0-QW3: when no wedding_date is configured, return null so the countdown
  // doesn't tick down to a fake default date (was '2026-06-26T21:30:00').
  // The countdown UI renders "Date à définir" when this is null.
  const weddingDateStr = useMemo(
    () => weddingDateSetting ? `${weddingDateSetting}T${weddingTimeSetting || '21:30:00'}` : null,
    [weddingDateSetting, weddingTimeSetting]
  )

  useEffect(() => {
    fetch('/api/settings')
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data?.settings) {
          setSettings(data.settings)
          // Build the bgPhotos array from the wedding's own couple photos.
          // Only settings-driven photos are used — no hardcoded defaults.
          const s = data.settings
          const photos: string[] = []
          if (s[SETTING_KEYS.COUPLE_PHOTO_1]) photos.push(s[SETTING_KEYS.COUPLE_PHOTO_1])
          if (s[SETTING_KEYS.COUPLE_PHOTO_2]) photos.push(s[SETTING_KEYS.COUPLE_PHOTO_2])
          setBgPhotos(photos)
        }
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    // P0-QW3: don't start the countdown timer when no wedding date is set.
    // The weddingDateStr is null in that case (see useMemo above).
    if (!weddingDateStr) return
    const weddingDate = new Date(weddingDateStr)
    const calculateTimeLeft = (): TimeLeft => {
      const now = new Date()
      const difference = weddingDate.getTime() - now.getTime()
      if (difference <= 0) return { days: 0, hours: 0, minutes: 0, seconds: 0 }
      return {
        days: Math.floor(difference / (1000 * 60 * 60 * 24)),
        hours: Math.floor((difference / (1000 * 60 * 60)) % 24),
        minutes: Math.floor((difference / 1000 / 60) % 60),
        seconds: Math.floor((difference / 1000) % 60),
      }
    }
    const tick = () => setTimeLeft(calculateTimeLeft())
    tick()
    const timer = setInterval(tick, 1000)
    return () => clearInterval(timer)
  }, [weddingDateStr])

  // Auto-rotate background photos — only runs when there are photos to rotate.
  // (P0-QW3: previously always ran with the hardcoded array; now no-ops when
  // the wedding hasn't configured any couple photos.)
  useEffect(() => {
    if (bgPhotos.length <= 1) return // nothing to rotate (0 = no photos, 1 = single photo)
    const interval = setInterval(() => {
      setCurrentBg(prev => (prev + 1) % bgPhotos.length)
    }, 8000)
    return () => clearInterval(interval)
  }, [bgPhotos.length])

  return (
    <section
      id="accueil"
      className="relative min-h-screen flex items-center justify-center overflow-hidden"
    >
      {/* ═══ Parallax Background with Photo Crossfade ═══ */}
      <motion.div
        style={isStatic ? undefined : { y, scale: bgScale }}
        className="absolute inset-0 z-0 -top-20 -bottom-20"
      >
        {/* Crossfading couple photos — only when the wedding has configured
            photos. P0-QW3: previously hardcoded ['/couple-hero.jpeg', …]
            leaked the default wedding's photos into every tenant's hero.
            When bgPhotos is empty, fall back to a CSS gradient background. */}
        {bgPhotos.length > 0 ? (
          isStatic ? (
            <div
              className="absolute inset-0 bg-cover bg-center bg-no-repeat"
              style={{
                backgroundImage: `url('${bgPhotos[currentBg]}')`,
              }}
            />
          ) : (
            <AnimatePresence mode="wait">
              <motion.div
                key={currentBg}
                initial={{ opacity: 0, scale: 1.05 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 2, ease: 'easeInOut' }}
                className="absolute inset-0 bg-cover bg-center bg-no-repeat"
                style={{
                  backgroundImage: `url('${bgPhotos[currentBg]}')`,
                }}
              />
            </AnimatePresence>
          )
        ) : (
          /* Gradient placeholder — no couple photo configured */
          <div className="absolute inset-0 bg-gradient-to-br from-black via-[#1a1420] to-[#0f0d18]" />
        )}
        {/* Cinematic dark overlay */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/65 via-black/55 to-black/80" />
        {/* Side vignette for depth */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_30%,rgba(0,0,0,0.6)_100%)]" />
        {/* Warm gold tint overlay */}
        <div className="absolute inset-0 bg-gradient-to-br from-gold-dark/10 via-transparent to-rose-gold/10" />
      </motion.div>

      {/* ═══ Ambient Gold Particles ═══ */}
      <div className="absolute inset-0 z-[1] pointer-events-none overflow-hidden">
        {[...Array(8)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute rounded-full bg-gold/20 dark:bg-gold-light/10"
            style={{
              left: `${10 + i * 12}%`,
              top: `${15 + (i % 4) * 22}%`,
              width: `${1 + (i % 3)}px`,
              height: `${1 + (i % 3)}px`,
              ...(isStatic ? { opacity: 0.25 } : {}),
            }}
            animate={isStatic ? undefined : {
              y: [-30, 30, -30],
              opacity: [0.1, 0.4, 0.1],
              scale: [1, 2, 1],
            }}
            transition={isStatic ? undefined : {
              duration: 6 + i * 0.7,
              repeat: Infinity,
              ease: 'easeInOut',
              delay: i * 0.4,
            }}
          />
        ))}
      </div>

      {/* ═══ Dynamic Light Sweep ═══ */}
      <DynamicLightSweep duration={15} opacity={0.05} />

      {/* ═══ Content ═══ */}
      <motion.div
        style={isStatic ? undefined : { opacity: contentOpacity, y: contentY }}
        className="relative z-10 text-center px-4 max-w-5xl mx-auto py-20"
      >
        {/* Ornamental top flourish */}
        <motion.div
          initial={isStatic ? false : { opacity: 0, y: 20 }}
          animate={isStatic ? undefined : { opacity: 1, y: 0 }}
          transition={isStatic ? { duration: 0 } : { duration: motionCfg.duration * 1.2, ease: motionCfg.ease as Easing, delay: 0.2 }}
          className="mb-8"
        >
          <div className="flex items-center justify-center gap-3">
            <div className="w-16 sm:w-28 h-px bg-gradient-to-r from-transparent via-gold/60 to-transparent" />
            <span className="flourish text-xl sm:text-2xl">✦</span>
            <div className="w-16 sm:w-28 h-px bg-gradient-to-r from-transparent via-gold/60 to-transparent" />
          </div>
        </motion.div>

        {/* Pre-title */}
        <motion.p
          initial={isStatic ? false : { opacity: 0, y: 20 }}
          animate={isStatic ? undefined : { opacity: 1, y: 0 }}
          transition={isStatic ? { duration: 0 } : { duration: motionCfg.duration, ease: motionCfg.ease as Easing, delay: 0.5 }}
          className="font-display text-lg sm:text-xl md:text-2xl tracking-[0.35em] uppercase text-white/70 mb-8 font-semibold"
        >
          Nous nous marions
        </motion.p>

        {/* ═══ Premium Couple Photo Showcase ═══ */}
        <motion.div
          initial={isStatic ? false : { opacity: 0, scale: 0.85 }}
          animate={isStatic ? undefined : { opacity: 1, scale: 1 }}
          transition={isStatic ? { duration: 0 } : { duration: motionCfg.duration * 1.4, ease: motionCfg.ease as Easing, delay: 0.7 }}
          className="relative flex items-center justify-center mb-10 sm:mb-14"
        >
          {/* Groom Photo - Elegant Rounded Frame */}
          <motion.div
            initial={isStatic ? false : { opacity: 0, x: -30 }}
            animate={isStatic ? undefined : { opacity: 1, x: 0 }}
            transition={isStatic ? { duration: 0 } : { duration: motionCfg.duration, ease: motionCfg.ease as Easing, delay: 0.9 }}
            className="relative z-[2]"
          >
            {/* Outer rotating ring */}
            <div className="absolute -inset-4 rounded-full animate-spin-slow"
              style={{
                background: 'conic-gradient(from 0deg, transparent 0%, oklch(0.68 0.12 85 / 25%) 8%, transparent 16%, transparent 48%, oklch(0.68 0.12 85 / 25%) 56%, transparent 64%)',
              }}
            />
            {/* Gold gradient border */}
            <div className="absolute -inset-2 rounded-full bg-gradient-to-br from-gold via-gold-light to-rose-gold p-[2.5px]">
              <div className="w-full h-full rounded-full bg-black/30" />
            </div>
            {/* Photo — settings-driven (couple_photo_1). P0-QW3: previously
                hardcoded '/couple-hero.jpeg' leaked the default wedding's
                groom photo into every tenant. Gradient placeholder when no
                couple_photo_1 is configured. */}
            <div className="relative w-32 h-32 sm:w-40 sm:h-40 md:w-48 md:h-48 rounded-full overflow-hidden border-[3px] border-gold/30 shadow-[0_0_40px_rgba(0,0,0,0.6),0_0_20px_oklch(0.68_0.12_85/20%)]">
              {groomPhotoPath ? (
                <Image
                  src={groomPhotoPath}
                  alt={groomName}
                  fill
                  className="object-cover object-top"
                  priority
                  sizes="(max-width: 640px) 128px, (max-width: 768px) 160px, 192px"
                />
              ) : (
                <div className="absolute inset-0 bg-gradient-to-br from-gold/25 via-gold-dark/15 to-rose-gold/25 flex items-center justify-center">
                  <span className="font-serif text-3xl sm:text-4xl md:text-5xl text-gold/40 font-bold">
                    {groomName ? groomName.charAt(0).toUpperCase() : '♡'}
                  </span>
                </div>
              )}
            </div>
            {/* Name */}
            <motion.p
              initial={isStatic ? false : { opacity: 0, y: 10 }}
              animate={isStatic ? undefined : { opacity: 1, y: 0 }}
              transition={isStatic ? { duration: 0 } : { duration: motionCfg.duration, ease: motionCfg.ease as Easing, delay: 1.6 }}
              className="mt-5 font-serif text-base sm:text-lg md:text-xl tracking-[0.12em] text-white/90 uppercase font-bold"
            >
              {groomName}
            </motion.p>
          </motion.div>

          {/* Heart / Ampersand */}
          <motion.div
            initial={isStatic ? false : { opacity: 0, scale: 0 }}
            animate={isStatic ? undefined : { opacity: 1, scale: 1 }}
            transition={isStatic ? { duration: 0 } : { duration: motionCfg.duration, ease: motionCfg.ease as Easing, delay: 1.3 }}
            className="relative z-[3] mx-[-18px] sm:mx-[-22px] md:mx-[-28px] flex flex-col items-center"
          >
            <div className="relative w-14 h-14 sm:w-16 sm:h-16 md:w-20 md:h-20 rounded-full bg-gradient-to-br from-gold via-gold-light to-rose-gold flex items-center justify-center shadow-[0_0_30px_oklch(0.68_0.12_85/40%)] animate-pulse-gold">
              <span className="font-serif text-2xl sm:text-3xl md:text-4xl font-bold text-background dark:text-background">
                &
              </span>
            </div>
            <Sparkles className="absolute -top-2 -right-2 size-4 text-gold-light/60 animate-pulse" />
            <Sparkles className="absolute -bottom-1 -left-2 size-3 text-rose-gold/50 animate-pulse" style={{ animationDelay: '0.5s' }} />
          </motion.div>

          {/* Bride Photo - Elegant Rounded Frame */}
          <motion.div
            initial={isStatic ? false : { opacity: 0, x: 30 }}
            animate={isStatic ? undefined : { opacity: 1, x: 0 }}
            transition={isStatic ? { duration: 0 } : { duration: motionCfg.duration, ease: motionCfg.ease as Easing, delay: 0.9 }}
            className="relative z-[2]"
          >
            {/* Outer rotating ring */}
            <div className="absolute -inset-4 rounded-full animate-spin-slow"
              style={{
                background: 'conic-gradient(from 180deg, transparent 0%, oklch(0.72 0.08 30 / 25%) 8%, transparent 16%, transparent 48%, oklch(0.72 0.08 30 / 25%) 56%, transparent 64%)',
              }}
            />
            {/* Rose-gold gradient border */}
            <div className="absolute -inset-2 rounded-full bg-gradient-to-br from-rose-gold via-gold-light to-gold p-[2.5px]">
              <div className="w-full h-full rounded-full bg-black/30" />
            </div>
            {/* Photo — settings-driven (couple_photo_2). P0-QW3: previously
                hardcoded '/couple-moment.jpeg' leaked the default wedding's
                bride photo into every tenant. Gradient placeholder when no
                couple_photo_2 is configured. */}
            <div className="relative w-32 h-32 sm:w-40 sm:h-40 md:w-48 md:h-48 rounded-full overflow-hidden border-[3px] border-rose-gold/30 shadow-[0_0_40px_rgba(0,0,0,0.6),0_0_20px_oklch(0.72_0.08_30/20%)]">
              {bridePhotoPath ? (
                <Image
                  src={bridePhotoPath}
                  alt={brideName}
                  fill
                  className="object-cover object-top"
                  priority
                  sizes="(max-width: 640px) 128px, (max-width: 768px) 160px, 192px"
                />
              ) : (
                <div className="absolute inset-0 bg-gradient-to-br from-rose-gold/25 via-gold/15 to-gold-dark/25 flex items-center justify-center">
                  <span className="font-serif text-3xl sm:text-4xl md:text-5xl text-rose-gold/40 font-bold">
                    {brideName ? brideName.charAt(0).toUpperCase() : '♡'}
                  </span>
                </div>
              )}
            </div>
            {/* Name */}
            <motion.p
              initial={isStatic ? false : { opacity: 0, y: 10 }}
              animate={isStatic ? undefined : { opacity: 1, y: 0 }}
              transition={isStatic ? { duration: 0 } : { duration: motionCfg.duration, ease: motionCfg.ease as Easing, delay: 1.6 }}
              className="mt-5 font-serif text-base sm:text-lg md:text-xl tracking-[0.12em] text-white/90 uppercase font-bold"
            >
              {brideName}
            </motion.p>
          </motion.div>
        </motion.div>

        {/* ═══ Names - Large gold gradient ═══ */}
        <motion.h1
          initial={isStatic ? false : { opacity: 0, y: 30 }}
          animate={isStatic ? undefined : { opacity: 1, y: 0 }}
          transition={isStatic ? { duration: 0 } : { duration: motionCfg.duration * 1.4, ease: motionCfg.ease as Easing, delay: 1.2 }}
          className="font-serif text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-bold mb-3 text-shadow-elegant"
        >
          <span className="gold-gradient">{groomName}</span>
          <span className="block my-1 font-display text-2xl sm:text-3xl md:text-4xl font-light text-gold/50 dark:text-gold-light/40 tracking-[0.3em]">
            &
          </span>
          <span className="gold-gradient">{brideName}</span>
        </motion.h1>

        {/* ═══ Date ═══ */}
        {/* P0-QW3: conditional render — when dateDisplay is empty (no
            site_subtitle setting), the entire date block is hidden so we
            never emit the default wedding's "Vendredi 26 Juin 2026" into
            another tenant's hero. The outer motion.div is always rendered
            to preserve the mt-6 mb-12 spacing for the countdown below. */}
        <motion.div
          initial={isStatic ? false : { opacity: 0, y: 20 }}
          animate={isStatic ? undefined : { opacity: 1, y: 0 }}
          transition={isStatic ? { duration: 0 } : { duration: motionCfg.duration, ease: motionCfg.ease as Easing, delay: 1.6 }}
          className="mt-6 mb-12"
        >
          {dateDisplay && (
            <>
              <div className="flex items-center justify-center gap-3 mb-4">
                <div className="w-12 sm:w-24 h-px bg-gradient-to-r from-transparent to-gold/60" />
                <span className="flourish text-xs sm:text-sm">❧</span>
                <div className="w-12 sm:w-24 h-px bg-gradient-to-l from-transparent to-gold/60" />
              </div>
              <p className="font-display text-xl sm:text-2xl md:text-3xl tracking-[0.2em] text-white/85 font-bold">
                {dateDisplay}
              </p>
              <div className="flex items-center justify-center gap-3 mt-4">
                <div className="w-12 sm:w-24 h-px bg-gradient-to-r from-transparent to-gold/60" />
                <span className="flourish text-xs sm:text-sm">❧</span>
                <div className="w-12 sm:w-24 h-px bg-gradient-to-l from-transparent to-gold/60" />
              </div>
            </>
          )}
        </motion.div>

        {/* ═══ Countdown Timer ═══ */}
        {/* P0-QW3: when no wedding_date is configured (weddingDateStr is null),
            render "Date à définir" instead of counting down to a fake date.
            Previously the countdown silently ticked against '2026-06-26T21:30:00'
            (the default wedding's date), leaking that date into every tenant. */}
        <motion.div
          initial={isStatic ? false : { opacity: 0, y: 30 }}
          animate={isStatic ? undefined : { opacity: 1, y: 0 }}
          transition={isStatic ? { duration: 0 } : { duration: motionCfg.duration * 1.2, ease: motionCfg.ease as Easing, delay: 1.9 }}
        >
          {weddingDateStr ? (
            <>
              <motion.p
                initial={isStatic ? false : { opacity: 0 }}
                animate={isStatic ? undefined : { opacity: 1 }}
                transition={isStatic ? { duration: 0 } : { duration: motionCfg.duration, ease: motionCfg.ease as Easing, delay: 2.2 }}
                className="font-display text-sm sm:text-base md:text-lg tracking-[0.3em] uppercase text-white/50 mb-6 font-semibold"
              >
                Compte à rebours
              </motion.p>

              <div className="flex items-center justify-center gap-1 sm:gap-2 md:gap-4">
                <CountdownUnit value={timeLeft.days} label="Jours" />
                <span className="text-gold/40 dark:text-gold-light/30 text-2xl sm:text-3xl md:text-5xl font-light mt-[-24px] sm:mt-[-28px] md:mt-[-32px] animate-pulse">✦</span>
                <CountdownUnit value={timeLeft.hours} label="Heures" />
                <span className="text-gold/40 dark:text-gold-light/30 text-2xl sm:text-3xl md:text-5xl font-light mt-[-24px] sm:mt-[-28px] md:mt-[-32px] animate-pulse" style={{ animationDelay: '0.5s' }}>✦</span>
                <CountdownUnit value={timeLeft.minutes} label="Minutes" />
                <span className="text-gold/40 dark:text-gold-light/30 text-2xl sm:text-3xl md:text-5xl font-light mt-[-24px] sm:mt-[-28px] md:mt-[-32px] animate-pulse" style={{ animationDelay: '1s' }}>✦</span>
                <CountdownUnit value={timeLeft.seconds} label="Secondes" />
              </div>
            </>
          ) : (
            <motion.p
              initial={isStatic ? false : { opacity: 0 }}
              animate={isStatic ? undefined : { opacity: 1 }}
              transition={isStatic ? { duration: 0 } : { duration: motionCfg.duration, ease: motionCfg.ease as Easing, delay: 2.2 }}
              className="font-display text-sm sm:text-base md:text-lg tracking-[0.3em] uppercase text-white/50 mb-6 font-semibold"
            >
              Date à définir
            </motion.p>
          )}
        </motion.div>

        {/* ═══ Action Buttons ═══ */}
        <motion.div
          initial={isStatic ? false : { opacity: 0, y: 20 }}
          animate={isStatic ? undefined : { opacity: 1, y: 0 }}
          transition={isStatic ? { duration: 0 } : { duration: motionCfg.duration, ease: motionCfg.ease as Easing, delay: 2.2 }}
          className="flex flex-col sm:flex-row items-center justify-center gap-4 mt-12"
        >
          <a
            href="#recherche"
            onClick={(e) => {
              e.preventDefault()
              document.getElementById('recherche')?.scrollIntoView({ behavior: 'smooth' })
            }}
            className="group relative inline-flex items-center gap-2 px-8 py-4 rounded-full bg-gradient-to-r from-gold to-gold-dark hover:from-gold-dark hover:to-gold text-white font-display tracking-wide shadow-xl shadow-gold/30 hover:shadow-2xl hover:shadow-gold/40 transition-all duration-300 text-sm sm:text-base font-semibold btn-premium"
          >
            <Search className="size-4" />
            Trouver ma table
          </a>
          <a
            href="#recherche"
            onClick={(e) => {
              e.preventDefault()
              document.getElementById('recherche')?.scrollIntoView({ behavior: 'smooth' })
            }}
            className="group relative inline-flex items-center gap-2 px-8 py-4 rounded-full glass-card gold-border hover:bg-gold/10 text-white/90 font-display tracking-wide transition-all duration-300 text-sm sm:text-base font-semibold btn-premium"
          >
            <MailOpen className="size-4" />
            Voir mon invitation
          </a>
        </motion.div>
      </motion.div>

      {/* ═══ Scroll Indicator ═══ */}
      <motion.div
        initial={isStatic ? false : { opacity: 0 }}
        animate={isStatic ? undefined : { opacity: 1 }}
        transition={isStatic ? { duration: 0 } : { delay: 2.8, duration: motionCfg.duration, ease: motionCfg.ease as Easing }}
        className="absolute bottom-8 left-1/2 -translate-x-1/2 z-20"
      >
        <motion.div
          animate={isStatic ? undefined : { y: [0, 8, 0] }}
          transition={isStatic ? undefined : { duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
          className="flex flex-col items-center gap-2"
        >
          <span className="text-[10px] sm:text-xs font-display tracking-[0.25em] text-white/40 uppercase font-semibold">
            Découvrir
          </span>
          <div className="w-6 h-9 border border-white/20 rounded-full flex justify-center pt-2">
            <motion.div
              animate={isStatic ? undefined : { y: [0, 10, 0], opacity: [1, 0.3, 1] }}
              transition={isStatic ? undefined : { duration: 2, repeat: Infinity, ease: 'easeInOut' }}
              className="w-1 h-2 bg-gold/60 dark:bg-gold-light/50 rounded-full"
            />
          </div>
        </motion.div>
      </motion.div>

      {/* ═══ Bottom Gradient Fade ═══ */}
      <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-background to-transparent z-[5]" />
    </section>
  )
}
