'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import Image from 'next/image'
import { motion, useScroll, useTransform } from 'framer-motion'
import { Search, MailOpen } from 'lucide-react'

interface TimeLeft {
  days: number
  hours: number
  minutes: number
  seconds: number
}



function CountdownUnit({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex flex-col items-center">
      <div className="relative w-16 h-16 sm:w-20 sm:h-20 md:w-24 md:h-24 flex items-center justify-center">
        {/* Outer ornamental ring */}
        <div className="absolute inset-0 rounded-full border border-gold/25 dark:border-gold-light/20" />
        <div className="absolute inset-1 rounded-full border border-gold/15 dark:border-gold-light/10" />
        {/* Inner glass card */}
        <div className="absolute inset-2 rounded-full glass-card flex items-center justify-center">
          <span className="font-serif text-2xl sm:text-3xl md:text-4xl font-bold text-gold-dark dark:text-gold-light">
            {String(value).padStart(2, '0')}
          </span>
        </div>
      </div>
      <span className="mt-2 text-[10px] sm:text-xs md:text-sm font-display tracking-[0.2em] uppercase text-foreground/50 dark:text-foreground/40">
        {label}
      </span>
    </div>
  )
}

export default function HeroSection() {
  const [settings, setSettings] = useState<Record<string, string>>({})
  const [timeLeft, setTimeLeft] = useState<TimeLeft>({ days: 0, hours: 0, minutes: 0, seconds: 0 })
  const { scrollY } = useScroll()
  const y = useTransform(scrollY, [0, 800], [0, 200])
  const bgScale = useTransform(scrollY, [0, 800], [1, 1.15])
  const contentOpacity = useTransform(scrollY, [0, 500], [1, 0])
  const contentY = useTransform(scrollY, [0, 500], [0, 80])

  const groomName = settings.groom_name || 'Josué'
  const brideName = settings.bride_name || 'Hornella'
  const dateDisplay = settings.site_subtitle || 'Vendredi 26 Juin 2026'

  // Stable wedding date string to prevent infinite re-renders
  const weddingDateStr = useMemo(
    () => `${settings.wedding_date || '2026-06-26'}T${settings.wedding_time || '14:00:00'}`,
    [settings.wedding_date, settings.wedding_time]
  )

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

      if (difference <= 0) {
        return { days: 0, hours: 0, minutes: 0, seconds: 0 }
      }

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

  return (
    <section
      id="accueil"
      className="relative min-h-screen flex items-center justify-center overflow-hidden"
    >
      {/* ═══ Parallax Background ═══ */}
      <motion.div
        style={{ y, scale: bgScale }}
        className="absolute inset-0 z-0 -top-20 -bottom-20"
      >
        {/* Main couple photo as background */}
        <div
          className="absolute inset-0 bg-cover bg-center bg-no-repeat"
          style={{
            backgroundImage: `url('/upload/couple-photo-1.jpeg')`,
          }}
        />
        {/* Dark cinematic overlay for readability */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/55 via-black/45 to-black/70" />
        {/* Side vignette */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_40%,rgba(0,0,0,0.4)_100%)]" />
        {/* Warm gold tint overlay */}
        <div className="absolute inset-0 bg-gradient-to-br from-gold-dark/8 via-transparent to-rose-gold/8" />
      </motion.div>

      {/* ═══ Ambient Gold Particles ═══ */}
      <div className="absolute inset-0 z-[1] pointer-events-none overflow-hidden">
        {[...Array(6)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute w-1 h-1 rounded-full bg-gold/30 dark:bg-gold-light/20"
            style={{
              left: `${15 + i * 15}%`,
              top: `${20 + (i % 3) * 25}%`,
            }}
            animate={{
              y: [-20, 20, -20],
              opacity: [0.2, 0.6, 0.2],
              scale: [1, 1.5, 1],
            }}
            transition={{
              duration: 4 + i * 0.8,
              repeat: Infinity,
              ease: 'easeInOut',
              delay: i * 0.6,
            }}
          />
        ))}
      </div>

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
            <div className="w-16 sm:w-24 h-px bg-gradient-to-r from-transparent via-gold/50 to-transparent" />
            <span className="flourish text-xl sm:text-2xl">✦</span>
            <div className="w-16 sm:w-24 h-px bg-gradient-to-r from-transparent via-gold/50 to-transparent" />
          </div>
        </motion.div>

        {/* Pre-title */}
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, delay: 0.5 }}
          className="font-display text-base sm:text-lg md:text-xl tracking-[0.3em] uppercase text-white/60 mb-8"
        >
          Nous nous marions
        </motion.p>

        {/* ═══ Couple Photos ═══ */}
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1.2, delay: 0.7, ease: [0.22, 1, 0.36, 1] }}
          className="relative flex items-center justify-center mb-10 sm:mb-12"
        >
          {/* Josué Photo */}
          <div className="relative z-[2]">
            {/* Outer decorative ring */}
            <div className="absolute -inset-3 rounded-full animate-spin-slow"
              style={{
                background: 'conic-gradient(from 0deg, transparent 0%, oklch(0.68 0.12 85 / 30%) 10%, transparent 20%, transparent 50%, oklch(0.68 0.12 85 / 30%) 60%, transparent 70%)',
              }}
            />
            {/* Gold border ring */}
            <div className="absolute -inset-1.5 rounded-full bg-gradient-to-br from-gold via-gold-light to-rose-gold p-[2px]">
              <div className="w-full h-full rounded-full bg-black/20" />
            </div>
            {/* Photo container */}
            <div className="relative w-28 h-28 sm:w-36 sm:h-36 md:w-44 md:h-44 rounded-full overflow-hidden border-2 border-gold/40 dark:border-gold-light/30 shadow-2xl shadow-black/50">
              <Image
                src="/upload/couple-photo-1.jpeg"
                alt={groomName}
                fill
                className="object-cover"
                priority
                sizes="(max-width: 640px) 112px, (max-width: 768px) 144px, 176px"
              />
            </div>
            {/* Name label */}
            <motion.p
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 1.5 }}
              className="mt-4 font-display text-sm sm:text-base tracking-[0.15em] text-white/70 uppercase"
            >
              {groomName}
            </motion.p>
          </div>

          {/* Heart / Ampersand between photos */}
          <motion.div
            initial={{ opacity: 0, scale: 0 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.8, delay: 1.3, type: 'spring', stiffness: 200 }}
            className="relative z-[3] mx-[-16px] sm:mx-[-20px] md:mx-[-24px] flex flex-col items-center"
          >
            <div className="relative w-12 h-12 sm:w-14 sm:h-14 md:w-16 md:h-16 rounded-full bg-gradient-to-br from-gold via-gold-light to-rose-gold flex items-center justify-center shadow-xl shadow-gold/30 animate-pulse-gold">
              <span className="font-display text-xl sm:text-2xl md:text-3xl font-semibold text-background dark:text-background">
                &
              </span>
            </div>
          </motion.div>

          {/* Hornella Photo */}
          <div className="relative z-[2]">
            {/* Outer decorative ring */}
            <div className="absolute -inset-3 rounded-full animate-spin-slow"
              style={{
                background: 'conic-gradient(from 180deg, transparent 0%, oklch(0.72 0.08 30 / 30%) 10%, transparent 20%, transparent 50%, oklch(0.72 0.08 30 / 30%) 60%, transparent 70%)',
              }}
            />
            {/* Gold border ring */}
            <div className="absolute -inset-1.5 rounded-full bg-gradient-to-br from-rose-gold via-gold-light to-gold p-[2px]">
              <div className="w-full h-full rounded-full bg-black/20" />
            </div>
            {/* Photo container */}
            <div className="relative w-28 h-28 sm:w-36 sm:h-36 md:w-44 md:h-44 rounded-full overflow-hidden border-2 border-rose-gold/40 dark:border-rose-gold/30 shadow-2xl shadow-black/50">
              <Image
                src="/upload/couple-photo-2.png"
                alt={brideName}
                fill
                className="object-cover"
                priority
                sizes="(max-width: 640px) 112px, (max-width: 768px) 144px, 176px"
              />
            </div>
            {/* Name label */}
            <motion.p
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 1.5 }}
              className="mt-4 font-display text-sm sm:text-base tracking-[0.15em] text-white/70 uppercase"
            >
              {brideName}
            </motion.p>
          </div>
        </motion.div>

        {/* ═══ Names - Large gold gradient ═══ */}
        <motion.h1
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1.4, delay: 1.0, ease: [0.22, 1, 0.36, 1] }}
          className="font-serif text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold mb-3 text-shadow-elegant"
        >
          <span className="gold-gradient">{groomName}</span>
          <span className="block my-1 font-display text-xl sm:text-2xl md:text-3xl font-light text-gold/50 dark:text-gold-light/40 tracking-[0.3em]">
            &
          </span>
          <span className="gold-gradient">{brideName}</span>
        </motion.h1>

        {/* ═══ Date ═══ */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, delay: 1.4 }}
          className="mt-6 mb-10"
        >
          <div className="flex items-center justify-center gap-3 mb-4">
            <div className="w-12 sm:w-20 h-px bg-gradient-to-r from-transparent to-gold/50" />
            <span className="flourish text-xs sm:text-sm">❧</span>
            <div className="w-12 sm:w-20 h-px bg-gradient-to-l from-transparent to-gold/50" />
          </div>
          <p className="font-display text-lg sm:text-xl md:text-2xl tracking-[0.2em] text-white/75">
            {dateDisplay}
          </p>
          <div className="flex items-center justify-center gap-3 mt-4">
            <div className="w-12 sm:w-20 h-px bg-gradient-to-r from-transparent to-gold/50" />
            <span className="flourish text-xs sm:text-sm">❧</span>
            <div className="w-12 sm:w-20 h-px bg-gradient-to-l from-transparent to-gold/50" />
          </div>
        </motion.div>

        {/* ═══ Countdown Timer ═══ */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, delay: 1.7 }}
          className="flex items-center justify-center gap-2 sm:gap-3 md:gap-5"
        >
          <CountdownUnit value={timeLeft.days} label="Jours" />
          <span className="text-gold/25 dark:text-gold-light/20 text-lg sm:text-xl md:text-2xl font-light mt-[-16px]">✦</span>
          <CountdownUnit value={timeLeft.hours} label="Heures" />
          <span className="text-gold/25 dark:text-gold-light/20 text-lg sm:text-xl md:text-2xl font-light mt-[-16px]">✦</span>
          <CountdownUnit value={timeLeft.minutes} label="Minutes" />
          <span className="text-gold/25 dark:text-gold-light/20 text-lg sm:text-xl md:text-2xl font-light mt-[-16px]">✦</span>
          <CountdownUnit value={timeLeft.seconds} label="Secondes" />
        </motion.div>

        {/* ═══ Action Buttons ═══ */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, delay: 2.0 }}
          className="flex flex-col sm:flex-row items-center justify-center gap-4 mt-10"
        >
          <a
            href="#recherche"
            onClick={(e) => {
              e.preventDefault()
              document.getElementById('recherche')?.scrollIntoView({ behavior: 'smooth' })
            }}
            className="group relative inline-flex items-center gap-2 px-8 py-3.5 rounded-full bg-gradient-to-r from-gold to-gold-dark hover:from-gold-dark hover:to-gold text-white font-display tracking-wide shadow-xl shadow-gold/30 hover:shadow-2xl hover:shadow-gold/40 transition-all duration-300 text-sm sm:text-base"
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
            className="group relative inline-flex items-center gap-2 px-8 py-3.5 rounded-full glass-card gold-border hover:bg-gold/10 text-white/90 font-display tracking-wide transition-all duration-300 text-sm sm:text-base"
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
        transition={{ delay: 2.5, duration: 1 }}
        className="absolute bottom-8 left-1/2 -translate-x-1/2 z-20"
      >
        <motion.div
          animate={{ y: [0, 8, 0] }}
          transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
          className="flex flex-col items-center gap-2"
        >
          <span className="text-[10px] sm:text-xs font-display tracking-[0.25em] text-white/40 uppercase">
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
