'use client'

import { useState, useEffect, useMemo } from 'react'
import Image from 'next/image'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Crown, Gem, Heart, Sparkles, Globe, Mail, Printer, Megaphone,
  Check, ChevronRight, X, Rocket, Star, Layers, Factory, TrendingUp,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { DesignRenderer } from '@/components/collections/designs/DesignRenderer'
import type { PremiumCollection, PackId, CollectionPack } from '@/lib/collections/types'

// ─── Types ─────────────────────────────────────────────────────────────────────
interface PublicCollection {
  id: string
  name: string
  family: string
  category: string
  tier: string
  tagline: string
  description: string
  coverImage: string
  completionPct: number
  version: string
  designer: string
  publishedAt: string
  priceFcfa: number
  priceUsd: number
  designSystem: PremiumCollection['designSystem']
  stats: { packs: number; modules: number; variants: number; qualityScore: number }
}

const PACK_ICONS: Record<PackId, React.ComponentType<{ className?: string }>> = {
  website: Globe,
  invitations: Mail,
  print: Printer,
  communication: Megaphone,
  luxury: Sparkles,
}

// ══════════════════════════════════════════════════════════════════════════════
// COLLECTIONS FACTORY TAB — platform admin view
// ══════════════════════════════════════════════════════════════════════════════

