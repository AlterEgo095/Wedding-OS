'use client'

import { useState, useEffect, useCallback } from 'react'
import Image from 'next/image'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Crown, Sparkles, Layers, Check, ChevronRight, X, Rocket,
  AlertTriangle, Shield, ShieldCheck, FileSignature, Package,
  Cpu, Eye, ArrowRight, Database, Store, GitBranch, Loader2,
  RefreshCw, Wrench, TrendingUp,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { toast } from 'sonner'

// ─── Types from the API ──────────────────────────────────────────────────────
interface MarketplacePackage {
  id: string
  collectionId: string
  collectionName: string
  collectionFamily: string
  collectionCategory: string
  collectionTier: string
  collectionVersion: string
  designer: string
  packageHash: string
  packageSize: number
  qualityScore: number
  completenessPct: number
  visualScore: number
  passesValidation: boolean
  detectedFrames: number
  expectedFrames: number
  priceFcfa: number
  priceUsd: number
  coverImage: string | null
  publishedToMarketplace: boolean
  publishedAt: string | null
  compiledAt: string
  minWeddingOsVersion: string
}

interface MarketplaceResponse {
  packages: MarketplacePackage[]
  count: number
  families: { family: string; count: number }[]
}

interface ManifestResponse {
  package: MarketplacePackage & { manifestJson?: string }
  manifest?: {
    signature: {
      collectionId: string
      name: string
      version: string
      designer: string
      compiledAt: string
      bodyHash: string
      hash: string
      minWeddingOsVersion: string
      signatureAlgorithm: string
    }
    collection: {
      id: string
      name: string
      family: string
      category: string
      tier: string
      tagline: string
      description: string
      coverImage: string
      priceFcfa: number
      priceUsd: number
    }
    tokens: {
      colors: { primary: string; secondary: string; background: string; surface: string; text: string; textMuted: string }
      fonts: { display: string; body: string }
    }
    packs: Array<{
      id: string
      name: string
      pageId: string | null
      modules: Array<{
        id: string
        name: string
        required: boolean
        variants: Array<{
          id: string
          name: string
          frame: {
            businessId: string
            frameUuid: string
            frameName: string
            pageId: string
            hash: string
            width?: number
            height?: number
          }
        }>
      }>
    }>
    validation: {
      passes: boolean
      qualityScore: number
      completenessPct: number
      detectedFrames: number
      expectedFrames: number
      issues: Array<{ level: string; code: string; message: string }>
    }
    visualValidation?: {
      passes: boolean
      score: number
      checks: number
      failedChecks: number
      issues: Array<{ level: string; code: string; message: string }>
    }
  }
}

// ─── Pipeline stage definition ───────────────────────────────────────────────
const PIPELINE_STAGES = [
  { icon: Wrench, label: 'Designer', sub: 'Penpot', color: 'text-amber-600' },
  { icon: Cpu, label: 'Compiler', sub: 'SHA256 + Sign', color: 'text-rose-600' },
  { icon: FileSignature, label: 'Manifest', sub: 'Signed JSON', color: 'text-pink-600' },
  { icon: ShieldCheck, label: 'Validator', sub: 'Structural + Visual', color: 'text-emerald-600' },
  { icon: Database, label: 'Registry', sub: 'Immutable', color: 'text-cyan-600' },
  { icon: Store, label: 'Marketplace', sub: 'Installable', color: 'text-violet-600' },
  { icon: Rocket, label: 'Deploy', sub: 'Wedding', color: 'text-orange-600' },
]

const CATEGORY_LABELS: Record<string, string> = {
  LUXURY: 'Luxe', ROYAL: 'Royal', ROMANTIC: 'Romantique',
  CULTURAL: 'Héritage', BEACH: 'Évasion',
}

