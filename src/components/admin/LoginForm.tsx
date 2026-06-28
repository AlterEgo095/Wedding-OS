'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Crown, Mail, Lock, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

interface LoginFormProps {
  onLogin: (token: string, user: { id: string; email: string; name: string; role: string }) => void
}

/**
 * Detect the current wedding slug from the URL path.
 * Returns null on root `/` (legacy /admin SPA served at root, default wedding).
 * Returns the slug on `/w/[slug]/...` routes (per-wedding admin).
 *
 * The slug is sent as `X-Wedding-Slug` header on the login POST so the
 * backend can scope the login attempt to the correct wedding — this is
 * important for per-wedding admin logins at `/w/[slug]/admin/login`.
 */
function getWeddingSlug(): string | null {
  if (typeof window === 'undefined') return null
  const match = window.location.pathname.match(/^\/w\/([a-z0-9-]+)/i)
  return match?.[1] ?? null
}

export default function LoginForm({ onLogin }: LoginFormProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const weddingSlug = getWeddingSlug()
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      // Scope the login to the per-wedding admin context when on /w/[slug]/admin/login.
      // On root /admin (legacy SPA), no header is sent — the default wedding is served.
      if (weddingSlug) {
        headers['X-Wedding-Slug'] = weddingSlug
      }

      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers,
        body: JSON.stringify({ email, password }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Erreur de connexion')
        toast.error(data.error || 'Erreur de connexion')
        return
      }

      localStorage.setItem('admin_token', data.token)
      localStorage.setItem('admin_user', JSON.stringify(data.user))
      toast.success(`Bienvenue, ${data.user.name} !`)
      onLogin(data.token, data.user)
    } catch {
      setError('Erreur de connexion au serveur')
      toast.error('Erreur de connexion au serveur')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex items-center justify-center min-h-full p-4">
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        className="glass-card gold-border w-full max-w-md p-8"
      >
        {/* Header */}
        <div className="flex flex-col items-center mb-8">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
            className="w-16 h-16 rounded-full bg-gradient-gold flex items-center justify-center mb-4 shadow-lg"
          >
            <Crown className="w-8 h-8 text-white" />
          </motion.div>
          <h2 className="text-2xl font-bold gold-gradient">Administration</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Connectez-vous pour accéder au panneau
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
                placeholder="admin@wedding.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="pl-10 bg-white/5 border-white/10 focus:border-gold/50"
                required
                disabled={loading}
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
              />
            </div>
          </div>

          {error && (
            <motion.p
              initial={{ opacity: 0, y: -5 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-sm text-red-400 bg-red-400/10 rounded-md p-2 text-center"
            >
              {error}
            </motion.p>
          )}

          <Button
            type="submit"
            disabled={loading}
            className="w-full bg-gradient-gold hover:opacity-90 text-white font-medium h-11 shadow-lg"
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Connexion...
              </>
            ) : (
              'Se connecter'
            )}
          </Button>
        </form>

        {/* Footer */}
        <p className="text-xs text-center text-muted-foreground mt-6">
          Panneau d&apos;administration — Accès réservé
        </p>
      </motion.div>
    </div>
  )
}
