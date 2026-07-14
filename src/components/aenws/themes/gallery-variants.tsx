'use client'

import { motion } from 'framer-motion'
import type { ThemePackage } from '@/lib/aenws/theme-system'

interface VariantProps {
  theme: ThemePackage
  variant: 'compact' | 'full'
}

const EASING = [0.25, 0.46, 0.45, 0.94] as const

// ═══ GALLERY MASONRY ═══════════════════════════════════════════════════════
export function GalleryMasonry({ theme, variant }: VariantProps) {
  const i = theme.identity
  const d = theme.demo
  const compact = variant === 'compact'
  const items = compact ? d.gallery.slice(0, 3) : d.gallery
  const heights = ['h-32', 'h-48', 'h-40', 'h-56', 'h-36']

  if (compact) {
    return (
      <div className="grid grid-cols-3 gap-1.5 p-2">
        {items.map((g, idx) => (
          <div key={g.id} className={`${heights[idx % heights.length]} rounded-lg flex items-center justify-center`} style={{ background: `${i.primary}20`, border: `1px solid ${i.primary}30` }}>
            <span className="text-[8px]" style={{ color: i.primary, fontFamily: `'${i.fontBody}'` }}>{g.caption}</span>
          </div>
        ))}
      </div>
    )
  }

  return (
    <section className="relative py-20 px-4">
      <motion.div initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.8, ease: EASING }} className="text-center mb-12 max-w-6xl mx-auto">
        <h2 className="text-3xl md:text-5xl font-bold mb-2" style={{ fontFamily: `'${i.fontDisplay}'`, color: i.primary }}>
          Galerie
        </h2>
        <p className="text-sm" style={{ color: i.textMuted, fontFamily: `'${i.fontBody}'` }}>Des instants gravés dans le temps</p>
      </motion.div>
      <div className="max-w-5xl mx-auto columns-2 md:columns-3 gap-4 space-y-4">
        {items.map((g, idx) => (
          <motion.div key={g.id} initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: idx * 0.08, duration: 0.6 }} className={`break-inside-avoid rounded-xl overflow-hidden ${heights[idx % heights.length]}`} style={{ border: `1px solid ${i.primary}30`, background: `${i.primary}15` }}>
            <div className="w-full h-full flex items-end p-3" style={{ background: `linear-gradient(to top, ${i.surfaceDeep}cc, transparent)` }}>
              <span className="text-xs" style={{ color: i.primary, fontFamily: `'${i.fontDisplay}'` }}>{g.caption}</span>
            </div>
          </motion.div>
        ))}
      </div>
    </section>
  )
}

// ═══ GALLERY GRID UNIFORM ═══════════════════════════════════════════════════
export function GalleryGrid({ theme, variant }: VariantProps) {
  const i = theme.identity
  const d = theme.demo
  const compact = variant === 'compact'
  const items = compact ? d.gallery.slice(0, 4) : d.gallery

  if (compact) {
    return (
      <div className="grid grid-cols-4 gap-1 p-2">
        {items.map((g) => (
          <div key={g.id} className="aspect-square rounded-md" style={{ background: `${i.primary}20`, border: `1px solid ${i.primary}30` }} />
        ))}
      </div>
    )
  }

  return (
    <section className="relative py-20 px-4">
      <motion.div initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.8 }} className="text-center mb-12">
        <h2 className="text-3xl md:text-5xl font-bold mb-2" style={{ fontFamily: `'${i.fontDisplay}'`, color: i.primary }}>Galerie</h2>
        <p className="text-sm" style={{ color: i.textMuted }}>Des instants gravés</p>
      </motion.div>
      <div className="max-w-4xl mx-auto grid grid-cols-2 md:grid-cols-3 gap-4">
        {items.map((g, idx) => (
          <motion.div key={g.id} initial={{ opacity: 0, scale: 0.9 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true }} transition={{ delay: idx * 0.1, duration: 0.6 }} className="aspect-square rounded-xl flex items-end p-4" style={{ border: `1px solid ${i.primary}30`, background: `${i.primary}15` }}>
            <span className="text-xs" style={{ color: i.primary, fontFamily: `'${i.fontDisplay}'` }}>{g.caption}</span>
          </motion.div>
        ))}
      </div>
    </section>
  )
}

// ═══ GALLERY CAROUSEL ══════════════════════════════════════════════════════
export function GalleryCarousel({ theme, variant }: VariantProps) {
  const i = theme.identity
  const d = theme.demo
  const compact = variant === 'compact'
  const items = compact ? d.gallery.slice(0, 3) : d.gallery

  return (
    <section className={compact ? 'p-2' : 'relative py-20 px-4'}>
      {!compact && (
        <motion.div initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.8 }} className="text-center mb-12">
          <h2 className="text-3xl md:text-5xl font-bold mb-2" style={{ fontFamily: `'${i.fontDisplay}'`, color: i.primary }}>Galerie</h2>
          <p className="text-sm" style={{ color: i.textMuted }}>Souvenirs en mouvement</p>
        </motion.div>
      )}
      <div className={`flex gap-3 overflow-x-auto no-scrollbar ${compact ? '' : 'max-w-5xl mx-auto pb-4'}`}>
        {items.map((g, idx) => (
          <div key={g.id} className={`shrink-0 rounded-xl flex items-end p-4 ${compact ? 'w-24 h-32' : 'w-72 h-80'}`} style={{ border: `1px solid ${i.primary}30`, background: `${i.primary}15` }}>
            <span className="text-xs" style={{ color: i.primary, fontFamily: `'${i.fontDisplay}'` }}>{g.caption}</span>
          </div>
        ))}
      </div>
    </section>
  )
}

// ═══ GALLERY POLAROID ══════════════════════════════════════════════════════
export function GalleryPolaroid({ theme, variant }: VariantProps) {
  const i = theme.identity
  const d = theme.demo
  const compact = variant === 'compact'
  const items = compact ? d.gallery.slice(0, 3) : d.gallery
  const rotations = ['-rotate-3', 'rotate-2', '-rotate-1', 'rotate-3']

  return (
    <section className={compact ? 'p-3' : 'relative py-20 px-4'}>
      {!compact && (
        <motion.div initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.8 }} className="text-center mb-12">
          <h2 className="text-3xl md:text-5xl font-bold mb-2" style={{ fontFamily: `'${i.fontDisplay}'`, color: i.primary }}>Galerie</h2>
          <p className="text-sm" style={{ color: i.textMuted }}>Souvenirs polaroïd</p>
        </motion.div>
      )}
      <div className={`flex flex-wrap justify-center gap-4 ${compact ? '' : 'max-w-4xl mx-auto'}`}>
        {items.map((g, idx) => (
          <motion.div key={g.id} initial={{ opacity: 0, y: 20, rotate: 0 }} whileInView={{ opacity: 1, y: 0, rotate: parseInt(rotations[idx % rotations.length]) }} viewport={{ once: true }} transition={{ delay: idx * 0.12, type: 'spring', stiffness: 100 }} className={`rounded-sm p-2 pb-8 ${compact ? 'w-20' : 'w-56'}`} style={{ background: i.accent, boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }}>
            <div className={`rounded-sm ${compact ? 'h-20' : 'h-48'}`} style={{ background: `${i.primary}30` }} />
            <p className="text-center text-[10px] mt-2" style={{ color: i.text, fontFamily: `'${i.fontBody}'` }}>{g.caption}</p>
          </motion.div>
        ))}
      </div>
    </section>
  )
}
