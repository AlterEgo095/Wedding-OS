'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  LayoutGrid, Star, Eye, EyeOff, ArrowUp, ArrowDown, Crown,
  RefreshCw, ExternalLink, Settings, Save, Loader2, AlertCircle,
  CheckCircle2, FlaskConical, Building2, Lock,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'

/**
 * MarketingControlPlane — Mission 4.8 Phase 3-6
 *
 * The ADMIN CONTROL PLANE for governing the Marketing OS from the browser.
 * Accessible from /platform/admin → Marketing tab.
 *
 * Three domains:
 *   A. Portfolio Control — show/hide events, classify CLIENT/DEMO/INTERNAL,
 *      set order, set featured
 *   B. Case Study Control — choose which event is THE case study (one at a time)
 *   C. Collection Control — lifecycle, visibility, order
 *
 * Every action calls a real API:
 *   - PATCH /api/platform/weddings/[id]/portfolio
 *   - PATCH /api/platform/collections/[id]/governance
 *
 * The homepage reads from the same DB fields, so changes are reflected
 * on / immediately (within ISR revalidate window = 60s).
 *
 * PLATFORM_ADMIN only. CSRF protected. No SSH, no curl, no Postman.
 */

interface WeddingGov {
  id: string
  slug: string
  coupleLabel: string
  status: string
  portfolioType: string | null
  portfolioVisible: boolean | null
  portfolioOrder: number | null
  caseStudyEnabled: boolean
  featured: boolean
  collection?: { name: string; slug: string } | null
}

interface CollectionGov {
  id: string
  slug: string
  name: string
  category: string
  status: string
  isActive: boolean
  isPublished: boolean
  sortOrder: number
  themeSeed: string
  _count?: { weddings: number }
}

interface Props {
  csrfToken: string
}

