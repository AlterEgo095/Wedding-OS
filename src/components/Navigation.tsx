'use client'

import { useState, useEffect, useSyncExternalStore } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useTheme } from 'next-themes'
import { Sun, Moon, Menu } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { NavUnderline } from '@/components/ui/nav-underline'

const navLinks = [
  { href: '#accueil', label: 'Accueil' },
  { href: '#histoire', label: 'Notre Histoire' },
  { href: '#programme', label: 'Programme' },
  { href: '#lieu', label: 'Lieu' },
  { href: '#recherche', label: 'Recherche' },
]

/**
 * Derive a short monogram from the couple names (e.g. "Josué" + "Hornella"
 * → "J & H"). Falls back to "M" (Mariage) when names aren't configured so
 * we don't leak "J & H" (the default wedding's initials) into other
 * weddings' navigation.
 */
function buildMonogram(groom: string, bride: string): string {
  const g = groom.trim()
  const b = bride.trim()
  if (g && b) return `${g.charAt(0).toUpperCase()} & ${b.charAt(0).toUpperCase()}`
  if (g) return g.charAt(0).toUpperCase()
  if (b) return b.charAt(0).toUpperCase()
  return 'M'
}

export default function Navigation() {
  const [scrolled, setScrolled] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  // Couple-derived monogram + date from settings (avoids hardcoding
  // "J & H" and "Vendredi 26 Juin 2026"). The default wedding resolves
  // to "J & H" / "Vendredi 26 Juin 2026" via /api/settings (zero regression).
  const [monogram, setMonogram] = useState<string>('M')
  const [dateDisplay, setDateDisplay] = useState<string>('')
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  )
  const { theme, setTheme } = useTheme()

  useEffect(() => {
    fetch('/api/settings')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        const s = data?.settings
        if (s && typeof s === 'object') {
          setMonogram(buildMonogram(s.groom_name || '', s.bride_name || ''))
          if (s.site_subtitle) setDateDisplay(s.site_subtitle)
        }
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 50)
    }
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  const handleNavClick = (href: string) => {
    setMobileOpen(false)
    const el = document.querySelector(href)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' })
    }
  }

  return (
    <>
      <motion.nav
        initial={{ y: -100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.8, ease: "easeOut" }}
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${
          scrolled
            ? 'glass border-b border-gold/10 shadow-lg shadow-black/5'
            : 'bg-transparent'
        }`}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16 md:h-20">
            {/* Logo */}
            <a
              href="#accueil"
              onClick={(e) => {
                e.preventDefault()
                handleNavClick('#accueil')
              }}
              className="flex items-center gap-2"
            >
              <span className="font-serif text-xl md:text-2xl font-bold gold-gradient">
                {monogram}
              </span>
            </a>

            {/* Desktop Navigation */}
            <div className="hidden md:flex items-center gap-1">
              {navLinks.map((link) => (
                // Phase 3D #8 — NavUnderline replaces the inline `link-elegant`
                // <a> tag. The component renders a Next.js <Link> with an
                // animated ::after underline that grows from left→right on
                // hover (and is locked at 100% width when `active`). It also
                // handles prefers-reduced-motion internally (instant width
                // change, no transition). The onClick is forwarded so the
                // existing smooth-scroll behaviour is preserved.
                <NavUnderline
                  key={link.href}
                  href={link.href}
                  onClick={(e) => {
                    e.preventDefault()
                    handleNavClick(link.href)
                  }}
                >
                  {link.label}
                </NavUnderline>
              ))}

              {/* Theme Toggle */}
              {mounted && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                  className="ml-2 text-foreground/70 hover:text-foreground"
                  aria-label="Basculer le thème"
                >
                  <AnimatePresence mode="wait" initial={false}>
                    {theme === 'dark' ? (
                      <motion.div
                        key="sun"
                        initial={{ rotate: -90, scale: 0 }}
                        animate={{ rotate: 0, scale: 1 }}
                        exit={{ rotate: 90, scale: 0 }}
                        transition={{ duration: 0.2 }}
                      >
                        <Sun className="size-4" />
                      </motion.div>
                    ) : (
                      <motion.div
                        key="moon"
                        initial={{ rotate: 90, scale: 0 }}
                        animate={{ rotate: 0, scale: 1 }}
                        exit={{ rotate: -90, scale: 0 }}
                        transition={{ duration: 0.2 }}
                      >
                        <Moon className="size-4" />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </Button>
              )}
            </div>

            {/* Mobile Menu Button */}
            <div className="flex md:hidden items-center gap-2">
              {mounted && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                  className="text-foreground/70 hover:text-foreground"
                  aria-label="Basculer le thème"
                >
                  {theme === 'dark' ? (
                    <Sun className="size-4" />
                  ) : (
                    <Moon className="size-4" />
                  )}
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setMobileOpen(true)}
                className="h-11 w-11 text-foreground/70 hover:text-foreground"
                aria-label="Ouvrir le menu"
              >
                <Menu className="size-5" />
              </Button>
            </div>
          </div>
        </div>
      </motion.nav>

      {/* Mobile Sheet */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-80 glass-card border-gold/10">
          <SheetHeader>
            <SheetTitle className="font-serif text-2xl gold-gradient text-left">
              {monogram}
            </SheetTitle>
          </SheetHeader>
          <nav className="flex flex-col gap-2 mt-8">
            {navLinks.map((link, i) => (
              <motion.a
                key={link.href}
                href={link.href}
                onClick={(e) => {
                  e.preventDefault()
                  handleNavClick(link.href)
                }}
                initial={{ x: -20, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ delay: i * 0.08, duration: 0.3 }}
                className="px-4 py-3 text-lg font-display tracking-wide text-foreground/80 hover:text-foreground hover:bg-gold/5 rounded-lg transition-colors"
              >
                {link.label}
              </motion.a>
            ))}
          </nav>
          <div className="mt-auto pt-8 border-t border-gold/10">
            {dateDisplay && (
              <p className="text-sm text-muted-foreground text-center font-display">
                {dateDisplay}
              </p>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}
