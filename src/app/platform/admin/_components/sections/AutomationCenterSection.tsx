'use client'

/**
 * Automation Center — Placeholder Section (Phase 5)
 *
 * Architecture-ready entry point for the Automation Engine.
 * The visual workflow builder, batch generators, and AI setup
 * will arrive in Phase 5. For now we surface the planned
 * triggers/actions interfaces and the engine contract.
 *
 * No API calls — pure architecture preview.
 */

import {
  Zap,
  Workflow,
  Webhook,
  Cog,
  FileArchive,
  Send,
  Bot,
  type LucideIcon,
} from 'lucide-react'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { SectionHeader, ComingSoonBanner } from '../widgets/StatCard'

// ─── Module card helper ──────

type ModuleStatus = 'Prêt' | 'À venir' | string

function statusBadgeClass(status: ModuleStatus): string {
  if (status === 'Prêt' || status.startsWith('Prêt interface')) {
    return 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
  }
  if (status.startsWith('Phase')) {
    return 'bg-gold/15 text-gold border-gold/40'
  }
  return 'bg-amber-500/15 text-amber-400 border-amber-500/30'
}

interface ModuleCardProps {
  icon: LucideIcon
  title: string
  description: string
  status: ModuleStatus
}

function ModuleCard({ icon: Icon, title, description, status }: ModuleCardProps) {
  return (
    <Card className="bg-white/[0.02] border-white/10 hover:border-gold/30 transition-colors">
      <CardHeader className="p-4 pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="w-9 h-9 rounded-md bg-gold/15 text-gold flex items-center justify-center shrink-0">
            <Icon className="w-4 h-4" />
          </div>
          <Badge
            variant="outline"
            className={`text-[10px] uppercase tracking-wider ${statusBadgeClass(status)}`}
          >
            {status}
          </Badge>
        </div>
        <CardTitle className="text-sm mt-3 font-semibold">{title}</CardTitle>
      </CardHeader>
      <CardContent className="p-4 pt-1">
        <p className="text-xs text-muted-foreground leading-relaxed">{description}</p>
      </CardContent>
    </Card>
  )
}

// ─── Planned modules ──────

const MODULES: ModuleCardProps[] = [
  {
    icon: Workflow,
    title: 'Workflow Builder',
    description:
      "Constructeur visuel de règles : déclencheur → conditions → actions. Drag-and-drop, templates réutilisables, versioning.",
    status: 'À venir Phase 5',
  },
  {
    icon: Webhook,
    title: 'Triggers',
    description:
      "Déclencheurs typés : RSVP reçu, invité check-in, mariage publié, invité créé, QR scanné. Interface IAutomationTrigger définie.",
    status: 'Prêt interface',
  },
  {
    icon: Cog,
    title: 'Actions',
    description:
      "Actions exécutables : envoi email, génération lot QR, création PDF, notification WhatsApp. Interface IAutomationAction définie.",
    status: 'Prêt interface',
  },
  {
    icon: FileArchive,
    title: 'Batch QR ZIP',
    description:
      "Génère tous les QR d'un mariage en un seul ZIP. Nommage intelligent par table/invité. Idéal pour impression massive.",
    status: 'À venir Phase 5',
  },
  {
    icon: Send,
    title: 'Envoi groupé invitations',
    description:
      "Envoi WhatsApp/Email en lot avec throttle, retries et accusés de réception. File d'attente persistante.",
    status: 'À venir Phase 5',
  },
  {
    icon: Bot,
    title: 'AI Wedding Setup',
    description:
      "Setup automatique d'un mariage via l'AI : crée invités, tables, QR, invitations, theme — en une seule conversation.",
    status: 'À venir Phase 5',
  },
]

// ─── Section ──────

export function AutomationCenterSection() {
  return (
    <section className="p-4 sm:p-6 max-w-7xl mx-auto">
      <SectionHeader
        title="Automation Center"
        description="Workflows automatiques — architecture prête, engine en Phase 5"
        icon={Zap}
      />

      <ComingSoonBanner
        phase="Phase 5"
        title="Automation Center — Workflows automatiques pour vos mariages"
        description="Moteur de workflows événementiels : déclencheurs, conditions, actions et génération batch. Automatise les tâches répétitives (QR, envois, PDF) et libère l'organisateur."
        ready={[
          {
            label: 'DB',
            detail: 'Modèle Automation créé (Prisma) — règles persistées par mariage',
          },
          {
            label: 'Engine',
            detail: 'Interface IAutomationEngine définie (contract TypeScript)',
          },
          {
            label: 'Events',
            detail: 'Event system défini (triggers + actions typés)',
          },
        ]}
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {MODULES.map((m) => (
          <ModuleCard key={m.title} {...m} />
        ))}
      </div>
    </section>
  )
}