export default function MarketingControlPlane({ csrfToken }: Props) {
  const [weddings, setWeddings] = useState<WeddingGov[]>([])
  const [collections, setCollections] = useState<CollectionGov[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const [wRes, cRes] = await Promise.all([
        fetch('/api/platform/weddings?limit=50', {
          headers: { 'X-CSRF-Token': csrfToken },
        }),
        fetch('/api/platform/collections', {
          headers: { 'X-CSRF-Token': csrfToken },
        }),
      ])
      if (wRes.ok) {
        const wData = await wRes.json()
        setWeddings(wData.weddings || [])
      }
      if (cRes.ok) {
        const cData = await cRes.json()
        const cols = cData.collections || cData
        setCollections(Array.isArray(cols) ? cols : [])
      }
    } catch (err) {
      toast.error('Erreur lors du chargement')
    } finally {
      setLoading(false)
    }
  }, [csrfToken])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Portfolio governance update
  const updateWeddingGov = async (weddingId: string, updates: Record<string, unknown>) => {
    setSaving(weddingId)
    try {
      const res = await fetch(`/api/platform/weddings/${weddingId}/portfolio`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': csrfToken,
        },
        body: JSON.stringify(updates),
      })
      if (res.ok) {
        const data = await res.json()
        setWeddings((prev) => prev.map((w) => w.id === weddingId ? { ...w, ...updates } : w))
        toast.success('Mis à jour')
        // If caseStudyEnabled was set, refresh all (only one case study at a time)
        if (updates.caseStudyEnabled === true) {
          setTimeout(() => fetchData(), 500)
        }
      } else {
        const err = await res.json()
        toast.error(err.error || 'Erreur')
      }
    } catch (err) {
      toast.error('Erreur de connexion')
    } finally {
      setSaving(null)
    }
  }

  // Collection governance update
  const updateCollectionGov = async (collectionId: string, updates: Record<string, unknown>) => {
    setSaving(collectionId)
    try {
      const res = await fetch(`/api/platform/collections/${collectionId}/governance`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': csrfToken,
        },
        body: JSON.stringify(updates),
      })
      if (res.ok) {
        const data = await res.json()
        setCollections((prev) => prev.map((c) => c.id === collectionId ? { ...c, ...updates } : c))
        toast.success('Collection mise à jour')
      } else {
        const err = await res.json()
        toast.error(err.error || 'Erreur')
      }
    } catch (err) {
      toast.error('Erreur de connexion')
    } finally {
      setSaving(null)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="size-8 animate-spin text-gold" />
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-serif text-2xl font-bold flex items-center gap-2">
            <LayoutGrid className="size-6 text-gold" />
            Marketing Control Plane
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Gouvernez le Marketing OS depuis le navigateur. Les changements apparaissent sur la homepage dans les 60 secondes.
          </p>
        </div>
        <Button onClick={fetchData} variant="outline" size="sm">
          <RefreshCw className="size-4 mr-2" /> Actualiser
        </Button>
      </div>

      {/* A. Portfolio Control */}
      <Card className="glass-card gold-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 font-serif">
            <Star className="size-5 text-gold" />
            Portfolio — Événements visibles publiquement
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {weddings.map((w) => (
              <WeddingRow
                key={w.id}
                wedding={w}
                saving={saving === w.id}
                onUpdate={(updates) => updateWeddingGov(w.id, updates)}
              />
            ))}
          </div>
        </CardContent>
      </Card>

      {/* B. Case Study Control */}
      <Card className="glass-card gold-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 font-serif">
            <Crown className="size-5 text-gold" />
            Case Study — Étude de cas principale
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground mb-4">
            Un seul Case Study à la fois. Il apparaît dans la section dédiée de la homepage, séparé du portfolio.
          </p>
          <div className="space-y-2">
            {weddings.map((w) => (
              <div
                key={w.id}
                className={`flex items-center justify-between p-3 rounded-lg border transition-all ${
                  w.caseStudyEnabled
                    ? 'border-gold/40 bg-gold/10'
                    : 'border-gold/10 hover:border-gold/20'
                }`}
              >
                <div className="flex items-center gap-3">
                  {w.caseStudyEnabled && <Crown className="size-4 text-gold" />}
                  <div>
                    <div className="font-serif text-sm font-bold">{w.coupleLabel}</div>
                    <div className="text-xs text-muted-foreground font-mono">{w.slug}</div>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant={w.caseStudyEnabled ? 'default' : 'outline'}
                  onClick={() => updateWeddingGov(w.id, { caseStudyEnabled: !w.caseStudyEnabled })}
                  disabled={saving === w.id}
                  className={w.caseStudyEnabled ? 'bg-gold text-white' : ''}
                >
                  {saving === w.id ? <Loader2 className="size-3 animate-spin" /> :
                    w.caseStudyEnabled ? 'Case Study actif' : 'Définir comme Case Study'}
                </Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* C. Collection Control */}
      <Card className="glass-card gold-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 font-serif">
            <Settings className="size-5 text-gold" />
            Collections — Visibilité marketing & lifecycle
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {collections.map((c) => (
              <CollectionRow
                key={c.id}
                collection={c}
                saving={saving === c.id}
                onUpdate={(updates) => updateCollectionGov(c.id, updates)}
              />
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// ─── Wedding Row ──────────────────────────────────────────────────────────────

function WeddingRow({ wedding, saving, onUpdate }: {
  wedding: WeddingGov
  saving: boolean
  onUpdate: (updates: Record<string, unknown>) => void
}) {
  const typeIcon = wedding.portfolioType === 'CLIENT' ? Building2 :
    wedding.portfolioType === 'DEMO' ? FlaskConical : Lock

  const TypeIcon = typeIcon

  return (
    <div className={`p-4 rounded-lg border transition-all ${
      wedding.portfolioVisible
        ? 'border-gold/20 bg-gold/5'
        : 'border-muted/30 bg-muted/10 opacity-60'
    }`}>
      <div className="flex flex-wrap items-center gap-3">
        {/* Identity */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-serif text-sm font-bold">{wedding.coupleLabel}</span>
            {wedding.caseStudyEnabled && (
              <Badge className="text-[9px] bg-gold/20 text-gold border-gold/30">
                <Crown className="size-2.5 mr-1" /> CASE STUDY
              </Badge>
            )}
            {wedding.featured && (
              <Badge className="text-[9px] bg-amber-500/20 text-amber-600 border-amber-500/30">
                <Star className="size-2.5 mr-1" /> FEATURED
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xs text-muted-foreground font-mono">{wedding.slug}</span>
            <span className="text-xs text-muted-foreground">·</span>
            <span className="text-xs text-muted-foreground">{wedding.status}</span>
            {wedding.collection && (
              <span className="text-xs text-gold/70">· {wedding.collection.name}</span>
            )}
          </div>
        </div>

        {/* Type selector */}
        <div className="flex items-center gap-1">
          {(['CLIENT', 'DEMO', 'INTERNAL'] as const).map((t) => {
            const Icon = t === 'CLIENT' ? Building2 : t === 'DEMO' ? FlaskConical : Lock
            return (
              <Button
                key={t}
                size="sm"
                variant={wedding.portfolioType === t ? 'default' : 'outline'}
                onClick={() => onUpdate({ portfolioType: t })}
                disabled={saving}
                className={`h-8 text-[10px] px-2 ${wedding.portfolioType === t ? 'bg-gold text-white' : ''}`}
              >
                <Icon className="size-3 mr-1" />
                {t}
              </Button>
            )
          })}
        </div>

        {/* Visibility toggle */}
        <Button
          size="sm"
          variant="outline"
          onClick={() => onUpdate({ portfolioVisible: !wedding.portfolioVisible })}
          disabled={saving}
          className="h-8 px-3"
          title={wedding.portfolioVisible ? 'Masquer du portfolio' : 'Afficher dans le portfolio'}
        >
          {wedding.portfolioVisible ? <Eye className="size-3 mr-1" /> : <EyeOff className="size-3 mr-1" />}
          {wedding.portfolioVisible ? 'Visible' : 'Masqué'}
        </Button>

        {/* Featured toggle */}
        <Button
          size="sm"
          variant="outline"
          onClick={() => onUpdate({ featured: !wedding.featured })}
          disabled={saving}
          className={`h-8 px-3 ${wedding.featured ? 'border-amber-500/40 text-amber-600' : ''}`}
        >
          <Star className={`size-3 mr-1 ${wedding.featured ? 'fill-amber-500' : ''}`} />
        </Button>

        {/* Order */}
        <Input
          type="number"
          value={wedding.portfolioOrder ?? ''}
          onChange={(e) => {
            const val = e.target.value ? parseInt(e.target.value) : null
            onUpdate({ portfolioOrder: val })
          }}
          className="w-16 h-8 text-center text-xs"
          placeholder="—"
          title="Ordre d'affichage"
        />

        {/* Preview link */}
        <a
          href={`/w/${wedding.slug}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-muted-foreground hover:text-gold transition-colors"
          title="Voir l'expérience publique"
        >
          <ExternalLink className="size-4" />
        </a>
      </div>
    </div>
  )
}

// ─── Collection Row ───────────────────────────────────────────────────────────

function CollectionRow({ collection, saving, onUpdate }: {
  collection: CollectionGov
  saving: boolean
  onUpdate: (updates: Record<string, unknown>) => void
}) {
  // Parse themeSeed for color display
  let primaryColor = '#D4AF37'
  let layout = 'classic'
  try {
    const seed = JSON.parse(collection.themeSeed)
    primaryColor = seed.primaryColor || primaryColor
    layout = seed.layout || layout
  } catch { /* ignore */ }

  const isArchived = collection.status === 'ARCHIVE'
  const isDraft = collection.status === 'BROUILLON' || collection.status === 'EN_COURS' || collection.status === 'VALIDATION'

  return (
    <div className={`p-4 rounded-lg border transition-all ${
      collection.isActive && !isArchived
        ? 'border-gold/20 bg-gold/5'
        : 'border-muted/30 bg-muted/10 opacity-60'
    }`}>
      <div className="flex flex-wrap items-center gap-3">
        {/* Color swatch */}
        <div
          className="w-10 h-10 rounded-lg border border-gold/20 flex-shrink-0"
          style={{ backgroundColor: primaryColor }}
        />

        {/* Identity */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-serif text-sm font-bold">{collection.name}</span>
            <Badge variant="outline" className="text-[9px]">{collection.category}</Badge>
            {isArchived && (
              <Badge className="text-[9px] bg-red-500/20 text-red-600 border-red-500/30">ARCHIVED</Badge>
            )}
            {isDraft && (
              <Badge className="text-[9px] bg-amber-500/20 text-amber-600 border-amber-500/30">DRAFT</Badge>
            )}
            {collection.status === 'COMMERCIALISE' && (
              <Badge className="text-[9px] bg-emerald-500/20 text-emerald-600 border-emerald-500/30">PUBLISHED</Badge>
            )}
          </div>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xs text-muted-foreground font-mono">{collection.slug}</span>
            <span className="text-xs text-muted-foreground">· layout: {layout}</span>
          </div>
        </div>

        {/* Visibility toggle */}
        <Button
          size="sm"
          variant="outline"
          onClick={() => onUpdate({ isActive: !collection.isActive })}
          disabled={saving}
          className="h-8 px-3"
          title={collection.isActive ? 'Masquer du marketing' : 'Afficher dans le marketing'}
        >
          {collection.isActive ? <Eye className="size-3 mr-1" /> : <EyeOff className="size-3 mr-1" />}
          {collection.isActive ? 'Visible' : 'Masqué'}
        </Button>

        {/* Status selector */}
        <select
          value={collection.status}
          onChange={(e) => onUpdate({ status: e.target.value })}
          disabled={saving}
          className="h-8 text-xs rounded-md border border-gold/20 bg-background px-2"
        >
          <option value="BROUILLON">Brouillon</option>
          <option value="EN_COURS">En cours</option>
          <option value="VALIDATION">Validation</option>
          <option value="PUBLIE">Publié</option>
          <option value="COMMERCIALISE">Commercialisé</option>
          <option value="ARCHIVE">Archivé</option>
        </select>

        {/* Order */}
        <Input
          type="number"
          value={collection.sortOrder}
          onChange={(e) => onUpdate({ sortOrder: parseInt(e.target.value) || 0 })}
          className="w-16 h-8 text-center text-xs"
          title="Ordre d'affichage"
        />
      </div>
    </div>
  )
}
