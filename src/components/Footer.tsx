'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Heart, Sparkles } from 'lucide-react'
import Image from 'next/image'
import { SETTING_KEYS } from '@/lib/constants'

export default function Footer() {
  const currentYear = new Date().getFullYear()

  // Couple label + hashtag + date from settings — avoids hardcoding
  // "Josué & Hornella", "#JosueEtHornella2026", "Vendredi 26 Juin 2026".
  // Generic empty fallbacks so other weddings don't leak the default
  // wedding's couple identity. The default wedding (josue-hornella) still
  // resolves to its configured values via /api/settings (zero regression).
  const [coupleLabel, setCoupleLabel] = useState<string>('Mariage')
  const [hashtag, setHashtag] = useState<string>('')
  const [dateDisplay, setDateDisplay] = useState<string>('')
  // Couple photo paths — settings-driven when available, falling back to the
  // legacy default-wedding photo path so the default wedding renders
  // identically (zero regression).
  const [couplePhoto1Path, setCouplePhoto1Path] = useState<string>('/uploads/couple-photo-1.jpeg')
  const [couplePhoto2Path, setCouplePhoto2Path] = useState<string>('/uploads/couple-photo-2.jpeg')
  const [groomName, setGroomName] = useState<string>('')
  const [brideName, setBrideName] = useState<string>('')

  useEffect(() => {
    fetch('/api/settings')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        const s = data?.settings
        if (s && typeof s === 'object') {
          const bride = (s[SETTING_KEYS.BRIDE_NAME] || '').trim()
          const groom = (s[SETTING_KEYS.GROOM_NAME] || '').trim()
          setGroomName(groom)
          setBrideName(bride)
          if (bride && groom) setCoupleLabel(`${groom} & ${bride}`)
          else if (bride || groom) setCoupleLabel(bride || groom)
          if (s[SETTING_KEYS.HASHTAG]) setHashtag(s[SETTING_KEYS.HASHTAG])
          if (s[SETTING_KEYS.SITE_SUBTITLE]) setDateDisplay(s[SETTING_KEYS.SITE_SUBTITLE])
          if (s[SETTING_KEYS.COUPLE_PHOTO_1]) setCouplePhoto1Path(s[SETTING_KEYS.COUPLE_PHOTO_1])
          if (s[SETTING_KEYS.COUPLE_PHOTO_2]) setCouplePhoto2Path(s[SETTING_KEYS.COUPLE_PHOTO_2])
        }
      })
      .catch(() => {})
  }, [])

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
          <div className="relative w-14 h-14 md:w-16 md:h-16 rounded-full overflow-hidden gold-border shadow-md shadow-gold/10">
            <Image
              src={couplePhoto1Path}
              alt={groomName || 'Photo du mari'}
              fill
              sizes="64px"
              className="object-cover"
            />
          </div>
          <motion.div
            animate={{ scale: [1, 1.15, 1] }}
            transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
          >
            <Heart className="size-5 text-gold fill-gold/30" />
          </motion.div>
          <div className="relative w-14 h-14 md:w-16 md:h-16 rounded-full overflow-hidden gold-border shadow-md shadow-gold/10">
            <Image
              src={couplePhoto2Path}
              alt={brideName || 'Photo de la mariée'}
              fill
              sizes="64px"
              className="object-cover"
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
            {coupleLabel}
          </h3>
          {dateDisplay && (
            <p className="font-display text-sm tracking-[0.3em] uppercase text-muted-foreground">
              {dateDisplay}
            </p>
          )}
        </motion.div>

        {/* Hashtag */}
        {hashtag && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="text-center mb-8"
          >
            <span className="inline-flex items-center gap-2 px-5 py-2 rounded-full glass-card gold-border text-sm font-display tracking-wide text-gold">
              <Heart className="size-3 fill-gold" />
              {hashtag}
              <Heart className="size-3 fill-gold" />
            </span>
          </motion.div>
        )}

        {/* AENEWS Signature — Premium with Logo */}
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8, delay: 0.2 }}
          className="text-center mb-6"
        >
          <p className="font-display text-[10px] tracking-[0.2em] uppercase text-gold/35 font-semibold mb-2">
            Développé avec passion par
          </p>
          <div className="flex items-center justify-center gap-2">
            <Image
              src="/aenews-logo.png"
              alt="AENEWS"
              width={80}
              height={53}
              className="h-8 w-auto opacity-50 hover:opacity-80 transition-opacity duration-300"
            />
          </div>
        </motion.div>

        {/* Copyright */}
        <div className="text-center space-y-2">
          <p className="text-xs text-muted-foreground/60 font-display">
            &copy; {currentYear} {coupleLabel} — Tous droits réservés
          </p>
          <p className="text-xs text-muted-foreground/40 font-display flex items-center justify-center gap-1">
            Fait avec <Heart className="size-3 text-rose-400 fill-rose-400" /> pour un jour exceptionnel
          </p>
        </div>
      </div>
    </footer>
  )
}
