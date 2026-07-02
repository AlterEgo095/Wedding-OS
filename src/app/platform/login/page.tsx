'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Crown, Shield, Mail, Lock, Loader2, ArrowLeft, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'

/**
 * Platform super-admin login.
 *
 * POSTs credentials to /api/platform/login. On success the API returns
 * `{ user, token }` AND sets an httpOnly `auth_token` cookie (so server-side
 * requests in subsequent SSR passes are authenticated too). We mirror the
 * token + user in localStorage for the client-side admin shell which uses
 * `Authorization: Bearer <token>` headers.
 *
 * The endpoint returns 403 if the user is not PLATFORM_ADMIN — we surface a
 * clear message and offer a link back to the legacy wedding admin at /admin.
 */
export default function PlatformLoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [errorKind, setErrorKind] = useState<
    | 'forbidden'   // 403 — not a platform admin
    | 'credentials' // 401
    | 'rate'        // 429
    | 'generic'
    | null
  >(null)
  const [errorMessage, setErrorMessage] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setErrorKind(null)
    setErrorMessage('')

    try {
      const res = await fetch('/api/platform/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })

      const data = await res.json().catch(() => ({}))

      if (res.ok) {
        localStorage.setItem('admin_token', data.token)
        localStorage.setItem('admin_user', JSON.stringify(data.user))
        toast.success(`Bienvenue, ${data.user?.name || 'Administrateur'} !`)
        router.push('/platform/admin')
        return
      }

      // Error path
      if (res.status === 403) {
        setErrorKind('forbidden')
        setErrorMessage(
          data.error ||
            "Votre compte n'a pas les permissions plateforme. Seuls les PLATFORM_ADMIN peuvent accéder."
        )
      } else if (res.status === 401) {
        setErrorKind('credentials')
        setErrorMessage('Email ou mot de passe incorrect')
        toast.error('Email ou mot de passe incorrect')
      } else if (res.status === 429) {
        setErrorKind('rate')
        setErrorMessage('Trop de tentatives. Réessayez plus tard.')
        toast.error('Trop de tentatives. Réessayez plus tard.')
      } else {
        setErrorKind('generic')
        setErrorMessage(data.error || 'Erreur de connexion')
        toast.error(data.error || 'Erreur de connexion')
      }
    } catch {
      setErrorKind('generic')
      setErrorMessage('Erreur de connexion au serveur')
      toast.error('Erreur de connexion au serveur')
    } finally {
      setLoading(false)
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
        {/* Decorative top flourish */}
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-gold/40 to-transparent" />

        {/* Header */}
        <div className="flex flex-col items-center mb-8">
          <motion.div
            initial={{ scale: 0, rotate: -10 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ delay: 0.15, type: 'spring', stiffness: 200 }}
            className="w-16 h-16 rounded-full bg-gradient-gold flex items-center justify-center mb-4 shadow-lg relative"
          >
            <Crown className="w-8 h-8 text-white" />
            <div className="absolute -inset-1 rounded-full border border-gold/30 animate-pulse" />
          </motion.div>
          <h2 className="text-2xl font-bold gold-gradient font-display tracking-wide">
            Administration Plateforme
          </h2>
          <p className="text-sm text-muted-foreground mt-1.5 text-center">
            Accès réservé aux administrateurs de la plateforme
          </p>
        </div>

        {/* Form */}
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
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="password" className="text-sm font-medium">
              Mot de passe
            </Label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="pl-10 bg-white/5 border-white/10 focus:border-gold/50"
                required
                disabled={loading}
                autoComplete="current-password"
              />
            </div>
          </div>

          {/* Error / forbidden notice */}
          {errorKind === 'forbidden' && (
            <motion.div
              initial={{ opacity: 0, y: -5 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3"
            >
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
                <div className="flex-1 text-sm text-amber-200">
                  <p className="font-medium mb-1">Accès refusé</p>
                  <p className="text-xs leading-relaxed">{errorMessage}</p>
                  <Link
                    href="/admin"
                    className="inline-flex items-center gap-1 mt-2 text-xs font-medium text-gold hover:text-gold-light transition-colors"
                  >
                    <ArrowLeft className="w-3 h-3" />
                    Aller à l&apos;administration mariage
                  </Link>
                </div>
              </div>
            </motion.div>
          )}

          {errorKind && errorKind !== 'forbidden' && (
            <motion.p
              initial={{ opacity: 0, y: -5 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-sm text-red-400 bg-red-400/10 border border-red-400/30 rounded-md p-2 text-center"
            >
              {errorMessage}
            </motion.p>
          )}

          <Button
            type="submit"
            disabled={loading}
            aria-describedby="platform-login-submit-status"
            className="w-full bg-gradient-gold hover:opacity-90 text-white font-medium h-11 shadow-lg"
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Connexion...
              </>
            ) : (
              <>
                <Shield className="mr-2 h-4 w-4" />
                Accès plateforme
              </>
            )}
          </Button>
          {/* P1-UX-8: screen-reader-only status explaining why the submit button
              is disabled (during submission). Sighted users see the inline
              spinner + "Connexion..." label; non-sighted users get the same
              context via aria-describedby. */}
          <span id="platform-login-submit-status" className="sr-only">
            {loading
              ? 'Connexion en cours, veuillez patienter.'
              : 'Bouton de connexion disponible.'}
          </span>
        </form>

        {/* P1-UX-10: password-reset / account-recovery link. The full
            self-service reset flow (P1-SEC-9) is deferred to P3 — for now the
            link opens a pre-filled mailto so the support team can verify
            identity and reset manually. */}
        <div className="mt-4 text-center">
          <a
            href="mailto:contact@heureux-mariage.com?subject=R%C3%A9initialisation%20mot%20de%20passe"
            className="text-sm text-muted-foreground hover:text-foreground underline-offset-4 hover:underline transition-colors"
          >
            Mot de passe oublié ?
          </a>
        </div>

        {/* Footer */}
        <div className="mt-6 pt-6 border-t border-white/5">
          <Link
            href="/"
            className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-3 h-3" />
            Retour au site
          </Link>
        </div>
      </motion.div>
    </div>
  )
}
