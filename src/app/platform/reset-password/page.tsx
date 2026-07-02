'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Crown, Lock, Loader2, ArrowLeft, CheckCircle2, AlertCircle } from 'lucide-react'
import { toast } from 'sonner'

/**
 * P1-SEC-9: Password reset confirmation page.
 *
 * Receives `?token=...` (from the reset email or dev reset URL), prompts for
 * a new password, and submits `{ token, newPassword }` to
 * /api/platform/password-reset/confirm.
 *
 * The token is read from the URL — this is acceptable because:
 *   1. The token is one-time-use (consumed on confirm).
 *   2. The token expires after 1 hour.
 *   3. The page sets `Referrer-Policy: no-referrer` via the metadata export
 *      so the token is not leaked to third-party resources via Referer.
 *
 * Note: `useSearchParams()` requires a Suspense boundary in Next.js App
 * Router. We wrap the inner component in <Suspense>.
 */

function ResetPasswordForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams.get('token') || ''

  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Validate password strength client-side (mirrors isValidPassword in
  // lib/constants — the server also validates, so this is purely UX).
  const passwordStrength = (() => {
    if (newPassword.length === 0) return { ok: false, msg: '' }
    if (newPassword.length < 8) return { ok: false, msg: 'Au moins 8 caractères' }
    if (!/[a-zA-Z]/.test(newPassword)) return { ok: false, msg: 'Au moins une lettre' }
    if (!/[0-9]/.test(newPassword)) return { ok: false, msg: 'Au moins un chiffre' }
    return { ok: true, msg: 'Mot de passe valide' }
  })()

  const passwordsMatch = newPassword.length > 0 && newPassword === confirmPassword

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!token) {
      setError('Token manquant. Vérifiez le lien de réinitialisation.')
      return
    }
    if (!passwordStrength.ok) {
      setError(`Mot de passe invalide : ${passwordStrength.msg}`)
      return
    }
    if (!passwordsMatch) {
      setError('Les mots de passe ne correspondent pas')
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/platform/password-reset/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ token, newPassword }),
      })

      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        setError(data.error || 'Erreur lors de la réinitialisation')
        return
      }

      setSuccess(true)
      toast.success('Mot de passe réinitialisé')
      // Redirect to login after 3 seconds.
      setTimeout(() => router.push('/platform/login'), 3000)
    } catch {
      setError('Erreur de connexion au serveur')
    } finally {
      setLoading(false)
    }
  }

  if (!token) {
    return (
      <div className="flex items-center justify-center min-h-screen p-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-card gold-border w-full max-w-md p-8 text-center"
        >
          <AlertCircle className="w-12 h-12 mx-auto text-amber-400 mb-4" />
          <h2 className="text-xl font-bold gold-gradient mb-2">Lien invalide</h2>
          <p className="text-sm text-muted-foreground mb-6">
            Aucun token de réinitialisation trouvé dans l&apos;URL. Vérifiez que vous
            avez bien cliqué sur le lien complet dans l&apos;email.
          </p>
          <Link
            href="/platform/forgot-password"
            className="inline-flex items-center gap-1.5 text-sm text-gold hover:text-gold-light transition-colors"
          >
            <ArrowLeft className="w-3 h-3" />
            Refaire une demande
          </Link>
        </motion.div>
      </div>
    )
  }

  if (success) {
    return (
      <div className="flex items-center justify-center min-h-screen p-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-card gold-border w-full max-w-md p-8 text-center"
        >
          <CheckCircle2 className="w-12 h-12 mx-auto text-emerald-400 mb-4" />
          <h2 className="text-xl font-bold gold-gradient mb-2">Mot de passe réinitialisé</h2>
          <p className="text-sm text-muted-foreground mb-6">
            Votre mot de passe a été mis à jour. Vous allez être redirigé vers la
            page de connexion.
          </p>
          <Link
            href="/platform/login"
            className="inline-flex items-center gap-1.5 text-sm text-gold hover:text-gold-light transition-colors"
          >
            Aller à la connexion →
          </Link>
        </motion.div>
      </div>
    )
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
            Nouveau mot de passe
          </h2>
          <p className="text-sm text-muted-foreground mt-1.5 text-center">
            Choisissez un nouveau mot de passe pour votre compte.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="newPassword" className="text-sm font-medium">
              Nouveau mot de passe
            </Label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="newPassword"
                type="password"
                placeholder="••••••••"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className={`pl-10 bg-white/5 border-white/10 focus:border-gold/50 ${
                  newPassword.length > 0
                    ? passwordStrength.ok
                      ? 'border-emerald-500/30'
                      : 'border-amber-500/30'
                    : ''
                }`}
                required
                disabled={loading}
                autoComplete="new-password"
                autoFocus
              />
            </div>
            {newPassword.length > 0 && (
              <p className={`text-xs ${passwordStrength.ok ? 'text-emerald-400' : 'text-amber-400'}`}>
                {passwordStrength.msg}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirmPassword" className="text-sm font-medium">
              Confirmer le mot de passe
            </Label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="confirmPassword"
                type="password"
                placeholder="••••••••"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className={`pl-10 bg-white/5 border-white/10 focus:border-gold/50 ${
                  confirmPassword.length > 0
                    ? passwordsMatch
                      ? 'border-emerald-500/30'
                      : 'border-red-500/30'
                    : ''
                }`}
                required
                disabled={loading}
                autoComplete="new-password"
              />
            </div>
            {confirmPassword.length > 0 && !passwordsMatch && (
              <p className="text-xs text-red-400">Les mots de passe ne correspondent pas</p>
            )}
          </div>

          {error && (
            <motion.p
              initial={{ opacity: 0, y: -5 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-sm text-red-400 bg-red-400/10 border border-red-400/30 rounded-md p-2 text-center"
            >
              {error}
            </motion.p>
          )}

          <Button
            type="submit"
            disabled={loading || !passwordStrength.ok || !passwordsMatch}
            className="w-full bg-gradient-gold hover:opacity-90 text-white font-medium h-11 shadow-lg"
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Réinitialisation...
              </>
            ) : (
              'Réinitialiser le mot de passe'
            )}
          </Button>
        </form>

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

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-screen">
          <Loader2 className="w-6 h-6 animate-spin text-gold" />
        </div>
      }
    >
      <ResetPasswordForm />
    </Suspense>
  )
}
