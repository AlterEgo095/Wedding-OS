'use client'

import { motion } from 'framer-motion'
import { Heart, Sparkles } from 'lucide-react'

export default function Footer() {
  const currentYear = new Date().getFullYear()

  return (
    <footer className="relative border-t border-gold/10 bg-gradient-to-b from-background to-champagne/5 dark:to-champagne/3 mt-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 md:py-16">
        {/* Top divider */}
        <div className="section-divider max-w-md mx-auto mb-8">
          <span className="flourish text-sm">✦</span>
        </div>

        {/* Couple Photos */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="flex items-center justify-center gap-3 mb-6"
        >
          <div className="w-14 h-14 md:w-16 md:h-16 rounded-full overflow-hidden gold-border shadow-md shadow-gold/10">
            <img
              src="/uploads/couple-photo-1.jpeg"
              alt="Josué"
              className="w-full h-full object-cover"
            />
          </div>
          <motion.div
            animate={{ scale: [1, 1.15, 1] }}
            transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
          >
            <Heart className="size-5 text-gold fill-gold/30" />
          </motion.div>
          <div className="w-14 h-14 md:w-16 md:h-16 rounded-full overflow-hidden gold-border shadow-md shadow-gold/10">
            <img
              src="/uploads/couple-photo-2.jpeg"
              alt="Hornella"
              className="w-full h-full object-cover"
            />
          </div>
        </motion.div>

        {/* Couple Names */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-6"
        >
          <h3 className="font-serif text-2xl md:text-3xl font-bold gold-gradient mb-2">
            Josué & Hornella
          </h3>
          <p className="font-display text-sm tracking-[0.3em] uppercase text-muted-foreground">
            Vendredi 26 Juin 2026
          </p>
        </motion.div>

        {/* Hashtag */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="text-center mb-8"
        >
          <span className="inline-flex items-center gap-2 px-5 py-2 rounded-full glass-card gold-border text-sm font-display tracking-wide text-gold">
            <Heart className="size-3 fill-gold" />
            #JosueEtHornella2026
            <Heart className="size-3 fill-gold" />
          </span>
        </motion.div>

        {/* Premium tagline */}
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8, delay: 0.2 }}
          className="text-center mb-6"
        >
          <p className="font-display text-[10px] tracking-[0.25em] uppercase text-gold/40 font-semibold">
            Une expérience digitale par
          </p>
          <div className="flex items-center justify-center gap-1 mt-1">
            <Sparkles className="size-3 text-gold/40" />
            <span className="font-display text-xs font-bold tracking-[0.15em] text-gold/50">AENEWS</span>
            <Sparkles className="size-3 text-gold/40" />
          </div>
        </motion.div>

        {/* Copyright */}
        <div className="text-center space-y-2">
          <p className="text-xs text-muted-foreground/60 font-display">
            &copy; {currentYear} Josué & Hornella — Tous droits réservés
          </p>
          <p className="text-xs text-muted-foreground/40 font-display flex items-center justify-center gap-1">
            Fait avec <Heart className="size-3 text-rose-400 fill-rose-400" /> pour un jour exceptionnel
          </p>
        </div>
      </div>
    </footer>
  )
}
