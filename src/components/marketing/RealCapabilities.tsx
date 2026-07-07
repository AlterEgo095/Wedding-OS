'use client'

import { motion } from 'framer-motion'
import {
  LayoutGrid, Palette, SlidersHorizontal, Users, Mail, QrCode,
  CalendarCheck, Table2, Image, Clock, CheckCircle, Settings, ShieldCheck,
} from 'lucide-react'

/**
 * RealCapabilities — SECTION 3
 *
 * ONLY displays capabilities that are actually REAL (verified in Mission 4.5).
 * Each card maps to a proven backend→frontend chain. No decorative claims.
 */
const CAPABILITIES = [
  { icon: LayoutGrid, title: 'Multi-événements', desc: 'Plusieurs mariages isolés, indépendants', status: 'REAL' },
  { icon: Palette, title: 'Collections Premium', desc: '12 Collections, 5 layouts structurels', status: 'REAL' },
  { icon: SlidersHorizontal, title: 'Designer Draft/Publish', desc: 'Prévisualisez avant de publier', status: 'REAL' },
  { icon: Users, title: 'Gestion des invités', desc: 'CRUD, import CSV/DOCX, catégories', status: 'REAL' },
  { icon: Mail, title: 'Invitations', desc: 'Génération single + bulk, QR codes', status: 'REAL' },
  { icon: QrCode, title: 'QR Codes sécurisés', desc: 'Tokens AES-256-GCM, check-in jour J', status: 'REAL' },
  { icon: CalendarCheck, title: 'RSVP + accompagnants', desc: 'Confirmations, plus-one, messages', status: 'REAL' },
  { icon: Table2, title: 'Plan de tables', desc: 'Drag-and-drop, capacité, affectation', status: 'REAL' },
  { icon: Image, title: 'Médias', desc: 'Galerie, hero, photos couple', status: 'REAL' },
  { icon: Clock, title: 'Programme & Timeline', desc: 'Étapes animées, lieux, icônes', status: 'REAL' },
  { icon: CheckCircle, title: 'Check-in multi-tenant', desc: 'Rejet cross-tenant, audit logs', status: 'REAL' },
  { icon: Settings, title: 'Platform Ops', desc: 'Dashboard santé, security events', status: 'REAL' },
  { icon: ShieldCheck, title: 'Isolation fail-closed', desc: 'AsyncLocalStorage + Prisma extension', status: 'REAL' },
]

export default function RealCapabilities() {
  return (
    <section id="fonctionnalites" className="relative py-20 md:py-32 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.7 }}
          className="text-center mb-16"
        >
          <span className="font-display text-xs tracking-[0.3em] uppercase text-gold/70 font-semibold mb-4 block">
            Capacités réelles
          </span>
          <h2 className="font-serif text-3xl sm:text-4xl md:text-5xl font-bold mb-6 leading-tight">
            <span className="text-foreground">Tout ce dont vous avez besoin,</span>{' '}
            <span className="gold-gradient">déjà opérationnel</span>
          </h2>
          <p className="font-display text-base sm:text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            Chaque fonctionnalité listée ici est <strong className="text-foreground">réellement connectée</strong> —
            de l'interface à la base de données, en passant par l'API.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-5">
          {CAPABILITIES.map((cap, i) => {
            const Icon = cap.icon
            return (
              <motion.div
                key={cap.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: (i % 3) * 0.1 + Math.floor(i / 3) * 0.05 }}
                className="group relative p-6 rounded-2xl glass-card border border-gold/10 hover:border-gold/30 transition-all duration-300"
              >
                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-gold/10 border border-gold/20 flex items-center justify-center group-hover:scale-110 group-hover:bg-gold/15 transition-all duration-300">
                    <Icon className="size-5 text-gold-dark dark:text-gold-light" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-serif text-lg font-bold text-foreground">
                        {cap.title}
                      </h3>
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold tracking-wider bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                        REAL
                      </span>
                    </div>
                    <p className="font-display text-sm text-muted-foreground leading-relaxed">
                      {cap.desc}
                    </p>
                  </div>
                </div>
              </motion.div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
