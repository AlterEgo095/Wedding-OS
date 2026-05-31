'use client'

import { motion } from 'framer-motion'
import { Heart } from 'lucide-react'

export default function Footer() {
  const currentYear = new Date().getFullYear()

  return (
    <footer className="relative border-t border-gold/10 bg-gradient-to-b from-background to-champagne/5 dark:to-champagne/3">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 md:py-16">
        {/* Top divider */}
        <div className="section-divider max-w-md mx-auto mb-8">
          <span className="flourish text-sm">✦</span>
        </div>

        {/* Couple Names */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-6"
        >
          <h3 className="font-serif text-2xl md:text-3xl font-bold gold-gradient mb-2">
            Alexandre & Béatrice
          </h3>
          <p className="font-display text-sm tracking-[0.3em] uppercase text-muted-foreground">
            15 Mars 2025
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
            #AlexandreEtBeatrice2025
            <Heart className="size-3 fill-gold" />
          </span>
        </motion.div>

        {/* Copyright */}
        <div className="text-center space-y-2">
          <p className="text-xs text-muted-foreground/60 font-display">
            &copy; {currentYear} Alexandre & Béatrice — Tous droits réservés
          </p>
          <p className="text-xs text-muted-foreground/40 font-display flex items-center justify-center gap-1">
            Fait avec <Heart className="size-3 text-rose-400 fill-rose-400" /> pour un jour exceptionnel
          </p>
        </div>
      </div>
    </footer>
  )
}
