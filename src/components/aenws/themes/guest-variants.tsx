'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import type { ThemePackage } from '@/lib/aenws/theme-system'

interface VariantProps {
  theme: ThemePackage
  variant: 'compact' | 'full'
}

const EASING = [0.25, 0.46, 0.45, 0.94] as const

// ═══ GUEST GLASS PORTAL ════════════════════════════════════════════════════
export function GuestGlass({ theme, variant }: VariantProps) {
  const i = theme.identity
  const compact = variant === 'compact'
  const [code, setCode] = useState('')

  return (
    <section className={compact ? 'p-3' : 'relative py-20 px-4'}>
      <div className={`${compact ? '' : 'max-w-md mx-auto'} rounded-2xl p-6 text-center`} style={{ background: `${i.surfaceDeep}90`, border: `1px solid ${i.primary}30`, backdropFilter: 'blur(20px)' }}>
        <motion.div initial={{ opacity: 0, scale: 0.8 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true }} transition={{ type: 'spring', stiffness: 150 }} className="inline-flex items-center justify-center w-12 h-12 rounded-full mb-3" style={{ background: i.primary }}>
          <span style={{ color: i.surface }}>✦</span>
        </motion.div>
        <h3 className="text-lg font-bold mb-1" style={{ color: i.text, fontFamily: `'${i.fontDisplay}'` }}>Entrez dans l'expérience</h3>
        <p className="text-[10px] mb-4" style={{ color: i.textMuted }}>Saisissez votre code d'accès</p>
        <input type="text" value={code} onChange={(e) => setCode(e.target.value)} placeholder="Code d'accès" className="w-full px-4 py-2 rounded-lg text-center text-sm mb-3 outline-none" style={{ background: `${i.surface}50`, border: `1px solid ${i.primary}40`, color: i.text }} />
        <button className="w-full py-2 rounded-lg text-sm font-semibold" style={{ background: i.primary, color: i.surface }}>
          Accéder
        </button>
      </div>
    </section>
  )
}

// ═══ GUEST MINIMAL FORM ════════════════════════════════════════════════════
export function GuestMinimal({ theme, variant }: VariantProps) {
  const i = theme.identity
  const compact = variant === 'compact'

  return (
    <section className={compact ? 'p-3' : 'relative py-20 px-4'}>
      <div className={`${compact ? '' : 'max-w-sm mx-auto'} text-center`}>
        <motion.p initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} transition={{ duration: 0.8 }} className="text-[10px] tracking-[0.3em] uppercase mb-4" style={{ color: i.textMuted }}>Accès</motion.p>
        <input type="text" placeholder="Code" className="w-full px-3 py-2 text-sm mb-3 outline-none border-b text-center" style={{ borderColor: i.primary, background: 'transparent', color: i.text }} />
        <button className="text-xs tracking-wider uppercase underline" style={{ color: i.primary }}>Entrer →</button>
      </div>
    </section>
  )
}

// ═══ GUEST ENVELOPE ════════════════════════════════════════════════════════
export function GuestEnvelope({ theme, variant }: VariantProps) {
  const i = theme.identity
  const compact = variant === 'compact'

  return (
    <section className={compact ? 'p-3' : 'relative py-20 px-4'}>
      <motion.div initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ type: 'spring', stiffness: 100 }} className={`${compact ? '' : 'max-w-md mx-auto'} relative rounded-sm p-6`} style={{ background: i.accent, boxShadow: '0 8px 30px rgba(0,0,0,0.15)' }}>
        <div className="text-center">
          <div className="inline-block mb-3 px-3 py-1 rounded-full text-[9px] tracking-wider uppercase" style={{ background: `${i.primary}20`, color: i.primary }}>Invitation</div>
          <h3 className="text-lg font-bold mb-2" style={{ color: i.text, fontFamily: `'${i.fontDisplay}'` }}>Votre invitation vous attend</h3>
          <input type="text" placeholder="Code d'accès" className="w-full px-4 py-2 rounded text-center text-sm mb-3 outline-none" style={{ background: i.surface, border: `1px solid ${i.primary}40`, color: i.text }} />
          <button className="w-full py-2 rounded text-sm font-semibold" style={{ background: i.primary, color: i.surface }}>Ouvrir</button>
        </div>
      </motion.div>
    </section>
  )
}
