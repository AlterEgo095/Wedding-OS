'use client'

import { motion } from 'framer-motion'
import type { ThemePackage } from '@/lib/aenws/theme-system'

interface VariantProps {
  theme: ThemePackage
  variant: 'compact' | 'full'
}

const EASING = [0.25, 0.46, 0.45, 0.94] as const

// ═══ MAP CINEMATIC ZOOM ════════════════════════════════════════════════════
export function MapCinematic({ theme, variant }: VariantProps) {
  const i = theme.identity
  const d = theme.demo
  const compact = variant === 'compact'

  return (
    <section className={compact ? 'p-3' : 'relative py-20 px-4'}>
      {!compact && (
        <motion.div initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.8 }} className="text-center mb-8 max-w-5xl mx-auto">
          <h2 className="text-3xl md:text-5xl font-bold mb-2" style={{ fontFamily: `'${i.fontDisplay}'`, color: i.primary }}>Le Lieu</h2>
          <p className="text-sm" style={{ color: i.textMuted }}>Là où tout commence</p>
        </motion.div>
      )}
      <div className={`${compact ? '' : 'max-w-5xl mx-auto'} relative rounded-2xl overflow-hidden ${compact ? 'h-24' : 'h-64'}`} style={{ border: `1px solid ${i.primary}30`, background: `${i.primary}10` }}>
        <div className="absolute inset-0" style={{ backgroundImage: i.pattern }} />
        <div className="absolute inset-0 flex items-center justify-center">
          <motion.div initial={{ scale: 0 }} whileInView={{ scale: 1 }} viewport={{ once: true }} transition={{ type: 'spring', stiffness: 150 }} className="relative">
            <div className="absolute inset-0 rounded-full animate-ping" style={{ border: `2px solid ${i.primary}` }} />
            <div className="w-6 h-6 rounded-full flex items-center justify-center" style={{ background: i.primary, boxShadow: `0 0 20px ${i.primary}80` }}>
              <span style={{ color: i.surface }}>●</span>
            </div>
          </motion.div>
        </div>
        <div className={`absolute bottom-0 left-0 right-0 p-3 ${compact ? '' : 'p-5'}`}>
          <h3 className="text-sm font-bold" style={{ color: i.text, fontFamily: `'${i.fontDisplay}'` }}>{d.venue}</h3>
          <p className="text-[10px]" style={{ color: i.textMuted }}>{d.venueAddress}</p>
        </div>
      </div>
    </section>
  )
}

// ═══ MAP SPLIT CARD ════════════════════════════════════════════════════════
export function MapSplit({ theme, variant }: VariantProps) {
  const i = theme.identity
  const d = theme.demo
  const compact = variant === 'compact'

  return (
    <section className={compact ? 'p-3' : 'relative py-20 px-4'}>
      <div className={`${compact ? '' : 'max-w-4xl mx-auto'} grid md:grid-cols-2 gap-4`}>
        <div className={`rounded-xl ${compact ? 'h-20' : 'h-48'}`} style={{ border: `1px solid ${i.primary}30`, background: `${i.primary}15` }} />
        <div className="flex flex-col justify-center">
          <h3 className="text-lg font-bold mb-1" style={{ color: i.primary, fontFamily: `'${i.fontDisplay}'` }}>{d.venue}</h3>
          <p className="text-xs" style={{ color: i.textMuted }}>{d.venueAddress}</p>
          <p className="text-xs mt-1" style={{ color: i.textMuted }}>{d.venueCity}</p>
        </div>
      </div>
    </section>
  )
}

// ═══ MAP FULL BLEED ════════════════════════════════════════════════════════
export function MapFullBleed({ theme, variant }: VariantProps) {
  const i = theme.identity
  const d = theme.demo
  const compact = variant === 'compact'

  return (
    <section className={compact ? 'p-3' : 'relative py-16'}>
      <motion.div initial={{ opacity: 0, scale: 1.05 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true }} transition={{ duration: 1 }} className={`relative w-full overflow-hidden ${compact ? 'h-24 rounded-xl' : 'h-80'}`} style={{ background: i.ambiance }}>
        <div className="absolute inset-0" style={{ backgroundImage: i.pattern }} />
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-10 h-10 rounded-full mb-2" style={{ background: i.primary }}>
              <span style={{ color: i.surface }}>📍</span>
            </div>
            <h3 className="text-base font-bold" style={{ color: i.text, fontFamily: `'${i.fontDisplay}'` }}>{d.venue}</h3>
            <p className="text-[10px]" style={{ color: i.textMuted }}>{d.venueCity}</p>
          </div>
        </div>
      </motion.div>
    </section>
  )
}
