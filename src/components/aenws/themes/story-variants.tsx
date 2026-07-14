'use client'

import { motion } from 'framer-motion'
import type { ThemePackage } from '@/lib/aenws/theme-system'

interface VariantProps {
  theme: ThemePackage
  variant: 'compact' | 'full'
}

const EASING = [0.25, 0.46, 0.45, 0.94] as const

// ═══ STORY CHAPTERS ════════════════════════════════════════════════════════
export function StoryChapters({ theme, variant }: VariantProps) {
  const i = theme.identity
  const d = theme.demo
  const compact = variant === 'compact'
  const items = compact ? d.story.slice(0, 1) : d.story

  return (
    <section className={compact ? 'p-3' : 'relative py-20 px-4'}>
      {!compact && (
        <motion.div initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.8 }} className="text-center mb-12 max-w-5xl mx-auto">
          <h2 className="text-3xl md:text-5xl font-bold mb-2" style={{ fontFamily: `'${i.fontDisplay}'`, color: i.primary }}>Notre Histoire</h2>
          <p className="text-sm" style={{ color: i.textMuted }}>Le chemin qui nous a menés ici</p>
        </motion.div>
      )}
      <div className={`${compact ? '' : 'max-w-4xl mx-auto'} space-y-6`}>
        {items.map((s, idx) => (
          <motion.div key={s.id} initial={{ opacity: 0, x: s.side === 'left' ? -40 : 40 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ duration: 0.7, ease: EASING }} className={`flex ${s.side === 'left' ? 'justify-start' : 'justify-end'}`}>
            <div className="rounded-2xl p-5 max-w-md" style={{ background: `${i.surfaceDeep}80`, border: `1px solid ${i.primary}25`, backdropFilter: 'blur(10px)' }}>
              <span className="text-3xl font-bold block mb-1" style={{ color: i.primary, opacity: 0.3, fontFamily: `'${i.fontDisplay}'` }}>{String(idx + 1).padStart(2, '0')}</span>
              <h3 className="text-lg font-bold mb-1" style={{ color: i.text, fontFamily: `'${i.fontDisplay}'` }}>{s.title}</h3>
              <p className="text-[10px] tracking-wider uppercase mb-2" style={{ color: i.primary }}>{s.date}</p>
              {!compact && <p className="text-xs leading-relaxed" style={{ color: i.textMuted }}>{s.description}</p>}
            </div>
          </motion.div>
        ))}
      </div>
    </section>
  )
}

// ═══ STORY SCROLL NARRATIVE ════════════════════════════════════════════════
export function StoryScroll({ theme, variant }: VariantProps) {
  const i = theme.identity
  const d = theme.demo
  const compact = variant === 'compact'
  const items = compact ? d.story.slice(0, 1) : d.story

  return (
    <section className={compact ? 'p-3' : 'relative py-20 px-4'}>
      {!compact && (
        <motion.div initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} transition={{ duration: 1 }} className="text-center mb-12 max-w-3xl mx-auto">
          <h2 className="text-3xl md:text-5xl font-light mb-2" style={{ fontFamily: `'${i.fontDisplay}'`, color: i.text }}>Notre Histoire</h2>
        </motion.div>
      )}
      <div className={`${compact ? '' : 'max-w-2xl mx-auto'} space-y-8`}>
        {items.map((s, idx) => (
          <motion.div key={s.id} initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.8 }} className="text-center">
            <p className="text-[10px] tracking-[0.3em] uppercase mb-3" style={{ color: i.primary }}>{s.date}</p>
            <h3 className="text-xl md:text-2xl font-light mb-2" style={{ color: i.text, fontFamily: `'${i.fontDisplay}'` }}>{s.title}</h3>
            {!compact && <p className="text-sm leading-relaxed max-w-md mx-auto" style={{ color: i.textMuted }}>{s.description}</p>}
          </motion.div>
        ))}
      </div>
    </section>
  )
}
