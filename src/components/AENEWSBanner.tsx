'use client'

import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import { motion, useInView } from 'framer-motion'
import type { Easing } from 'framer-motion'
import {
  Sparkles, Users, QrCode, Mail, CalendarCheck,
  Image as ImageIcon, LayoutDashboard, ArrowRight,
  Globe, Cpu, Zap, Heart, CheckCircle2, ExternalLink
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useMotionTier } from '@/lib/motion/useMotionTier'

const WHATSAPP_URL = 'https://wa.me/243816515095?text=Bonjour%2C%20je%20souhaite%20obtenir%20une%20plateforme%20similaire%20pour%20mon%20%C3%A9v%C3%A9nement.'
const AENEWS_URL = 'https://aenews.net'

// ─── P1.10 White Label — platform domain detection ──────────────────────────
// The AENEWS banner is the platform's marketing CTA (WhatsApp + aenews.net
// link). White-label customers pay to remove AENEWS branding from their custom
// domain — so this component must auto-hide when rendered on a non-platform
// host.
//
// Detection is client-side because AENEWSBanner is a Client Component (uses
// framer-motion's useInView). The server-side equivalent — reading the
// `x-white-label` response header set by middleware — is unavailable to client
// components (the header is on the HTTP response, not accessible from
// `document`). Instead we mirror the `isCustomDomainRequest` logic from
// `src/lib/custom-domains.ts` here in a client-safe form.
//
// Hydration safety:
//   - `shouldRender` starts at `false` (matches SSR — server can't read window).
//   - After mount, we read `window.location.hostname` and flip to `true` only
//     on platform domains. On custom domains it stays `false` and the banner
//     is never attached to the DOM.
//   - This means a brief delay before the banner appears on the default
//     platform domain (~1 tick after hydration). Acceptable: the banner is
//     below the fold, and the alternative (SSR-render then hide) would flash
//     the AENEWS logo on white-label domains for ~1 frame.
const PLATFORM_DOMAIN_SUFFIXES = ['.aenews.net', '.hpph.net', '.aenews.store']
const PLATFORM_HOSTS = new Set([
  'wedding.hpph.net',
  'www.wedding.hpph.net',
  'wedding.aenews.store',
  'www.wedding.aenews.store',
  'localhost',
  '127.0.0.1',
])

function isPlatformHost(host: string): boolean {
  const normalized = host.toLowerCase().trim()
  if (!normalized) return false
  if (PLATFORM_HOSTS.has(normalized)) return true
  for (const suffix of PLATFORM_DOMAIN_SUFFIXES) {
    if (normalized.endsWith(suffix)) return true
  }
  return false
}

const features = [
  { icon: Users, label: 'Gestion intelligente des invités' },
  { icon: Mail, label: 'Invitations numériques personnalisées' },
  { icon: CalendarCheck, label: 'Attribution automatique des tables' },
  { icon: QrCode, label: 'QR Codes sécurisés' },
  { icon: ImageIcon, label: 'Sites de mariage premium' },
  { icon: LayoutDashboard, label: 'Applications web sur mesure' },
  { icon: Globe, label: 'Automatisation de processus' },
  { icon: Cpu, label: "Solutions d'intelligence artificielle" },
]

interface AENEWSBannerProps {
  variant?: 'homepage' | 'invitation'
}

