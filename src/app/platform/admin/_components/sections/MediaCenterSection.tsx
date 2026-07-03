'use client'

/**
 * Media Center Section — Phase 1 (placeholder architecture).
 *
 * Centralized media library organized by wedding. The storage abstraction
 * (IStorageAdapter: LOCAL + R2) and MediaLibrary model already exist in the
 * schema (Phase 0 Étape 9), but the upload/thumbnail/CDN engine lands in
 * Phase 2. This section therefore shows:
 *
 *   1. A ComingSoonBanner announcing Phase 2 + the ready contracts.
 *   2. A grid of wedding cards, each surfacing its current media count
 *      (`_count.media` from the weddings API). The "Voir les médias" CTA
 *      is disabled until Phase 2 ships.
 *   3. A "Types de médias" catalog (Photos, Vidéos, Musiques, Logos,
 *      Bannières, Fichiers) — each tile is a placeholder so the admin can
 *      preview how the future library will be organized.
 *
 * Data: GET /api/platform/weddings?limit=100 via usePlatformFetch.
 * Auth: handled at the API layer (PLATFORM_ADMIN).
 */

import { useEffect, useState } from 'react'
import {
  Image as ImageIcon,
  Video,
  Music,
  Sparkles,
  PanelTop,
  FileText,
  Eye,
  Loader2,
  Heart,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'

import type { Wedding } from '../../_lib/types'
import { usePlatformFetch } from '../../_lib/auth'
import { StatusBadge, PlanBadge, formatDate } from '../../_lib/ui'
import {
  ComingSoonBanner,
  EmptyState,
  SectionHeader,
} from '../widgets/StatCard'

/** Media-type catalog shown at the bottom of the section. */
const MEDIA_TYPES: Array<{
  key: string
  label: string
  description: string
  icon: typeof ImageIcon
}> = [
  {
    key: 'photos',
    label: 'Photos',
    description: 'Galerie couple, cérémonie, réception',
    icon: ImageIcon,
  },
  {
    key: 'videos',
    label: 'Vidéos',
    description: 'Clips, teaser, replay livestream',
    icon: Video,
  },
  {
    key: 'musics',
    label: 'Musiques',
    description: 'Pistes audio, playlists d\'ambiance',
    icon: Music,
  },
  {
    key: 'logos',
    label: 'Logos',
    description: 'Identité de marque, monogrammes',
    icon: Sparkles,
  },
  {
    key: 'banners',
    label: 'Bannières',
    description: 'Hero, covers réseaux sociaux',
    icon: PanelTop,
  },
  {
    key: 'files',
    label: 'Fichiers',
    description: 'PDFs, contrats, documents divers',
    icon: FileText,
  },
]

export function MediaCenterSection() {
  const { fetchWithAuth } = usePlatformFetch()
  const [weddings, setWeddings] = useState<Wedding[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      const res = await fetchWithAuth('/api/platform/weddings?limit=100')
      if (cancelled) return
      if (!res) {
        setError('Erreur de connexion au serveur')
        setLoading(false)
        return
      }
      try {
        const data = await res.json()
        if (data?.weddings) {
          setWeddings(data.weddings as Wedding[])
          setTotal(data.total ?? data.weddings.length)
        } else {
          setWeddings([])
          setTotal(0)
        }
      } catch {
        setError('Réponse invalide du serveur')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [fetchWithAuth])

  // Aggregate media count across all loaded weddings (best-effort — the
  // weddings API does not yet expose _count.media, so this typically
  // returns 0 until Phase 2 wires the MediaLibrary model).
  const totalMedia = weddings.reduce(
    (sum, w) => sum + (w._count?.media ?? 0),
    0,
  )

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Media Center"
        description="Bibliothèque média centralisée — organisée par mariage, optimisée pour LOCAL + R2"
        icon={ImageIcon}
        actions={
          <Badge variant="outline" className="text-[10px] uppercase tracking-wide text-gold border-gold/40">
            {total} mariage{total > 1 ? 's' : ''} · {totalMedia} média{totalMedia > 1 ? 's' : ''}
          </Badge>
        }
      />

      <ComingSoonBanner
        phase="Phase 2"
        title="Media Center — Bibliothèque média centralisée"
        description="Architecture prête pour un moteur média multi-fournisseurs (LOCAL + Cloudflare R2). L'interface de gestion (upload, thumbnails, CDN, organisation par collections) arrive en Phase 2. Aucune donnée existante n'est affectée."
        ready={[
          {
            label: 'Interface IMediaEngine',
            detail: 'Contrat d\'abstraction du moteur média — upload, delete, transform',
          },
          {
            label: 'IStorageAdapter (LOCAL + R2)',
            detail: 'Abstraction stockage — bascule transparente filesystem ↔ Cloudflare R2',
          },
          {
            label: 'MediaLibrary model',
            detail: 'Modèle Prisma en place — collections par type (CEREMONY, RECEPTION, COUPLE…)',
          },
        ]}
      />

      {/* ── Wedding grid ─────────────────────────────────────────────────── */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i} className="bg-white/[0.02] border-white/10">
              <CardContent className="p-4 space-y-3">
                <Skeleton className="h-5 w-3/4 bg-white/5" />
                <Skeleton className="h-4 w-1/2 bg-white/5" />
                <Skeleton className="h-9 w-full bg-white/5" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : error ? (
        <EmptyState
          icon={ImageIcon}
          title="Impossible de charger les mariages"
          description={error}
        />
      ) : weddings.length === 0 ? (
        <EmptyState
          icon={Heart}
          title="Aucun mariage"
          description="Les mariages créés apparaîtront ici avec leur bibliothèque média."
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {weddings.map((w) => {
            const mediaCount = w._count?.media ?? 0
            return (
              <Card
                key={w.id}
                className="bg-white/[0.02] border-white/10 hover:border-gold/30 transition-colors group"
              >
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">
                        {w.coupleLabel || w.slug}
                      </p>
                      <p className="text-[11px] text-muted-foreground truncate">
                        /w/{w.slug} · créé le {formatDate(w.createdAt)}
                      </p>
                    </div>
                    <ImageIcon className="w-4 h-4 text-muted-foreground shrink-0 group-hover:text-gold transition-colors" />
                  </div>

                  <div className="flex items-center gap-1.5 flex-wrap">
                    <StatusBadge status={w.status} />
                    <PlanBadge plan={w.plan} />
                  </div>

                  <div className="flex items-center justify-between pt-1 border-t border-white/5">
                    <span className="text-xs text-muted-foreground">
                      <span className="text-foreground font-semibold">{mediaCount}</span>{' '}
                      média{mediaCount > 1 ? 's' : ''}
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled
                      className="h-7 text-[11px] gap-1 text-muted-foreground"
                      title="Bientôt disponible — Phase 2"
                    >
                      <Eye className="w-3 h-3" />
                      Voir les médias
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* ── Media types catalog ──────────────────────────────────────────── */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <h3 className="text-sm font-semibold">Types de médias</h3>
          <Badge
            variant="outline"
            className="text-[10px] uppercase tracking-wide bg-amber-500/10 text-amber-400 border-amber-500/30"
          >
            Bientôt disponible
          </Badge>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {MEDIA_TYPES.map((mt) => {
            const Icon = mt.icon
            return (
              <Card
                key={mt.key}
                className="bg-white/[0.02] border-white/10 hover:border-white/20 transition-colors"
              >
                <CardContent className="p-4 space-y-2">
                  <div className="w-9 h-9 rounded-md bg-gold/10 text-gold flex items-center justify-center">
                    <Icon className="w-4 h-4" />
                  </div>
                  <p className="text-sm font-medium">{mt.label}</p>
                  <p className="text-[11px] text-muted-foreground leading-snug line-clamp-2">
                    {mt.description}
                  </p>
                  <Badge
                    variant="outline"
                    className="text-[9px] uppercase tracking-wide bg-amber-500/10 text-amber-400 border-amber-500/30"
                  >
                    Bientôt disponible
                  </Badge>
                </CardContent>
              </Card>
            )
          })}
        </div>
      </div>

      {loading && (
        <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground pt-2">
          <Loader2 className="w-3 h-3 animate-spin" />
          Chargement de la bibliothèque…
        </div>
      )}
    </div>
  )
}
