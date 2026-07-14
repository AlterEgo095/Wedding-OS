'use client'

import { useState, useCallback, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { THEME_PACKAGES } from '@/lib/aenws/theme-packages'
import { CATEGORY_META, TIER_META, type ThemePackage } from '@/lib/aenws/theme-system'
import ThemeRenderer from './ThemeRenderer'
import { ChevronLeft, ChevronRight, Eye, ArrowRight, ArrowLeftRight, X } from 'lucide-react'

interface ThemeTheaterProps {
  onSelect: (theme: ThemePackage) => void
  onCompare: (theme: ThemePackage) => void
}

export default function ThemeTheater({ onSelect, onCompare }: ThemeTheaterProps) {
  // Support ?theme=slug to open directly on a specific theme
  const getInitialIndex = () => {
    if (typeof window === 'undefined') return 0
    const params = new URLSearchParams(window.location.search)
    const themeSlug = params.get('theme')
    if (themeSlug) {
      const idx = THEME_PACKAGES.findIndex((t) => t.slug === themeSlug)
      if (idx >= 0) return idx
    }
    return 0
  }
  const [index, setIndex] = useState(getInitialIndex)
  const [direction, setDirection] = useState(0)
  const [device, setDevice] = useState<'desktop' | 'tablet' | 'mobile'>('desktop')
  const [showComparator, setShowComparator] = useState(false)
  const [compareA, setCompareA] = useState(THEME_PACKAGES[0])
  const [compareB, setCompareB] = useState(THEME_PACKAGES[2])

  const currentTheme = THEME_PACKAGES[index]

  const goNext = useCallback(() => { setDirection(1); setIndex((p) => (p + 1) % THEME_PACKAGES.length) }, [])
  const goPrev = useCallback(() => { setDirection(-1); setIndex((p) => (p - 1 + THEME_PACKAGES.length) % THEME_PACKAGES.length) }, [])
  const goTo = useCallback((i: number) => { setDirection(i > index ? 1 : -1); setIndex(i) }, [index])

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') goNext()
      else if (e.key === 'ArrowLeft') goPrev()
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [goNext, goPrev])

  const [touchStart, setTouchStart] = useState<number | null>(null)
  const onTouchStart = (e: React.TouchEvent) => setTouchStart(e.touches[0].clientX)
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchStart === null) return
    const diff = touchStart - e.changedTouches[0].clientX
    if (Math.abs(diff) > 50) { diff > 0 ? goNext() : goPrev() }
    setTouchStart(null)
  }

  const variants = {
    enter: (dir: number) => ({ opacity: 0, scale: 1.05, x: dir > 0 ? 60 : -60 }),
    center: { opacity: 1, scale: 1, x: 0 },
    exit: (dir: number) => ({ opacity: 0, scale: 0.95, x: dir > 0 ? -60 : 60 }),
  }

  const deviceW = device === 'desktop' ? '100%' : device === 'tablet' ? '768px' : '375px'
  const deviceH = device === 'desktop' ? '65vh' : device === 'tablet' ? '90vh' : '60vh'

  return (
    <section className="relative min-h-screen flex flex-col bg-[#0a0a0a] overflow-hidden" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      {/* Header */}
      <div className="relative z-20 flex items-center justify-between px-6 py-4 border-b border-[#D4AF37]/15">
        <div className="flex items-center gap-3">
          <div>
            <h2 className="font-display text-lg font-bold gold-gradient">Showcase Theater</h2>
            <p className="text-[10px] tracking-[0.2em] uppercase text-white/40">12 thèmes · ← →</p>
          </div>
        </div>
        <div className="hidden md:flex items-center gap-1 p-1 rounded-full glass-card">
          {(['desktop', 'tablet', 'mobile'] as const).map((d) => (
            <button key={d} onClick={() => setDevice(d)} className={`px-3 py-1.5 rounded-full text-[10px] tracking-wider uppercase transition-colors ${device === d ? 'bg-[#D4AF37] text-[#0a0a0a] font-semibold' : 'text-white/50 hover:text-white/80'}`}>
              {d === 'desktop' ? 'Bureau' : d === 'tablet' ? 'Tablette' : 'Mobile'}
            </button>
          ))}
        </div>
        <div className="font-display text-sm text-white/60">
          <span className="gold-gradient font-bold">{String(index + 1).padStart(2, '0')}</span>
          <span className="mx-1">/</span>
          <span>{String(THEME_PACKAGES.length).padStart(2, '0')}</span>
        </div>
      </div>

      {/* Stage */}
      <div className="relative flex-1 flex items-center justify-center p-4 md:p-8 overflow-hidden">
        <button onClick={goPrev} className="absolute left-4 top-1/2 -translate-y-1/2 z-30 w-12 h-12 rounded-full glass-card flex items-center justify-center hover:bg-[#D4AF37]/20 transition-all hover:scale-110" aria-label="Précédent">
          <ChevronLeft className="w-5 h-5 text-[#D4AF37]" />
        </button>
        <button onClick={goNext} className="absolute right-4 top-1/2 -translate-y-1/2 z-30 w-12 h-12 rounded-full glass-card flex items-center justify-center hover:bg-[#D4AF37]/20 transition-all hover:scale-110" aria-label="Suivant">
          <ChevronRight className="w-5 h-5 text-[#D4AF37]" />
        </button>

        <div className="relative z-10 rounded-2xl overflow-hidden gold-border shadow-2xl shadow-black/60 transition-all duration-500" style={{ width: deviceW, maxWidth: '100%', height: deviceH, maxHeight: '75vh' }}>
          <AnimatePresence mode="wait" custom={direction}>
            <motion.div key={currentTheme.slug} custom={direction} variants={variants} initial="enter" animate="center" exit="exit" transition={{ opacity: { duration: 0.4 }, scale: { duration: 0.5 }, x: { duration: 0.4 } }} className="absolute inset-0 overflow-y-auto">
              {/* RENDU RÉEL DU THÈME — pas une carte factice */}
              <ThemeRenderer theme={currentTheme} variant="compact" />
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {/* Info panel */}
      <div className="relative z-20 px-6 pb-4">
        <AnimatePresence mode="wait">
          <motion.div key={currentTheme.slug} initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.3 }} className="max-w-4xl mx-auto">
            <div className="flex flex-wrap items-center justify-center gap-3 mb-2">
              <h3 className="font-display text-xl md:text-2xl font-bold text-[#FAF8F5]">{currentTheme.name}</h3>
              <span className="px-2 py-0.5 rounded-full text-[8px] font-bold tracking-wider uppercase border" style={{ color: CATEGORY_META[currentTheme.category].color, borderColor: `${CATEGORY_META[currentTheme.category].color}40`, background: `${CATEGORY_META[currentTheme.category].color}15` }}>
                {CATEGORY_META[currentTheme.category].label}
              </span>
              <span className="px-2 py-0.5 rounded-full text-[8px] font-bold tracking-wider uppercase border" style={{ color: TIER_META[currentTheme.tier].color, borderColor: `${TIER_META[currentTheme.tier].color}40`, background: `${TIER_META[currentTheme.tier].color}15` }}>
                {TIER_META[currentTheme.tier].label}
              </span>
              <span className="px-2 py-0.5 rounded-full text-[8px] font-bold tracking-wider uppercase border border-white/20 text-white/60">
                {currentTheme.demo.groomName} & {currentTheme.demo.brideName}
              </span>
            </div>
            <p className="text-center text-xs text-white/40 max-w-2xl mx-auto mb-3">{currentTheme.description}</p>
            <div className="flex flex-wrap items-center justify-center gap-2">
              <button onClick={() => onSelect(currentTheme)} className="btn-premium inline-flex items-center gap-1.5 px-4 py-2 rounded-xl gold-surface text-[#0a0a0a] text-[11px] font-semibold tracking-wide shadow-lg shadow-[#D4AF37]/20">
                <Eye className="w-3.5 h-3.5" /> Aperçu complet
              </button>
              <button onClick={() => { setCompareA(currentTheme); setShowComparator(true) }} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl glass-card gold-border text-[#FAF8F5] text-[11px] font-semibold hover:bg-[#D4AF37]/10 transition-all">
                <ArrowLeftRight className="w-3.5 h-3.5" /> Comparer
              </button>
              <button onClick={() => onSelect(currentTheme)} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-[#D4AF37]/30 text-[#D4AF37] text-[11px] font-semibold hover:bg-[#D4AF37]/10 transition-all">
                Choisir <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </motion.div>
        </AnimatePresence>

        {/* Dots */}
        <div className="flex items-center justify-center gap-1.5 mt-4">
          {THEME_PACKAGES.map((t, i) => (
            <button key={t.slug} onClick={() => goTo(i)} className={`transition-all rounded-full ${i === index ? 'w-6 h-1.5 gold-surface' : 'w-1.5 h-1.5 bg-white/20 hover:bg-white/40'}`} aria-label={t.name} />
          ))}
        </div>

        {/* Thumbnail strip */}
        <div className="hidden lg:flex items-center justify-center gap-1.5 mt-3 overflow-x-auto no-scrollbar max-w-3xl mx-auto">
          {THEME_PACKAGES.map((t, i) => (
            <button key={t.slug} onClick={() => goTo(i)} className={`shrink-0 px-2.5 py-1 rounded-md text-[9px] tracking-wider uppercase transition-all ${i === index ? 'bg-[#D4AF37]/20 text-[#D4AF37] border border-[#D4AF37]/40' : 'text-white/40 hover:text-white/70 border border-transparent'}`}>
              {t.name}
            </button>
          ))}
        </div>
      </div>

      {/* Comparator overlay */}
      <AnimatePresence>
        {showComparator && (
          <ComparatorOverlay themeA={compareA} themeB={compareB} onClose={() => setShowComparator(false)} onSwap={() => { setCompareA(compareB); setCompareB(compareA) }} setThemeA={setCompareA} setThemeB={setCompareB} />
        )}
      </AnimatePresence>
    </section>
  )
}

