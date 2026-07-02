'use client'

import { useState } from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Crown, Mail, Loader2, ArrowLeft, CheckCircle2, AlertCircle, Copy } from 'lucide-react'
import { toast } from 'sonner'

/**
 * P1-SEC-9: Forgot-password page.
 *
 * Submits `{ email }` to /api/platform/password-reset/request. The API:
 *   - Always returns 200 (even if the email doesn't exist — prevents
 *     user-enumeration).
 *   - In dev/demo (NODE_ENV !== 'production'), the response includes
 *     `resetUrl` and `mailtoLink` so the developer can complete the flow
 *     manually.
 *   - In production, only a generic "if the account exists, an email has
 *     been sent" message is returned (email sending is P3).
 *
 * After submit, we show:
 *   - In dev/demo: the reset URL (with a "copy" button) + the mailto link.
 *   - In production: just the generic success message.
 */
export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [resetUrl, setResetUrl] = useState<string | null>(null)
  const [mailtoLink, setMailtoLink] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      const res = await fetch('/api/platform/password-reset/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email }),
      })

      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        toast.error(data.error || 'Erreur lors de la demande')
        return
      }

      setSubmitted(true)
      // Dev/demo only — production responses don't include these fields.
      if (data.resetUrl) setResetUrl(data.resetUrl)
      if (data.mailtoLink) setMailtoLink(data.mailtoLink)
      toast.success('Demande envoyée')
    } catch {
      toast.error('Erreur de connexion au serveur')
    } finally {
      setLoading(false)
    }
  }

  const copyToClipboard = (text: string) => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(text).then(
        () => toast.success('Lien copié'),
        () => toast.error('Échec de la copie')
      )
    }
  }

  return (
    <div className="flex items-center justify-center min-h-screen p-4">
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        className="glass-card gold-border w-full max-w-md p-8 relative overflow-hidden"
      >
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-gold/40 to-transparent" />

        <div className="flex flex-col items-center mb-8">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.15, type: 'spring', stiffness: 200 }}
            className="w-16 h-16 rounded-full bg-gradient-gold flex items-center justify-center mb-4 shadow-lg"
          >
            <Crown className="w-8 h-8 text-white" />
          </motion.div>
          <h2 className="text-2xl font-bold gold-gradient font-display tracking-wide">
            Mot de passe oublié
          </h2>
          <p className="text-sm text-muted-foreground mt-1.5 text-center">
            {submitted
              ? 'Votre demande a été traitée.'
              : 'Entrez votre email pour recevoir un lien de réinitialisation.'}
          </p>
        </div>

        {!submitted ? (
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm font-medium">
                Email
              </Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  placeholder="admin@heureux-mariage.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pl-10 bg-white/5 border-white/10 focus:border-gold/50"
                  required
                  disabled={loading}
                  autoComplete="email"
                  autoFocus
                />
              </div>
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-gold hover:opacity-90 text-white font-medium h-11 shadow-lg"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Envoi...
                </>
              ) : (
                'Envoyer le lien'
              )}
            </Button>
          </form>
        ) : (
          <div className="space-y-4">
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-md border border-emerald-500/30 bg-emerald-500/10 p-4"
            >
              <div className="flex items-start gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-400 mt-0.5 shrink-0" />
                <div className="flex-1 text-sm text-emerald-100">
                  <p className="font-medium mb-1">Demande traitée</p>
                  <p className="text-xs leading-relaxed">
                    Si un compte existe pour <strong>{email}</strong>, un lien de
                    réinitialisation a été généré. Le lien expire dans 1 heure.
                  </p>
                </div>
              </div>
            </motion.div>

            {/* Dev/demo: show the reset URL + mailto link so the developer
                can complete the flow without an email integration. In
                production, these fields are not returned by the API. */}
            {resetUrl && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="rounded-md border border-amber-500/30 bg-amber-500/10 p-4 space-y-2"
              >
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
                  <p className="text-xs font-medium text-amber-100">
                    Mode développement — lien de réinitialisation
                  </p>
                </div>
                <p className="text-[11px] text-amber-200/80 leading-relaxed">
                  En production, ce lien serait envoyé par email. En dev, copiez-le
                  et ouvrez-le dans votre navigateur.
                </p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-[10px] bg-stone-900/50 px-2 py-1.5 rounded truncate text-amber-100">
                    {resetUrl.length > 60 ? `${resetUrl.slice(0, 60)}…` : resetUrl}
                  </code>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => copyToClipboard(resetUrl)}
                    className="h-8 px-2 shrink-0"
                  >
                    <Copy className="w-3 h-3 mr-1" />
                    Copier
                  </Button>
                </div>
                <Link
                  href={resetUrl}
                  className="inline-flex items-center justify-center w-full text-xs font-medium text-gold hover:text-gold-light transition-colors py-2"
                >
                  Ouvrir le lien →
                </Link>
              </motion.div>
            )}

            {mailtoLink && (
              <a
                href={mailtoLink}
                className="block text-center text-xs text-muted-foreground hover:text-foreground underline-offset-4 hover:underline transition-colors"
              >
                Ou envoyer l&apos;email manuellement via votre client mail
              </a>
            )}
          </div>
        )}

        <div className="mt-6 pt-6 border-t border-white/5">
          <Link
            href="/platform/login"
            className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-3 h-3" />
            Retour à la connexion
          </Link>
        </div>
      </motion.div>
    </div>
  )
}