const CATEGORY_GRADIENTS: Record<string, string> = {
  ROYAL: 'from-amber-500/15 via-yellow-500/10 to-amber-500/5',
  LUXURY: 'from-zinc-700/20 via-zinc-800/15 to-zinc-900/5',
  ROMANTIC: 'from-rose-400/15 via-pink-400/10 to-rose-300/5',
  CULTURAL: 'from-red-600/15 via-orange-500/10 to-amber-500/5',
  BEACH: 'from-teal-500/15 via-cyan-500/10 to-sky-400/5',
}

export default function MarketplaceShowcase() {
  const [data, setData] = useState<MarketplaceResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [bootstrapping, setBootstrapping] = useState(false)
  const [selectedPkg, setSelectedPkg] = useState<MarketplacePackage | null>(null)
  const [manifest, setManifest] = useState<ManifestResponse['manifest'] | null>(null)
  const [manifestLoading, setManifestLoading] = useState(false)

  const fetchMarketplace = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/marketplace')
      const json = await res.json()
      setData(json)
    } catch {
      setData({ packages: [], count: 0, families: [] })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchMarketplace()
  }, [fetchMarketplace])

  const bootstrap = async () => {
    setBootstrapping(true)
    try {
      const res = await fetch('/api/registry/seed-marketplace', { method: 'POST' })
      const json = await res.json()
      if (json.success) {
        toast.success(`${json.compiled} Collections compilées et publiées sur le marketplace`)
        await fetchMarketplace()
      } else {
        toast.error(json.error || 'Bootstrap échoué')
      }
    } catch (e) {
      toast.error('Erreur: ' + (e as Error).message)
    } finally {
      setBootstrapping(false)
    }
  }

  const openDetail = async (pkg: MarketplacePackage) => {
    setSelectedPkg(pkg)
    setManifest(null)
    setManifestLoading(true)
    try {
      const res = await fetch(`/api/registry/packages/${pkg.id}?manifest=true`)
      const json: ManifestResponse = await res.json()
      setManifest(json.manifest || null)
    } catch {
      setManifest(null)
    } finally {
      setManifestLoading(false)
    }
  }

  const packages = data?.packages ?? []
  const families = data?.families ?? []
  const isEmpty = !loading && packages.length === 0

  // Group packages by family
  const byFamily = new Map<string, MarketplacePackage[]>()
  for (const p of packages) {
    if (!byFamily.has(p.collectionFamily)) byFamily.set(p.collectionFamily, [])
    byFamily.get(p.collectionFamily)!.push(p)
  }

  // Aggregate stats
  const stats = {
    total: packages.length,
    families: families.length,
    passes: packages.filter((p) => p.passesValidation).length,
    avgVisual: packages.length > 0 ? Math.round(packages.reduce((s, p) => s + p.visualScore, 0) / packages.length) : 0,
    totalFrames: packages.reduce((s, p) => s + p.detectedFrames, 0),
  }

  return (
    <section className="relative py-20 px-4 sm:px-6 lg:px-8 bg-gradient-to-b from-background via-background/95 to-background">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-300 text-xs font-medium tracking-wider uppercase mb-4">
            <Crown className="w-3.5 h-3.5" />
            Collection Factory Enterprise · Phase 7
          </div>
          <h2 className="font-serif text-4xl sm:text-5xl font-bold tracking-tight mb-4">
            Marketplace de Collections Premium
          </h2>
          <p className="text-muted-foreground max-w-2xl mx-auto text-base">
            Les designs sont créés <strong>exclusivement dans Penpot</strong>. Wedding OS les compile,
            les signe, les valide, les catalogue et les déploie. Sept étapes orchestrent le flux.
          </p>
        </div>

        {/* Pipeline diagram */}
        <div className="mb-12 p-5 rounded-2xl border bg-card/50 overflow-x-auto">
          <div className="flex items-center justify-between gap-1 min-w-[900px]">
            {PIPELINE_STAGES.map((stage, i) => (
              <div key={stage.label} className="flex items-center gap-1 flex-1">
                <div className="flex flex-col items-center gap-1.5 px-2 py-2.5 rounded-lg hover:bg-muted/50 transition-colors flex-1">
                  <div className={`w-10 h-10 rounded-full bg-background border-2 border-current ${stage.color} flex items-center justify-center`}>
                    <stage.icon className="w-5 h-5" />
                  </div>
                  <div className="text-center">
                    <div className="text-xs font-semibold">{stage.label}</div>
                    <div className="text-[10px] text-muted-foreground">{stage.sub}</div>
                  </div>
                </div>
                {i < PIPELINE_STAGES.length - 1 && (
                  <ArrowRight className="w-4 h-4 text-muted-foreground/50 shrink-0" />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Stats bar */}
        {packages.length > 0 && (
          <div className="mb-10 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <StatCard icon={Package} label="Collections" value={stats.total} tone="text-violet-600" />
            <StatCard icon={Layers} label="Familles" value={stats.families} tone="text-amber-600" />
            <StatCard icon={ShieldCheck} label="Validées" value={`${stats.passes}/${stats.total}`} tone="text-emerald-600" />
            <StatCard icon={Eye} label="Score visuel moy." value={`${stats.avgVisual}%`} tone="text-rose-600" />
            <StatCard icon={Database} label="Frames référencées" value={stats.totalFrames} tone="text-cyan-600" />
          </div>
        )}

        {/* Loading state */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-amber-500" />
            <p className="text-sm text-muted-foreground">Chargement du marketplace…</p>
          </div>
        )}

        {/* Empty state — bootstrap CTA */}
        {isEmpty && (
          <div className="text-center py-16 px-6 rounded-2xl border-2 border-dashed border-amber-500/30 bg-amber-500/5">
            <Cpu className="w-12 h-12 mx-auto text-amber-500 mb-4" />
            <h3 className="text-xl font-semibold mb-2">Registry vide</h3>
            <p className="text-muted-foreground text-sm max-w-md mx-auto mb-6">
              Aucune Collection n'a encore été compilée. Lancez le bootstrap pour compiler les 5
              Collections de démonstration (Royal Gold, Royal Black, White Romance, Kente Prestige, Beach Luxury)
              avec signatures HMAC-SHA256 et validation visuelle.
            </p>
            <Button
              onClick={bootstrap}
              disabled={bootstrapping}
              size="lg"
              className="bg-amber-600 hover:bg-amber-700 text-white"
            >
              {bootstrapping ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Compilation en cours…</>
              ) : (
                <><Rocket className="w-4 h-4 mr-2" /> Bootstrap le Marketplace</>
              )}
            </Button>
          </div>
        )}

        {/* Marketplace grid grouped by family */}
        {packages.length > 0 && (
          <div className="space-y-12">
            {Array.from(byFamily.entries()).map(([family, items]) => (
              <div key={family}>
                <div className="flex items-center gap-3 mb-5">
                  <h3 className="font-serif text-2xl font-semibold">{family}</h3>
                  <Badge variant="secondary" className="rounded-full">{items.length}</Badge>
                  <div className="flex-1 h-px bg-border" />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                  {items.map((pkg) => (
                    <MarketplaceCard key={pkg.id} pkg={pkg} onOpen={() => openDetail(pkg)} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Architectural callout */}
        <div className="mt-16 p-6 rounded-2xl bg-gradient-to-br from-emerald-500/10 via-teal-500/5 to-transparent border border-emerald-500/20">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center shrink-0">
              <GitBranch className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <h4 className="font-semibold mb-1">Séparation des responsabilités</h4>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Penpot est la <strong>source de vérité</strong> des designs. Wedding OS est un{' '}
                <strong>moteur d'orchestration</strong> : il détecte, compile, signe, valide, versionne,
                catalogue et déploie. Chaque Collection est un <strong>package immuable signé</strong>{' '}
                (HMAC-SHA256) avec manifeste, hashes de frames, tokens exportés, validation structurelle
                ET validation visuelle (WCAG, grille, espacement). Les migrations entre versions sont
                auto-générées (patch/minor auto, major manuel).
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Detail modal */}
      <Dialog open={!!selectedPkg} onOpenChange={(o) => !o && setSelectedPkg(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden p-0">
          {selectedPkg && (
            <PackageDetail
              pkg={selectedPkg}
              manifest={manifest}
              manifestLoading={manifestLoading}
            />
          )}
        </DialogContent>
      </Dialog>
    </section>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// Stat card
// ══════════════════════════════════════════════════════════════════════════════
function StatCard({ icon: Icon, label, value, tone }: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string | number
  tone: string
}) {
  return (
    <div className="p-3 rounded-xl border bg-card/60 hover:bg-card transition-colors">
      <div className="flex items-center gap-2 mb-1">
        <Icon className={`w-4 h-4 ${tone}`} />
        <span className="text-[11px] text-muted-foreground uppercase tracking-wide">{label}</span>
      </div>
      <div className="text-xl font-bold">{value}</div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// Marketplace card
// ══════════════════════════════════════════════════════════════════════════════
function MarketplaceCard({ pkg, onOpen }: { pkg: MarketplacePackage; onOpen: () => void }) {
  const gradient = CATEGORY_GRADIENTS[pkg.collectionCategory] || 'from-amber-500/10 to-amber-500/5'
  return (
    <motion.div
      whileHover={{ y: -4 }}
      transition={{ type: 'spring', stiffness: 300, damping: 20 }}
      className="group relative rounded-2xl overflow-hidden border bg-card hover:shadow-xl transition-shadow cursor-pointer"
      onClick={onOpen}
    >
      {/* Cover */}
      <div className={`relative aspect-[4/3] bg-gradient-to-br ${gradient} overflow-hidden`}>
        {pkg.coverImage && (
          <Image
            src={pkg.coverImage}
            alt={pkg.collectionName}
            fill
            className="object-cover group-hover:scale-105 transition-transform duration-500"
            sizes="(max-width: 768px) 100vw, 33vw"
          />
        )}
        {/* Top badges */}
        <div className="absolute top-3 left-3 flex gap-1.5">
          <Badge className="bg-background/90 backdrop-blur text-foreground border-0 shadow-sm">
            <ShieldCheck className="w-3 h-3 mr-1 text-emerald-500" />
            Signé
          </Badge>
          {pkg.collectionTier === 'EXCLUSIVE' && (
            <Badge className="bg-amber-600/90 text-white border-0 shadow-sm">
              <Crown className="w-3 h-3 mr-1" />
              Exclusive
            </Badge>
          )}
        </div>
        <div className="absolute top-3 right-3">
          <Badge variant="secondary" className="bg-background/90 backdrop-blur border-0 shadow-sm font-mono">
            v{pkg.collectionVersion}
          </Badge>
        </div>
      </div>

      {/* Body */}
      <div className="p-5">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div>
            <h3 className="font-serif text-xl font-bold">{pkg.collectionName}</h3>
            <p className="text-xs text-muted-foreground">{CATEGORY_LABELS[pkg.collectionCategory] || pkg.collectionCategory}</p>
          </div>
          <div className="text-right shrink-0">
            <div className="text-sm font-semibold">{pkg.priceFcfa.toLocaleString('fr-FR')}</div>
            <div className="text-[10px] text-muted-foreground">FCFA · ${pkg.priceUsd}</div>
          </div>
        </div>

        {/* Scores */}
        <div className="grid grid-cols-3 gap-2 mb-4 text-center">
          <ScoreMini label="Structure" value={pkg.qualityScore} tone="text-emerald-600" />
          <ScoreMini label="Visuel" value={pkg.visualScore} tone="text-rose-600" />
          <ScoreMini label="Complétude" value={pkg.completenessPct} tone="text-cyan-600" />
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <div className="flex items-center gap-1">
            <Package className="w-3 h-3" />
            <span className="font-mono">{pkg.detectedFrames}/{pkg.expectedFrames} frames</span>
          </div>
          <div className="flex items-center gap-1 text-amber-600 group-hover:gap-2 transition-all">
            <span>Voir le manifeste</span>
            <ChevronRight className="w-3 h-3" />
          </div>
        </div>
      </div>
    </motion.div>
  )
}

function ScoreMini({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="p-2 rounded-lg bg-muted/40">
      <div className={`text-base font-bold ${tone}`}>{value}%</div>
      <div className="text-[9px] text-muted-foreground uppercase tracking-wide">{label}</div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// Package detail modal
// ══════════════════════════════════════════════════════════════════════════════
function PackageDetail({ pkg, manifest, manifestLoading }: {
  pkg: MarketplacePackage
  manifest: ManifestResponse['manifest'] | null
  manifestLoading: boolean
}) {
  return (
    <ScrollArea className="max-h-[90vh]">
      <div className="p-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 mb-6">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Badge variant="secondary">{CATEGORY_LABELS[pkg.collectionCategory] || pkg.collectionCategory}</Badge>
              {pkg.collectionTier === 'EXCLUSIVE' && (
                <Badge className="bg-amber-600 text-white border-0"><Crown className="w-3 h-3 mr-1" />Exclusive</Badge>
              )}
              <Badge variant="outline" className="font-mono">v{pkg.collectionVersion}</Badge>
            </div>
            <h2 className="font-serif text-3xl font-bold">{pkg.collectionName}</h2>
            <p className="text-sm text-muted-foreground">{pkg.collectionFamily} · par {pkg.designer}</p>
          </div>
          <div className="text-right shrink-0">
            <div className="text-2xl font-bold">{pkg.priceFcfa.toLocaleString('fr-FR')}</div>
            <div className="text-xs text-muted-foreground">FCFA · ${pkg.priceUsd}</div>
          </div>
        </div>

        {manifestLoading && (
          <div className="flex items-center justify-center py-12 gap-2">
            <Loader2 className="w-5 h-5 animate-spin text-amber-500" />
            <span className="text-sm text-muted-foreground">Lecture du manifeste signé…</span>
          </div>
        )}

        {manifest && (
          <Tabs defaultValue="signature" className="w-full">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="signature" className="text-xs"><Shield className="w-3 h-3 mr-1.5" />Signature</TabsTrigger>
              <TabsTrigger value="tokens" className="text-xs"><Sparkles className="w-3 h-3 mr-1.5" />Tokens</TabsTrigger>
              <TabsTrigger value="frames" className="text-xs"><Layers className="w-3 h-3 mr-1.5" />Frames</TabsTrigger>
              <TabsTrigger value="validation" className="text-xs"><ShieldCheck className="w-3 h-3 mr-1.5" />Validation</TabsTrigger>
            </TabsList>

            {/* SIGNATURE TAB */}
            <TabsContent value="signature" className="space-y-4 mt-4">
              <div className="p-4 rounded-lg border bg-card/50">
                <div className="flex items-center gap-2 mb-3">
                  <FileSignature className="w-4 h-4 text-amber-600" />
                  <span className="font-semibold text-sm">Collection Signature</span>
                  <Badge className="ml-auto bg-emerald-600 text-white border-0">
                    <ShieldCheck className="w-3 h-3 mr-1" />
                    {manifest.signature.signatureAlgorithm}
                  </Badge>
                </div>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <SigRow label="Collection ID" value={manifest.signature.collectionId} mono />
                  <SigRow label="Version" value={manifest.signature.version} mono />
                  <SigRow label="Designer" value={manifest.signature.designer} />
                  <SigRow label="Compilé le" value={new Date(manifest.signature.compiledAt).toLocaleString('fr-FR')} />
                  <SigRow label="Wedding OS min." value={manifest.signature.minWeddingOsVersion} mono />
                  <SigRow label="Algorithme" value={manifest.signature.signatureAlgorithm} mono />
                </div>
                <Separator className="my-3" />
                <div className="space-y-2">
                  <SigRow label="Body Hash (SHA256)" value={manifest.signature.bodyHash} mono truncate />
                  <SigRow label="Signature (HMAC-SHA256)" value={manifest.signature.hash} mono truncate />
                </div>
              </div>

              <div className="p-4 rounded-lg border bg-emerald-500/5">
                <div className="flex items-start gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <p className="text-xs text-muted-foreground">
                    Le manifeste est <strong>signé côté serveur</strong> avec HMAC-SHA256. Wedding OS vérifie
                    l'intégrité à chaque déploiement — un manifeste altéré est refusé. Le body hash garantit
                    l'immutabilité du contenu (frames, tokens, validation).
                  </p>
                </div>
              </div>
            </TabsContent>

            {/* TOKENS TAB */}
            <TabsContent value="tokens" className="space-y-4 mt-4">
              <div className="p-4 rounded-lg border bg-card/50">
                <div className="flex items-center gap-2 mb-3">
                  <Sparkles className="w-4 h-4 text-rose-600" />
                  <span className="font-semibold text-sm">Design Tokens exportés</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {Object.entries(manifest.tokens.colors).map(([k, v]) => (
                    <div key={k} className="p-2 rounded border bg-background">
                      <div className="flex items-center gap-2 mb-1">
                        <div className="w-5 h-5 rounded border" style={{ backgroundColor: v }} />
                        <span className="text-[10px] text-muted-foreground capitalize">{k}</span>
                      </div>
                      <code className="text-xs">{v}</code>
                    </div>
                  ))}
                </div>
                <Separator className="my-3" />
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-2 rounded border bg-background">
                    <div className="text-[10px] text-muted-foreground uppercase">Police Display</div>
                    <div className="text-sm font-serif">{manifest.tokens.fonts.display}</div>
                  </div>
                  <div className="p-2 rounded border bg-background">
                    <div className="text-[10px] text-muted-foreground uppercase">Police Body</div>
                    <div className="text-sm">{manifest.tokens.fonts.body}</div>
                  </div>
                </div>
              </div>
              <div className="p-3 rounded-lg bg-violet-500/5 border border-violet-500/20 text-xs text-muted-foreground">
                <strong>Architecture :</strong> les tokens ne sont JAMAIS copiés sur le Theme du Wedding.
                Le runtime résout <code>manifest.tokens → overrides couple → injection CSS</code>.
                Le Theme ne stocke que <code>packageId + version + overrides</code>.
              </div>
            </TabsContent>

            {/* FRAMES TAB */}
            <TabsContent value="frames" className="space-y-3 mt-4">
              <div className="text-xs text-muted-foreground mb-2">
                Chaque frame possède un <strong>business ID</strong> (<code>{'{pack}.{module}.{variant}'}</code>) indépendant
                de son nom Penpot. Le renommage d'une frame dans Penpot n'a aucun impact — Wedding OS retrouve
                la frame via son UUID + son hash.
              </div>
              {manifest.packs.map((pack) => (
                <div key={pack.id} className="p-3 rounded-lg border bg-card/50">
                  <div className="flex items-center justify-between mb-2">
                    <div className="font-semibold text-sm flex items-center gap-2">
                      <Layers className="w-3.5 h-3.5 text-amber-600" />
                      {pack.name}
                    </div>
                    <Badge variant="outline" className="text-[10px]">
                      {pack.modules.reduce((s, m) => s + m.variants.length, 0)} frames
                    </Badge>
                  </div>
                  <div className="space-y-1.5">
                    {pack.modules.map((m) => (
                      <div key={m.id} className="flex items-center gap-2 text-xs">
                        {m.required ? (
                          <Check className="w-3 h-3 text-emerald-500 shrink-0" />
                        ) : (
                          <div className="w-3 h-3 shrink-0" />
                        )}
                        <span className="font-medium w-24 shrink-0">{m.name}</span>
                        <div className="flex flex-wrap gap-1">
                          {m.variants.map((v) => (
                            <code key={v.id} className="text-[10px] px-1.5 py-0.5 rounded bg-muted" title={`UUID: ${v.frame.frameUuid}`}>
                              {v.frame.businessId}
                            </code>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </TabsContent>

            {/* VALIDATION TAB */}
            <TabsContent value="validation" className="space-y-3 mt-4">
              <div className="grid grid-cols-3 gap-2">
                <ScoreBig label="Structure" value={manifest.validation.qualityScore} tone="text-emerald-600" passes={manifest.validation.passes} />
                <ScoreBig label="Visuel" value={manifest.visualValidation?.score ?? 0} tone="text-rose-600" passes={manifest.visualValidation?.passes ?? false} />
                <ScoreBig label="Complétude" value={manifest.validation.completenessPct} tone="text-cyan-600" passes={manifest.validation.completenessPct === 100} />
              </div>

              {manifest.validation.issues.length > 0 && (
                <div className="p-3 rounded-lg border bg-card/50">
                  <div className="font-semibold text-sm mb-2">Validation structurelle</div>
                  <div className="space-y-1">
                    {manifest.validation.issues.map((iss, i) => (
                      <div key={i} className="flex items-start gap-2 text-xs">
                        <AlertTriangle className={`w-3 h-3 shrink-0 mt-0.5 ${
                          iss.level === 'ERROR' ? 'text-red-500' : iss.level === 'WARNING' ? 'text-amber-500' : 'text-blue-500'
                        }`} />
                        <span><code className="text-[10px] mr-1">{iss.code}</code>{iss.message}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {manifest.visualValidation && manifest.visualValidation.issues.length > 0 && (
                <div className="p-3 rounded-lg border bg-card/50">
                  <div className="font-semibold text-sm mb-2">Validation visuelle</div>
                  <div className="space-y-1 max-h-48 overflow-y-auto">
                    {manifest.visualValidation.issues.slice(0, 15).map((iss, i) => (
                      <div key={i} className="flex items-start gap-2 text-xs">
                        <Eye className={`w-3 h-3 shrink-0 mt-0.5 ${
                          iss.level === 'ERROR' ? 'text-red-500' : iss.level === 'WARNING' ? 'text-amber-500' : 'text-blue-500'
                        }`} />
                        <span><code className="text-[10px] mr-1">{iss.code}</code>{iss.message}</span>
                      </div>
                    ))}
                    {manifest.visualValidation.issues.length > 15 && (
                      <div className="text-[10px] text-muted-foreground pl-5">
                        +{manifest.visualValidation.issues.length - 15} autres…
                      </div>
                    )}
                  </div>
                </div>
              )}

              {manifest.validation.issues.length === 0 && manifest.visualValidation?.issues.length === 0 && (
                <div className="p-4 rounded-lg bg-emerald-500/5 border border-emerald-500/20 text-sm text-center">
                  <ShieldCheck className="w-5 h-5 mx-auto text-emerald-600 mb-2" />
                  Aucun problème détecté — Collection parfaitement valide.
                </div>
              )}
            </TabsContent>
          </Tabs>
        )}
      </div>
    </ScrollArea>
  )
}

function SigRow({ label, value, mono, truncate }: { label: string; value: string; mono?: boolean; truncate?: boolean }) {
  return (
    <div>
      <div className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">{label}</div>
      <div className={`text-xs ${mono ? 'font-mono' : ''} ${truncate ? 'truncate' : ''}`} title={value}>
        {value}
      </div>
    </div>
  )
}

function ScoreBig({ label, value, tone, passes }: { label: string; value: number; tone: string; passes: boolean }) {
  return (
    <div className="p-3 rounded-lg border bg-card/50 text-center">
      <div className={`text-2xl font-bold ${tone}`}>{value}%</div>
      <div className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">{label}</div>
      {passes ? (
        <Badge className="bg-emerald-600 text-white border-0 text-[9px]"><Check className="w-2.5 h-2.5 mr-0.5" />PASS</Badge>
      ) : (
        <Badge variant="destructive" className="text-[9px]">FAIL</Badge>
      )}
    </div>
  )
}
