'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Lock, KeyRound, User, ArrowRight, Sparkles, ShieldCheck, Fingerprint } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

interface GuestAuthFormProps {
  onLogin: (code: string, firstName?: string, lastName?: string) => Promise<{ success: boolean; error?: string }>
  initialCode?: string
}

export default function GuestAuthForm({ onLogin, initialCode }: GuestAuthFormProps) {
  const [mode, setMode] = useState<'code' | 'full'>('code')
  const [code, setCode] = useState(initialCode || '')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!code.trim()) return

    setLoading(true)
    setError(null)

    const result = await onLogin(
      code.trim(),
      mode === 'full' ? firstName.trim() : undefined,
      mode === 'full' ? lastName.trim() : undefined
    )

    if (!result.success) {
      setError(result.error || 'Code invalide')
    }
    setLoading(false)
  }

  return (
    <section id="authentification" className="py-20 md:py-32 relative overflow-hidden">
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
          {/* Shield icon */}
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-gold/15 to-rose-gold/10 mb-6"
          >
            <ShieldCheck className="size-10 text-gold" />
          </motion.div>

          <h2 className="font-serif text-3xl md:text-5xl font-bold mb-4">
            <span className="gold-gradient">Votre Invitation Privée</span>
          </h2>
          <p className="font-display text-lg text-muted-foreground max-w-lg mx-auto leading-relaxed">
            Chaque invitation est unique et exclusive. Entrez votre code pour accéder à votre espace personnel sécurisé.
          </p>

          <div className="section-divider max-w-xs mx-auto mt-8">
            <span className="flourish text-sm">✦</span>
          </div>
        </motion.div>

        {/* Auth Card */}
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

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Code Input - Always visible */}
            <div className="space-y-2">
              <label className="text-sm font-display font-bold tracking-wide text-foreground/80 uppercase">
                Code d&apos;invitation
              </label>
              <div className="relative group">
                <KeyRound className="absolute left-4 top-1/2 -translate-y-1/2 size-5 text-gold/40 group-focus-within:text-gold transition-colors" />
                <Input
                  type="text"
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  placeholder="Ex: JH-2026-ABC"
                  className="pl-12 h-14 text-lg font-display tracking-wider uppercase glass-card gold-border rounded-xl focus:border-gold focus:ring-gold/30 text-center"
                  autoComplete="off"
                  autoFocus
                />
              </div>
            </div>

            {/* Toggle mode */}
            <AnimatePresence mode="wait">
              {mode === 'full' ? (
                <motion.div
                  key="full"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.3 }}
                  className="space-y-4 overflow-hidden"
                >
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-xs font-display font-bold tracking-wide text-foreground/60 uppercase">
                        Prénom
                      </label>
                      <div className="relative group">
                        <User className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-gold/40 group-focus-within:text-gold transition-colors" />
                        <Input
                          type="text"
                          value={firstName}
                          onChange={(e) => setFirstName(e.target.value)}
                          placeholder="Votre prénom"
                          className="pl-10 h-12 font-display glass-card rounded-xl focus:border-gold focus:ring-gold/30"
                          autoComplete="off"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-display font-bold tracking-wide text-foreground/60 uppercase">
                        Nom
                      </label>
                      <div className="relative group">
                        <User className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-gold/40 group-focus-within:text-gold transition-colors" />
                        <Input
                          type="text"
                          value={lastName}
                          onChange={(e) => setLastName(e.target.value)}
                          placeholder="Votre nom"
                          className="pl-10 h-12 font-display glass-card rounded-xl focus:border-gold focus:ring-gold/30"
                          autoComplete="off"
                        />
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setMode('code')}
                    className="text-xs font-display text-muted-foreground hover:text-foreground transition-colors underline underline-offset-2"
                  >
                    Se connecter avec le code uniquement
                  </button>
                </motion.div>
              ) : (
                <motion.div
                  key="code-only"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.3 }}
                  className="text-center"
                >
                  <button
                    type="button"
                    onClick={() => setMode('full')}
                    className="text-xs font-display text-muted-foreground hover:text-gold transition-colors inline-flex items-center gap-1.5"
                  >
                    <Fingerprint className="size-3.5" />
                    Ajouter ma verification d&apos;identité (nom + code)
                  </button>
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

            {/* Submit button */}
            <Button
              type="submit"
              disabled={loading || !code.trim()}
              className="w-full h-14 bg-gradient-to-r from-gold to-gold-dark hover:from-gold-dark hover:to-gold text-white shadow-xl shadow-gold/30 hover:shadow-2xl hover:shadow-gold/40 transition-all duration-300 rounded-xl font-display tracking-wide text-base font-bold"
            >
              {loading ? (
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                  className="size-5 border-2 border-white/30 border-t-white rounded-full"
                />
              ) : (
                <>
                  <Sparkles className="size-5 mr-2" />
                  Accéder à mon invitation
                  <ArrowRight className="size-5 ml-2" />
                </>
              )}
            </Button>
          </form>

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
              <Fingerprint className="size-3 text-gold/40" />
              <span className="text-[10px] font-display tracking-wide text-muted-foreground/50 uppercase">Personnel</span>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  )
}
