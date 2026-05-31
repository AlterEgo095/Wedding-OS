'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion, useScroll, useTransform } from 'framer-motion'

const WEDDING_DATE = new Date('2025-03-15T14:00:00')

interface TimeLeft {
  days: number
  hours: number
  minutes: number
  seconds: number
}

function calculateTimeLeft(): TimeLeft {
  const now = new Date()
  const difference = WEDDING_DATE.getTime() - now.getTime()

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

function CountdownUnit({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex flex-col items-center">
      <div className="glass-card gold-border w-20 h-20 md:w-24 md:h-24 flex items-center justify-center rounded-xl">
        <span className="font-serif text-3xl md:text-4xl font-bold text-gold-dark dark:text-gold-light">
          {String(value).padStart(2, '0')}
        </span>
      </div>
      <span className="mt-2 text-xs md:text-sm font-display tracking-widest uppercase text-muted-foreground">
        {label}
      </span>
    </div>
  )
}

export default function HeroSection() {
  const [timeLeft, setTimeLeft] = useState<TimeLeft>(calculateTimeLeft())
  const { scrollY } = useScroll()
  const y = useTransform(scrollY, [0, 500], [0, 150])
  const opacity = useTransform(scrollY, [0, 400], [1, 0])

  const tick = useCallback(() => {
    setTimeLeft(calculateTimeLeft())
  }, [])

  useEffect(() => {
    const timer = setInterval(tick, 1000)
    return () => clearInterval(timer)
  }, [tick])

  return (
    <section
      id="accueil"
      className="relative min-h-screen flex items-center justify-center overflow-hidden"
    >
      {/* Background */}
      <motion.div
        style={{ y }}
        className="absolute inset-0 z-0"
      >
        {/* Background Image with CSS gradient fallback */}
        <div
          className="absolute inset-0 bg-cover bg-center bg-no-repeat"
          style={{
            backgroundImage: `url('/upload/wedding-hero.png')`,
          }}
        />
        {/* Fallback gradient layer */}
        <div className="absolute inset-0 bg-gradient-hero" />
        {/* Additional warm overlay */}
        <div className="absolute inset-0 bg-gradient-to-br from-cream/80 via-champagne/60 to-cream/70 dark:from-background/90 dark:via-background/80 dark:to-background/90" />
        {/* Gold accent glow */}
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-gold/5 dark:bg-gold/3 blur-3xl" />
      </motion.div>

      {/* Content */}
      <motion.div
        style={{ opacity }}
        className="relative z-10 text-center px-4 max-w-4xl mx-auto"
      >
        {/* Ornamental top */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, delay: 0.2 }}
          className="flourish text-2xl md:text-3xl mb-6 tracking-[1em]"
        >
          ♦
        </motion.div>

        {/* Pre-title */}
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, delay: 0.4 }}
          className="font-display text-lg md:text-xl tracking-[0.3em] uppercase text-muted-foreground mb-4"
        >
          Nous nous marions
        </motion.p>

        {/* Names */}
        <motion.h1
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1.2, delay: 0.6, ease: [0.22, 1, 0.36, 1] }}
          className="font-serif text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-bold mb-4 text-shadow-elegant"
        >
          <span className="gold-gradient">Alexandre</span>
          <span className="block my-2 font-display text-2xl md:text-3xl font-light text-gold/60 tracking-[0.2em]">
            &amp;
          </span>
          <span className="gold-gradient">Béatrice</span>
        </motion.h1>

        {/* Date */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, delay: 1 }}
          className="mt-6 mb-12"
        >
          <div className="section-divider max-w-xs mx-auto mb-6">
            <span className="flourish text-sm">✦</span>
          </div>
          <p className="font-display text-xl md:text-2xl tracking-[0.2em] text-foreground/80">
            15 Mars 2025
          </p>
        </motion.div>

        {/* Countdown */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, delay: 1.2 }}
          className="flex items-center justify-center gap-4 md:gap-6"
        >
          <CountdownUnit value={timeLeft.days} label="Jours" />
          <span className="text-gold/40 text-2xl font-light mt-[-20px]">:</span>
          <CountdownUnit value={timeLeft.hours} label="Heures" />
          <span className="text-gold/40 text-2xl font-light mt-[-20px]">:</span>
          <CountdownUnit value={timeLeft.minutes} label="Minutes" />
          <span className="text-gold/40 text-2xl font-light mt-[-20px]">:</span>
          <CountdownUnit value={timeLeft.seconds} label="Secondes" />
        </motion.div>

        {/* Scroll indicator */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 2, duration: 1 }}
          className="absolute bottom-8 left-1/2 -translate-x-1/2"
        >
          <motion.div
            animate={{ y: [0, 8, 0] }}
            transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
            className="flex flex-col items-center gap-2"
          >
            <span className="text-xs font-display tracking-widest text-muted-foreground uppercase">
              Découvrir
            </span>
            <div className="w-5 h-8 border border-gold/30 rounded-full flex justify-center pt-1.5">
              <div className="w-1 h-2 bg-gold/50 rounded-full animate-bounce" />
            </div>
          </motion.div>
        </motion.div>
      </motion.div>
    </section>
  )
}
