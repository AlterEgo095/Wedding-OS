'use client'

/**
 * Invitation Center — Entry-Point Section (Phase 3)
 *
 * The Invitation Engine contract is defined (IInvitationEngine) and
 * the QR + WhatsApp systems already exist. This section previews the
 * Phase 3 roadmap: parameterized templates, batch PDF, AI
 * personalization, and the 10-template library.
 *
 * No API calls — pure architecture preview.
 */

import {
  Mail,
  Library,
  FileText,
  FileStack,
  Wand2,
  QrCode,
  MessageCircle,
  type LucideIcon,
} from 'lucide-react'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { SectionHeader, ComingSoonBanner } from '../widgets/StatCard'

// ─── Module card helper ──────

type ModuleStatus = 'Prêt' | 'À venir' | string

function statusBadgeClass(status: ModuleStatus): string {
  if (status === 'Prêt') {
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
    icon: Library,
    title: 'Template Library',
    description:
      '10 templates premium : Royal, Luxury, Modern, Minimal, Floral, Premium, Classic, Glass, Gold, Black Edition. Chacun avec tokens paramétrables.',
    status: 'À venir Phase 3',
  },
  {
    icon: FileText,
    title: 'Parameterized Renderer',
    description:
      "Rendu basé sur design tokens : couleurs, fonts, layout, motifs. Un template, mille variations selon le thème du mariage.",
    status: 'À venir Phase 3',
  },
  {
    icon: FileStack,
    title: 'Batch PDF',
    description:
      "Génération PDF groupée de toutes les invitations d'un mariage. Une URL par invité, PDF A5 prêts à imprimer.",
    status: 'À venir Phase 3',
  },
  {
    icon: Wand2,
    title: 'AI Personalization',
    description:
      "Personnalisation automatique par invité : message adapté selon la relation, langue, table. Propulsé par z-ai-web-dev-sdk.",
    status: 'À venir Phase 3',
  },
  {
    icon: QrCode,
    title: 'QR Codes',
    description:
      "Système QR existant : un code unique par invité, scan pour RSVP/check-in, tracking analytics par invitation.",
    status: 'Prêt',
  },
  {
    icon: MessageCircle,
    title: 'WhatsApp Send',
    description:
      "Envoi WhatsApp d'invitations via Twilio : template message, image, lien RSVP. Accusés de réception et retries.",
    status: 'Prêt',
  },
]

// ─── Section ──────

export function InvitationCenterSection() {
  return (
    <section className="p-4 sm:p-6 max-w-7xl mx-auto">
      <SectionHeader
        title="Invitation Center"
        description="Moteur d'invitations premium — hub du Invitation Engine (Phase 3)"
        icon={Mail}
      />

      <ComingSoonBanner
        phase="Phase 3"
        title="Invitation Center — Moteur d'invitations premium"
        description="Moteur d'invitations paramétrées : 10 templates premium, rendu token-based, batch PDF, personnalisation AI et envoi WhatsApp/Email. Le système QR + WhatsApp existant sert de socle."
        ready={[
          {
            label: 'DB',
            detail: 'Modèle InvitationTemplate créé (Prisma schema)',
          },
          {
            label: 'Engine',
            detail: 'Interface IInvitationEngine définie (contract TypeScript)',
          },
          {
            label: 'Component',
            detail: 'InvitationCard component existant (rendu client)',
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