// ═══ Comparator Overlay ════════════════════════════════════════════════════
function ComparatorOverlay({ themeA, themeB, onClose, onSwap, setThemeA, setThemeB }: { themeA: ThemePackage; themeB: ThemePackage; onClose: () => void; onSwap: () => void; setThemeA: (t: ThemePackage) => void; setThemeB: (t: ThemePackage) => void }) {
  const [selSide, setSelSide] = useState<'A' | 'B' | null>(null)

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[150] bg-[#0a0a0a] flex flex-col">
      <div className="flex items-center justify-between px-6 py-4 border-b border-[#D4AF37]/15">
        <h2 className="font-display text-lg font-bold gold-gradient">Comparateur</h2>
        <div className="flex gap-2">
          <button onClick={onSwap} className="px-3 py-1.5 rounded-lg glass-card gold-border text-[10px] font-semibold text-[#FAF8F5] hover:bg-[#D4AF37]/10">Échanger</button>
          <button onClick={onClose} className="w-9 h-9 rounded-lg glass-card flex items-center justify-center hover:bg-red-500/20"><X className="w-4 h-4 text-[#FAF8F5]" /></button>
        </div>
      </div>
      <div className="relative flex-1 flex overflow-hidden">
        <div className="absolute top-0 bottom-0 left-1/2 -translate-x-1/2 w-px bg-[#D4AF37]/30 z-20" />
        <div className="relative flex-1 border-r border-[#D4AF37]/10">
          <button onClick={() => setSelSide('A')} className="absolute top-3 left-3 z-10 px-3 py-1.5 rounded-lg glass-card text-[10px] font-semibold text-[#FAF8F5]">
            <span className="text-[#D4AF37]">A:</span> {themeA.name}
          </button>
          <div className="absolute inset-0 overflow-y-auto">
            <ThemeRenderer theme={themeA} variant="compact" />
          </div>
        </div>
        <div className="relative flex-1">
          <button onClick={() => setSelSide('B')} className="absolute top-3 right-3 z-10 px-3 py-1.5 rounded-lg glass-card text-[10px] font-semibold text-[#FAF8F5]">
            <span className="text-[#D4AF37]">B:</span> {themeB.name}
          </button>
          <div className="absolute inset-0 overflow-y-auto">
            <ThemeRenderer theme={themeB} variant="compact" />
          </div>
        </div>
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-30">
          <div className="w-10 h-10 rounded-full glass-card gold-border flex items-center justify-center font-display text-xs font-bold gold-gradient">VS</div>
        </div>
      </div>

      {/* Theme selector */}
      <AnimatePresence>
        {selSide && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center p-6 z-50" onClick={() => setSelSide(null)}>
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }} className="glass-card rounded-2xl p-5 max-w-2xl w-full max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
              <h3 className="font-display text-base font-bold gold-gradient mb-3">Thème {selSide}</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {THEME_PACKAGES.map((t) => (
                  <button key={t.slug} onClick={() => { selSide === 'A' ? setThemeA(t) : setThemeB(t); setSelSide(null) }} className="p-2 rounded-lg text-left border transition-all hover:border-[#D4AF37]/40" style={{ borderColor: t.slug === (selSide === 'A' ? themeA.slug : themeB.slug) ? '#D4AF37' : 'rgba(255,255,255,0.1)' }}>
                    <div className="w-full h-10 rounded-md mb-1.5" style={{ background: t.identity.ambiance }} />
                    <p className="text-[10px] text-white/70">{t.name}</p>
                  </button>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
