// ══════════════════════════════════════════════════════════════════════════════
// /w/[slug]/admin/login/page.tsx — Phase 3 Per-Wedding Admin Login
// ══════════════════════════════════════════════════════════════════════════════
// Branded login page for wedding organizers. Sends X-Wedding-Slug header so the
// /api/admin/login endpoint (updated in Task 3-C) can verify the user belongs to
// this wedding (or is PLATFORM_ADMIN).
//
// UX:
//   - Luxury dark gradient background with gold glow
//   - Glass card with gold border, framer-motion entrance
//   - Specific error messages for 401 / 403 / 429
//   - On success → httpOnly auth cookie is set by the API (P1-SEC-3); we just
//     cache `admin_user` in localStorage for UI display, push to /w/{slug}/admin

'use client';

import { useState, FormEvent, useMemo } from 'react';
import Link from 'next/link';
import { useRouter, useParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Crown, Mail, Lock, Loader2, ArrowLeft, AlertCircle, KeyRound } from 'lucide-react';
import { toast } from 'sonner';
import TwoFactorLogin from '@/components/auth/TwoFactorLogin';
import { useWedding } from '../../wedding-context';

/** Fallback display label built from the URL slug (e.g. "josue-hornella" → "Josue & Hornella"). */
function formatSlugAsLabel(slug: string): string {
  return slug
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' & ');
}

type ErrorKind = 'invalid' | 'forbidden' | 'rate' | 'generic';

