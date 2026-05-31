'use client'

import { useState, useEffect } from 'react'
import { Download, X } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export default function PWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [showBanner, setShowBanner] = useState(false)

  useEffect(() => {
    // Register service worker
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {})
    }

    // Listen for install prompt
    const handler = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
      // Show banner after a delay for better UX
      setTimeout(() => setShowBanner(true), 3000)
    }

    window.addEventListener('beforeinstallprompt', handler)

    // Check if already installed
    window.addEventListener('appinstalled', () => {
      setDeferredPrompt(null)
      setShowBanner(false)
    })

    return () => {
      window.removeEventListener('beforeinstallprompt', handler)
    }
  }, [])

  const handleInstall = async () => {
    if (!deferredPrompt) return
    await deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    if (outcome === 'accepted') {
      setDeferredPrompt(null)
      setShowBanner(false)
    }
  }

  return (
    <AnimatePresence>
      {showBanner && deferredPrompt && (
        <motion.div
          initial={{ opacity: 0, y: 80 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 80 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="fixed bottom-20 left-4 right-4 sm:left-auto sm:right-6 sm:w-auto sm:max-w-sm z-50"
        >
          <div className="glass-card gold-border p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-gold to-gold-dark flex items-center justify-center shrink-0 shadow-lg shadow-gold/20">
              <Download className="size-5 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-display text-sm font-bold text-foreground truncate">
                Installer l&apos;application
              </p>
              <p className="text-xs text-muted-foreground truncate">
                Accès rapide, hors-ligne, expérience native
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={handleInstall}
                className="px-3 py-1.5 rounded-full bg-gradient-to-r from-gold to-gold-dark text-white text-xs font-display font-bold tracking-wide shadow-md shadow-gold/20 hover:shadow-lg hover:shadow-gold/30 transition-all"
              >
                Installer
              </button>
              <button
                onClick={() => setShowBanner(false)}
                className="p-1 rounded-full hover:bg-foreground/5 transition-colors"
                aria-label="Fermer"
              >
                <X className="size-4 text-muted-foreground" />
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
