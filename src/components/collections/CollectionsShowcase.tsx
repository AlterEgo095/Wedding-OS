'use client'

import { useState, useEffect, useMemo } from 'react'
import Image from 'next/image'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Crown, Gem, Heart, Sparkles, Globe, Mail, Printer, Megaphone,
  Check, ChevronRight, X, Rocket, ArrowRight, Star, Layers, Loader2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Separator } from '@/components/ui/separator'
import { DesignRenderer } from '@/components/collections/designs/DesignRenderer'
import type { PremiumCollection, PackId, CollectionPack } from '@/lib/collections/types'

// ─── Public catalog type (lightweight, for fetch) ──────────────────────────────
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

// ─── Couple preview data (Phase B — no hardcoded "Josué" / "Hornella") ─────────
// Fetched from /api/settings (tenant-aware). Falls back to neutral placeholders
// when no wedding is resolved or settings are missing.
interface CouplePreview {
  bride: string
  groom: string
  label: string
  date: string
  venue: string
  hashtag?: string
}

const NEUTRAL_COUPLE: CouplePreview = {
  bride: 'Mme',
  groom: 'M.',
  label: 'Mari & Mme',
  date: 'Date à définir',
  venue: 'Lieu à définir',
  hashtag: '',
}

const PACK_ICONS: Record<PackId, React.ComponentType<{ className?: string }>> = {
  website: Globe,
  invitations: Mail,
  print: Printer,
  communication: Megaphone,
  luxury: Sparkles,
}

const CATEGORY_LABELS: Record<string, string> = {
  ROYAL: 'Royal',
  LUXURY: 'Luxe',
  ROMANTIC: 'Romance',
  CULTURAL: 'Héritage',
  BEACH: 'Évasion',
}

const TIER_STYLES: Record<string, string> = {
  EXCLUSIVE: 'bg-gradient-to-r from-amber-500/20 to-yellow-500/20 text-amber-300 border-amber-500/40',
  PREMIUM: 'bg-gradient-to-r from-rose-500/20 to-pink-500/20 text-rose-300 border-rose-500/40',
}

// ══════════════════════════════════════════════════════════════════════════════
// COLLECTION CARD — public catalog grid item
// ══════════════════════════════════════════════════════════════════════════════

