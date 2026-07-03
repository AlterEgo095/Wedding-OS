'use client'

/**
 * Command Center — Wedding Workspace Section
 *
 * Each wedding has its own workspace. This section is a launcher: the admin
 * picks a wedding from the portfolio, then sees a grid of workspace modules
 * (Informations, Invités, Tables, Programme, Galerie, Invitations, QR Codes,
 * RSVP, Statistiques, Paramètres, Historique, Médias, Sauvegardes,
 * Personnalisation).
 *
 * Each module card links to the existing per-wedding admin at /w/{slug}/admin
 * (which already has Dashboard, Guests, Tables, Access logs, Media, Music,
 * Timeline, Appearance tabs) — so we REUSE the existing admin rather than
 * duplicating it. Zero regression.
 *
 * Phase 1 — ÉTAPE 2 (Wedding Workspace).
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import {
  Heart,
  Info,
  Users as UsersIcon,
  Grid3x3,
  CalendarDays,
  Image as ImageIcon,
  Mail,
  QrCode,
  CheckCircle2,
  BarChart3,
  Settings,
  History,
  Film,
  Save,
  Palette,
  ExternalLink,
  Search,
  ChevronDown,
  type LucideIcon,
} from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

import { usePlatformFetch } from '../../_lib/auth'
import { StatusBadge, PlanBadge, formatDate } from '../../_lib/ui'
import { SectionHeader, EmptyState } from '../widgets/StatCard'
import type { Wedding, PaginatedWeddings } from '../../_lib/types'

interface WorkspaceModule {
  id: string
  label: string
  description: string
  icon: LucideIcon
  // The per-wedding admin tab anchor (e.g. "#guests"). Empty = opens the
  // wedding public page or external resource.
  anchor?: string
  href?: (slug: string) => string
  external?: boolean
  tone: 'gold' | 'emerald' | 'violet' | 'rose' | 'sky' | 'amber'
}

const WORKSPACE_MODULES: WorkspaceModule[] = [
  {
    id: 'infos',
    label: 'Informations',
    description: 'Couple, date, lieu, slogan',
    icon: Info,
    anchor: '#dashboard',
    tone: 'gold',
  },
  {
    id: 'guests',
    label: 'Invités',
    description: 'Liste, statuts, check-in',
    icon: UsersIcon,
    anchor: '#guests',
    tone: 'emerald',
  },
  {
    id: 'tables',
    label: 'Tables',
    description: 'Plan de table, sièges',
    icon: Grid3x3,
    anchor: '#tables',
    tone: 'violet',
  },
  {
    id: 'program',
    label: 'Programme',
    description: 'Timeline, événements',
    icon: CalendarDays,
    anchor: '#timeline',
    tone: 'sky',
  },
  {
    id: 'gallery',
    label: 'Galerie',
    description: 'Photos du couple',
    icon: ImageIcon,
    anchor: '#media',
    tone: 'rose',
  },
  {
    id: 'invitations',
    label: 'Invitations',
    description: 'Templates, envoi',
    icon: Mail,
    href: (slug) => `/w/${slug}`,
    external: true,
    tone: 'amber',
  },
  {
    id: 'qr',
    label: 'QR Codes',
    description: 'Génération, suivi',
    icon: QrCode,
    anchor: '#guests',
    tone: 'violet',
  },
  {
    id: 'rsvp',
    label: 'RSVP',
    description: 'Confirmations, présents',
    icon: CheckCircle2,
    anchor: '#guests',
    tone: 'emerald',
  },
  {
    id: 'stats',
    label: 'Statistiques',
    description: 'Vues, scans, téléchargements',
    icon: BarChart3,
    anchor: '#dashboard',
    tone: 'sky',
  },
  {
    id: 'settings',
    label: 'Paramètres',
    description: 'Configuration du mariage',
    icon: Settings,
    anchor: '#settings',
    tone: 'gold',
  },
  {
    id: 'history',
    label: 'Historique',
    description: 'Logs d\'accès invités',
    icon: History,
    anchor: '#access-logs',
    tone: 'amber',
  },
  {
    id: 'media',
    label: 'Médias',
    description: 'Uploads, musique',
    icon: Film,
    anchor: '#media',
    tone: 'rose',
  },
  {
    id: 'backups',
    label: 'Sauvegardes',
    description: 'Snapshots, exports',
    icon: Save,
    href: (slug) => `/w/${slug}/admin`,
    tone: 'emerald',
  },
  {
    id: 'appearance',
    label: 'Personnalisation',
    description: 'Thème, effets, apparence',
    icon: Palette,
    anchor: '#appearance',
    tone: 'violet',
  },
]

const TONE_ICON_BG: Record<WorkspaceModule['tone'], string> = {
  gold: 'bg-gold/15 text-gold',
  emerald: 'bg-emerald-500/15 text-emerald-400',
  violet: 'bg-violet-500/15 text-violet-400',
  rose: 'bg-rose-500/15 text-rose-400',
  sky: 'bg-sky-500/15 text-sky-400',
  amber: 'bg-amber-500/15 text-amber-400',
}

export function WeddingWorkspaceSection() {
  const { fetchWithAuth } = usePlatformFetch()
  const [weddings, setWeddings] = useState<Wedding[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetchWithAuth('/api/platform/weddings?limit=100')
    if (!res) {
      setLoading(false)
      return
    }
    try {
      const json = (await res.json()) as PaginatedWeddings
      setWeddings(json.weddings || [])
      // Auto-select the default wedding on first load
      if (!selectedId) {
        const def = json.weddings.find((w) => w.isDefault) ?? json.weddings[0]
        if (def) setSelectedId(def.id)
      }
    } catch {
      toast.error('Réponse invalide du serveur')
    } finally {
      setLoading(false)
    }
  }, [fetchWithAuth, selectedId])

  useEffect(() => {
    // Fetch weddings once on mount — load() auto-selects the default wedding.
    load()
  }, [])

  const selected = useMemo(
    () => weddings.find((w) => w.id === selectedId) ?? null,
    [weddings, selectedId],
  )

  const filteredWeddings = useMemo(() => {
    if (!search) return weddings
    const q = search.toLowerCase()
    return weddings.filter(
      (w) =>
        w.coupleLabel.toLowerCase().includes(q) ||
        w.slug.toLowerCase().includes(q) ||
        (w.venueCity ?? '').toLowerCase().includes(q),
    )
  }, [weddings, search])

  return (
    <div className="space-y-5 p-4 md:p-6">
      <SectionHeader
        title="Wedding Workspace"
        description="Espace de travail dédié à chaque mariage. Sélectionnez un mariage pour accéder à ses modules."
        icon={Heart}
      />

      {/* Wedding selector */}
      <Card className="bg-white/[0.02] border-white/10">
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium mb-1">
                Mariage sélectionné
              </p>
              {loading ? (
                <Skeleton className="h-8 w-48 rounded" />
              ) : selected ? (
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-gold flex items-center justify-center text-white text-sm font-bold shrink-0">
                    {selected.coupleLabel.charAt(0)}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold truncate">{selected.coupleLabel}</p>
                    <p className="text-[11px] text-muted-foreground">
                      /w/{selected.slug} · {formatDate(selected.weddingDate)}
                    </p>
                  </div>
                  <div className="flex gap-1.5 ml-2 shrink-0">
                    <StatusBadge status={selected.status} />
                    <PlanBadge plan={selected.plan} />
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Aucun mariage sélectionné</p>
              )}
            </div>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="shrink-0">
                  Changer de mariage
                  <ChevronDown className="w-3.5 h-3.5 ml-1.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-80">
                <DropdownMenuLabel className="text-xs">
                  {weddings.length} mariage{weddings.length > 1 ? 's' : ''}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <div className="p-2">
                  <div className="relative">
                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                      placeholder="Rechercher…"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="h-8 pl-7 text-xs bg-white/5 border-white/10"
                    />
                  </div>
                </div>
                <DropdownMenuSeparator />
                <div className="max-h-64 overflow-y-auto custom-scrollbar">
                  {filteredWeddings.length === 0 ? (
                    <div className="px-3 py-6 text-center text-xs text-muted-foreground">
                      Aucun résultat
                    </div>
                  ) : (
                    filteredWeddings.map((w) => (
                      <DropdownMenuItem
                        key={w.id}
                        onClick={() => {
                          setSelectedId(w.id)
                          setSearch('')
                        }}
                        className="flex items-center gap-2 py-2 cursor-pointer"
                      >
                        <div className="w-7 h-7 rounded-full bg-gradient-gold flex items-center justify-center text-white text-[10px] font-bold shrink-0">
                          {w.coupleLabel.charAt(0)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium truncate">{w.coupleLabel}</p>
                          <p className="text-[10px] text-muted-foreground truncate">
                            /w/{w.slug}
                          </p>
                        </div>
                        {w.isDefault && (
                          <Badge className="text-[9px] bg-gold/15 text-gold border-gold/30">
                            Par défaut
                          </Badge>
                        )}
                      </DropdownMenuItem>
                    ))
                  )}
                </div>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </CardContent>
      </Card>

      {/* Workspace modules */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {Array.from({ length: 14 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full rounded-lg" />
          ))}
        </div>
      ) : !selected ? (
        <EmptyState
          icon={Heart}
          title="Aucun mariage à afficher"
          description="Créez un mariage depuis le Wedding Portfolio pour activer son workspace."
        />
      ) : (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3"
        >
          {WORKSPACE_MODULES.map((mod, i) => {
            const href = mod.href
              ? mod.href(selected.slug)
              : `/w/${selected.slug}/admin${mod.anchor ?? ''}`
            const isExternal = mod.external ?? false
            return (
              <motion.div
                key={mod.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.02 }}
              >
                <Link
                  href={href}
                  target={isExternal ? '_blank' : undefined}
                  rel={isExternal ? 'noopener noreferrer' : undefined}
                  className="block group"
                >
                  <Card className="bg-white/[0.02] border-white/10 hover:border-gold/30 hover:bg-white/[0.04] transition-all h-full">
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3">
                        <div
                          className={`w-9 h-9 rounded-md flex items-center justify-center shrink-0 ${TONE_ICON_BG[mod.tone]}`}
                        >
                          <mod.icon className="w-4 h-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <p className="text-sm font-medium group-hover:text-gold transition-colors">
                              {mod.label}
                            </p>
                            <ExternalLink className="w-3 h-3 text-muted-foreground/40 opacity-0 group-hover:opacity-100 transition-opacity" />
                          </div>
                          <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
                            {mod.description}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              </motion.div>
            )
          })}
        </motion.div>
      )}

      {/* Quick stats for selected wedding */}
      {selected && (selected._count?.guests || 0) > 0 && (
        <Card className="bg-white/[0.02] border-white/10">
          <CardContent className="p-4">
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium mb-3">
              Aperçu · {selected.coupleLabel}
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <MiniStat label="Invités" value={selected._count?.guests ?? 0} icon={UsersIcon} />
              <MiniStat label="Tables" value={selected._count?.tables ?? 0} icon={Grid3x3} />
              <MiniStat label="Médias" value={selected._count?.media ?? 0} icon={ImageIcon} />
              <MiniStat label="Admins" value={selected._count?.admins ?? 0} icon={Settings} />
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function MiniStat({
  label,
  value,
  icon: Icon,
}: {
  label: string
  value: number
  icon: LucideIcon
}) {
  return (
    <div className="flex items-center gap-2">
      <div className="w-8 h-8 rounded-md bg-white/5 flex items-center justify-center shrink-0">
        <Icon className="w-3.5 h-3.5 text-gold" />
      </div>
      <div>
        <p className="text-lg font-bold leading-none">{value}</p>
        <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-0.5">{label}</p>
      </div>
    </div>
  )
}