export default function PerWeddingLoginPage() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug;
  const router = useRouter();
  const wedding = useWedding();

  // coupleLabel comes from the WeddingContextProvider in /w/[slug]/layout.tsx.
  // Fallback: format the slug nicely.
  const coupleLabel = useMemo(
    () => wedding.coupleLabel || formatSlugAsLabel(slug),
    [wedding.coupleLabel, slug]
  );

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorKind, setErrorKind] = useState<ErrorKind | null>(null);
  const [errorMessage, setErrorMessage] = useState('');

  // ── P4.7 2FA flow state ─────────────────────────────────────────────
  // If /api/admin/login returns requiresTwoFactor, we transition to the
  // 2FA step and delegate to <TwoFactorLogin> (which POSTs to
  // /api/auth/2fa/login — the generic 2FA endpoint that works for ALL
  // admin/staff roles).
  const [twoFactorRequired, setTwoFactorRequired] = useState(false);
  const [challengeToken, setChallengeToken] = useState('');
  const [twoFactorEmail, setTwoFactorEmail] = useState('');
  const [twoFactorName, setTwoFactorName] = useState('');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setErrorKind(null);
    setErrorMessage('');

    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Wedding-Slug': slug,
        },
        credentials: 'include', // P1-SEC-3: send + receive httpOnly auth cookie.
        body: JSON.stringify({ email, password }),
      });

      // Allow empty-body responses to fail gracefully
      const data = await res.json().catch(() => ({} as { error?: string; token?: string; user?: unknown; requiresTwoFactor?: boolean; challengeToken?: string; email?: string; name?: string }));

      // ── P4.7: 2FA branch — if the user has 2FA enabled, /api/admin/login
      // returns { requiresTwoFactor: true, challengeToken, email, name }
      // instead of setting the auth cookie. Transition to the 2FA step.
      if (res.ok && data.requiresTwoFactor) {
        setChallengeToken(data.challengeToken || '');
        setTwoFactorEmail(data.email || email);
        setTwoFactorName(data.name || '');
        setTwoFactorRequired(true);
        setLoading(false);
        return;
      }

      if (!res.ok) {
        if (res.status === 401) {
          setErrorKind('invalid');
          setErrorMessage('Email ou mot de passe incorrect');
          toast.error('Email ou mot de passe incorrect');
        } else if (res.status === 403) {
          setErrorKind('forbidden');
          setErrorMessage("Vous n'avez pas accès à ce mariage");
          toast.error("Vous n'avez pas accès à ce mariage");
        } else if (res.status === 429) {
          setErrorKind('rate');
          setErrorMessage('Trop de tentatives. Réessayez dans 15 minutes.');
          toast.error('Trop de tentatives. Réessayez dans 15 minutes.');
        } else {
          setErrorKind('generic');
          setErrorMessage(data.error || 'Erreur de connexion');
          toast.error(data.error || 'Erreur de connexion');
        }
        return;
      }

      // Success — P1-SEC-3: NO `admin_token` localStorage write. The httpOnly
      // cookie set by the server is the secure auth path. We keep `admin_user`
      // for UI display only.
      try {
        localStorage.setItem('admin_user', JSON.stringify(data.user));
      } catch {
        /* ignore — localStorage may be unavailable */
      }
      const userName = (data.user as { name?: string } | undefined)?.name || '';
      toast.success(`Bienvenue${userName ? `, ${userName}` : ''} !`);
      router.push(`/w/${slug}/admin`);
    } catch {
      setErrorKind('generic');
      setErrorMessage('Erreur de connexion au serveur');
      toast.error('Erreur de connexion au serveur');
    } finally {
      setLoading(false);
    }
  }

  // ── P4.7: 2FA success handler ───────────────────────────────────────
  // Called by <TwoFactorLogin> after /api/auth/2fa/login succeeds.
  // We persist the user in localStorage (UI display only) and redirect to
  // /w/{slug}/admin — the per-wedding admin dashboard.
  function handle2FASuccess(user: { id: string; name: string; email: string; role: string }) {
    try {
      localStorage.setItem('admin_user', JSON.stringify(user));
    } catch {
      /* ignore — localStorage may be unavailable */
    }
    toast.success(`Bienvenue, ${user?.name || 'Administrateur'} !`);
    router.push(`/w/${slug}/admin`);
  }

  // ── P4.7: 2FA step UI ───────────────────────────────────────────────
  // Replaces the email/password form when the user has 2FA enabled.
  if (twoFactorRequired) {
    return (
      <div
        className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden"
        style={{
          background:
            'linear-gradient(135deg, oklch(0.12 0.02 270), oklch(0.16 0.02 270), oklch(0.14 0.02 240))',
        }}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'radial-gradient(ellipse 60% 50% at 50% 30%, oklch(0.55 0.10 80 / 0.18), transparent 70%)',
          }}
        />
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
          className="glass-card gold-border w-full max-w-md p-8 relative z-10"
        >
          <div className="flex flex-col items-center mb-6 text-center">
            <motion.div
              initial={{ scale: 0, rotate: -20 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ delay: 0.15, type: 'spring', stiffness: 200, damping: 15 }}
              className="w-16 h-16 rounded-full bg-gradient-gold flex items-center justify-center mb-4 shadow-lg"
            >
              <KeyRound className="w-8 h-8 text-white" />
            </motion.div>
            <p className="text-[11px] uppercase tracking-[0.25em] text-muted-foreground mb-1">
              Vérification 2FA
            </p>
            <h1 className="font-serif text-2xl gold-gradient font-display">{coupleLabel}</h1>
            <p className="text-sm text-muted-foreground mt-2">
              Saisissez le code à 6 chiffres pour finaliser la connexion
            </p>
          </div>

          <TwoFactorLogin
            challengeToken={challengeToken}
            email={twoFactorEmail}
            name={twoFactorName}
            onSuccess={handle2FASuccess}
            onCancel={() => {
              setTwoFactorRequired(false);
              setChallengeToken('');
              setErrorKind(null);
              setErrorMessage('');
            }}
          />

          <div className="mt-6 pt-6 border-t border-white/10 text-center">
            <button
              type="button"
              onClick={() => {
                setTwoFactorRequired(false);
                setChallengeToken('');
                setErrorKind(null);
                setErrorMessage('');
              }}
              className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Revenir à la connexion
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden"
      style={{
        background:
          'linear-gradient(135deg, oklch(0.12 0.02 270), oklch(0.16 0.02 270), oklch(0.14 0.02 240))',
      }}
    >
      {/* Decorative gold glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 60% 50% at 50% 30%, oklch(0.55 0.10 80 / 0.18), transparent 70%)',
        }}
      />

      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        className="glass-card gold-border w-full max-w-md p-8 relative z-10"
      >
        {/* Header */}
        <div className="flex flex-col items-center mb-8 text-center">
          <motion.div
            initial={{ scale: 0, rotate: -20 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ delay: 0.15, type: 'spring', stiffness: 200, damping: 15 }}
            className="w-16 h-16 rounded-full bg-gradient-gold flex items-center justify-center mb-4 shadow-lg"
          >
            <Crown className="w-8 h-8 text-white" />
          </motion.div>
          <p className="text-[11px] uppercase tracking-[0.25em] text-muted-foreground mb-1">
            Espace administrateur
          </p>
          <h1 className="font-serif text-3xl gold-gradient font-display">{coupleLabel}</h1>
          <p className="text-sm text-muted-foreground mt-2">
            Connectez-vous pour gérer ce mariage
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
                placeholder="admin@mariage.com"
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

          {errorKind && (
            <motion.div
              initial={{ opacity: 0, y: -5 }}
              animate={{ opacity: 1, y: 0 }}
              className={`rounded-md p-3 text-sm flex items-start gap-2 ${
                errorKind === 'forbidden'
                  ? 'bg-amber-400/10 text-amber-300 border border-amber-400/30'
                  : 'bg-red-400/10 text-red-400 border border-red-400/30'
              }`}
            >
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <div className="flex-1">
                <p>{errorMessage}</p>
                {errorKind === 'forbidden' && (
                  <Link
                    href={`/w/${slug}`}
                    className="inline-flex items-center gap-1 mt-1 underline hover:text-amber-200"
                  >
                    <ArrowLeft className="w-3 h-3" />
                    Retour à l&apos;invitation
                  </Link>
                )}
              </div>
            </motion.div>
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
        <div className="mt-6 pt-6 border-t border-white/10 text-center">
          <Link
            href={`/w/${slug}`}
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Retour à l&apos;invitation
          </Link>
        </div>
      </motion.div>
    </div>
  );
}
