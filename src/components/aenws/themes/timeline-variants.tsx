'use client'

import { motion } from 'framer-motion'
import type { ThemePackage } from '@/lib/aenws/theme-system'

interface VariantProps {
  theme: ThemePackage
  variant: 'compact' | 'full'
}

const EASING = [0.25, 0.46, 0.45, 0.94] as const

// ═══ TIMELINE ALTERNATING ═══════════════════════════════════════════════════
export function TimelineAlternating({ theme, variant }: VariantProps) {
  const i = theme.identity
  const d = theme.demo
  const compact = variant === 'compact'
  const items = compact ? d.timeline.slice(0, 2) : d.timeline

  return (
    <section className={compact ? 'p-3' : 'relative py-20 px-4'}>
      {!compact && (
        <motion.div initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.8 }} className="text-center mb-12 max-w-5xl mx-auto">
          <h2 className="text-3xl md:text-5xl font-bold mb-2" style={{ fontFamily: `'${i.fontDisplay}'`, color: i.primary }}>Programme</h2>
          <p className="text-sm" style={{ color: i.textMuted }}>Une journée en plusieurs actes</p>
        </motion.div>
      )}
      <div className={`relative ${compact ? '' : 'max-w-4xl mx-auto'}`}>
        <div className="absolute left-4 top-0 bottom-0 w-px" style={{ background: `${i.primary}30` }} />
        <div className="space-y-4">
          {items.map((e, idx) => (
            <motion.div key={e.id} initial={{ opacity: 0, x: idx % 2 === 0 ? -30 : 30 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ duration: 0.6 }} className={`relative pl-12 ${compact ? '' : 'md:pl-16'}`}>
              <div className="absolute left-2.5 top-2 w-3 h-3 rounded-full" style={{ background: i.primary, boxShadow: `0 0 12px ${i.primary}60` }} />
              <div className="rounded-xl p-4" style={{ background: `${i.surfaceDeep}80`, border: `1px solid ${i.primary}25`, backdropFilter: 'blur(10px)' }}>
                <div className="flex items-baseline gap-3 mb-1">
                  <span className="text-2xl font-bold" style={{ fontFamily: `'${i.fontDisplay}'`, color: i.primary }}>{e.time}</span>
                  <span className="text-[10px] tracking-wider uppercase" style={{ color: i.textMuted }}>{e.location}</span>
                </div>
                <h3 className="text-base font-semibold mb-1" style={{ color: i.text }}>{e.title}</h3>
                {!compact && <p className="text-xs" style={{ color: i.textMuted }}>{e.description}</p>}
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ═══ TIMELINE VERTICAL LIST ════════════════════════════════════════════════
export function TimelineVertical({ theme, variant }: VariantProps) {
  const i = theme.identity
  const d = theme.demo
  const compact = variant === 'compact'
  const items = compact ? d.timeline.slice(0, 2) : d.timeline

  return (
    <section className={compact ? 'p-3' : 'relative py-20 px-4'}>
      {!compact && (
        <motion.div initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.8 }} className="text-center mb-12 max-w-3xl mx-auto">
          <h2 className="text-3xl md:text-5xl font-bold mb-2" style={{ fontFamily: `'${i.fontDisplay}'`, color: i.primary }}>Programme</h2>
          <p className="text-sm" style={{ color: i.textMuted }}>Le déroulé de la journée</p>
        </motion.div>
      )}
      <div className={`${compact ? '' : 'max-w-2xl mx-auto'} space-y-2`}>
        {items.map((e, idx) => (
          <motion.div key={e.id} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: idx * 0.1, duration: 0.5 }} className="flex items-center gap-4 py-3 border-b" style={{ borderColor: `${i.primary}20` }}>
            <span className="text-xl font-bold w-16" style={{ fontFamily: `'${i.fontDisplay}'`, color: i.primary }}>{e.time}</span>
            <div className="flex-1">
              <h3 className="text-sm font-semibold" style={{ color: i.text }}>{e.title}</h3>
              <p className="text-[10px]" style={{ color: i.textMuted }}>{e.location}</p>
            </div>
          </motion.div>
        ))}
      </div>
    </section>
  )
}

// ═══ TIMELINE CARD STACK ═══════════════════════════════════════════════════
export function TimelineCardStack({ theme, variant }: VariantProps) {
  const i = theme.identity
  const d = theme.demo
  const compact = variant === 'compact'
  const items = compact ? d.timeline.slice(0, 2) : d.timeline

  return (
    <section className={compact ? 'p-3' : 'relative py-20 px-4'}>
      {!compact && (
        <motion.div initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.8 }} className="text-center mb-12 max-w-5xl mx-auto">
          <h2 className="text-3xl md:text-5xl font-bold mb-2" style={{ fontFamily: `'${i.fontDisplay}'`, color: i.primary }}>Programme</h2>
          <p className="text-sm" style={{ color: i.textMuted }}>La journée étape par étape</p>
        </motion.div>
      )}
      <div className={`${compact ? '' : 'max-w-3xl mx-auto'} space-y-3`}>
        {items.map((e, idx) => (
          <motion.div key={e.id} initial={{ opacity: 0, scale: 0.95 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true }} transition={{ delay: idx * 0.12, duration: 0.6 }} className="rounded-2xl p-5 flex items-center gap-4" style={{ background: `linear-gradient(135deg, ${i.primary}15, ${i.surfaceDeep}80)`, border: `1px solid ${i.primary}30` }}>
            <div className="w-14 h-14 rounded-full flex items-center justify-center shrink-0" style={{ background: i.primary }}>
              <span className="text-xs font-bold" style={{ color: i.surface }}>{e.time.split(':')[0]}h</span>
            </div>
            <div className="flex-1">
              <h3 className="text-base font-bold" style={{ color: i.text, fontFamily: `'${i.fontDisplay}'` }}>{e.title}</h3>
              <p className="text-[10px] tracking-wider uppercase" style={{ color: i.primary }}>{e.time} · {e.location}</p>
              {!compact && <p className="text-xs mt-1" style={{ color: i.textMuted }}>{e.description}</p>}
            </div>
          </motion.div>
        ))}
      </div>
    </section>
  )
}
