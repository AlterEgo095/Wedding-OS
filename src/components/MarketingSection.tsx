'use client'

import { useRef } from 'react'
import { motion, useInView } from 'framer-motion'
import type { Easing } from 'framer-motion'
import { MessageCircle, Sparkles, QrCode, Users, LayoutDashboard, Mail, CalendarCheck, Image as ImageIcon, ArrowRight, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useMotionTier } from '@/lib/motion/useMotionTier'

const WHATSAPP_URL = 'https://wa.me/243816515095?text=Bonjour%2C%20je%20souhaite%20obtenir%20une%20plateforme%20%C3%A9v%C3%A9nementielle%20similaire%20pour%20mon%20mariage%20ou%20mon%20%C3%A9v%C3%A9nement.'

const features = [
  { icon: Users, label: 'Gestion intelligente des invités' },
  { icon: QrCode, label: 'QR Codes personnalisés' },
  { icon: Mail, label: 'Invitations numériques premium' },
  { icon: CalendarCheck, label: 'Attribution automatique des tables' },
  { icon: ImageIcon, label: 'Galeries photos élégantes' },
  { icon: LayoutDashboard, label: 'Tableaux de bord administratifs' },
]

export default function MarketingSection() {
  const sectionRef = useRef<HTMLDivElement>(null)
  const isInView = useInView(sectionRef, { once: true, margin: '-80px' })
  const { config: motionCfg, reduced: prefersReducedMotion, tier } = useMotionTier()
  // Static path: render plain divs (no motion). Layout/className/children are
  // identical — only the animation layer is removed.
  const isStatic = prefersReducedMotion || tier === 'none'

  return (
    <section
      ref={sectionRef}
      className="relative py-20 md:py-32 overflow-hidden"
    >
      {/* ─── Background ─── */}
      <div className="absolute inset-0 bg-gradient-to-br from-background via-champagne/5 to-background" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,oklch(0.68_0.12_85/0.06),transparent_50%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,oklch(0.72_0.08_30/0.04),transparent_50%)]" />

      {/* Decorative top/bottom borders */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-gold/20 to-transparent" />
      <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-gold/20 to-transparent" />

      {/* Floating particles */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <motion.div
          animate={isStatic ? undefined : { y: [-15, 15, -15], opacity: [0.15, 0.3, 0.15] }}
          transition={isStatic ? undefined : { duration: 6, repeat: Infinity, ease: 'easeInOut' }}
          style={isStatic ? { opacity: 0.2 } : undefined}
          className="absolute top-1/4 left-[10%] w-2 h-2 rounded-full bg-gold/20"
        />
        <motion.div
          animate={isStatic ? undefined : { y: [10, -10, 10], opacity: [0.1, 0.25, 0.1] }}
          transition={isStatic ? undefined : { duration: 5, repeat: Infinity, ease: 'easeInOut', delay: 1 }}
          style={isStatic ? { opacity: 0.15 } : undefined}
          className="absolute top-1/3 right-[15%] w-1.5 h-1.5 rounded-full bg-rose-gold/20"
        />
        <motion.div
          animate={isStatic ? undefined : { y: [-10, 10, -10], opacity: [0.15, 0.3, 0.15] }}
          transition={isStatic ? undefined : { duration: 7, repeat: Infinity, ease: 'easeInOut', delay: 2 }}
          style={isStatic ? { opacity: 0.2 } : undefined}
          className="absolute bottom-1/4 left-[20%] w-1 h-1 rounded-full bg-gold-light/20"
        />
      </div>

      <div className="relative z-10 max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* ─── Section Title ─── */}
        <motion.div
          initial={isStatic ? false : { opacity: 0, y: 30 }}
          animate={isStatic ? undefined : (isInView ? { opacity: 1, y: 0 } : {})}
          transition={isStatic ? { duration: 0 } : { duration: motionCfg.duration, ease: motionCfg.ease as Easing }}
          className="text-center mb-12"
        >
          {/* Badge */}
          <motion.div
            initial={isStatic ? false : { opacity: 0, scale: 0.9 }}
            animate={isStatic ? undefined : (isInView ? { opacity: 1, scale: 1 } : {})}
            transition={isStatic ? { duration: 0 } : { duration: motionCfg.duration, ease: motionCfg.ease as Easing, delay: 0.2 }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass-card gold-border mb-8"
          >
            <Sparkles className="size-4 text-gold" />
            <span className="text-sm font-display tracking-wide text-gold">Expérience Premium</span>
          </motion.div>

          <h2 className="font-serif text-3xl md:text-5xl font-bold mb-6 leading-tight">
            Vous organisez un mariage, une conférence,
            <br className="hidden sm:block" />
            <span className="gold-gradient"> une remise de diplômes ou un événement privé ?</span>
          </h2>

          <p className="font-display text-lg md:text-xl text-muted-foreground max-w-3xl mx-auto leading-relaxed">
            Offrez à vos invités une expérience numérique moderne, élégante et personnalisée grâce à une plateforme dédiée à votre événement.
          </p>

          <div className="section-divider max-w-xs mx-auto mt-8">
            <span className="flourish text-sm">✦</span>
          </div>
        </motion.div>

        {/* ─── Feature Grid ─── */}
        <motion.div
          initial={isStatic ? false : { opacity: 0, y: 20 }}
          animate={isStatic ? undefined : (isInView ? { opacity: 1, y: 0 } : {})}
          transition={isStatic ? { duration: 0 } : { duration: motionCfg.duration, ease: motionCfg.ease as Easing, delay: 0.3 }}
          className="grid grid-cols-2 md:grid-cols-3 gap-4 md:gap-6 mb-12"
        >
          {features.map((feature, i) => (
            <motion.div
              key={feature.label}
              initial={isStatic ? false : { opacity: 0, y: 20 }}
              animate={isStatic ? undefined : (isInView ? { opacity: 1, y: 0 } : {})}
              transition={isStatic ? { duration: 0 } : { delay: 0.3 + i * 0.08, duration: motionCfg.duration, ease: motionCfg.ease as Easing }}
              className="glass-card p-4 md:p-6 rounded-xl text-center group hover:shadow-lg hover:shadow-gold/5 transition-all duration-300"
            >
              <div className="w-10 h-10 md:w-12 md:h-12 mx-auto mb-3 rounded-full bg-gradient-to-br from-gold/10 to-rose-gold/10 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                <feature.icon className="size-5 md:size-6 text-gold" />
              </div>
              <span className="font-display text-xs md:text-sm text-muted-foreground leading-snug">
                {feature.label}
              </span>
            </motion.div>
          ))}
        </motion.div>

        {/* ─── Marketing Text ─── */}
        <motion.div
          initial={isStatic ? false : { opacity: 0, y: 20 }}
          animate={isStatic ? undefined : (isInView ? { opacity: 1, y: 0 } : {})}
          transition={isStatic ? { duration: 0 } : { duration: motionCfg.duration, ease: motionCfg.ease as Easing, delay: 0.6 }}
          className="max-w-3xl mx-auto text-center mb-12"
        >
          <p className="font-display text-base md:text-lg text-muted-foreground/80 leading-relaxed mb-6">
            De la gestion intelligente des invités à l&apos;attribution automatique des tables, en passant par les invitations numériques personnalisées, les QR Codes, les galeries photos, les confirmations de présence et les tableaux de bord administratifs, nous concevons des plateformes événementielles sur mesure qui valorisent votre image et simplifient l&apos;organisation de vos événements.
          </p>

          <div className="flex items-center justify-center gap-6 mb-8">
            {['Sur mesure', 'Premium', 'Innovant'].map((item, i) => (
              <motion.div
                key={item}
                initial={isStatic ? false : { opacity: 0, x: i === 0 ? -20 : i === 2 ? 20 : 0, scale: 0.8 }}
                animate={isStatic ? undefined : (isInView ? { opacity: 1, x: 0, scale: 1 } : {})}
                transition={isStatic ? { duration: 0 } : { delay: 0.8 + i * 0.1, duration: motionCfg.duration, ease: motionCfg.ease as Easing }}
                className="flex items-center gap-1.5"
              >
                <CheckCircle2 className="size-4 text-gold" />
                <span className="font-display text-sm text-foreground/70">{item}</span>
              </motion.div>
            ))}
          </div>

          <p className="font-serif text-xl md:text-2xl font-semibold text-foreground/90 italic">
            Transformez votre cérémonie en une expérience mémorable, professionnelle et innovante.
          </p>
        </motion.div>

        {/* ─── CTA Button ─── */}
        <motion.div
          initial={isStatic ? false : { opacity: 0, y: 20 }}
          animate={isStatic ? undefined : (isInView ? { opacity: 1, y: 0 } : {})}
          transition={isStatic ? { duration: 0 } : { duration: motionCfg.duration, ease: motionCfg.ease as Easing, delay: 0.9 }}
          className="flex flex-col items-center"
        >
          <a
            href={WHATSAPP_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="group relative inline-flex items-center gap-3"
          >
            {/* Glow background */}
            <div className="absolute -inset-2 rounded-full bg-gradient-to-r from-green-500/20 via-green-400/10 to-green-500/20 blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

            <Button
              size="lg"
              className="relative bg-gradient-to-r from-[#25D366] to-[#128C7E] hover:from-[#20BD5A] hover:to-[#0F7A6E] text-white shadow-xl shadow-green-500/20 hover:shadow-2xl hover:shadow-green-500/30 transition-all duration-300 rounded-full px-8 py-6 text-base md:text-lg font-display tracking-wide"
            >
              {/* WhatsApp Icon */}
              <svg
                viewBox="0 0 24 24"
                className="size-5 md:size-6 mr-1"
                fill="currentColor"
              >
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
              </svg>

              Créer ma plateforme événementielle

              <ArrowRight className="size-5 ml-1 group-hover:translate-x-1 transition-transform duration-300" />
            </Button>
          </a>

          <p className="mt-4 text-xs font-display text-muted-foreground/50 text-center">
            Réponse rapide via WhatsApp — Disponible 24/7
          </p>
        </motion.div>
      </div>
    </section>
  )
}