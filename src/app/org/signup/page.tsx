// ══════════════════════════════════════════════════════════════════════════════
// src/app/org/signup/page.tsx — Mission 6.0 P1.9 — Organization Onboarding Wizard
// ══════════════════════════════════════════════════════════════════════════════
//
// 4-step public wizard that creates a brand-new Organization + first ORG_ADMIN
// user + (optional) first Wedding in a single POST /api/org/signup call.
//
// Steps:
//   1. Votre compte       — name, email, password (creates the ORG_ADMIN user)
//   2. Votre organisation — name, slug (auto-generated, editable), email,
//                            phone, plan selection (TRIAL/ESSENTIEL/PREMIUM/ELITE)
//   3. Premier mariage    — bride/groom names OR couple label, date, venue
//                            (optional — "Passer pour l'instant" link)
//   4. Inviter l'équipe   — up to 3 (email + role) pairs
//                            (optional — informational only, no email sent)
//   5. Succès             — confirmation + "Aller au tableau de bord" CTA
//
// UI:
//   - Framer Motion AnimatePresence for step transitions.
//   - shadcn Card / Input / Label / Button / Select / Progress / Badge.
//   - French throughout, mobile-first responsive (1 col mobile / 2 col desktop).
//   - Trust signals: "Aucune carte requise", "Annulez à tout moment", lock icon.
//   - Inline field errors + sonner toast for API errors.
//   - Loading spinner on the submit button.
//
// POST /api/org/signup returns { user, organization, wedding } on 201 and sets
// the auth_token + csrf_token cookies. On success we redirect to
// /org/[orgSlug]/admin (the P1.8 org dashboard). If P1.8 isn't deployed yet,
// the redirect will land on a 404 — but at that point the user is authenticated
// and the platform admin can manually route them.
//
// Slug uniqueness is pre-checked via GET /api/org/signup?check=slug&value=...
// with a 500ms debounce while the user types.

'use client';

import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronRight,
  Building2,
  CalendarHeart,
  Mail,
  ShieldCheck,
  SkipForward,
  Sparkles,
  User,
  Users,
  Lock,
  PartyPopper,
  Loader2,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

// ─── Types ────────────────────────────────────────────────────────────────────

type Plan = 'TRIAL' | 'ESSENTIEL' | 'PREMIUM' | 'ELITE';
type MemberRole = 'ORG_MEMBER' | 'ORG_VIEWER';
type StepId = 1 | 2 | 3 | 4 | 5;

interface Invite {
  email: string;
  role: MemberRole;
}

interface FormData {
  // Step 1
  userName: string;
  userEmail: string;
  password: string;
  confirmPassword: string;
  // Step 2
  orgName: string;
  orgSlug: string;
  orgSlugTouched: boolean; // true if the user manually edited the slug
  orgEmail: string;
  orgPhone: string;
  orgPlan: Plan;
  // Step 3 (optional)
  skipWedding: boolean;
  brideName: string;
  groomName: string;
  coupleLabel: string;
  weddingDate: string; // yyyy-mm-dd
  venueName: string;
  venueCity: string;
  // Step 4 (optional)
  skipInvites: boolean;
  invites: Invite[];
}

const INITIAL_DATA: FormData = {
  userName: '',
  userEmail: '',
  password: '',
  confirmPassword: '',
  orgName: '',
  orgSlug: '',
  orgSlugTouched: false,
  orgEmail: '',
  orgPhone: '',
  orgPlan: 'TRIAL',
  skipWedding: false,
  brideName: '',
  groomName: '',
  coupleLabel: '',
  weddingDate: '',
  venueName: '',
  venueCity: '',
  skipInvites: false,
  invites: [{ email: '', role: 'ORG_MEMBER' }, { email: '', role: 'ORG_MEMBER' }, { email: '', role: 'ORG_MEMBER' }],
};

// ─── Plan metadata (must match src/lib/types.ts PLAN_METADATA) ────────────────
const PLANS: Array<{
  id: Plan;
  label: string;
  priceFcfa: number;
  priceUsd: number;
  maxWeddings: number | string;
  maxMembers: number;
  highlight?: boolean;
}> = [
  { id: 'TRIAL', label: 'Essai Libre', priceFcfa: 0, priceUsd: 0, maxWeddings: 1, maxMembers: 3 },
  { id: 'ESSENTIEL', label: 'Essentiel', priceFcfa: 30_000, priceUsd: 49, maxWeddings: 3, maxMembers: 5 },
  { id: 'PREMIUM', label: 'Premium', priceFcfa: 60_000, priceUsd: 99, maxWeddings: 10, maxMembers: 10, highlight: true },
  { id: 'ELITE', label: 'Élite', priceFcfa: 120_000, priceUsd: 199, maxWeddings: 'Illimités', maxMembers: 50 },
];

