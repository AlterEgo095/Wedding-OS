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

const navLinks = [
  { href: '#accueil', label: 'Accueil' },
  { href: '#histoire', label: 'Notre Histoire' },
  { href: '#programme', label: 'Programme' },
  { href: '#lieu', label: 'Lieu' },
  { href: '#recherche', label: 'Recherche' },
]

export default function Navigation() {
  const [scrolled, setScrolled] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  )
  const { theme, setTheme } = useTheme()

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
        transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
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
                J & H
              </span>
            </a>

            {/* Desktop Navigation */}
            <div className="hidden md:flex items-center gap-1">
              {navLinks.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  onClick={(e) => {
                    e.preventDefault()
                    handleNavClick(link.href)
                  }}
                  className="link-elegant px-4 py-2 text-sm font-medium text-foreground/80 hover:text-foreground transition-colors font-display tracking-wide"
                >
                  {link.label}
                </a>
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
                className="text-foreground/70 hover:text-foreground"
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
              A & B
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
            <p className="text-sm text-muted-foreground text-center font-display">
              Vendredi 26 Juin 2026
            </p>
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}