export function CollectionsFactoryTab() {
  const [collections, setCollections] = useState<PublicCollection[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<PublicCollection | null>(null)

  useEffect(() => {
    fetch('/api/collections')
      .then((r) => r.json())
      .then((d) => setCollections(d.collections || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const totals = useMemo(() => ({
    collections: collections.length,
    variants: collections.reduce((s, c) => s + c.stats.variants, 0),
    modules: collections.reduce((s, c) => s + c.stats.modules, 0),
    avgQuality: collections.length
      ? Math.round(collections.reduce((s, c) => s + c.stats.qualityScore, 0) / collections.length)
      : 0,
    revenue: collections.reduce((s, c) => s + c.priceFcfa, 0),
  }), [collections])

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold font-display tracking-wide flex items-center gap-2 gold-gradient">
            <Factory className="size-6" />
            Premium Collection Factory
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Catalogue des Collections Premium prêtes à déployer. Phase 6 — production de contenu.
          </p>
        </div>
        <Badge variant="outline" className="border-gold/40 text-gold bg-gold/10">
          Phase 6
        </Badge>
      </div>

      {/* Factory metrics */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card className="border-gold/20">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
              <Layers size={11} /> Collections
            </div>
            <p className="text-2xl font-bold gold-gradient">{totals.collections}</p>
          </CardContent>
        </Card>
        <Card className="border-gold/20">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
              <Globe size={11} /> Modules
            </div>
            <p className="text-2xl font-bold gold-gradient">{totals.modules}</p>
          </CardContent>
        </Card>
        <Card className="border-gold/20">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
              <Sparkles size={11} /> Variantes
            </div>
            <p className="text-2xl font-bold gold-gradient">{totals.variants}</p>
          </CardContent>
        </Card>
        <Card className="border-gold/20">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
              <TrendingUp size={11} /> Qualité moyenne
            </div>
            <p className="text-2xl font-bold gold-gradient">{totals.avgQuality}%</p>
          </CardContent>
        </Card>
        <Card className="border-gold/20">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
              <Crown size={11} /> Valeur catalogue
            </div>
            <p className="text-2xl font-bold gold-gradient">{(totals.revenue / 1000).toFixed(0)}k</p>
            <p className="text-[9px] text-muted-foreground">FCFA cumulé</p>
          </CardContent>
        </Card>
      </div>

      {/* Reference banner — Royal Gold */}
      {!loading && collections[0] && (
        <Card className="border-gold/40 bg-gradient-to-br from-gold/5 to-transparent overflow-hidden">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="w-14 h-14 rounded-xl bg-gold/15 flex items-center justify-center flex-shrink-0">
              <Crown className="size-7 text-gold" />
            </div>
            <div className="flex-1">
              <p className="text-[10px] uppercase tracking-widest text-gold-light mb-0.5">Collection de référence</p>
              <p className="font-serif text-lg font-bold text-foreground">{collections[0].name} — 100% complet</p>
              <p className="text-xs text-muted-foreground">Toutes les variantes sont produites et opérationnelles. Sert de modèle pour les autres Collections.</p>
            </div>
            <Button size="sm" onClick={() => setSelected(collections[0])} className="bg-gold text-white hover:bg-gold-dark gap-1">
              Voir <ChevronRight size={14} />
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Catalog grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Card key={i} className="border-gold/10">
              <div className="aspect-video shimmer rounded-t-lg" />
              <CardContent className="p-4 space-y-2">
                <div className="h-3 w-1/3 rounded shimmer" />
                <div className="h-4 w-2/3 rounded shimmer" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {collections.map((c) => (
            <FactoryCard key={c.id} c={c} onOpen={() => setSelected(c)} />
          ))}
        </div>
      )}

      {/* Detail modal */}
      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        {selected && <FactoryDetail collection={selected} onClose={() => setSelected(null)} />}
      </Dialog>
    </div>
  )
}

// ─── Factory Card ──────────────────────────────────────────────────────────────
function FactoryCard({ c, onOpen }: { c: PublicCollection; onOpen: () => void }) {
  const ds = c.designSystem
  return (
    <Card className="border-gold/20 hover:border-gold/50 transition-colors overflow-hidden cursor-pointer group" onClick={onOpen}>
      <div className="relative aspect-video overflow-hidden" style={{ background: ds.background }}>
        {c.coverImage ? (
          <Image src={c.coverImage} alt={c.name} fill className="object-cover group-hover:scale-105 transition-transform duration-500" unoptimized />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <Crown size={40} style={{ color: ds.primary }} className="opacity-40" />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
        <div className="absolute bottom-0 p-3">
          <p className="text-[9px] tracking-[0.3em] uppercase text-white/70">{c.family}</p>
          <p className="font-serif text-lg font-bold text-white" style={{ fontFamily: ds.fontDisplay }}>{c.name}</p>
        </div>
        <div className="absolute top-2 right-2">
          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-black/60 backdrop-blur text-white flex items-center gap-1">
            <Star size={8} className="text-gold" /> {c.completionPct}%
          </span>
        </div>
      </div>
      <CardContent className="p-3 space-y-2">
        <div className="flex items-center justify-between text-[10px] text-muted-foreground">
          <span>{c.stats.modules} modules · {c.stats.variants} variantes</span>
          <span className="font-bold text-gold">{c.priceFcfa.toLocaleString('fr-FR')} F</span>
        </div>
        <div className="h-1 rounded-full bg-muted overflow-hidden">
          <div className="h-full bg-gradient-to-r from-gold to-gold-dark" style={{ width: `${c.completionPct}%` }} />
        </div>
      </CardContent>
    </Card>
  )
}

// ─── Factory Detail ────────────────────────────────────────────────────────────
function FactoryDetail({ collection, onClose }: { collection: PublicCollection; onClose: () => void }) {
  const [activePack, setActivePack] = useState<PackId>('website')
  const [fullCollection, setFullCollection] = useState<PremiumCollection | null>(null)

  useEffect(() => {
    fetch(`/api/collections/${collection.id}`)
      .then((r) => r.json())
      .then((d) => setFullCollection(d.collection))
      .catch(() => {})
  }, [collection.id])

  const ds = collection.designSystem
  const pack = fullCollection?.packs.find((p) => p.id === activePack)

  return (
    <DialogContent className="max-w-5xl max-h-[92vh] overflow-hidden flex flex-col p-0 gap-0" style={{ background: ds.background, border: `1px solid ${ds.primary}40` }}>
      {/* Header */}
      <div className="p-5 pb-3 relative" style={{ background: `linear-gradient(135deg, ${ds.surface}, ${ds.background})`, borderBottom: `1px solid ${ds.primary}30` }}>
        <button onClick={onClose} className="absolute top-4 right-4 w-8 h-8 rounded-full flex items-center justify-center" style={{ background: `${ds.primary}20`, color: ds.text }}>
          <X size={16} />
        </button>
        <div className="flex items-start gap-4 pr-10">
          <div className="w-16 h-16 rounded-lg overflow-hidden flex-shrink-0 relative" style={{ border: `1px solid ${ds.primary}40` }}>
            {collection.coverImage && <Image src={collection.coverImage} alt={collection.name} fill className="object-cover" unoptimized />}
          </div>
          <div className="flex-1">
            <h2 className="font-serif text-2xl font-bold" style={{ color: ds.text, fontFamily: ds.fontDisplay }}>{collection.name}</h2>
            <p className="text-xs" style={{ color: ds.textMuted }}>{collection.description}</p>
            <div className="flex flex-wrap gap-3 mt-2 text-[10px]" style={{ color: ds.textMuted }}>
              <span>{collection.stats.packs} packs</span>
              <span>{collection.stats.modules} modules</span>
              <span>{collection.stats.variants} variantes</span>
              <span style={{ color: ds.primary }}>Qualité {collection.stats.qualityScore}%</span>
              <span>v{collection.version}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Pack tabs */}
      <div className="px-5 py-2 flex gap-1.5 overflow-x-auto" style={{ borderBottom: `1px solid ${ds.primary}20`, background: ds.background }}>
        {fullCollection?.packs.map((p) => {
          const Icon = PACK_ICONS[p.id]
          const active = activePack === p.id
          return (
            <button key={p.id} onClick={() => setActivePack(p.id)} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded text-[11px] font-semibold whitespace-nowrap" style={{
              background: active ? ds.primary : 'transparent',
              color: active ? ds.background : ds.textMuted,
              border: `1px solid ${active ? ds.primary : `${ds.primary}30`}`,
            }}>
              <Icon className="size-3" /> {p.name} <span className="opacity-60">({p.modules.length})</span>
            </button>
          )
        })}
      </div>

      {/* Modules */}
      <div className="flex-1 overflow-y-auto p-5 space-y-3" style={{ background: ds.background }}>
        {pack?.modules.map((m) => {
          const v = m.variants[0]
          return (
            <div key={m.id} className="rounded-lg overflow-hidden" style={{ background: ds.surface, border: `1px solid ${ds.primary}25` }}>
              <div className="p-2.5 flex items-center gap-3">
                <div className="w-7 h-7 rounded flex items-center justify-center flex-shrink-0" style={{ background: `${ds.primary}20` }}>
                  <Sparkles size={12} style={{ color: ds.primary }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-xs font-semibold" style={{ color: ds.text }}>{m.name}</p>
                    {m.required && <span className="text-[8px] px-1 py-0.5 rounded font-bold uppercase" style={{ background: `${ds.primary}25`, color: ds.primary }}>Requis</span>}
                  </div>
                  <p className="text-[10px]" style={{ color: ds.textMuted }}>{v?.name} · {m.variants.length} variante(s)</p>
                </div>
              </div>
              <div className="px-2.5 pb-2.5">
                <DesignRenderer renderer={v?.renderer || ''} ds={ds} />
              </div>
            </div>
          )
        })}
      </div>

      {/* Footer */}
      <div className="p-3 flex items-center justify-between" style={{ background: ds.surface, borderTop: `1px solid ${ds.primary}30` }}>
        <p className="text-xs font-bold" style={{ color: ds.primary }}>{collection.priceFcfa.toLocaleString('fr-FR')} FCFA</p>
        <Button size="sm" className="gap-1.5" style={{ background: ds.primary, color: ds.background }}>
          <Rocket size={13} /> Déployer sur un mariage
        </Button>
      </div>
    </DialogContent>
  )
}