const SLUG_REGEX = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function formatFcfa(n: number): string {
  if (n === 0) return 'Gratuit';
  return `${n.toLocaleString('fr-FR')} FCFA`;
}

function formatUsd(n: number): string {
  if (n === 0) return '';
  return `$${n}/mois`;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function OrgSignupWizard() {
  const router = useRouter();
  const [step, setStep] = useState<StepId>(1);
  const [data, setData] = useState<FormData>(INITIAL_DATA);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [slugCheck, setSlugCheck] = useState<{ loading: boolean; available: boolean | null; reason: string | null }>({
    loading: false,
    available: null,
    reason: null,
  });
  const [emailCheck, setEmailCheck] = useState<{ loading: boolean; available: boolean | null }>({
    loading: false,
    available: null,
  });
  const [successData, setSuccessData] = useState<{
    orgSlug: string;
    orgName: string;
    userName: string;
    hasWedding: boolean;
  } | null>(null);

  const slugAbort = useRef<AbortController | null>(null);
  const emailAbort = useRef<AbortController | null>(null);

  // ─── Field update helper ────────────────────────────────────────────────────
  const setField = useCallback(<K extends keyof FormData>(key: K, value: FormData[K]) => {
    setData((d) => ({ ...d, [key]: value }));
    // clear field error on edit
    setErrors((e) => {
      if (!e[key as string]) return e;
      const next = { ...e };
      delete next[key as string];
      return next;
    });
  }, []);

  // ─── Auto-generate slug from org name (until user edits slug manually) ──────
  useEffect(() => {
    if (data.orgSlugTouched) return;
    setField('orgSlug', slugify(data.orgName));
  }, [data.orgName, data.orgSlugTouched, setField]);

  // ─── Debounced slug availability check ──────────────────────────────────────
  useEffect(() => {
    if (step !== 2) return;
    const slug = data.orgSlug.trim().toLowerCase();
    if (!slug || !SLUG_REGEX.test(slug)) {
      setSlugCheck({ loading: false, available: null, reason: null });
      return;
    }
    slugAbort.current?.abort();
    const ctrl = new AbortController();
    slugAbort.current = ctrl;
    setSlugCheck({ loading: true, available: null, reason: null });
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/org/signup?check=slug&value=${encodeURIComponent(slug)}`, {
          signal: ctrl.signal,
        });
        if (!res.ok) return;
        const json = (await res.json()) as { available: boolean; reason?: string };
        setSlugCheck({ loading: false, available: json.available, reason: json.reason ?? null });
      } catch {
        // network/abort — leave loading=false, available=null (don't block)
        if (!ctrl.signal.aborted) {
          setSlugCheck({ loading: false, available: null, reason: null });
        }
      }
    }, 500);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [data.orgSlug, step]);

  // ─── Debounced account-email availability check ─────────────────────────────
  useEffect(() => {
    if (step !== 1) return;
    const email = data.userEmail.trim().toLowerCase();
    if (!email || !EMAIL_REGEX.test(email)) {
      setEmailCheck({ loading: false, available: null });
      return;
    }
    emailAbort.current?.abort();
    const ctrl = new AbortController();
    emailAbort.current = ctrl;
    setEmailCheck({ loading: true, available: null });
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/org/signup?check=email&value=${encodeURIComponent(email)}`, {
          signal: ctrl.signal,
        });
        if (!res.ok) return;
        const json = (await res.json()) as { available: boolean };
        setEmailCheck({ loading: false, available: json.available });
      } catch {
        if (!ctrl.signal.aborted) {
          setEmailCheck({ loading: false, available: null });
        }
      }
    }, 500);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [data.userEmail, step]);

  // ─── Step validation ─────────────────────────────────────────────────────────
  const validateStep = useCallback((s: StepId): boolean => {
    const e: Record<string, string> = {};

    if (s === 1) {
      if (!data.userName.trim()) e.userName = 'Le nom est requis';
      else if (data.userName.trim().length > 100) e.userName = 'Le nom est trop long';
      if (!data.userEmail.trim()) e.userEmail = 'L\'email est requis';
      else if (!EMAIL_REGEX.test(data.userEmail.trim().toLowerCase())) e.userEmail = 'Email invalide';
      else if (emailCheck.available === false) e.userEmail = 'Cet email est déjà utilisé';
      if (!data.password) e.password = 'Le mot de passe est requis';
      else if (data.password.length < 8) e.password = 'Min. 8 caractères';
      else if (!/[a-zA-Z]/.test(data.password) || !/[0-9]/.test(data.password))
        e.password = 'Doit contenir une lettre et un chiffre';
      if (data.confirmPassword !== data.password) e.confirmPassword = 'Les mots de passe ne correspondent pas';
    }

    if (s === 2) {
      if (!data.orgName.trim()) e.orgName = 'Le nom est requis';
      else if (data.orgName.trim().length > 120) e.orgName = 'Nom trop long';
      if (!data.orgSlug.trim()) e.orgSlug = 'Le slug est requis';
      else if (!SLUG_REGEX.test(data.orgSlug)) e.orgSlug = 'Minuscules + tirets (ex: agence-mariage)';
      else if (slugCheck.available === false) e.orgSlug = 'Ce slug est déjà pris';
      if (!data.orgEmail.trim()) e.orgEmail = 'L\'email de l\'organisation est requis';
      else if (!EMAIL_REGEX.test(data.orgEmail.trim().toLowerCase())) e.orgEmail = 'Email invalide';
      else if (emailCheck.available === false && data.orgEmail.trim().toLowerCase() === data.userEmail.trim().toLowerCase()) {
        // already covered by userEmail check
      }
      if (data.orgPhone && data.orgPhone.length > 40) e.orgPhone = 'Trop long';
    }

    if (s === 3 && !data.skipWedding) {
      const hasAny = !!(data.brideName || data.groomName || data.coupleLabel || data.weddingDate || data.venueName || data.venueCity);
      if (hasAny) {
        if (!data.coupleLabel && !data.brideName && !data.groomName) {
          e.coupleLabel = 'Renseignez au moins un nom ou le label du couple';
        }
      }
      if (data.weddingDate) {
        const d = new Date(data.weddingDate + 'T12:00:00Z');
        if (isNaN(d.getTime())) e.weddingDate = 'Date invalide';
      }
    }

    setErrors(e);
    return Object.keys(e).length === 0;
  }, [data, slugCheck.available, emailCheck.available]);

  // ─── Step navigation ───────────────────────────────────────────────────────
  const next = useCallback(() => {
    if (!validateStep(step)) {
      toast.error('Veuillez corriger les erreurs avant de continuer');
      return;
    }
    setStep((s) => (s < 5 ? ((s + 1) as StepId) : s));
  }, [step, validateStep]);

  const back = useCallback(() => {
    setStep((s) => (s > 1 ? ((s - 1) as StepId) : s));
  }, []);

  const skipStep = useCallback(() => {
    if (step === 3) {
      setField('skipWedding', true);
    } else if (step === 4) {
      setField('skipInvites', true);
    }
    setStep((s) => (s < 5 ? ((s + 1) as StepId) : s));
  }, [step, setField]);

  // ─── Final submit ─────────────────────────────────────────────────────────
  const submit = useCallback(async () => {
    setSubmitting(true);
    try {
      // Build the wedding payload (only if step 3 wasn't skipped and has data)
      const hasWeddingPayload =
        !data.skipWedding &&
        !!(data.brideName || data.groomName || data.coupleLabel || data.weddingDate || data.venueName || data.venueCity);

      const wedding = hasWeddingPayload
        ? {
            brideName: data.brideName.trim(),
            groomName: data.groomName.trim(),
            coupleLabel: data.coupleLabel.trim(),
            weddingDate: data.weddingDate || '',
            venueName: data.venueName.trim(),
            venueCity: data.venueCity.trim(),
          }
        : null;

      // Filter invites to only those with a non-empty valid email
      const invites = data.skipInvites
        ? []
        : data.invites
            .filter((i) => i.email.trim() && EMAIL_REGEX.test(i.email.trim().toLowerCase()))
            .map((i) => ({ email: i.email.trim().toLowerCase(), role: i.role }));

      const payload = {
        account: {
          name: data.userName.trim(),
          email: data.userEmail.trim().toLowerCase(),
          password: data.password,
          confirmPassword: data.confirmPassword,
        },
        organization: {
          name: data.orgName.trim(),
          slug: data.orgSlug.trim().toLowerCase(),
          email: data.orgEmail.trim().toLowerCase(),
          phone: data.orgPhone.trim() || '',
          plan: data.orgPlan,
        },
        wedding,
        invites,
      };

      const res = await fetch('/api/org/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });

      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        user?: { id: string; name: string; email: string };
        organization?: { slug: string; name: string };
        wedding?: { id: string; slug: string } | null;
      };

      if (!res.ok) {
        if (res.status === 409) {
          toast.error(json.error || 'Email ou slug déjà utilisé');
        } else if (res.status === 422) {
          toast.error(json.error || 'Données invalides');
        } else if (res.status === 429) {
          toast.error('Trop de tentatives. Réessayez dans une minute.');
        } else {
          toast.error(json.error || 'Erreur lors de la création du compte');
        }
        return;
      }

      // Success
      setSuccessData({
        orgSlug: json.organization?.slug || data.orgSlug,
        orgName: json.organization?.name || data.orgName,
        userName: json.user?.name || data.userName,
        hasWedding: !!json.wedding,
      });
      setStep(5);
      toast.success('Votre espace agence est prêt !');
    } catch (err) {
      toast.error('Erreur réseau. Vérifiez votre connexion.');
    } finally {
      setSubmitting(false);
    }
  }, [data]);

  // ─── Redirect after success ─────────────────────────────────────────────────
  const goToDashboard = useCallback(() => {
    if (!successData) return;
    router.push(`/org/${successData.orgSlug}/admin`);
  }, [router, successData]);

  // ─── Derived: progress percent ──────────────────────────────────────────────
  const progress = useMemo(() => {
    // 4 active steps (success is the 5th "step" but not part of the bar)
    return Math.min(100, Math.round(((Math.min(step, 4) - 1) / 3) * 100));
  }, [step]);

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <main className="min-h-screen bg-gradient-to-br from-background via-background to-muted/30 text-foreground">
      {/* ── Top bar (back to home) ─────────────────────────────────────────── */}
      <header className="border-b border-border/40 bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-30">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <Link href="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="size-4" />
            Retour à l'accueil
          </Link>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <ShieldCheck className="size-3.5 text-gold/70" />
            <span className="hidden sm:inline">Connexion sécurisée</span>
            <span className="sm:hidden">Sécurisé</span>
          </div>
        </div>
      </header>

      {/* ── Wizard container ───────────────────────────────────────────────── */}
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
        {/* ── Header / progress ──────────────────────────────────────────────── */}
        {step !== 5 && (
          <div className="mb-8 sm:mb-10">
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-gold/80 font-semibold mb-3">
              <Sparkles className="size-3.5" />
              <span>Espace Agences</span>
            </div>
            <h1 className="font-serif text-2xl sm:text-3xl md:text-4xl font-bold mb-2">
              Créez votre agence
            </h1>
            <p className="text-sm text-muted-foreground mb-6">
              Quatre étapes, deux minutes. Aucune carte requise.
            </p>
            {/* Progress bar */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Étape {step} sur 4</span>
                <span>{progress}%</span>
              </div>
              <Progress value={progress} className="h-1.5" />
              {/* Step badges */}
              <div className="hidden sm:flex items-center justify-between mt-4">
                {[
                  { id: 1, label: 'Compte', icon: User },
                  { id: 2, label: 'Organisation', icon: Building2 },
                  { id: 3, label: 'Mariage', icon: CalendarHeart },
                  { id: 4, label: 'Équipe', icon: Users },
                ].map(({ id, label, icon: Icon }) => {
                  const done = step > id;
                  const active = step === id;
                  return (
                    <div key={id} className="flex items-center gap-2">
                      <div
                        className={[
                          'flex items-center justify-center size-7 rounded-full border transition-colors',
                          done
                            ? 'bg-gold text-white border-gold'
                            : active
                            ? 'border-gold text-gold'
                            : 'border-border text-muted-foreground',
                        ].join(' ')}
                      >
                        {done ? <Check className="size-3.5" /> : <Icon className="size-3.5" />}
                      </div>
                      <span className={`text-xs ${active || done ? 'text-foreground font-medium' : 'text-muted-foreground'}`}>
                        {label}
                      </span>
                      {id < 4 && <ChevronRight className="size-3 text-muted-foreground/40 mx-1" />}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ── Step content (animated) ─────────────────────────────────────── */}
        <AnimatePresence mode="wait">
          {step === 1 && (
            <motion.div
              key="step-1"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.25 }}
            >
              <StepAccount
                data={data}
                errors={errors}
                setField={setField}
                emailCheck={emailCheck}
              />
            </motion.div>
          )}
          {step === 2 && (
            <motion.div
              key="step-2"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.25 }}
            >
              <StepOrganization
                data={data}
                errors={errors}
                setField={setField}
                slugCheck={slugCheck}
              />
            </motion.div>
          )}
          {step === 3 && (
            <motion.div
              key="step-3"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.25 }}
            >
              <StepWedding data={data} errors={errors} setField={setField} />
            </motion.div>
          )}
          {step === 4 && (
            <motion.div
              key="step-4"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.25 }}
            >
              <StepTeam data={data} setField={setField} />
            </motion.div>
          )}
          {step === 5 && successData && (
            <motion.div
              key="step-5"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.4 }}
            >
              <StepSuccess data={successData} onGoToDashboard={goToDashboard} />
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Actions row ─────────────────────────────────────────────────── */}
        {step !== 5 && (
          <div className="mt-8 flex flex-col-reverse sm:flex-row gap-3 sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              {step > 1 && (
                <Button type="button" variant="ghost" onClick={back} disabled={submitting}>
                  <ArrowLeft className="size-4 mr-1.5" />
                  Retour
                </Button>
              )}
              {(step === 3 || step === 4) && (
                <Button type="button" variant="link" onClick={skipStep} disabled={submitting} className="text-muted-foreground">
                  <SkipForward className="size-3.5 mr-1" />
                  Passer pour l'instant
                </Button>
              )}
            </div>
            {step < 4 ? (
              <Button type="button" onClick={next} disabled={submitting} className="sm:ml-auto">
                Continuer
                <ArrowRight className="size-4 ml-1.5" />
              </Button>
            ) : (
              <Button type="button" onClick={submit} disabled={submitting} className="sm:ml-auto min-w-[180px]">
                {submitting ? (
                  <>
                    <Loader2 className="size-4 mr-2 animate-spin" />
                    Création en cours…
                  </>
                ) : (
                  <>
                    <Check className="size-4 mr-1.5" />
                    Terminer
                  </>
                )}
              </Button>
            )}
          </div>
        )}

        {/* ── Trust signals footer ────────────────────────────────────────── */}
        {step !== 5 && (
          <div className="mt-12 pt-6 border-t border-border/40">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs text-muted-foreground">
              <div className="flex items-center gap-2">
                <Lock className="size-3.5 text-gold/70 shrink-0" />
                <span>Aucune carte requise</span>
              </div>
              <div className="flex items-center gap-2">
                <ShieldCheck className="size-3.5 text-gold/70 shrink-0" />
                <span>Annulez à tout moment</span>
              </div>
              <div className="flex items-center gap-2">
                <Mail className="size-3.5 text-gold/70 shrink-0" />
                <span>Données chiffrées (bcrypt + JWT)</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// Step components
// ══════════════════════════════════════════════════════════════════════════════

interface StepProps {
  data: FormData;
  errors: Record<string, string>;
  setField: <K extends keyof FormData>(key: K, value: FormData[K]) => void;
}

// ─── Step 1 — Account ─────────────────────────────────────────────────────────
function StepAccount({
  data,
  errors,
  setField,
  emailCheck,
}: StepProps & {
  emailCheck: { loading: boolean; available: boolean | null };
}) {
  return (
    <Card className="border-border/60 shadow-lg shadow-black/5">
      <CardHeader>
        <div className="flex items-center gap-3 mb-1">
          <div className="flex items-center justify-center size-9 rounded-full bg-gold/10 text-gold">
            <User className="size-4" />
          </div>
          <div>
            <CardTitle className="text-lg">Votre compte</CardTitle>
            <CardDescription>Vous serez l'administrateur de l'agence.</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="userName">Nom complet</Label>
          <Input
            id="userName"
            value={data.userName}
            onChange={(e) => setField('userName', e.target.value)}
            placeholder="ex: Aïcha Mbala"
            autoComplete="name"
            aria-invalid={!!errors.userName}
          />
          {errors.userName && <FieldError msg={errors.userName} />}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="userEmail">Email</Label>
          <div className="relative">
            <Input
              id="userEmail"
              type="email"
              value={data.userEmail}
              onChange={(e) => setField('userEmail', e.target.value)}
              placeholder="vous@agence.com"
              autoComplete="email"
              aria-invalid={!!errors.userEmail}
              className="pr-10"
            />
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              {emailCheck.loading ? (
                <Loader2 className="size-4 animate-spin text-muted-foreground" />
              ) : emailCheck.available === true ? (
                <CheckCircle2 className="size-4 text-emerald-500" />
              ) : emailCheck.available === false ? (
                <span className="text-xs text-destructive">×</span>
              ) : null}
            </div>
          </div>
          {errors.userEmail ? (
            <FieldError msg={errors.userEmail} />
          ) : emailCheck.available === false ? (
            <FieldError msg="Cet email est déjà utilisé" />
          ) : null}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="password">Mot de passe</Label>
            <Input
              id="password"
              type="password"
              value={data.password}
              onChange={(e) => setField('password', e.target.value)}
              placeholder="Min. 8 caractères"
              autoComplete="new-password"
              aria-invalid={!!errors.password}
            />
            {errors.password ? (
              <FieldError msg={errors.password} />
            ) : (
              <p className="text-xs text-muted-foreground">
                Une lettre + un chiffre, min. 8 caractères.
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="confirmPassword">Confirmer le mot de passe</Label>
            <Input
              id="confirmPassword"
              type="password"
              value={data.confirmPassword}
              onChange={(e) => setField('confirmPassword', e.target.value)}
              placeholder="Retapez votre mot de passe"
              autoComplete="new-password"
              aria-invalid={!!errors.confirmPassword}
            />
            {errors.confirmPassword && <FieldError msg={errors.confirmPassword} />}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Step 2 — Organization ────────────────────────────────────────────────────
function StepOrganization({
  data,
  errors,
  setField,
  slugCheck,
}: StepProps & {
  slugCheck: { loading: boolean; available: boolean | null; reason: string | null };
}) {
  return (
    <Card className="border-border/60 shadow-lg shadow-black/5">
      <CardHeader>
        <div className="flex items-center gap-3 mb-1">
          <div className="flex items-center justify-center size-9 rounded-full bg-gold/10 text-gold">
            <Building2 className="size-4" />
          </div>
          <div>
            <CardTitle className="text-lg">Votre organisation</CardTitle>
            <CardDescription>
              L'entité qui regroupera tous vos mariages et votre équipe.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="orgName">Nom de l'agence</Label>
            <Input
              id="orgName"
              value={data.orgName}
              onChange={(e) => setField('orgName', e.target.value)}
              placeholder="ex: Agence Mariage CD"
              aria-invalid={!!errors.orgName}
            />
            {errors.orgName && <FieldError msg={errors.orgName} />}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="orgSlug">
              Slug URL{' '}
              <span className="text-xs text-muted-foreground font-normal">
                (/{data.orgSlug || 'votre-agence'}/admin)
              </span>
            </Label>
            <div className="relative">
              <Input
                id="orgSlug"
                value={data.orgSlug}
                onChange={(e) => {
                  setField('orgSlug', e.target.value);
                  setField('orgSlugTouched', true);
                }}
                placeholder="agence-mariage-cd"
                aria-invalid={!!errors.orgSlug}
                className="pr-10 lowercase"
              />
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                {slugCheck.loading ? (
                  <Loader2 className="size-4 animate-spin text-muted-foreground" />
                ) : slugCheck.available === true && !errors.orgSlug ? (
                  <CheckCircle2 className="size-4 text-emerald-500" />
                ) : slugCheck.available === false ? (
                  <span className="text-xs text-destructive">×</span>
                ) : null}
              </div>
            </div>
            {errors.orgSlug ? (
              <FieldError msg={errors.orgSlug} />
            ) : slugCheck.available === false ? (
              <FieldError msg="Ce slug est déjà pris" />
            ) : slugCheck.reason === 'format' ? (
              <FieldError msg="Format invalide (minuscules + tirets)" />
            ) : (
              <p className="text-xs text-muted-foreground">
                Minuscules, chiffres et tirets uniquement.
              </p>
            )}
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="orgEmail">Email de contact</Label>
            <Input
              id="orgEmail"
              type="email"
              value={data.orgEmail}
              onChange={(e) => setField('orgEmail', e.target.value)}
              placeholder="contact@agence.com"
              aria-invalid={!!errors.orgEmail}
            />
            {errors.orgEmail && <FieldError msg={errors.orgEmail} />}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="orgPhone">Téléphone (optionnel)</Label>
            <Input
              id="orgPhone"
              value={data.orgPhone}
              onChange={(e) => setField('orgPhone', e.target.value)}
              placeholder="+243 8xx xxx xxx"
              aria-invalid={!!errors.orgPhone}
            />
            {errors.orgPhone && <FieldError msg={errors.orgPhone} />}
          </div>
        </div>

        {/* Plan selection */}
        <div className="space-y-2 pt-2">
          <Label>Choisissez votre formule</Label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {PLANS.map((p) => {
              const selected = data.orgPlan === p.id;
              return (
                <button
                  type="button"
                  key={p.id}
                  onClick={() => setField('orgPlan', p.id)}
                  className={[
                    'relative text-left p-4 rounded-xl border transition-all',
                    selected
                      ? 'border-gold bg-gold/5 ring-1 ring-gold/40'
                      : 'border-border hover:border-gold/40 hover:bg-muted/30',
                  ].join(' ')}
                >
                  {p.highlight && (
                    <Badge className="absolute -top-2 right-3 bg-gold text-white text-[10px] px-2 py-0.5">
                      Populaire
                    </Badge>
                  )}
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-serif font-semibold text-base">{p.label}</span>
                    {selected && <Check className="size-4 text-gold" />}
                  </div>
                  <div className="font-display text-lg font-bold text-foreground">
                    {formatFcfa(p.priceFcfa)}
                  </div>
                  <div className="text-xs text-muted-foreground mb-2">
                    {p.priceUsd > 0 ? formatUsd(p.priceUsd) : 'Pour démarrer'}
                  </div>
                  <div className="text-xs text-muted-foreground space-y-0.5">
                    <div>
                      <span className="text-foreground font-medium">{p.maxWeddings}</span> mariage{typeof p.maxWeddings === 'number' && p.maxWeddings > 1 ? 's' : ''}
                    </div>
                    <div>
                      <span className="text-foreground font-medium">{p.maxMembers}</span> membres
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Step 3 — First Wedding ────────────────────────────────────────────────────
function StepWedding({ data, errors, setField }: StepProps) {
  return (
    <Card className="border-border/60 shadow-lg shadow-black/5">
      <CardHeader>
        <div className="flex items-center gap-3 mb-1">
          <div className="flex items-center justify-center size-9 rounded-full bg-gold/10 text-gold">
            <CalendarHeart className="size-4" />
          </div>
          <div>
            <CardTitle className="text-lg">Premier mariage</CardTitle>
            <CardDescription>
              Créez votre premier événement maintenant, ou plus tard depuis votre tableau de bord.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="brideName">Nom de la mariée</Label>
            <Input
              id="brideName"
              value={data.brideName}
              onChange={(e) => setField('brideName', e.target.value)}
              placeholder="ex: Sophie"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="groomName">Nom du marié</Label>
            <Input
              id="groomName"
              value={data.groomName}
              onChange={(e) => setField('groomName', e.target.value)}
              placeholder="ex: David"
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="coupleLabel">
            Label du couple{' '}
            <span className="text-xs text-muted-foreground font-normal">(optionnel)</span>
          </Label>
          <Input
            id="coupleLabel"
            value={data.coupleLabel}
            onChange={(e) => setField('coupleLabel', e.target.value)}
            placeholder="ex: Sophie & David"
          />
          {errors.coupleLabel && <FieldError msg={errors.coupleLabel} />}
          <p className="text-xs text-muted-foreground">
            Si vide, le label sera généré à partir des noms des mariés.
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="weddingDate">Date du mariage</Label>
          <Input
            id="weddingDate"
            type="date"
            value={data.weddingDate}
            onChange={(e) => setField('weddingDate', e.target.value)}
            aria-invalid={!!errors.weddingDate}
          />
          {errors.weddingDate && <FieldError msg={errors.weddingDate} />}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="venueName">Nom du lieu</Label>
            <Input
              id="venueName"
              value={data.venueName}
              onChange={(e) => setField('venueName', e.target.value)}
              placeholder="ex: Salle Le Crystal"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="venueCity">Ville</Label>
            <Input
              id="venueCity"
              value={data.venueCity}
              onChange={(e) => setField('venueCity', e.target.value)}
              placeholder="ex: Kinshasa"
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Step 4 — Invite Team ──────────────────────────────────────────────────────
function StepTeam({
  data,
  setField,
}: {
  data: FormData;
  setField: <K extends keyof FormData>(key: K, value: FormData[K]) => void;
}) {
  const updateInvite = (idx: number, patch: Partial<Invite>) => {
    const next = data.invites.map((inv, i) => (i === idx ? { ...inv, ...patch } : inv));
    setField('invites', next);
  };

  return (
    <Card className="border-border/60 shadow-lg shadow-black/5">
      <CardHeader>
        <div className="flex items-center gap-3 mb-1">
          <div className="flex items-center justify-center size-9 rounded-full bg-gold/10 text-gold">
            <Users className="size-4" />
          </div>
          <div>
            <CardTitle className="text-lg">Inviter votre équipe</CardTitle>
            <CardDescription>
              Ajoutez jusqu'à 3 collaborateurs. Ils recevront une invitation après votre inscription.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-lg border border-dashed border-border bg-muted/20 p-3 text-xs text-muted-foreground flex items-start gap-2">
          <Mail className="size-3.5 text-gold/70 shrink-0 mt-0.5" />
          <span>
            Les invitations seront préparées en attente. Vos collaborateurs recevront un email
            d'activation dès que leur compte sera créé sur la plateforme.
          </span>
        </div>
        {data.invites.map((inv, idx) => (
          <div key={idx} className="grid grid-cols-1 sm:grid-cols-[1fr_180px] gap-3 items-end">
            <div className="space-y-1.5">
              <Label htmlFor={`invite-email-${idx}`}>Email du membre {idx + 1}</Label>
              <Input
                id={`invite-email-${idx}`}
                type="email"
                value={inv.email}
                onChange={(e) => updateInvite(idx, { email: e.target.value })}
                placeholder={`collegue${idx + 1}@agence.com`}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`invite-role-${idx}`}>Rôle</Label>
              <Select
                value={inv.role}
                onValueChange={(v) => updateInvite(idx, { role: v as MemberRole })}
              >
                <SelectTrigger id={`invite-role-${idx}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ORG_MEMBER">Membre (lecture/écriture)</SelectItem>
                  <SelectItem value="ORG_VIEWER">Observateur (lecture seule)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        ))}
        <p className="text-xs text-muted-foreground">
          Laissez les lignes vides si vous n'avez pas encore d'équipe — vous pourrez les
          inviter plus tard depuis votre tableau de bord.
        </p>
      </CardContent>
    </Card>
  );
}

// ─── Step 5 — Success ──────────────────────────────────────────────────────────
function StepSuccess({
  data,
  onGoToDashboard,
}: {
  data: { orgSlug: string; orgName: string; userName: string; hasWedding: boolean };
  onGoToDashboard: () => void;
}) {
  return (
    <Card className="border-gold/30 shadow-2xl shadow-gold/10 text-center overflow-hidden">
      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-gold/0 via-gold to-gold/0" />
      <CardContent className="pt-10 pb-8 px-6">
        <motion.div
          initial={{ scale: 0, rotate: -180 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: 'spring', stiffness: 200, damping: 15, delay: 0.1 }}
          className="mx-auto mb-6 flex items-center justify-center size-16 rounded-full bg-gradient-to-br from-gold to-gold-dark text-white shadow-lg shadow-gold/40"
        >
          <PartyPopper className="size-8" />
        </motion.div>
        <h2 className="font-serif text-2xl sm:text-3xl font-bold mb-2">
          Bienvenue, {data.userName.split(' ')[0]} !
        </h2>
        <p className="text-muted-foreground text-sm sm:text-base max-w-md mx-auto mb-6">
          Votre espace <strong className="text-foreground">{data.orgName}</strong> est prêt.
          {data.hasWedding
            ? ' Votre premier mariage a été créé en brouillon.'
            : ' Vous pouvez maintenant créer votre premier mariage depuis le tableau de bord.'}
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center items-center">
          <Button onClick={onGoToDashboard} size="lg" className="min-w-[220px]">
            Aller au tableau de bord
            <ArrowRight className="size-4 ml-1.5" />
          </Button>
          <Link href="/">
            <Button variant="ghost" size="lg">
              Retour à l'accueil
            </Button>
          </Link>
        </div>
        <div className="mt-8 grid grid-cols-3 gap-3 max-w-md mx-auto text-center">
          <div className="p-3 rounded-lg bg-muted/30">
            <Check className="size-4 text-emerald-500 mx-auto mb-1" />
            <div className="text-xs text-muted-foreground">Compte créé</div>
          </div>
          <div className="p-3 rounded-lg bg-muted/30">
            <Check className="size-4 text-emerald-500 mx-auto mb-1" />
            <div className="text-xs text-muted-foreground">Agence active</div>
          </div>
          <div className="p-3 rounded-lg bg-muted/30">
            <Check className="size-4 text-emerald-500 mx-auto mb-1" />
            <div className="text-xs text-muted-foreground">Connexion établie</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Small helpers ─────────────────────────────────────────────────────────────
function FieldError({ msg }: { msg: string }) {
  return <p className="text-xs text-destructive mt-1">{msg}</p>;
}
