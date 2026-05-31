'use client'

import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { User, ArrowRight, Sparkles, ShieldCheck, Lock, Heart, Loader2, Search, CheckCircle2, MailOpen, Crown } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { cleanGuestName } from '@/lib/guest-utils'

interface LookupResult {
  name: string
  firstName: string
  lastName: string
  isCouple?: boolean
  greeting?: string
  table: string | null
  seats: number
  category: string
  lookupToken: string
}

interface GuestAuthFormProps {
  onLoginByLookupToken: (lookupToken: string) => Promise<{ success: boolean; error?: string }>
  onLoginWithLinkToken: (token: string) => Promise<{ success: boolean; error?: string }>
  initialInviteToken?: string
}

/**
 * GuestAuthForm — Premium Invitation Search
 * 
 * Cinematic search experience with elegant animations.
 * User types name → Results appear → Select → Auto-auth → Envelope reveal
 */
export default function GuestAuthForm({ onLoginByLookupToken, onLoginWithLinkToken, initialInviteToken }: GuestAuthFormProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [lookupResults, setLookupResults] = useState<LookupResult[]>([])
  const [selectedLookup, setSelectedLookup] = useState<LookupResult | null>(null)
  const [lookupLoading, setLookupLoading] = useState(false)
  const [authLoading, setAuthLoading] = useState(false)
  const [showAutoAuth, setShowAutoAuth] = useState(!!initialInviteToken)
  const [error, setError] = useState<string | null>(null)
  const [autoAuthDone, setAutoAuthDone] = useState(false)

  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const sectionRef = useRef<HTMLElement>(null)

  // Auto-authenticate with invite token from URL
  useEffect(() => {
    if (initialInviteToken && !autoAuthDone) {
      setAutoAuthDone(true)
      onLoginWithLinkToken(initialInviteToken)
        .then((result) => {
          if (!result.success) {
            setError(result.error || 'Lien d\'invitation invalide')
          }
          setShowAutoAuth(false)
        })
        .catch(() => {
          setError('Erreur de connexion au serveur')
          setShowAutoAuth(false)
        })
    }
  }, [initialInviteToken, onLoginWithLinkToken, autoAuthDone])

  // Debounced name search
  useEffect(() => {
    setError(null)

    if (searchQuery.trim().length < 2) {
      setLookupResults([])
      return
    }

    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current)
    }

    searchTimeoutRef.current = setTimeout(async () => {
      setLookupLoading(true)
      try {
        const res = await fetch(`/api/guest/lookup?q=${encodeURIComponent(searchQuery.trim())}`)
        const data = await res.json()
        if (res.ok) {
          setLookupResults(data.results || [])
        } else if (res.status === 403 && data?.searchLocked) {
          setError('Vous êtes déjà connecté à votre espace personnel.')
        } else if (!res.ok) {
          setError(data?.error || 'Erreur lors de la recherche. Veuillez réessayer.')
        }
      } catch {
        setError('Erreur de connexion au serveur. Veuillez réessayer.')
      } finally {
        setLookupLoading(false)
      }
    }, 300)

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current)
      }
    }
  }, [searchQuery])

  // Auto-authenticate when user selects their name
  const handleLookupSelect = async (result: LookupResult) => {
    setSelectedLookup(result)
    setAuthLoading(true)
    setError(null)

    try {
      const authResult = await onLoginByLookupToken(result.lookupToken)
      if (!authResult.success) {
        setError(authResult.error || 'Impossible d\'accéder à votre invitation')
        setSelectedLookup(null)
      }
    } catch {
      setError('Erreur de connexion au serveur')
      setSelectedLookup(null)
    } finally {
      setAuthLoading(false)
    }
  }

  // If auto-authenticating from invite link
  if (showAutoAuth) {
    return (
      <section id="authentification" className="py-20 md:py-32 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-background via-champagne/5 to-background" />
        <div className="max-w-2xl mx-auto px-4 sm:px-6 relative z-10">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="glass-card gold-border rounded-2xl p-10 text-center"
          >
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 1.2, repeat: Infinity, ease: 'linear' }}
              className="inline-block mb-6"
            >
              <div className="w-12 h-12 border-[3px] border-gold/20 border-t-gold rounded-full" />
            </motion.div>
            <p className="font-display text-lg text-foreground/80">
              Accès à votre invitation en cours...
            </p>
            <p className="text-sm text-muted-foreground mt-2">
              Vérification de votre lien sécurisé
            </p>
          </motion.div>
        </div>
      </section>
    )
  }

  return (
    <section ref={sectionRef} id="authentification" className="py-20 md:py-32 relative overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 bg-gradient-to-br from-background via-champagne/5 to-background" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,oklch(0.68_0.12_85/0.04),transparent_60%)]" />

      {/* Floating particles */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <motion.div
          animate={{ y: [-10, 10, -10], opacity: [0.1, 0.3, 0.1] }}
          transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute top-1/4 left-[15%] w-2 h-2 rounded-full bg-gold/15"
        />
        <motion.div
          animate={{ y: [10, -10, 10], opacity: [0.08, 0.2, 0.08] }}
          transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut', delay: 1 }}
          className="absolute top-1/3 right-[20%] w-1.5 h-1.5 rounded-full bg-rose-gold/15"
        />
      </div>

      <div className="max-w-2xl mx-auto px-4 sm:px-6 relative z-10">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8 }}
          className="text-center mb-12"
        >
          {/* Icon */}
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-gold/15 to-rose-gold/10 mb-6"
          >
            <MailOpen className="size-10 text-gold" />
          </motion.div>

          <h2 className="font-serif text-3xl md:text-5xl font-bold mb-4">
            <span className="gold-gradient">Trouver Mon Invitation</span>
          </h2>
          <p className="font-display text-lg text-muted-foreground max-w-lg mx-auto leading-relaxed">
            Entrez votre nom pour retrouver votre invitation personnelle
          </p>

          <div className="section-divider max-w-xs mx-auto mt-8">
            <span className="flourish text-sm">✦</span>
          </div>
        </motion.div>

        {/* Search Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8, delay: 0.3 }}
          className="glass-card gold-border rounded-2xl p-6 sm:p-8 md:p-10"
        >
          {/* Security badge */}
          <div className="flex items-center justify-center gap-2 mb-8">
            <Lock className="size-3.5 text-gold/60" />
            <span className="text-[10px] font-display tracking-[0.3em] uppercase text-gold/60 font-bold">
              Espace Sécurisé
            </span>
            <Lock className="size-3.5 text-gold/60" />
          </div>

          <div className="space-y-6">
            <AnimatePresence mode="wait">
              {selectedLookup && authLoading ? (
                /* ═══ Authenticating state ═══ */
                <motion.div
                  key="authenticating"
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.98 }}
                  className="text-center py-8 space-y-4"
                >
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1.2, repeat: Infinity, ease: 'linear' }}
                    className="inline-block"
                  >
                    <div className="w-14 h-14 border-[3px] border-gold/20 border-t-gold rounded-full" />
                  </motion.div>
                  <div>
                    <p className="font-serif text-xl font-bold gold-gradient">
                      {cleanGuestName(selectedLookup.firstName, selectedLookup.lastName).displayName}
                    </p>
                    <p className="font-display text-sm text-muted-foreground mt-2">
                      Ouverture de votre invitation...
                    </p>
                  </div>
                </motion.div>
              ) : (
                /* ═══ Search state ═══ */
                <motion.div
                  key="search"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.3 }}
                  className="space-y-5"
                >
                  {/* Name Search */}
                  <div className="space-y-2">
                    <label className="text-sm font-display font-bold tracking-wide text-foreground/80 uppercase">
                      Nom et prénom
                    </label>
                    <div className="relative group">
                      <Search className="absolute left-4 top-1/2 -translate-y-1/2 size-5 text-gold/40 group-focus-within:text-gold transition-colors" />
                      <Input
                        ref={inputRef}
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Entrez votre nom pour retrouver votre invitation"
                        className="pl-12 h-14 text-lg font-display glass-card gold-border rounded-xl focus:border-gold focus:ring-gold/30"
                        autoComplete="off"
                        autoFocus
                      />
                      {lookupLoading && (
                        <Loader2 className="absolute right-4 top-1/2 -translate-y-1/2 size-5 text-gold/40 animate-spin" />
                      )}
                    </div>
                  </div>

                  {/* Search Results */}
                  <AnimatePresence>
                    {lookupResults.length > 0 && (
                      <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="space-y-2"
                      >
                        <p className="text-xs text-muted-foreground font-display">
                          {lookupResults.length} résultat{lookupResults.length > 1 ? 's' : ''} trouvé{lookupResults.length > 1 ? 's' : ''} — Sélectionnez votre nom :
                        </p>
                        <div className="max-h-64 overflow-y-auto custom-scrollbar space-y-1.5">
                          {lookupResults.map((result, index) => (
                            <motion.button
                              key={result.lookupToken}
                              type="button"
                              onClick={() => handleLookupSelect(result)}
                              disabled={authLoading}
                              initial={{ opacity: 0, x: -10 }}
                              animate={{ opacity: 1, x: 0 }}
                              transition={{ delay: index * 0.05 }}
                              className="w-full text-left p-4 rounded-xl glass-card hover:bg-gold/[0.08] border border-gold/10 hover:border-gold/25 transition-all duration-200 group"
                            >
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-gold/15 to-rose-gold/10 flex items-center justify-center shrink-0">
                                    <Crown className="size-4 text-gold/60" />
                                  </div>
                                  <div>
                                    <p className="font-medium text-sm text-foreground group-hover:text-gold transition-colors">
                                      {result.name}
                                    </p>
                                    {result.table && (
                                      <p className="text-xs text-muted-foreground mt-0.5">
                                        {result.table} • {result.seats} place{result.seats > 1 ? 's' : ''}
                                      </p>
                                    )}
                                    {result.isCouple && (
                                      <span className="inline-flex items-center gap-1 mt-0.5 text-[9px] font-display tracking-wider uppercase text-gold/50 font-semibold">
                                        <Heart className="size-2.5" /> Couple
                                      </span>
                                    )}
                                  </div>
                                </div>
                                <ArrowRight className="size-4 text-gold/30 group-hover:text-gold group-hover:translate-x-1 transition-all duration-200" />
                              </div>
                            </motion.button>
                          ))}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* No results */}
                  <AnimatePresence>
                    {searchQuery.trim().length >= 2 && !lookupLoading && lookupResults.length === 0 && (
                      <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="text-center py-4"
                      >
                        <div className="flourish text-3xl mb-2">✉</div>
                        <p className="text-sm text-muted-foreground font-display">
                          Aucun invité trouvé pour &laquo; {searchQuery} &raquo;
                        </p>
                        <p className="text-xs text-muted-foreground/60 mt-1">
                          Essayez avec une autre orthographe ou une partie de votre nom
                        </p>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Error message */}
            <AnimatePresence>
              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="p-3 rounded-xl bg-red-500/10 border border-red-500/20"
                >
                  <p className="text-sm font-display text-red-500 text-center">{error}</p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Trust indicators */}
          <div className="flex items-center justify-center gap-4 mt-8 pt-6 border-t border-gold/10">
            <div className="flex items-center gap-1.5">
              <Lock className="size-3 text-gold/40" />
              <span className="text-[10px] font-display tracking-wide text-muted-foreground/50 uppercase">Chiffré</span>
            </div>
            <div className="w-1 h-1 rounded-full bg-gold/20" />
            <div className="flex items-center gap-1.5">
              <ShieldCheck className="size-3 text-gold/40" />
              <span className="text-[10px] font-display tracking-wide text-muted-foreground/50 uppercase">Privé</span>
            </div>
            <div className="w-1 h-1 rounded-full bg-gold/20" />
            <div className="flex items-center gap-1.5">
              <Heart className="size-3 text-gold/40" />
              <span className="text-[10px] font-display tracking-wide text-muted-foreground/50 uppercase">Personnel</span>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  )
}