function CollectionCard({ c, onOpen }: { c: PublicCollection; onOpen: () => void }) {
  const ds = c.designSystem
  return (
    <motion.button
      onClick={onOpen}
      whileHover={{ y: -4 }}
      transition={{ type: 'spring', stiffness: 300, damping: 24 }}
      className="group relative text-left w-full rounded-2xl overflow-hidden border border-gold/20 hover:border-gold/50 transition-colors bg-card"
      style={{ boxShadow: '0 8px 32px -12px rgba(212, 168, 83, 0.15)' }}
    >
      {/* Cover */}
      <div className="relative aspect-square overflow-hidden" style={{ background: ds.background }}>
        {c.coverImage ? (
          <Image
            src={c.coverImage}
            alt={`Collection ${c.name}`}
            fill
            sizes="(max-width: 768px) 100vw, 33vw"
            className="object-cover transition-transform duration-700 group-hover:scale-105"
            unoptimized
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <Crown size={48} style={{ color: ds.primary }} className="opacity-40" />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />

        {/* Tier badge */}
        <div className="absolute top-3 right-3">
          <span className={`text-[10px] font-bold tracking-wider px-2 py-1 rounded-full border backdrop-blur-sm ${TIER_STYLES[c.tier] || ''}`}>
            {c.tier}
          </span>
        </div>

        {/* Completion badge */}
        <div className="absolute top-3 left-3">
          <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-black/60 backdrop-blur-sm border border-white/10 text-white flex items-center gap-1">
            <Star size={9} className="text-gold" />
            {c.completionPct}%
          </span>
        </div>

        {/* Bottom title */}
        <div className="absolute bottom-0 left-0 right-0 p-4">
          <p className="text-[10px] tracking-[0.3em] uppercase text-gold-light/80 mb-1">{c.family}</p>
          <h3 className="font-serif text-2xl font-bold text-white leading-tight" style={{ fontFamily: ds.fontDisplay }}>
            {c.name}
          </h3>
          <p className="text-xs text-white/70 mt-1 line-clamp-1">{c.tagline}</p>
        </div>
      </div>

      {/* Stats footer */}
      <div className="p-4 flex items-center justify-between" style={{ background: ds.surface }}>
        <div className="flex items-center gap-3 text-[11px]" style={{ color: ds.textMuted }}>
          <span className="flex items-center gap-1"><Layers size={11} /> {c.stats.packs} packs</span>
          <span className="flex items-center gap-1"><Gem size={11} /> {c.stats.modules} modules</span>
          <span className="flex items-center gap-1"><Sparkles size={11} /> {c.stats.variants}</span>
        </div>
        <ChevronRight size={16} style={{ color: ds.primary }} className="group-hover:translate-x-1 transition-transform" />
      </div>
    </motion.button>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// COLLECTION DETAIL — modal with pack tabs + live design previews
// ══════════════════════════════════════════════════════════════════════════════

function PackTabButton({ pack, active, onClick, ds }: {
  pack: CollectionPack
  active: boolean
  onClick: () => void
  ds: PremiumCollection['designSystem']
}) {
  const Icon = PACK_ICONS[pack.id]
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold transition-all whitespace-nowrap"
      style={{
        background: active ? ds.primary : 'transparent',
        color: active ? ds.background : ds.textMuted,
        border: `1px solid ${active ? ds.primary : `${ds.primary}30`}`,
      }}
    >
      <Icon className="size-3.5" />
      {pack.name}
      <span className="text-[9px] opacity-70">({pack.modules.length})</span>
    </button>
  )
}

function ModulePreview({ pack, ds, couple }: { pack: CollectionPack; ds: PremiumCollection['designSystem']; couple: CouplePreview }) {
  const [activeVariantByModule, setActiveVariantByModule] = useState<Record<string, string>>({})
  const [expandedModule, setExpandedModule] = useState<string | null>(null)

  return (
    <div className="space-y-3">
      {pack.modules.map((m) => {
        const chosenVariantId = activeVariantByModule[m.id] || m.variants[0]?.id
        const chosenVariant = m.variants.find((v) => v.id === chosenVariantId) || m.variants[0]
        const isExpanded = expandedModule === m.id
        return (
          <div key={m.id} className="rounded-xl overflow-hidden" style={{ background: ds.background, border: `1px solid ${ds.primary}25` }}>
            <div className="p-3 flex items-center gap-3" style={{ background: ds.surface }}>
              <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: `${ds.primary}20` }}>
                <Sparkles size={14} style={{ color: ds.primary }} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold truncate" style={{ color: ds.text }}>{m.name}</p>
                  {m.required && (
                    <span className="text-[8px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider" style={{ background: `${ds.primary}25`, color: ds.primary }}>Requis</span>
                  )}
                </div>
                <p className="text-[10px] truncate" style={{ color: ds.textMuted }}>{chosenVariant?.name} · {chosenVariant?.description}</p>
              </div>
              <div className="flex items-center gap-1.5">
                {m.variants.length > 1 && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ background: `${ds.primary}15`, color: ds.textMuted }}>{m.variants.length} variantes</span>
                )}
                <button
                  onClick={() => setExpandedModule(isExpanded ? null : m.id)}
                  className="text-[10px] px-2 py-1 rounded transition-colors"
                  style={{ border: `1px solid ${ds.primary}40`, color: ds.textMuted }}
                >
                  {isExpanded ? 'Réduire' : 'Voir'}
                </button>
              </div>
            </div>

            <div className="p-3">
              {/* Variant selector pills */}
              {m.variants.length > 1 && (
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {m.variants.map((v) => (
                    <button
                      key={v.id}
                      onClick={() => setActiveVariantByModule((s) => ({ ...s, [m.id]: v.id }))}
                      className="text-[10px] px-2 py-1 rounded-md font-semibold transition-all"
                      style={{
                        background: v.id === chosenVariantId ? ds.primary : `${ds.primary}15`,
                        color: v.id === chosenVariantId ? ds.background : ds.textMuted,
                        border: `1px solid ${v.id === chosenVariantId ? ds.primary : `${ds.primary}30`}`,
                      }}
                    >
                      {v.id} · {v.name.split('—')[1]?.trim() || v.name}
                    </button>
                  ))}
                </div>
              )}

              {/* Live preview */}
              <div className="rounded-lg overflow-hidden" style={{ background: ds.background }}>
                <DesignRenderer renderer={chosenVariant?.renderer || ''} ds={ds} couple={couple} />
              </div>

              {/* Tags + quality (expanded) */}
              <AnimatePresence>
                {isExpanded && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                    <div className="pt-3 mt-3 border-t flex flex-wrap items-center gap-2" style={{ borderColor: `${ds.primary}20` }}>
                      <span className="text-[10px] font-semibold" style={{ color: ds.textMuted }}>Qualité :</span>
                      <div className="flex items-center gap-1">
                        <div className="w-20 h-1.5 rounded-full overflow-hidden" style={{ background: `${ds.primary}20` }}>
                          <div className="h-full rounded-full" style={{ width: `${chosenVariant?.quality}%`, background: ds.primary }} />
                        </div>
                        <span className="text-[10px] font-bold" style={{ color: ds.primary }}>{chosenVariant?.quality}%</span>
                      </div>
                      {chosenVariant?.tags.map((t) => (
                        <span key={t} className="text-[9px] px-1.5 py-0.5 rounded" style={{ background: `${ds.primary}15`, color: ds.textMuted }}>#{t}</span>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function CollectionDetail({ collection, onClose }: { collection: PublicCollection; onClose: () => void }) {
  const [activePack, setActivePack] = useState<PackId>('website')
  const [fullCollection, setFullCollection] = useState<PremiumCollection | null>(null)
  const [couple, setCouple] = useState<CouplePreview>(NEUTRAL_COUPLE)
  // Phase D — deploy state
  const [deploying, setDeploying] = useState(false)
  const [deployResult, setDeployResult] = useState<{ ok: boolean; message: string } | null>(null)

  // Phase B — fetch the current wedding's couple identity (tenant-aware).
  // /api/settings resolves the wedding from X-Wedding-Slug header / auth / default
  // and returns bride_name, groom_name, wedding_date, venue_name, hashtag.
  useEffect(() => {
    fetch('/api/settings')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data?.settings) return
        const s = data.settings
        const bride = (s.bride_name || '').trim()
        const groom = (s.groom_name || '').trim()
        const label = [bride, groom].filter(Boolean).join(' & ') || 'Mari & Mme'
        const dateRaw = s.wedding_date || ''
        const dateDisplay = dateRaw
          ? new Date(dateRaw).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
          : 'Date à définir'
        setCouple({
          bride: bride || 'Mme',
          groom: groom || 'M.',
          label,
          date: dateDisplay,
          venue: (s.venue_name || '').trim() || 'Lieu à définir',
          hashtag: (s.hashtag || '').trim() || '',
        })
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    fetch(`/api/collections/${collection.id}`)
      .then((r) => r.json())
      .then((d) => setFullCollection(d.collection))
      .catch(() => {})
  }, [collection.id])

  const ds = collection.designSystem
  const pack = fullCollection?.packs.find((p) => p.id === activePack)

  // Phase D — wire the "Déployer cette Collection" button to the deploy endpoint.
  // The endpoint requires ORGANIZER+ auth and persists a WeddingCollectionBinding
  // + applies the Collection's DesignSystem to the Wedding's Theme row.
  const handleDeploy = async () => {
    setDeploying(true)
    setDeployResult(null)
    try {
      const res = await fetch('/api/collections/deploy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ collectionId: collection.id }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok && data?.success) {
        setDeployResult({
          ok: true,
          message: `Collection "${collection.name}" déployée — le thème du mariage a été mis à jour.`,
        })
      } else if (res.status === 401) {
        setDeployResult({ ok: false, message: 'Connexion requise — connectez-vous en tant qu\u2019Organisateur.' })
      } else if (res.status === 403) {
        setDeployResult({ ok: false, message: 'Permissions insuffisantes — rôle Organisateur requis.' })
      } else {
        setDeployResult({ ok: false, message: data?.error || 'Échec du déploiement.' })
      }
    } catch {
      setDeployResult({ ok: false, message: 'Erreur réseau — réessayez.' })
    } finally {
      setDeploying(false)
    }
  }

  return (
    <DialogContent className="max-w-5xl max-h-[92vh] overflow-hidden flex flex-col p-0 gap-0" style={{ background: ds.background, border: `1px solid ${ds.primary}40` }}>
      {/* Header */}
      <div className="relative p-6 pb-4" style={{ background: `linear-gradient(135deg, ${ds.surface}, ${ds.background})`, borderBottom: `1px solid ${ds.primary}30` }}>
        <button onClick={onClose} className="absolute top-4 right-4 w-8 h-8 rounded-full flex items-center justify-center transition-colors" style={{ background: `${ds.primary}20`, color: ds.text }}>
          <X size={16} />
        </button>
        <div className="flex items-start gap-4 pr-10">
          <div className="w-20 h-20 rounded-xl overflow-hidden flex-shrink-0 relative" style={{ border: `1px solid ${ds.primary}40` }}>
            {collection.coverImage && (
              <Image src={collection.coverImage} alt={collection.name} fill className="object-cover" unoptimized />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <p className="text-[10px] tracking-[0.3em] uppercase" style={{ color: ds.primary }}>{collection.family}</p>
              <span className={`text-[9px] px-1.5 py-0.5 rounded-full border ${TIER_STYLES[collection.tier]}`}>{collection.tier}</span>
              <span className="text-[9px] px-1.5 py-0.5 rounded-full" style={{ background: `${ds.primary}20`, color: ds.primary }}>{CATEGORY_LABELS[collection.category]}</span>
            </div>
            <h2 className="font-serif text-3xl font-bold" style={{ color: ds.text, fontFamily: ds.fontDisplay }}>{collection.name}</h2>
            <p className="text-sm mt-1" style={{ color: ds.textMuted }}>{collection.description}</p>
            <div className="flex flex-wrap items-center gap-3 mt-3 text-[11px]" style={{ color: ds.textMuted }}>
              <span className="flex items-center gap-1"><Layers size={11} /> {collection.stats.packs} packs</span>
              <span className="flex items-center gap-1"><Gem size={11} /> {collection.stats.modules} modules</span>
              <span className="flex items-center gap-1"><Sparkles size={11} /> {collection.stats.variants} variantes</span>
              <span className="flex items-center gap-1"><Star size={11} style={{ color: ds.primary }} /> Qualité {collection.stats.qualityScore}%</span>
              <span className="flex items-center gap-1"><Check size={11} style={{ color: ds.primary }} /> {collection.completionPct}% complet</span>
            </div>
          </div>
        </div>
      </div>

      {/* Pack tabs */}
      <div className="px-6 py-3 flex gap-2 overflow-x-auto custom-scrollbar" style={{ borderBottom: `1px solid ${ds.primary}20`, background: ds.background }}>
        {fullCollection?.packs.map((p) => (
          <PackTabButton key={p.id} pack={p} active={activePack === p.id} onClick={() => setActivePack(p.id)} ds={ds} />
        ))}
      </div>

      {/* Module previews */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-6" style={{ background: ds.background }}>
        {pack ? (
          <>
            <p className="text-xs mb-4" style={{ color: ds.textMuted }}>{pack.description} — {pack.modules.length} modules</p>
            <ModulePreview pack={pack} ds={ds} couple={couple} />
          </>
        ) : (
          <div className="flex items-center justify-center py-20">
            <Sparkles size={24} style={{ color: ds.primary }} className="animate-pulse" />
          </div>
        )}
      </div>

      {/* Footer — Deploy CTA (Phase D — wired to POST /api/collections/deploy) */}
      <div className="p-4 flex flex-col gap-2" style={{ background: ds.surface, borderTop: `1px solid ${ds.primary}30` }}>
        {deployResult && (
          <div
            className="text-xs px-3 py-2 rounded-md flex items-start gap-2"
            style={{
              background: deployResult.ok ? `${ds.primary}15` : 'rgba(239, 68, 68, 0.12)',
              color: deployResult.ok ? ds.primary : '#f87171',
              border: `1px solid ${deployResult.ok ? `${ds.primary}40` : 'rgba(239, 68, 68, 0.3)'}`,
            }}
          >
            {deployResult.ok ? <Check size={14} className="mt-0.5 flex-shrink-0" /> : <X size={14} className="mt-0.5 flex-shrink-0" />}
            <span>{deployResult.message}</span>
          </div>
        )}
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[10px] uppercase tracking-wider" style={{ color: ds.textMuted }}>Tarif Collection</p>
            <p className="font-serif text-xl font-bold" style={{ color: ds.primary }}>{collection.priceFcfa.toLocaleString('fr-FR')} FCFA</p>
            <p className="text-[10px]" style={{ color: ds.textMuted }}>≈ ${collection.priceUsd} USD</p>
          </div>
          <Button
            onClick={handleDeploy}
            disabled={deploying}
            className="gap-2"
            style={{ background: ds.primary, color: ds.background }}
          >
            {deploying ? <Loader2 size={15} className="animate-spin" /> : <Rocket size={15} />}
            {deploying ? 'Déploiement…' : 'Déployer cette Collection'}
            {!deploying && <ArrowRight size={15} />}
          </Button>
        </div>
      </div>
    </DialogContent>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// SHOWCASE — public homepage section
// ══════════════════════════════════════════════════════════════════════════════

export default function CollectionsShowcase() {
  const [collections, setCollections] = useState<PublicCollection[]>([])
  const [families, setFamilies] = useState<{ family: string; count: number }[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<PublicCollection | null>(null)

  useEffect(() => {
    fetch('/api/collections')
      .then((r) => r.json())
      .then((d) => {
        setCollections(d.collections || [])
        setFamilies(d.families || [])
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const grouped = useMemo(() => {
    const map = new Map<string, PublicCollection[]>()
    for (const c of collections) {
      if (!map.has(c.family)) map.set(c.family, [])
      map.get(c.family)!.push(c)
    }
    return Array.from(map.entries())
  }, [collections])

  return (
    <section className="relative py-16 md:py-24 px-4 sm:px-6 lg:px-8 overflow-hidden" aria-label="Collections Premium">
      {/* Backdrop */}
      <div className="absolute inset-0 -z-10 bg-gradient-to-b from-background via-background/95 to-background" />
      <div className="absolute inset-0 -z-10 opacity-30" style={{
        backgroundImage: 'radial-gradient(circle at 30% 20%, rgba(212, 168, 83, 0.08) 0%, transparent 50%), radial-gradient(circle at 70% 80%, rgba(200, 120, 90, 0.06) 0%, transparent 50%)',
      }} />

      <div className="max-w-7xl mx-auto">
        {/* Heading */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.6 }}
          className="text-center mb-12"
        >
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-gold/10 border border-gold/30 text-gold-light text-xs font-display tracking-widest mb-4">
            <Crown className="size-3.5" />
            PHASE 6 — PREMIUM COLLECTION FACTORY
          </div>
          <h2 className="font-serif text-4xl md:text-5xl lg:text-6xl font-bold gold-gradient leading-tight">
            Collections Premium
          </h2>
          <p className="mt-4 text-muted-foreground font-display text-sm md:text-base max-w-2xl mx-auto">
            Des Collections de mariage complètes, prêtes à déployer. Chaque Collection contient
            5 packs (Site, Invitations, Print, Communication, Luxury) avec de vraies variantes de design.
            Le commercial choisit, le système déploie.
          </p>

          {/* Stats */}
          <div className="flex flex-wrap items-center justify-center gap-4 mt-6">
            <span className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Layers size={12} className="text-gold" /> {families.length} familles
            </span>
            <span className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Gem size={12} className="text-gold" /> {collections.length} Collections
            </span>
            <span className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Sparkles size={12} className="text-gold" /> {collections.reduce((s, c) => s + c.stats.variants, 0)} designs réels
            </span>
          </div>
        </motion.div>

        {/* Loading */}
        {loading && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map((i) => (
              <div key={i} className="rounded-2xl overflow-hidden border border-gold/10">
                <div className="aspect-square shimmer" />
                <div className="p-4 space-y-2">
                  <div className="h-3 w-1/3 rounded shimmer" />
                  <div className="h-4 w-2/3 rounded shimmer" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Grid by family */}
        {!loading && grouped.map(([family, cols]) => (
          <div key={family} className="mb-12 last:mb-0">
            <div className="flex items-center gap-3 mb-6">
              <div className="h-px flex-1 bg-gradient-to-r from-transparent to-gold/30" />
              <h3 className="font-serif text-xl text-gold-light tracking-wide whitespace-nowrap">{family}</h3>
              <div className="h-px flex-1 bg-gradient-to-l from-transparent to-gold/30" />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {cols.map((c) => (
                <CollectionCard key={c.id} c={c} onOpen={() => setSelected(c)} />
              ))}
            </div>
          </div>
        ))}

        {/* Commercial flow callout */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="mt-16 rounded-2xl p-6 md:p-8 border border-gold/20 bg-card/50 backdrop-blur-sm"
        >
          <div className="flex flex-col md:flex-row items-center gap-6">
            <div className="flex-1">
              <h4 className="font-serif text-2xl gold-gradient mb-2">Le flow commercial</h4>
              <p className="text-sm text-muted-foreground">
                Un couple arrive. Le commercial ouvre une Collection, choisit une variante,
                importe les photos, entre les noms, et déploie. Le système produit instantanément
                le site, les invitations, les badges, les QR, les supports print et les visuels sociaux.
              </p>
            </div>
            <div className="flex items-center gap-2 text-xs font-display tracking-wide flex-wrap justify-center">
              {['Collection', 'Variante', 'Photos', 'Noms', 'Palette', 'Déploiement'].map((step, i, arr) => (
                <div key={step} className="flex items-center gap-2">
                  <span className="px-3 py-1.5 rounded-full bg-gold/10 border border-gold/30 text-gold-light whitespace-nowrap">{step}</span>
                  {i < arr.length - 1 && <ChevronRight size={14} className="text-gold/50" />}
                </div>
              ))}
            </div>
          </div>
        </motion.div>
      </div>

      {/* Detail modal */}
      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        {selected && <CollectionDetail collection={selected} onClose={() => setSelected(null)} />}
      </Dialog>
    </section>
  )
}
