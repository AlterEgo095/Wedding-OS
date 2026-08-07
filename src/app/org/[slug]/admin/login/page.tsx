'use client';

// ══════════════════════════════════════════════════════════════════════════════
// /org/[slug]/admin/login/page.tsx — Mission 6.0 P1.8 Org Login
// ══════════════════════════════════════════════════════════════════════════════
//
// Simple email + password form. POSTs to /api/org/login (a NEW endpoint that
// accepts ALL roles and returns a `redirectTo` hint based on the user's role).
//
// Behavior on success:
//   - The server sets the httpOnly auth_token + csrf_token cookies (same as
//     the platform login flow).
//   - The response body contains { user, csrfToken, redirectTo }.
//   - The client reads `redirectTo` and router.push()es to it.
//
// Behavior on 403 (wrong role):
//   - The login endpoint does NOT 403 (it accepts all roles). The only 403
//     path is if the user is ORG_* but trying to access an org they don't
//     belong to — but that's enforced later by the layout. So this form
//     only needs to handle 401 (bad credentials) and 429 (rate limit).
//
// The `error` query param (set by layout.tsx redirects) shows an inline
// banner explaining why the user was bounced here (org_role_required,
// org_mismatch, etc.).

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Building2, Mail, Lock, Loader2, ArrowLeft, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

export default function OrgLoginPage() {
  return (
    <Suspense fallback={null}>
      <OrgLoginForm />
    </Suspense>
  );
}

function OrgLoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorKind, setErrorKind] = useState<
    | 'credentials' // 401
    | 'rate' // 429
    | 'generic'
    | null
  >(null);
  const [errorMessage, setErrorMessage] = useState('');

  // ─── Inline banner from query param (set by layout.tsx redirects) ─────
  const errorCode = searchParams.get('error');
  const [bannerMessage, setBannerMessage] = useState<string | null>(null);
  useEffect(() => {
    if (errorCode === 'org_role_required') {
      setBannerMessage("Votre compte n'est pas rattaché à une organisation. Connectez-vous avec un compte organisation (ORG_ADMIN / ORG_MEMBER / ORG_VIEWER).");
    } else if (errorCode === 'org_mismatch') {
      setBannerMessage("Votre compte appartient à une autre organisation. Connectez-vous avec un compte de cette organisation.");
    } else if (errorCode === 'unauthorized') {
      setBannerMessage('Veuillez vous connecter pour accéder à cet espace.');
    } else {
      setBannerMessage(null);
    }
  }, [errorCode]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorKind(null);
    setErrorMessage('');

    try {
      const res = await fetch('/api/org/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json().catch(() => ({}));

      if (res.ok) {
        // Persist the user in localStorage for UI display (mirrors the
        // platform login flow).
        if (data.user) {
          try {
            localStorage.setItem('admin_user', JSON.stringify(data.user));
          } catch {
            /* ignore */
          }
        }
        toast.success(`Bienvenue, ${data.user?.name || 'Administrateur'} !`);
        // Use the server-provided redirect hint (always set for known roles).
        const target = typeof data.redirectTo === 'string' && data.redirectTo ? data.redirectTo : '/';
        router.push(target);
        return;
      }

      // Error path
      if (res.status === 401) {
        setErrorKind('credentials');
        setErrorMessage('Email ou mot de passe incorrect');
        toast.error('Email ou mot de passe incorrect');
      } else if (res.status === 429) {
        setErrorKind('rate');
        setErrorMessage('Trop de tentatives. Réessayez plus tard.');
        toast.error('Trop de tentatives. Réessayez plus tard.');
      } else {
        setErrorKind('generic');
        setErrorMessage(data.error || 'Erreur de connexion');
        toast.error(data.error || 'Erreur de connexion');
      }
    } catch {
      setErrorKind('generic');
      setErrorMessage('Erreur de connexion au serveur');
      toast.error('Erreur de connexion au serveur');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="flex items-center justify-center min-h-screen p-4"
      style={{
        background:
          'linear-gradient(135deg, oklch(0.12 0.02 270), oklch(0.16 0.02 270), oklch(0.14 0.02 240))',
      }}
    >
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        className="glass-card gold-border w-full max-w-md p-8 relative overflow-hidden"
      >
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-gold/40 to-transparent" />

        <div className="flex flex-col items-center mb-8">
          <motion.div
            initial={{ scale: 0, rotate: -10 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ delay: 0.15, type: 'spring', stiffness: 200 }}
            className="w-16 h-16 rounded-full bg-gradient-gold flex items-center justify-center mb-4 shadow-lg relative"
          >
            <Building2 className="w-8 h-8 text-white" />
            <div className="absolute -inset-1 rounded-full border border-gold/30 animate-pulse" />
          </motion.div>
          <h2 className="text-2xl font-bold gold-gradient font-display tracking-wide">
            Espace Organisation
          </h2>
          <p className="text-sm text-muted-foreground mt-1.5 text-center">
            Connectez-vous pour gérer vos mariages
          </p>
        </div>

        {bannerMessage && (
          <motion.div
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-4 text-sm text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-md p-3 flex items-start gap-2"
          >
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{bannerMessage}</span>
          </motion.div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="email" className="text-sm font-medium flex items-center gap-1.5">
              <Mail className="w-3.5 h-3.5" />
              Email
            </Label>
            <Input
              id="email"
              type="email"
              placeholder="vous@agence-mariage.fr"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="bg-white/5 border-white/10 focus:border-gold/50"
              required
              disabled={loading}
              autoComplete="email"
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password" className="text-sm font-medium flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5" />
              Mot de passe
            </Label>
            <Input
              id="password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="bg-white/5 border-white/10 focus:border-gold/50"
              required
              disabled={loading}
              autoComplete="current-password"
            />
          </div>

          {errorKind && (
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
            className="w-full bg-gradient-gold hover:opacity-90 text-white font-medium h-11 shadow-lg"
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Connexion…
              </>
            ) : (
              <>
                <Building2 className="mr-2 h-4 w-4" />
                Se connecter
              </>
            )}
          </Button>
        </form>

        <div className="mt-6 pt-6 border-t border-white/10 space-y-2 text-sm">
          <Link
            href="/platform/login"
            className="flex items-center justify-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Espace super-admin plateforme
          </Link>
          <Link
            href="/"
            className="flex items-center justify-center gap-1.5 text-muted-foreground/70 hover:text-foreground/80 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Retour à l&apos;accueil
          </Link>
        </div>
      </motion.div>
    </div>
  );
}
