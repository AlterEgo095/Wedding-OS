'use client'

/**
 * Penpot Studio — Placeholder Section (Phase 2)
 *
 * Architecture-ready entry point for the Penpot design-system bridge.
 * All TypeScript interfaces (IPenpotEngine, PenpotDesignTokens,
 * IPenpotThemeBridge, IPenpotInvitationBridge) and the
 * isPenpotConfigured() helper are defined.
 *
 * Runtime is gated behind PENPOT_API_URL — when unset, the section
 * shows a clear "Non configuré" status card so the admin knows
 * exactly what to do.
 */

import {
  PenTool,
  FolderTree,
  SwatchBook,
  Component,
  Download,
  Cable,
  Mail,
  AlertTriangle,
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
    icon: FolderTree,
    title: 'File Browser',
    description:
      "Liste des fichiers Penpot accessibles : projets, pages, composants. Navigation arborescente avec preview thumbnails.",
    status: 'À venir Phase 2',
  },
  {
    icon: SwatchBook,
    title: 'Design Tokens Import',
    description:
      "Import automatique des tokens Penpot : colors (palette + alpha), typography (font families + sizes), spacing scales.",
    status: 'À venir Phase 2',
  },
  {
    icon: Component,
    title: 'Component Sync',
    description:
      "Synchronisation des composants Penpot → Theme Engine. Un bouton publie le design system dans la plateforme.",
    status: 'À venir Phase 2',
  },
  {
    icon: Download,
    title: 'SVG Export',
    description:
      "Export des composants Penpot en SVG optimisé : logos, motifs, ornements, monogrammes. Prêt pour InvitationCard.",
    status: 'À venir Phase 2',
  },
  {
    icon: Cable,
    title: 'Theme Bridge',
    description:
      "IPenpotThemeBridge : contract défini pour mapper les tokens Penpot vers les variables --theme-* du ThemeInjector.",
    status: 'Prêt interface',
  },
  {
    icon: Mail,
    title: 'Invitation Bridge',
    description:
      "IPenpotInvitationBridge : contract défini pour exporter les layouts Penpot en templates InvitationCard paramétrés.",
    status: 'Prêt interface',
  },
]

// ─── Section ──────

export function PenpotStudioSection() {
  return (
    <section className="p-4 sm:p-6 max-w-7xl mx-auto">
      <SectionHeader
        title="Penpot Studio"
        description="Intégration design system — bridge Penpot ↔ Engines (Phase 2)"
        icon={PenTool}
      />

      <ComingSoonBanner
        phase="Phase 2"
        title="Penpot Studio — Intégration design system"
        description="Pont entre Penpot (design system open-source) et les engines AENEWS : import de tokens, sync de composants, export SVG, et bridges vers Theme + Invitation engines. Architecture prête, runtime en Phase 2."
        ready={[
          {
            label: 'Engine',
            detail: 'Interface IPenpotEngine définie (contract TypeScript)',
          },
          {
            label: 'Tokens',
            detail: 'Type PenpotDesignTokens défini (colors/typo/spacing)',
          },
          {
            label: 'Bridges',
            detail: 'IPenpotThemeBridge + IPenpotInvitationBridge définis',
          },
        ]}
      />

      {/* Configuration status — PENPOT_API_URL not set in this env */}
      <Card className="bg-white/[0.02] border-amber-500/20 mb-5">
        <CardContent className="p-4 flex items-start gap-3">
          <div className="w-9 h-9 rounded-md bg-amber-500/15 text-amber-400 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold">Configuration : Non configuré</p>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
              La variable d'environnement <code className="px-1 py-0.5 rounded bg-white/5 text-gold font-mono text-[11px]">PENPOT_API_URL</code>{' '}
              n'est pas définie. Une fois renseignée (URL Penpot self-hosted ou cloud), le runtime
              sera activé et les modules ci-dessous deviendront fonctionnels.
            </p>
          </div>
          <Badge
            variant="outline"
            className="text-[10px] uppercase tracking-wider bg-amber-500/15 text-amber-400 border-amber-500/30 shrink-0"
          >
            Non configuré
          </Badge>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {MODULES.map((m) => (
          <ModuleCard key={m.title} {...m} />
        ))}
      </div>
    </section>
  )
}
