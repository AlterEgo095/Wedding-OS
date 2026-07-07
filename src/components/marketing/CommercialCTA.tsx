'use client'

import { motion } from 'framer-motion'
import Link from 'next/link'
import { ArrowRight, MessageCircle, Sparkles } from 'lucide-react'

/**
 * CommercialCTA — SECTION 9
 *
 * Real onboarding CTA. No fake checkout. The billing flow is manual
 * (WhatsApp-negotiated), so the CTA points to /onboarding (lead capture)
 * and a WhatsApp contact link. Honest about the current commercial model.
 */

const WHATSAPP_URL = 'https://wa.me/243816515095?text=Bonjour%2C%20je%20souhaite%20cr%C3%A9er%20une%20exp%C3%A9rience%20%C3%A9v%C3%A9nementielle%20sur%20votre%20plateforme.'

export default function CommercialCTA() {
  return (
    <section className="relative py-20 md:py-32 px-4 sm:px-6 lg:px-8 overflow-hidden">
      {/* Cinematic backdrop */}
      <div className="absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-gradient-to-br from-[oklch(0.16_0.03_290)] via-background to-[oklch(0.14_0.04_30)]" />
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-gold/30 to-transparent" />
        <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-gold/30 to-transparent" />
        {/* Gold particles */}
        <div className="absolute top-1/4 left-10 w-1.5 h-1.5 rounded-full bg-gold/40 blur-sm animate-pulse-gold" />
        <div className="absolute bottom-1/3 right-16 w-2 h-2 rounded-full bg-gold/30 blur-sm animate-pulse-gold" style={{ animationDelay: '1s' }} />
        <div className="absolute top-1/2 right-1/4 w-1 h-1 rounded-full bg-gold-light/50 blur-sm animate-pulse-gold" style={{ animationDelay: '2s' }} />
      </div>

      <div className="max-w-4xl mx-auto text-center">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.7 }}
        >
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-gold/20 bg-gold/5 mb-8">
            <Sparkles className="size-3.5 text-gold/70" />
            <span className="font-display text-[10px] sm:text-xs tracking-[0.25em] uppercase text-gold/80 font-semibold">
              Lancez votre événement
            </span>
          </div>

          <h2 className="font-serif text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold mb-6 leading-tight">
            <span className="text-foreground">Votre événement mérite</span>{' '}
            <span className="gold-gradient">sa propre expérience numérique.</span>
          </h2>

          <p className="font-display text-base sm:text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto mb-10 leading-relaxed">
            Décrivez votre projet, choisissez une Collection, et lancez votre expérience
            en quelques jours — sans développement sur mesure.
          </p>

          {/* CTAs — real routes */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <Link
              href="/onboarding"
              className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-full bg-gradient-to-r from-gold to-gold-dark hover:from-gold-dark hover:to-gold text-white font-display tracking-wide text-sm font-semibold shadow-2xl shadow-gold/30 hover:shadow-gold/50 transition-all duration-300 btn-premium w-full sm:w-auto"
            >
              Créer mon événement
              <ArrowRight className="size-4" />
            </Link>
            <a
              href={WHATSAPP_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-full glass-card gold-border text-foreground/90 font-display tracking-wide text-sm font-semibold transition-all duration-300 hover:bg-gold/10 w-full sm:w-auto"
            >
              <MessageCircle className="size-4" />
              Demander une démonstration
            </a>
          </div>

          {/* Honest note about the commercial model */}
          <motion.p
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7, delay: 0.4 }}
            className="mt-8 font-display text-xs text-muted-foreground max-w-lg mx-auto"
          >
            Formules Trial, Essentiel, Premium et Élite.
            Tarification négociée selon votre projet — paiement mobile money, virement ou espèces.
          </motion.p>
        </motion.div>
      </div>
    </section>
  )
}
