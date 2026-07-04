'use client'

/**
 * AI Command Center — Placeholder Section (Phase 4)
 *
 * Architecture-ready entry point for the AI Assistant engine.
 * The chat interface, tool-calling pipeline, and conversation
 * memory will arrive in Phase 4. For now we surface:
 *  - the ComingSoonBanner (phase + ready items)
 *  - a grid of planned modules with status badges
 *
 * No API calls — this is a pure architecture preview.
 */

import {
  Sparkles,
  MessageSquare,
  ScanSearch,
  Wrench,
  Brain,
  History,
  ShieldCheck,
  type LucideIcon,
} from 'lucide-react'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { SectionHeader, ComingSoonBanner } from '../widgets/StatCard'

// ─── Module card helper ──────

type ModuleStatus = 'Prêt' | 'À venir' | string // 'Phase X' passes through

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
    icon: MessageSquare,
    title: 'Chat Assistant',
    description:
      "Conversation naturelle avec l'administrateur. Recherche, analyse et actions en langage courant via z-ai-web-dev-sdk.",
    status: 'À venir Phase 4',
  },
  {
    icon: ScanSearch,
    title: 'Détection d\'inconsistances',
    description:
      'Analyse automatique des données plateforme : mariages incomplets, invités orphelins, QR non générés, configs manquantes.',
    status: 'À venir Phase 4',
  },
  {
    icon: Wrench,
    title: 'Tool Calling',
    description:
      'Outils natifs : createWedding, addGuest, generateQR, sendInvitation, publishWedding. Le modèle choisit et exécute l\'outil approprié.',
    status: 'À venir Phase 4',
  },
  {
    icon: Brain,
    title: 'Context Engine',
    description:
      "Modèle AIContext persistant : capture l'état plateforme, les mariages actifs, les actions récentes et les préférences admin.",
    status: 'Prêt',
  },
  {
    icon: History,
    title: 'Historique de conversation',
    description:
      'Modèle AIConversation : mémoire long-terme des échanges, reprise de session, et traçabilité complète pour audit.',
    status: 'Prêt',
  },
  {
    icon: ShieldCheck,
    title: 'Permissions RBAC',
    description:
      "Les tools AI respectent strictement les rôles. PLATFORM_ADMIN voit tout, ORGANIZER limité à son mariage, RECEPTION en lecture seule.",
    status: 'Prêt',
  },
]

// ─── Section ──────

export function AICommandSection() {
  return (
    <section className="p-4 sm:p-6 max-w-7xl mx-auto">
      <SectionHeader
        title="AI Command Center"
        description="Assistant intelligent — architecture prête, engine en Phase 4"
        icon={Sparkles}
      />

      <ComingSoonBanner
        phase="Phase 4"
        title="AI Command Center — L'assistant intelligent de la plateforme"
        description="L'assistant intelligent qui analysera votre plateforme, détectera les inconsistances, et exécutera des actions naturelles en langage courant via le z-ai-web-dev-sdk."
        ready={[
          {
            label: 'Interface',
            detail: 'Architecture chat + historique + contexte prête (composants à brancher)',
          },
          {
            label: 'SDK',
            detail: 'z-ai-web-dev-sdk installé côté backend (LLM, VLM, TTS, ASR)',
          },
          {
            label: 'DB',
            detail: 'Modèles AIConversation + AIContext créés (Prisma schema)',
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
