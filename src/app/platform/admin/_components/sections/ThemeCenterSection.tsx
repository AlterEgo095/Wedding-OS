'use client'

/**
 * Theme Center — Entry-Point Section (Phase 2)
 *
 * The Theme Engine is partially live (ThemeCustomizer + ThemeInjector +
 * 4 templates + 8 fonts). This section is the hub: it surfaces what's
 * ready now and previews the Phase 2 roadmap (per-section theming,
 * animations, Penpot bridge).
 *
 * The "Ouvrir le ThemeCustomizer" CTA is decorative — the actual
 * customizer lives in the Appearance tab (no navigation needed here).
 */

import {
  Palette,
  Library,
  Eye,
  Layers,
  Type,
  Sparkles,
  PenTool,
  type LucideIcon,
} from 'lucide-react'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
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
      '4 templates disponibles : Or Classique, Rose Romantique, Minimal Moderne, Nuit Royale. Chacun injecte --theme-primary, fonts et accents.',
    status: 'Prêt',
  },
  {
    icon: Eye,
    title: 'Live Preview',
    description:
      "ThemeInjector applique les variables CSS en temps réel sur le site public. Prévisualisation instantanée côté admin et invité.",
    status: 'Prêt',
  },
  {
    icon: Layers,
    title: 'Per-Section Theming',
    description:
      "Couleurs spécifiques par section (hero, RSVP, gallery, programme). Override local des tokens globaux.",
    status: 'À venir Phase 2',
  },
  {
    icon: Type,
    title: 'Custom Fonts',
    description:
      '8 Google Fonts intégrées : Playfair Display, Cormorant, Cinzel, Montserrat, Inter, Lora, EB Garamond, Bebas Neue.',
    status: 'Prêt',
  },
  {
    icon: Sparkles,
    title: 'Animations',
    description:
      "Transitions personnalisables par mariage : fade, slide, parallax, shimmer gold. Intensité et durée configurables.",
    status: 'À venir Phase 2',
  },
  {
    icon: PenTool,
    title: 'Penpot Bridge',
    description:
      "Import des design tokens depuis un fichier Penpot (couleurs, typo, spacing) directement dans le Theme Engine.",
    status: 'À venir Phase 2',
  },
]

// ─── Section ──────

export function ThemeCenterSection() {
  return (
    <section className="p-4 sm:p-6 max-w-7xl mx-auto">
      <SectionHeader
        title="Theme Center"
        description="Moteur de thèmes visuels — hub du Theme Engine (Phase 2)"
        icon={Palette}
        actions={
          <Button
            variant="outline"
            className="border-gold/40 text-gold hover:bg-gold/10 hover:text-gold"
            onClick={() => {
              /* CTA décoratif — le ThemeCustomizer vit dans l'onglet Apparence */
            }}
          >
            <Palette className="w-4 h-4 mr-2" />
            Ouvrir le ThemeCustomizer
          </Button>
        }
      />

      <ComingSoonBanner
        phase="Phase 2"
        title="Theme Center — Moteur de thèmes visuels"
        description="Hub central du Theme Engine : templates, live preview, fonts, animations et pont Penpot. Une partie est déjà active (4 templates + 8 fonts), le reste arrive en Phase 2."
        ready={[
          {
            label: 'Customizer',
            detail: 'ThemeCustomizer actif (4 templates sélectionnables)',
          },
          {
            label: 'Injector',
            detail: 'ThemeInjector multi-tenant applique --theme-* en live',
          },
          {
            label: 'Engine',
            detail: 'Interface IThemeEngine définie (contract TypeScript)',
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