export default function AENEWSBanner({ variant = 'homepage' }: AENEWSBannerProps) {
  const sectionRef = useRef<HTMLDivElement>(null)
  const isInView = useInView(sectionRef, { once: true, margin: '-60px' })
  const { config: motionCfg, reduced: prefersReducedMotion, tier } = useMotionTier()
  // Static path: render plain divs (no motion). Layout/className/children are
  // identical — only the animation layer is removed.
  const isStatic = prefersReducedMotion || tier === 'none'

  // ─── P1.10 White Label — auto-hide on custom domains ─────────────────────
  // `shouldRender` starts false on both server and client first render (no
  // hydration mismatch). After mount, we check `window.location.hostname`:
  //   - Platform domain (wedding.hpph.net, *.aenews.net, *.hpph.net,
  //     localhost) → set to true → banner appears.
  //   - Custom domain → leave false → banner never attaches.
  //
  // This is the only behavior change to this component: on the default
  // platform domain the banner renders exactly as before (after a ~1-tick
  // delay imperceptible to users since the banner is below the fold). On a
  // custom domain it never appears — exactly what white-label customers expect.
  const [shouldRender, setShouldRender] = useState(false)
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (isPlatformHost(window.location.hostname)) {
      setShouldRender(true)
    }
    // Else: leave false — custom domain, white-label mode, hide the banner.
  }, [])

  if (!shouldRender) return null

  return (
    <section
      ref={sectionRef}
      className={`relative overflow-hidden ${
        variant === 'homepage' ? 'py-16 md:py-24' : 'py-12 md:py-16'
      }`}
    >
      {/* ─── Cinematic Dark Background ─── */}
      <div className="absolute inset-0 bg-gradient-to-br from-[oklch(0.10_0.02_270)] via-[oklch(0.08_0.03_270)] to-[oklch(0.06_0.04_270)]" />

      {/* Animated gradient mesh */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <motion.div
          animate={isStatic ? undefined : {
            x: [0, 40, 0],
            y: [0, -30, 0],
            opacity: [0.15, 0.35, 0.15],
          }}
          transition={isStatic ? undefined : { duration: 10, repeat: Infinity, ease: 'easeInOut' }}
          style={isStatic ? { opacity: 0.25 } : undefined}
          className="absolute -top-32 -right-32 w-[500px] h-[500px] rounded-full"
        >
          <div className="absolute inset-0 rounded-full" style={{
            background: 'radial-gradient(circle, oklch(0.68 0.12 85 / 10%) 0%, transparent 70%)',
          }} />
        </motion.div>
        <motion.div
          animate={isStatic ? undefined : {
            x: [0, -30, 0],
            y: [0, 25, 0],
            opacity: [0.1, 0.25, 0.1],
          }}
          transition={isStatic ? undefined : { duration: 12, repeat: Infinity, ease: 'easeInOut', delay: 2 }}
          style={isStatic ? { opacity: 0.18 } : undefined}
          className="absolute -bottom-32 -left-32 w-[600px] h-[600px] rounded-full"
        >
          <div className="absolute inset-0 rounded-full" style={{
            background: 'radial-gradient(circle, oklch(0.72 0.08 30 / 6%) 0%, transparent 70%)',
          }} />
        </motion.div>
      </div>

      {/* Grid pattern overlay */}
      <div
        className="absolute inset-0 opacity-[0.02]"
        style={{
          backgroundImage: `
            linear-gradient(oklch(0.72 0.12 85 / 30%) 1px, transparent 1px),
            linear-gradient(90deg, oklch(0.72 0.12 85 / 30%) 1px, transparent 1px)
          `,
          backgroundSize: '80px 80px',
        }}
      />

      {/* Top gold line */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-gold/40 to-transparent" />
      {/* Bottom gold line */}
      <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-gold/40 to-transparent" />

      <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* ─── Header with Logo ─── */}
        <motion.div
          initial={isStatic ? false : { opacity: 0, y: 20 }}
          animate={isStatic ? undefined : (isInView ? { opacity: 1, y: 0 } : {})}
          transition={isStatic ? { duration: 0 } : { duration: motionCfg.duration, ease: motionCfg.ease as Easing }}
          className="text-center mb-8 md:mb-12"
        >
          {/* AENEWS Logo */}
          <motion.div
            initial={isStatic ? false : { opacity: 0, scale: 0.9 }}
            animate={isStatic ? undefined : (isInView ? { opacity: 1, scale: 1 } : {})}
            transition={isStatic ? { duration: 0 } : { duration: motionCfg.duration, ease: motionCfg.ease as Easing, delay: 0.1 }}
            className="flex items-center justify-center mb-6"
          >
            <div className="relative">
              {/* Glow effect behind logo */}
              <div className="absolute -inset-4 rounded-2xl bg-gradient-to-br from-gold/15 via-transparent to-rose-gold/10 blur-xl" />
              {/* Logo */}
              <div className="relative">
                <Image
                  src="/aenews-logo.png"
                  alt="AENEWS — Solutions Numériques Innovantes"
                  width={200}
                  height={133}
                  className="h-16 md:h-20 w-auto object-contain"
                  priority
                />
              </div>
            </div>
          </motion.div>

          {/* Title */}
          <motion.div
            initial={isStatic ? false : { opacity: 0, y: 10 }}
            animate={isStatic ? undefined : (isInView ? { opacity: 1, y: 0 } : {})}
            transition={isStatic ? { duration: 0 } : { duration: motionCfg.duration, ease: motionCfg.ease as Easing, delay: 0.2 }}
          >
            <p className="font-display text-xs md:text-sm tracking-[0.2em] uppercase text-white/30 mb-3 font-semibold">
              Expérience digitale
            </p>
            <h2 className="font-serif text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold leading-tight mb-4">
              <span className="text-white/90">Cette expérience digitale a été</span>
              <br />
              <span className="bg-gradient-to-r from-gold-light via-gold to-rose-gold bg-clip-text text-transparent">
                conçue par AENEWS
              </span>
            </h2>
          </motion.div>

          {/* Subtitle */}
          <motion.p
            initial={isStatic ? false : { opacity: 0, y: 10 }}
            animate={isStatic ? undefined : (isInView ? { opacity: 1, y: 0 } : {})}
            transition={isStatic ? { duration: 0 } : { duration: motionCfg.duration, ease: motionCfg.ease as Easing, delay: 0.3 }}
            className="font-display text-sm md:text-base lg:text-lg text-white/50 max-w-2xl mx-auto leading-relaxed"
          >
            Solutions numériques innovantes pour mariages, événements, entreprises et organisations.
          </motion.p>

          {/* Decorative divider */}
          <motion.div
            initial={isStatic ? false : { opacity: 0, scaleX: 0 }}
            animate={isStatic ? undefined : (isInView ? { opacity: 1, scaleX: 1 } : {})}
            transition={isStatic ? { duration: 0 } : { duration: motionCfg.duration, ease: motionCfg.ease as Easing, delay: 0.4 }}
            className="flex items-center justify-center gap-3 mt-6"
          >
            <div className="h-px w-16 bg-gradient-to-r from-transparent to-gold/40" />
            <Sparkles className="size-4 text-gold/50" />
            <div className="h-px w-16 bg-gradient-to-l from-transparent to-gold/40" />
          </motion.div>
        </motion.div>

        {/* ─── Description ─── */}
        <motion.div
          initial={isStatic ? false : { opacity: 0, y: 20 }}
          animate={isStatic ? undefined : (isInView ? { opacity: 1, y: 0 } : {})}
          transition={isStatic ? { duration: 0 } : { duration: motionCfg.duration, ease: motionCfg.ease as Easing, delay: 0.4 }}
          className="max-w-3xl mx-auto text-center mb-8 md:mb-10"
        >
          <p className="font-display text-sm md:text-base text-white/40 leading-relaxed mb-4">
            Vous organisez un mariage, une conférence, une remise de diplôme, une cérémonie familiale ou un événement professionnel ?
          </p>
          <p className="font-display text-sm md:text-base text-white/35 leading-relaxed">
            AENEWS développe des plateformes événementielles modernes permettant :
          </p>
        </motion.div>

        {/* ─── Feature Grid ─── */}
        <motion.div
          initial={isStatic ? false : { opacity: 0, y: 20 }}
          animate={isStatic ? undefined : (isInView ? { opacity: 1, y: 0 } : {})}
          transition={isStatic ? { duration: 0 } : { duration: motionCfg.duration, ease: motionCfg.ease as Easing, delay: 0.5 }}
          className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 mb-8 md:mb-10 max-w-4xl mx-auto"
        >
          {features.map((feature, i) => (
            <motion.div
              key={feature.label}
              initial={isStatic ? false : { opacity: 0, y: 15 }}
              animate={isStatic ? undefined : (isInView ? { opacity: 1, y: 0 } : {})}
              transition={isStatic ? { duration: 0 } : { delay: 0.5 + i * 0.06, duration: motionCfg.duration, ease: motionCfg.ease as Easing }}
              className="flex flex-col items-center gap-2 p-3 md:p-4 rounded-xl border border-white/5 bg-white/[0.02] backdrop-blur-sm hover:bg-white/[0.06] hover:border-gold/20 transition-all duration-300 group"
            >
              <div className="w-8 h-8 md:w-10 md:h-10 rounded-lg bg-gradient-to-br from-gold/12 to-rose-gold/8 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                <feature.icon className="size-4 md:size-5 text-gold/70 group-hover:text-gold-light transition-colors" />
              </div>
              <span className="text-[10px] md:text-xs font-display font-semibold text-white/40 group-hover:text-white/60 transition-colors text-center leading-tight">
                {feature.label}
              </span>
            </motion.div>
          ))}
        </motion.div>

        {/* ─── Closing Statement ─── */}
        <motion.div
          initial={isStatic ? false : { opacity: 0, y: 10 }}
          animate={isStatic ? undefined : (isInView ? { opacity: 1, y: 0 } : {})}
          transition={isStatic ? { duration: 0 } : { duration: motionCfg.duration, ease: motionCfg.ease as Easing, delay: 0.7 }}
          className="text-center mb-8 md:mb-10"
        >
          <p className="font-serif text-lg md:text-xl lg:text-2xl font-semibold text-white/60 italic">
            Transformez votre événement en une expérience moderne, élégante et mémorable.
          </p>
        </motion.div>

        {/* ─── CTA Buttons ─── */}
        <motion.div
          initial={isStatic ? false : { opacity: 0, y: 20 }}
          animate={isStatic ? undefined : (isInView ? { opacity: 1, y: 0 } : {})}
          transition={isStatic ? { duration: 0 } : { duration: motionCfg.duration, ease: motionCfg.ease as Easing, delay: 0.8 }}
          className="flex flex-col sm:flex-row items-center justify-center gap-4"
        >
          {/* Primary: Créer ma plateforme — WhatsApp */}
          <a
            href={WHATSAPP_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="group relative w-full sm:w-auto"
          >
            <div className="absolute -inset-1.5 rounded-full bg-gradient-to-r from-[#25D366]/20 via-[#128C7E]/10 to-[#25D366]/20 blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            <Button
              size="lg"
              className="relative w-full sm:w-auto bg-gradient-to-r from-[#25D366] to-[#128C7E] hover:from-[#20BD5A] hover:to-[#0F7A6E] text-white shadow-xl shadow-green-500/20 hover:shadow-2xl hover:shadow-green-500/30 transition-all duration-300 rounded-full px-8 py-6 font-display font-bold tracking-wide text-base"
            >
              <svg viewBox="0 0 24 24" className="size-5 mr-2" fill="currentColor">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
              </svg>
              Créer ma plateforme
              <ArrowRight className="size-4 ml-2 group-hover:translate-x-1 transition-transform duration-300" />
            </Button>
          </a>

          {/* Secondary: Découvrir AENEWS */}
          <a
            href={AENEWS_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="group relative w-full sm:w-auto"
          >
            <Button
              size="lg"
              variant="outline"
              className="relative w-full sm:w-auto border-white/15 hover:border-gold/40 bg-white/[0.03] hover:bg-white/[0.08] text-white/70 hover:text-white rounded-full px-8 py-6 font-display font-bold tracking-wide transition-all duration-300 text-base"
            >
              <ExternalLink className="size-4 mr-2" />
              Découvrir AENEWS
            </Button>
          </a>
        </motion.div>

        {/* ─── Signature de marque ─── */}
        <motion.div
          initial={isStatic ? false : { opacity: 0 }}
          animate={isStatic ? undefined : (isInView ? { opacity: 1 } : {})}
          transition={isStatic ? { duration: 0 } : { duration: motionCfg.duration, ease: motionCfg.ease as Easing, delay: 1.0 }}
          className="mt-10 md:mt-14 text-center"
        >
          <div className="flex items-center justify-center gap-3 text-white/20">
            <div className="h-px w-10 bg-gradient-to-r from-transparent to-gold/20" />
            <Heart className="size-3 fill-current" />
            <span className="text-[10px] font-display font-bold tracking-[0.2em] uppercase">
              Développé avec passion par AENEWS
            </span>
            <Heart className="size-3 fill-current" />
            <div className="h-px w-10 bg-gradient-to-l from-transparent to-gold/20" />
          </div>
        </motion.div>
      </div>
    </section>
  )
}