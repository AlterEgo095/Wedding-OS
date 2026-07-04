'use client'

/**
 * Marketplace — Placeholder Section (Phase 6)
 *
 * Architecture-ready entry point for the Marketplace engine.
 * The MarketplaceItem + BrandKit Prisma models exist and the
 * IMarketplaceEngine interface is defined. Browse, install,
 * uninstall, and revenue flows arrive in Phase 6.
 *
 * No API calls — pure architecture preview.
 */

import {
  ShoppingBag,
  Palette,
  Mail,
  Blocks,
  Clapperboard,
  Package,
  Download,
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
    icon: Palette,
    title: 'Themes Marketplace',
    description:
      "Thèmes premium vendus séparément : collections saisonnières, collaborations designers, exclusivités ELITE. Installation en 1 clic.",
    status: 'À venir Phase 6',
  },
  {
    icon: Mail,
    title: 'Invitations Marketplace',
    description:
      "Templates d'invitations premium : Royal, Luxury, Black Edition, Floral Deluxe. Achat à l'unité ou par pack.",
    status: 'À venir Phase 6',
  },
  {
    icon: Blocks,
    title: 'Component Packs',
    description:
      "Composants UI réutilisables : hero variants, galleries, countdowns, programmes. Plug-and-play dans le Wedding Workspace.",
    status: 'À venir Phase 6',
  },
  {
    icon: Clapperboard,
    title: 'Media Packs',
    description:
      "Packs médias premium : photos, vidéos, musiques libre de droits. Curated par direction artistique AENEWS.",
    status: 'À venir Phase 6',
  },
  {
    icon: Package,
    title: 'Brand Kits',
    description:
      "Modèle BrandKit existant : logos, palettes, typographies, guidelines. Attaché à un mariage ou partagé multi-mariages.",
    status: 'Prêt',
  },
  {
    icon: Download,
    title: 'Install / Uninstall',
    description:
      "Flow d'installation transactionnel : achat, téléchargement, activation atomique, rollback. Historique persistant.",
    status: 'À venir Phase 6',
  },
]

// ─── Section ──────

export function MarketplaceSection() {
  return (
    <section className="p-4 sm:p-6 max-w-7xl mx-auto">
      <SectionHeader
        title="Marketplace"
        description="Thèmes, invitations, composants, médias — hub commercial (Phase 6)"
        icon={ShoppingBag}
      />

      <ComingSoonBanner
        phase="Phase 6"
        title="Marketplace — Thèmes, invitations, composants, médias"
        description="Place de marché premium pour les couples et organisateurs : thèmes, templates d'invitations, packs de composants UI, médias curatés, et brand kits. Install/uninstall transactionnel avec historique."
        ready={[
          {
            label: 'DB',
            detail: 'Modèle MarketplaceItem créé (catalogue persistant)',
          },
          {
            label: 'Brand',
            detail: 'Modèle BrandKit créé (logos + palettes + typo par mariage)',
          },
          {
            label: 'Engine',
            detail: 'Interface IMarketplaceEngine définie (contract TypeScript)',
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
