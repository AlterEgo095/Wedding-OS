'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import Image from 'next/image'
import { motion, useScroll, useTransform, AnimatePresence } from 'framer-motion'
import { Search, MailOpen, ChevronDown, Sparkles } from 'lucide-react'
import { useVisualEffects } from '@/lib/visual-effects-store'
import { SETTING_KEYS } from '@/lib/constants'
import DynamicLightSweep from '@/components/effects/DynamicLightSweep'

interface TimeLeft {
  days: number
  hours: number
  minutes: number
  seconds: number
}

function CountdownUnit({ value, label }: { value: number; label: string }) {
  const prevValueRef = useRef(value)

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
          <AnimatePresence mode="wait">
            <motion.span
              key={value}
              initial={{ opacity: 0, y: -10, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.9 }}
              transition={{ duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] }}
              className="font-serif text-3xl sm:text-5xl md:text-7xl font-black text-transparent bg-clip-text bg-gradient-to-b from-white via-gold-light to-gold drop-shadow-[0_0_20px_oklch(0.68_0.12_85/50%)]"
              style={{ WebkitTextStroke: '0.5px oklch(0.82 0.08 85 / 30%)' }}
            >
              {String(value).padStart(2, '0')}
            </motion.span>
          </AnimatePresence>
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
  const { scrollY } = useScroll()
  const y = useTransform(scrollY, [0, 800], [0, 200])
  const bgScale = useTransform(scrollY, [0, 800], [1, 1.15])
  const contentOpacity = useTransform(scrollY, [0, 500], [1, 0])
  const contentY = useTransform(scrollY, [0, 500], [0, 80])

  const groomName = settings[SETTING_KEYS.GROOM_NAME] || ''
  const brideName = settings[SETTING_KEYS.BRIDE_NAME] || ''
  const dateDisplay = settings[SETTING_KEYS.SITE_SUBTITLE] || 'Vendredi 26 Juin 2026'

  // Read wedding_date / wedding_time into local consts so the useMemo deps
  // array stays a list of simple expressions (react-hooks/use-memo rule).
  // The SETTING_KEYS lookup is computed once per render; the memo recomputes
  // only when the underlying string values change.
  const weddingDateSetting = settings[SETTING_KEYS.WEDDING_DATE]
  const weddingTimeSetting = settings[SETTING_KEYS.WEDDING_TIME]
  const weddingDateStr = useMemo(
    () => `${weddingDateSetting || '2026-06-26'}T${weddingTimeSetting || '21:30:00'}`,
    [weddingDateSetting, weddingTimeSetting]
  )

  // Background photos for crossfade
  const bgPhotos = ['/couple-hero.jpeg', '/couple-moment.jpeg', '/photos/couple-bridge.jpeg', '/photos/couple-bouquet.jpeg']

  useEffect(() => {
    fetch('/api/settings')
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data?.settings) setSettings(data.settings)
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
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

  // Auto-rotate background photos
  useEffect(() => {
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
        style={{ y, scale: bgScale }}
        className="absolute inset-0 z-0 -top-20 -bottom-20"
      >
        {/* Crossfading couple photos */}
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
            }}
            animate={{
              y: [-30, 30, -30],
              opacity: [0.1, 0.4, 0.1],
              scale: [1, 2, 1],
            }}
            transition={{
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
        style={{ opacity: contentOpacity, y: contentY }}
        className="relative z-10 text-center px-4 max-w-5xl mx-auto py-20"
      >
        {/* Ornamental top flourish */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1.2, delay: 0.2 }}
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
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, delay: 0.5 }}
          className="font-display text-lg sm:text-xl md:text-2xl tracking-[0.35em] uppercase text-white/70 mb-8 font-semibold"
        >
          Nous nous marions
        </motion.p>

        {/* ═══ Premium Couple Photo Showcase ═══ */}
        <motion.div
          initial={{ opacity: 0, scale: 0.85 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1.4, delay: 0.7, ease: "easeOut" }}
          className="relative flex items-center justify-center mb-10 sm:mb-14"
        >
          {/* Groom Photo - Elegant Rounded Frame */}
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 1, delay: 0.9 }}
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
            {/* Photo */}
            <div className="relative w-32 h-32 sm:w-40 sm:h-40 md:w-48 md:h-48 rounded-full overflow-hidden border-[3px] border-gold/30 shadow-[0_0_40px_rgba(0,0,0,0.6),0_0_20px_oklch(0.68_0.12_85/20%)]">
              <Image
                src="/couple-hero.jpeg"
                alt={groomName}
                fill
                className="object-cover object-top"
                priority
                sizes="(max-width: 640px) 128px, (max-width: 768px) 160px, 192px"
              />
            </div>
            {/* Name */}
            <motion.p
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 1.6 }}
              className="mt-5 font-serif text-base sm:text-lg md:text-xl tracking-[0.12em] text-white/90 uppercase font-bold"
            >
              {groomName}
            </motion.p>
          </motion.div>

          {/* Heart / Ampersand */}
          <motion.div
            initial={{ opacity: 0, scale: 0 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.8, delay: 1.3, type: 'spring', stiffness: 200 }}
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
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 1, delay: 0.9 }}
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
            {/* Photo */}
            <div className="relative w-32 h-32 sm:w-40 sm:h-40 md:w-48 md:h-48 rounded-full overflow-hidden border-[3px] border-rose-gold/30 shadow-[0_0_40px_rgba(0,0,0,0.6),0_0_20px_oklch(0.72_0.08_30/20%)]">
              <Image
                src="/couple-moment.jpeg"
                alt={brideName}
                fill
                className="object-cover object-top"
                priority
                sizes="(max-width: 640px) 128px, (max-width: 768px) 160px, 192px"
              />
            </div>
            {/* Name */}
            <motion.p
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 1.6 }}
              className="mt-5 font-serif text-base sm:text-lg md:text-xl tracking-[0.12em] text-white/90 uppercase font-bold"
            >
              {brideName}
            </motion.p>
          </motion.div>
        </motion.div>

        {/* ═══ Names - Large gold gradient ═══ */}
        <motion.h1
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1.4, delay: 1.2, ease: "easeOut" }}
          className="font-serif text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-bold mb-3 text-shadow-elegant"
        >
          <span className="gold-gradient">{groomName}</span>
          <span className="block my-1 font-display text-2xl sm:text-3xl md:text-4xl font-light text-gold/50 dark:text-gold-light/40 tracking-[0.3em]">
            &
          </span>
          <span className="gold-gradient">{brideName}</span>
        </motion.h1>

        {/* ═══ Date ═══ */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, delay: 1.6 }}
          className="mt-6 mb-12"
        >
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
        </motion.div>

        {/* ═══ Countdown Timer ═══ */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1.2, delay: 1.9 }}
        >
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 2.2, duration: 0.8 }}
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
        </motion.div>

        {/* ═══ Action Buttons ═══ */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, delay: 2.2 }}
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
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 2.8, duration: 1 }}
        className="absolute bottom-8 left-1/2 -translate-x-1/2 z-20"
      >
        <motion.div
          animate={{ y: [0, 8, 0] }}
          transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
          className="flex flex-col items-center gap-2"
        >
          <span className="text-[10px] sm:text-xs font-display tracking-[0.25em] text-white/40 uppercase font-semibold">
            Découvrir
          </span>
          <div className="w-6 h-9 border border-white/20 rounded-full flex justify-center pt-2">
            <motion.div
              animate={{ y: [0, 10, 0], opacity: [1, 0.3, 1] }}
              transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
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
