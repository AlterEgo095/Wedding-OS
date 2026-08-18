'use client'

import { useState } from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { authedFetch } from '@/lib/csrf-client'
import {
  Sparkles,
  QrCode,
  Users,
  Wallet,
  ChevronDown,
  Loader2,
  Send,
  CheckCircle2,
  Heart,
  MessageCircle,
  ArrowRight,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import Footer from '@/components/Footer'

// ══════════════════════════════════════════════════════════════════════════════
// Plan preview data — kept static (mirrors PLAN_METADATA from src/lib/types.ts)
// to avoid importing server-only types in this client component.
// ══════════════════════════════════════════════════════════════════════════════
type PlanKey = 'TRIAL' | 'ESSENTIEL' | 'PREMIUM' | 'ELITE'

interface PlanPreview {
  key: PlanKey
  label: string
  priceFcfa: number
  priceUsd: number
  tagline: string
  services: string[]
  popular?: boolean
}

const PLANS_PREVIEW: PlanPreview[] = [
  {
    key: 'TRIAL',
    label: 'Essai Libre',
    priceFcfa: 0,
    priceUsd: 0,
    tagline: 'Pour découvrir la plateforme',
    services: [
      "Jusqu'à 20 invités",
      '100 Mo de médias',
      '1 compte staff',
      'Invitation digitale de base',
      'Sans domaine personnalisé',
    ],
  },
  {
    key: 'ESSENTIEL',
    label: 'Essentiel',
    priceFcfa: 30000,
    priceUsd: 49,
    tagline: 'Pour les mariages intimes',
    services: [
      "Jusqu'à 200 invités",
      '1 Go de médias',
      '2 comptes staff',
      'Invitation digitale complète',
      'QR code check-in',
    ],
  },
  {
    key: 'PREMIUM',
    label: 'Premium',
    priceFcfa: 60000,
    priceUsd: 99,
    tagline: 'Le plus populaire',
    services: [
      "Jusqu'à 500 invités",
      '5 Go de médias',
      '5 comptes staff',
      'Invitation digitale de luxe',
      'Domaine personnalisé inclus',
    ],
    popular: true,
  },
  {
    key: 'ELITE',
    label: 'Élite',
    priceFcfa: 120000,
    priceUsd: 199,
    tagline: 'Sans aucune limite',
    services: [
      'Invités illimités',
      'Médias illimités',
      '10 comptes staff',
      'Expérience sur mesure',
      'Domaine personnalisé + support dédié',
    ],
  },
]

const WHY_US = [
  {
    icon: Sparkles,
    title: 'Invitation digitale de luxe',
    description:
      'Une page de mariage élégante avec animations cinématiques, galerie premium et récit de votre histoire.',
  },
  {
    icon: QrCode,
    title: 'QR code check-in',
    description:
      "Chaque invité reçoit un QR code unique. Le check-in à l'entrée se fait en une seconde, sans file d'attente.",
  },
  {
    icon: Users,
    title: 'RSVP en temps réel',
    description:
      "Suivez les confirmations en direct. Les invités trouvent leur table en un clic depuis leur téléphone.",
  },
  {
    icon: Wallet,
    title: 'Paiement flexible',
    description:
      'Mobile Money (M-Pesa, Airtel Money, Orange Money), virement bancaire ou espèces. Négociez le prix avec un conseiller.',
  },
]

// ══════════════════════════════════════════════════════════════════════════════
// Invitation Packs — tiered per-invitation pricing (Mission 5.9.5)
// $0.70/invitation for ≤250, $0.50/invitation for >250
// ══════════════════════════════════════════════════════════════════════════════
interface InvitationPack {
  tier: string
  unitPrice: number
  range: string
  example: string
  exampleTotal: string
  highlight?: boolean
}

const INVITATION_PACKS: InvitationPack[] = [
  {
    tier: 'Pack Standard',
    unitPrice: 0.7,
    range: '1 — 250 invitations',
    example: 'Exemple : 200 invitations',
    exampleTotal: '$140',
    highlight: true,
  },
  {
    tier: 'Pack Volume',
    unitPrice: 0.5,
    range: '251 invitations et plus',
    example: 'Exemple : 500 invitations',
    exampleTotal: '$250',
  },
]

// ══════════════════════════════════════════════════════════════════════════════
// Reseller / Agency / Wedding Planner packages — flat $0.50/invitation
// ══════════════════════════════════════════════════════════════════════════════
interface ResellerPackage {
  type: string
  label: string
  unitPrice: number
  perks: string[]
  highlight?: boolean
}

const RESELLER_PACKAGES: ResellerPackage[] = [
  {
    type: 'AGENCY',
    label: 'Agence',
    unitPrice: 0.5,
    perks: [
      'Tarif flat $0.50 / invitation',
      'Multi-organisation',
      'White-label inclus',
      'Account manager dédié',
      'API & intégrations',
    ],
    highlight: true,
  },
  {
    type: 'RESELLER',
    label: 'Revendeur',
    unitPrice: 0.5,
    perks: [
      'Tarif flat $0.50 / invitation',
      'Revente à vos clients',
      'Tableau de bord revendeur',
      'Commission sur abonnements',
      'Support prioritaire',
    ],
  },
  {
    type: 'WEDDING_PLANNER',
    label: 'Wedding Planner',
    unitPrice: 0.5,
    perks: [
      'Tarif flat $0.50 / invitation',
      'Gestion de plusieurs mariages',
      'Outils de planification',
      'Coordination des invités',
      'Support 24/7',
    ],
  },
]

// ══════════════════════════════════════════════════════════════════════════════
// Form schema — zod validation
// ══════════════════════════════════════════════════════════════════════════════
const leadSchema = z.object({
  brideName: z
    .string()
    .min(1, 'Le prénom de la mariée est requis')
    .max(80, 'Maximum 80 caractères'),
  groomName: z
    .string()
    .min(1, 'Le prénom du marié est requis')
    .max(80, 'Maximum 80 caractères'),
  weddingDate: z.string().optional().nullable(),
  venueCity: z.string().max(120, 'Maximum 120 caractères').optional().nullable(),
  email: z
    .string()
    .min(1, "L'email est requis")
    .email("Format d'email invalide"),
  phone: z.string().max(40, 'Maximum 40 caractères').optional().nullable(),
  plan: z.enum(['TRIAL', 'ESSENTIEL', 'PREMIUM', 'ELITE'], {
    // P3: Zod v4 replaced `errorMap` with `message` / `error`.
    message: 'Veuillez sélectionner un plan',
  }),
  message: z.string().max(2000, 'Maximum 2000 caractères').optional().nullable(),
})

type LeadFormValues = z.infer<typeof leadSchema>

const PLAN_LABELS: Record<LeadFormValues['plan'], string> = {
  TRIAL: 'Essai Libre',
  ESSENTIEL: 'Essentiel',
  PREMIUM: 'Premium',
  ELITE: 'Élite',
}

function formatPrice(usd: number, fcfa: number): string {
  if (usd === 0) return 'Gratuit'
  return `$${usd}`
}

function formatUsd(n: number): string {
  if (n === 0) return ''
  return `$${n}`
}

// ══════════════════════════════════════════════════════════════════════════════
// Main page component
// ══════════════════════════════════════════════════════════════════════════════
export default function OnboardingLeadPage() {
  const [submitted, setSubmitted] = useState(false)

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<LeadFormValues>({
    resolver: zodResolver(leadSchema),
    defaultValues: {
      brideName: '',
      groomName: '',
      weddingDate: '',
      venueCity: '',
      email: '',
      phone: '',
      plan: 'PREMIUM',
      message: '',
    },
  })

  const selectedPlan = watch('plan')

  const scrollToForm = () => {
    const el = document.getElementById('demande')
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const onSubmit = async (values: LeadFormValues) => {
    try {
      const body: Record<string, unknown> = {
        brideName: values.brideName.trim(),
        groomName: values.groomName.trim(),
        email: values.email.trim(),
        plan: values.plan,
      }
      if (values.weddingDate && values.weddingDate.trim()) {
        body.weddingDate = values.weddingDate.trim()
      }
      if (values.venueCity && values.venueCity.trim()) {
        body.venueCity = values.venueCity.trim()
      }
      if (values.phone && values.phone.trim()) {
        body.phone = values.phone.trim()
      }
      if (values.message && values.message.trim()) {
        body.message = values.message.trim()
      }

      const res = await authedFetch('/api/onboarding/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      // Try to parse JSON regardless of status (defensive)
      let data: { ok?: boolean; error?: string; message?: string } = {}
      try {
        data = await res.json()
      } catch {
        // non-JSON response (e.g. 404 HTML page from Next.js)
      }

      if (res.status === 429) {
        toast.error('Trop de demandes. Réessayez dans quelques minutes.')
        return
      }

      if (!res.ok) {
        const msg =
          data?.error ||
          data?.message ||
          "Une erreur est survenue. Veuillez réessayer ou nous contacter sur WhatsApp."
        toast.error(msg)
        return
      }

      setSubmitted(true)
      reset()
      toast.success('Demande envoyée avec succès !')
    } catch (err) {
      console.error('Lead submit error:', err)
      toast.error(
        "Impossible d'envoyer votre demande. Vérifiez votre connexion et réessayez.",
      )
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-gradient-warm">
      {/* ─── HERO ─────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        {/* Background gradient overlay on a romantic dark base */}
        <div className="absolute inset-0 bg-gradient-to-br from-[oklch(0.18_0.04_290)] via-[oklch(0.22_0.06_270)] to-[oklch(0.16_0.03_300)]" />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/40 to-transparent" />

        {/* Decorative golden halos */}
        <div className="absolute -top-32 -left-32 w-96 h-96 rounded-full bg-gold/10 blur-3xl" />
        <div className="absolute -top-20 -right-20 w-80 h-80 rounded-full bg-rose-gold/10 blur-3xl" />
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[60%] h-40 bg-gold/5 blur-3xl" />

        <div className="relative max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-24 pb-20 md:pt-32 md:pb-28 text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7 }}
            className="flex justify-center mb-6"
          >
            <Badge
              variant="outline"
              className="bg-white/5 backdrop-blur-sm border-gold/30 text-gold-light px-4 py-1.5 text-xs sm:text-sm font-display tracking-wide"
            >
              <Sparkles className="size-3.5" />
              Service premium · RDC & Afrique francophone
            </Badge>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.1 }}
            className="font-serif text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold leading-tight"
          >
            <span className="gold-gradient">Créez votre</span>
            <br />
            <span className="text-white drop-shadow-[0_2px_20px_oklch(0.72_0.12_85/30%)]">
              mariage digital
            </span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.25 }}
            className="mt-6 max-w-2xl mx-auto text-base sm:text-lg md:text-xl text-white/80 font-display leading-relaxed"
          >
            Invitations élégantes, gestion d&apos;invités, RSVP en temps réel.
            <br className="hidden sm:block" />
            <span className="text-gold-light font-medium">
              {' '}
              Un conseiller vous contacte sur WhatsApp sous 24h.
            </span>
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.4 }}
            className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-3"
          >
            <Button
              onClick={scrollToForm}
              size="lg"
              className="btn-premium bg-gradient-gold text-white shadow-2xl shadow-gold/30 hover:shadow-gold/50 px-8 py-6 text-base w-full sm:w-auto rounded-full"
            >
              <Send className="size-4" />
              Demander mon mariage
            </Button>
            <Link
              href="/"
              className="text-white/70 hover:text-white text-sm font-display tracking-wide underline-offset-4 hover:underline transition-colors"
            >
              Voir un exemple réel →
            </Link>
          </motion.div>

          {/* Scroll indicator */}
          <motion.button
            type="button"
            onClick={scrollToForm}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, y: [0, 8, 0] }}
            transition={{
              opacity: { duration: 1, delay: 1 },
              y: { duration: 2, repeat: Infinity, ease: 'easeInOut' },
            }}
            className="hidden md:flex flex-col items-center gap-1 mt-16 mx-auto text-white/40 hover:text-white/70 transition-colors"
            aria-label="Faire défiler vers les offres"
          >
            <span className="text-[10px] uppercase tracking-[0.3em] font-display">
              Découvrir
            </span>
            <ChevronDown className="size-5" />
          </motion.button>
        </div>
      </section>

      {/* ─── PLANS PREVIEW ────────────────────────────────────────────── */}
      <section className="relative py-16 md:py-24 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="text-center mb-12 md:mb-16"
          >
            <div className="section-divider max-w-md mx-auto mb-6">
              <span className="flourish text-sm">✦</span>
            </div>
            <h2 className="font-serif text-3xl sm:text-4xl md:text-5xl font-bold gold-gradient mb-4">
              Nos offres
            </h2>
            <p className="text-muted-foreground font-display text-sm sm:text-base max-w-2xl mx-auto">
              Choisissez le format qui correspond à votre mariage. Le prix final
              est négocié avec votre conseiller selon les services inclus.
            </p>
          </motion.div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {PLANS_PREVIEW.map((plan, idx) => (
              <motion.div
                key={plan.key}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: idx * 0.1 }}
              >
                <Card
                  className={`card-premium relative h-full bg-card/80 backdrop-blur-sm ${
                    plan.popular
                      ? 'border-gold/50 shadow-lg shadow-gold/10 gold-border'
                      : 'border-border/60'
                  }`}
                >
                  {plan.popular && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                      <Badge className="bg-gradient-gold text-white border-0 px-3 py-1 text-xs font-display tracking-wide shadow-md shadow-gold/30">
                        <Heart className="size-3 fill-white" />
                        Le plus populaire
                      </Badge>
                    </div>
                  )}
                  <CardHeader className="text-center pb-2">
                    <CardTitle className="font-serif text-2xl font-bold text-foreground">
                      {plan.label}
                    </CardTitle>
                    <CardDescription className="text-muted-foreground text-xs">
                      {plan.tagline}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-col flex-1">
                    <div className="text-center mb-4">
                      <div className="font-serif text-3xl font-bold gold-gradient">
                        {formatPrice(plan.priceUsd, plan.priceFcfa)}
                      </div>
                      {plan.priceUsd > 0 && (
                        <div className="text-xs text-muted-foreground font-display mt-1">
                          ≈ {formatUsd(plan.priceUsd)} / mois
                        </div>
                      )}
                    </div>

                    <ul className="space-y-2 text-sm flex-1 mb-5">
                      {plan.services.map((s) => (
                        <li
                          key={s}
                          className="flex items-start gap-2 text-foreground/80"
                        >
                          <CheckCircle2 className="size-4 text-gold mt-0.5 shrink-0" />
                          <span>{s}</span>
                        </li>
                      ))}
                    </ul>

                    <Button
                      onClick={scrollToForm}
                      variant={plan.popular ? 'default' : 'outline'}
                      className={`w-full rounded-full ${
                        plan.popular
                          ? 'bg-gradient-gold text-white hover:opacity-90'
                          : 'border-gold/40 text-gold hover:bg-gold/5'
                      }`}
                    >
                      Choisir {plan.label}
                    </Button>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>

          <p className="text-center text-xs text-muted-foreground mt-8 font-display">
            💡 Tous les plans incluent une page de mariage personnalisable,
            l&apos;envoi d&apos;invitations et le suivi RSVP.
          </p>
        </div>
      </section>

      {/* ─── INVITATION PACKS (tiered per-invitation pricing) ──────────── */}
      <section id="invitations" className="relative py-16 md:py-24 px-4 sm:px-6 lg:px-8 bg-gradient-to-b from-champagne/10 via-transparent to-champagne/10">
        <div className="max-w-7xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="text-center mb-12 md:mb-16"
          >
            <div className="section-divider max-w-md mx-auto mb-6">
              <span className="flourish text-sm">✉</span>
            </div>
            <h2 className="font-serif text-3xl sm:text-4xl md:text-5xl font-bold gold-gradient mb-4">
              Packs d&apos;invitations
            </h2>
            <p className="text-muted-foreground font-display text-sm sm:text-base max-w-2xl mx-auto">
              Ajoutez des invitations à la carte. Prix dégressifs selon le volume —
              plus vous invitez, moins cher par invitation.
            </p>
          </motion.div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 max-w-4xl mx-auto">
            {INVITATION_PACKS.map((pack, idx) => (
              <motion.div
                key={pack.tier}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: idx * 0.1 }}
              >
                <Card
                  className={`card-premium relative h-full bg-card/80 backdrop-blur-sm ${
                    pack.highlight
                      ? 'border-gold/50 shadow-lg shadow-gold/10 gold-border'
                      : 'border-border/60'
                  }`}
                >
                  {pack.highlight && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                      <Badge className="bg-gradient-gold text-white border-0 px-3 py-1 text-xs font-display tracking-wide shadow-md shadow-gold/30">
                        <Heart className="size-3 fill-white" />
                        Le plus demandé
                      </Badge>
                    </div>
                  )}
                  <CardHeader className="text-center pb-2">
                    <CardTitle className="font-serif text-2xl font-bold text-foreground">
                      {pack.tier}
                    </CardTitle>
                    <CardDescription className="text-muted-foreground text-xs">
                      {pack.range}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-col items-center">
                    <div className="text-center mb-6">
                      <div className="font-serif text-4xl font-bold gold-gradient">
                        ${pack.unitPrice.toFixed(2)}
                      </div>
                      <div className="text-xs text-muted-foreground font-display mt-1">
                        par invitation
                      </div>
                    </div>
                    <div className="w-full text-center p-3 rounded-lg bg-gold/5 border border-gold/20 mb-4">
                      <p className="text-xs text-muted-foreground font-display">
                        {pack.example}
                      </p>
                      <p className="font-serif text-xl font-bold gold-gradient mt-1">
                        {pack.exampleTotal}
                      </p>
                    </div>
                    <Button
                      onClick={scrollToForm}
                      variant={pack.highlight ? 'default' : 'outline'}
                      className={`w-full rounded-full ${
                        pack.highlight
                          ? 'bg-gradient-gold text-white hover:opacity-90'
                          : 'border-gold/40 text-gold hover:bg-gold/5'
                      }`}
                    >
                      Commander
                    </Button>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>

          <p className="text-center text-xs text-muted-foreground mt-6 font-display">
            💡 Facturation au prorata — payez uniquement pour les invitations envoyées.
          </p>
        </div>
      </section>

      {/* ─── RESELLER / AGENCY / WEDDING PLANNER PACKAGES ──────────────── */}
      <section id="resellers" className="relative py-16 md:py-24 px-4 sm:px-6 lg:px-8 bg-gradient-to-b from-transparent via-champagne/10 to-transparent">
        <div className="max-w-7xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="text-center mb-12 md:mb-16"
          >
            <div className="section-divider max-w-md mx-auto mb-6">
              <span className="flourish text-sm">★</span>
            </div>
            <h2 className="font-serif text-3xl sm:text-4xl md:text-5xl font-bold gold-gradient mb-4">
              Forfaits Reseller
            </h2>
            <p className="text-muted-foreground font-display text-sm sm:text-base max-w-2xl mx-auto">
              Pour les agences, revendeurs et wedding planners — tarif flat
              $0.50 / invitation, sans palier.
            </p>
          </motion.div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {RESELLER_PACKAGES.map((pkg, idx) => (
              <motion.div
                key={pkg.type}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: idx * 0.1 }}
              >
                <Card
                  className={`card-premium relative h-full bg-card/80 backdrop-blur-sm ${
                    pkg.highlight
                      ? 'border-gold/50 shadow-lg shadow-gold/10 gold-border lg:-translate-y-2'
                      : 'border-border/60'
                  }`}
                >
                  {pkg.highlight && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                      <Badge className="bg-gradient-gold text-white border-0 px-3 py-1 text-xs font-display tracking-wide shadow-md shadow-gold/30">
                        <Sparkles className="size-3" />
                        Recommandé
                      </Badge>
                    </div>
                  )}
                  <CardHeader className="text-center pb-2">
                    <CardTitle className="font-serif text-2xl font-bold text-foreground">
                      {pkg.label}
                    </CardTitle>
                    <CardDescription className="text-muted-foreground text-xs">
                      {pkg.type === 'AGENCY' && 'Pour les agences événementielles'}
                      {pkg.type === 'RESELLER' && 'Pour la revente à vos clients'}
                      {pkg.type === 'WEDDING_PLANNER' && 'Pour les planificateurs de mariages'}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-col flex-1">
                    <div className="text-center mb-4">
                      <div className="font-serif text-3xl font-bold gold-gradient">
                        ${pkg.unitPrice.toFixed(2)}
                      </div>
                      <div className="text-xs text-muted-foreground font-display mt-1">
                        par invitation — tarif flat
                      </div>
                    </div>
                    <ul className="space-y-2 text-sm flex-1 mb-5">
                      {pkg.perks.map((perk) => (
                        <li
                          key={perk}
                          className="flex items-start gap-2 text-foreground/80"
                        >
                          <CheckCircle2 className="size-4 text-gold mt-0.5 shrink-0" />
                          <span>{perk}</span>
                        </li>
                      ))}
                    </ul>
                    <Button
                      onClick={scrollToForm}
                      variant={pkg.highlight ? 'default' : 'outline'}
                      className={`w-full rounded-full ${
                        pkg.highlight
                          ? 'bg-gradient-gold text-white hover:opacity-90'
                          : 'border-gold/40 text-gold hover:bg-gold/5'
                      }`}
                    >
                      Devenir {pkg.label}
                    </Button>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>

          <p className="text-center text-xs text-muted-foreground mt-6 font-display">
            💡 Les forfaits reseller incluent un tableau de bord dédié et la gestion
            multi-organisation.
          </p>
        </div>
      </section>

      {/* ─── WHY US ───────────────────────────────────────────────────── */}
      <section className="relative py-16 md:py-24 px-4 sm:px-6 lg:px-8 bg-gradient-to-b from-transparent via-champagne/10 to-transparent">
        <div className="max-w-7xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="text-center mb-12 md:mb-16"
          >
            <div className="section-divider max-w-md mx-auto mb-6">
              <span className="flourish text-sm">✦</span>
            </div>
            <h2 className="font-serif text-3xl sm:text-4xl md:text-5xl font-bold gold-gradient mb-4">
              Pourquoi Heureux Mariage ?
            </h2>
            <p className="text-muted-foreground font-display text-sm sm:text-base max-w-2xl mx-auto">
              Une plateforme pensée pour les mariages en RDC et en Afrique
              francophone — élégante, simple et accessible.
            </p>
          </motion.div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {WHY_US.map((feature, idx) => {
              const Icon = feature.icon
              return (
                <motion.div
                  key={feature.title}
                  initial={{ opacity: 0, y: 30 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.5, delay: idx * 0.1 }}
                >
                  <Card className="card-premium h-full bg-card/60 backdrop-blur-sm border-border/60 text-center">
                    <CardHeader className="items-center">
                      <div className="w-14 h-14 rounded-full bg-gradient-to-br from-gold/20 to-rose-gold/20 border border-gold/30 flex items-center justify-center mb-2">
                        <Icon className="size-6 text-gold" />
                      </div>
                      <CardTitle className="font-serif text-lg font-semibold">
                        {feature.title}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-muted-foreground font-display leading-relaxed">
                        {feature.description}
                      </p>
                    </CardContent>
                  </Card>
                </motion.div>
              )
            })}
          </div>
        </div>
      </section>

      {/* ─── LEAD CAPTURE FORM ────────────────────────────────────────── */}
      <section
        id="demande"
        className="relative py-16 md:py-24 px-4 sm:px-6 lg:px-8 scroll-mt-20"
      >
        <div className="max-w-3xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="text-center mb-10"
          >
            <div className="section-divider max-w-md mx-auto mb-6">
              <span className="flourish text-sm">✦</span>
            </div>
            <h2 className="font-serif text-3xl sm:text-4xl md:text-5xl font-bold gold-gradient mb-4">
              Demandez votre mariage sur mesure
            </h2>
            <p className="text-muted-foreground font-display text-sm sm:text-base">
              Remplissez ce formulaire. Un conseiller Heureux Mariage vous
              contactera sur WhatsApp sous 24h pour finaliser votre offre.
            </p>
          </motion.div>

          {submitted ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5 }}
            >
              <Card className="border-gold/40 gold-border bg-card/95 backdrop-blur-md">
                <CardContent className="pt-8 pb-8 text-center space-y-5">
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{
                      type: 'spring',
                      stiffness: 200,
                      damping: 15,
                      delay: 0.2,
                    }}
                    className="mx-auto w-20 h-20 rounded-full bg-gradient-to-br from-gold/20 to-rose-gold/20 border border-gold/40 flex items-center justify-center"
                  >
                    <Heart className="size-10 text-gold fill-gold/30" />
                  </motion.div>
                  <div className="space-y-2">
                    <h3 className="font-serif text-2xl md:text-3xl font-bold gold-gradient">
                      Merci ! Votre demande a bien été reçue. 💍
                    </h3>
                    <p className="text-muted-foreground font-display text-sm md:text-base max-w-md mx-auto leading-relaxed">
                      Un conseiller Heureux Mariage vous contactera sur WhatsApp
                      sous 24h pour finaliser votre offre.
                    </p>
                  </div>
                  <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
                    <Button
                      asChild
                      className="bg-gradient-gold text-white hover:opacity-90 rounded-full px-6"
                    >
                      <Link href="/">
                        Découvrir un exemple de mariage
                        <ArrowRight className="size-4" />
                      </Link>
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => setSubmitted(false)}
                      className="text-muted-foreground hover:text-foreground rounded-full"
                    >
                      Envoyer une autre demande
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ) : (
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
            >
              <Card className="glass-card border-gold/20 bg-card/80 backdrop-blur-md shadow-xl shadow-gold/5">
                <CardHeader>
                  <CardTitle className="font-serif text-xl md:text-2xl font-bold flex items-center gap-2">
                    <MessageCircle className="size-5 text-gold" />
                    Formulaire de demande
                  </CardTitle>
                  <CardDescription className="font-display">
                    Les champs marqués d&apos;un{' '}
                    <span className="text-destructive">*</span> sont obligatoires.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <form
                    onSubmit={handleSubmit(onSubmit)}
                    className="space-y-5"
                    noValidate
                  >
                    {/* Couple names — side by side on md+ */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="brideName" className="text-foreground">
                          Prénom de la mariée{' '}
                          <span className="text-destructive">*</span>
                        </Label>
                        <Input
                          id="brideName"
                          type="text"
                          autoComplete="given-name"
                          placeholder="Ex. Hornella"
                          aria-label="Prénom de la mariée"
                          aria-invalid={!!errors.brideName}
                          aria-required="true"
                          className="bg-background/60"
                          {...register('brideName')}
                        />
                        {errors.brideName && (
                          <p className="text-xs text-destructive font-display">
                            {errors.brideName.message}
                          </p>
                        )}
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="groomName" className="text-foreground">
                          Prénom du marié{' '}
                          <span className="text-destructive">*</span>
                        </Label>
                        <Input
                          id="groomName"
                          type="text"
                          autoComplete="given-name"
                          placeholder="Ex. Josué"
                          aria-label="Prénom du marié"
                          aria-invalid={!!errors.groomName}
                          aria-required="true"
                          className="bg-background/60"
                          {...register('groomName')}
                        />
                        {errors.groomName && (
                          <p className="text-xs text-destructive font-display">
                            {errors.groomName.message}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Wedding date + venue city */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="weddingDate" className="text-foreground">
                          Date du mariage{' '}
                          <span className="text-muted-foreground text-xs">
                            (optionnel)
                          </span>
                        </Label>
                        <Input
                          id="weddingDate"
                          type="date"
                          aria-label="Date du mariage"
                          className="bg-background/60"
                          {...register('weddingDate')}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="venueCity" className="text-foreground">
                          Ville du mariage{' '}
                          <span className="text-muted-foreground text-xs">
                            (optionnel)
                          </span>
                        </Label>
                        <Input
                          id="venueCity"
                          type="text"
                          autoComplete="address-level2"
                          placeholder="Ex. Kinshasa"
                          aria-label="Ville du mariage"
                          className="bg-background/60"
                          {...register('venueCity')}
                        />
                      </div>
                    </div>

                    {/* Email + phone */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="email" className="text-foreground">
                          Email <span className="text-destructive">*</span>
                        </Label>
                        <Input
                          id="email"
                          type="email"
                          autoComplete="email"
                          placeholder="vous@exemple.com"
                          aria-label="Adresse email"
                          aria-invalid={!!errors.email}
                          aria-required="true"
                          className="bg-background/60"
                          {...register('email')}
                        />
                        {errors.email && (
                          <p className="text-xs text-destructive font-display">
                            {errors.email.message}
                          </p>
                        )}
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="phone" className="text-foreground">
                          Téléphone WhatsApp{' '}
                          <span className="text-muted-foreground text-xs">
                            (recommandé)
                          </span>
                        </Label>
                        <Input
                          id="phone"
                          type="tel"
                          autoComplete="tel"
                          placeholder="Ex. +243 970 000 000"
                          aria-label="Numéro de téléphone WhatsApp pour vous contacter rapidement"
                          className="bg-background/60"
                          {...register('phone')}
                        />
                        <p className="text-[11px] text-muted-foreground/80 font-display">
                          Pour vous contacter rapidement
                        </p>
                      </div>
                    </div>

                    {/* Plan select */}
                    <div className="space-y-2">
                      <Label htmlFor="plan" className="text-foreground">
                        Plan souhaité <span className="text-destructive">*</span>
                      </Label>
                      <Select
                        value={selectedPlan}
                        onValueChange={(val) =>
                          setValue('plan', val as LeadFormValues['plan'], {
                            shouldValidate: true,
                          })
                        }
                      >
                        <SelectTrigger
                          id="plan"
                          className="w-full bg-background/60 h-10"
                          aria-label="Plan souhaité"
                          aria-required="true"
                        >
                          <SelectValue placeholder="Sélectionnez un plan" />
                        </SelectTrigger>
                        <SelectContent>
                          {PLANS_PREVIEW.map((p) => (
                            <SelectItem key={p.key} value={p.key}>
                              {p.label}
                              {p.priceFcfa > 0
                                ? ` — ${formatUsd(p.priceUsd)}`
                                : ' — Gratuit'}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {errors.plan && (
                        <p className="text-xs text-destructive font-display">
                          {errors.plan.message}
                        </p>
                      )}
                      <p className="text-[11px] text-muted-foreground/80 font-display">
                        Plan sélectionné :{' '}
                        <span className="text-gold font-medium">
                          {PLAN_LABELS[selectedPlan]}
                        </span>
                      </p>
                    </div>

                    {/* Message */}
                    <div className="space-y-2">
                      <Label htmlFor="message" className="text-foreground">
                        Message{' '}
                        <span className="text-muted-foreground text-xs">
                          (optionnel)
                        </span>
                      </Label>
                      <Textarea
                        id="message"
                        rows={4}
                        placeholder="Parlez-nous de votre projet : nombre d'invités estimé, style souhaité, dates importantes, etc."
                        aria-label="Message — parlez-nous de votre projet"
                        className="bg-background/60 resize-y min-h-24"
                        {...register('message')}
                      />
                      {errors.message && (
                        <p className="text-xs text-destructive font-display">
                          {errors.message.message}
                        </p>
                      )}
                    </div>

                    {/* Submit */}
                    <Button
                      type="submit"
                      disabled={isSubmitting}
                      aria-describedby="onboarding-submit-status"
                      className="btn-premium w-full sm:w-auto bg-gradient-gold text-white hover:opacity-90 rounded-full px-8 py-6 text-base shadow-lg shadow-gold/20 disabled:opacity-60 disabled:shadow-none"
                      aria-label="Envoyer ma demande"
                    >
                      {isSubmitting ? (
                        <>
                          <Loader2 className="size-4 animate-spin" />
                          Envoi en cours...
                        </>
                      ) : (
                        <>
                          <Send className="size-4" />
                          Envoyer ma demande
                        </>
                      )}
                    </Button>
                    {/* P1-UX-8: screen-reader-only status explaining why the submit
                        button is disabled (during submission). Sighted users see
                        the inline spinner + "Envoi en cours..." label; non-sighted
                        users get the same context via aria-describedby. */}
                    <span id="onboarding-submit-status" className="sr-only">
                      {isSubmitting
                        ? 'Envoi de votre demande en cours, veuillez patienter.'
                        : 'Bouton d’envoi disponible.'}
                    </span>

                    <p className="text-[11px] text-muted-foreground/70 font-display leading-relaxed pt-2 border-t border-border/40">
                      🔒 Vos données restent confidentielles et ne sont utilisées
                      que pour vous contacter au sujet de votre mariage. Aucun
                      paiement en ligne : tout se fait via WhatsApp avec votre
                      conseiller.
                    </p>
                  </form>
                </CardContent>
              </Card>
            </motion.div>
          )}
        </div>
      </section>

      {/* ─── FOOTER (sticky bottom via mt-auto) ──────────────────────── */}
      <Footer />
    </div>
  )
}

