'use client'

import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Loader2, Factory, LayoutDashboard, Palette, Boxes, Crown, GitBranch, FileImage, Activity, CheckCircle2, AlertCircle, Clock, ChevronUp, ChevronDown, Save, Eye } from 'lucide-react'
import { toast } from 'sonner'
import dynamic from 'next/dynamic'

const ThemeCustomizer = dynamic(() => import('@/components/admin/ThemeCustomizer').then((m) => m.ThemeCustomizer), { ssr: false })

type StudioSection = 'cockpit' | 'collections' | 'design-system' | 'product-builder'

interface Props { csrfToken: string }

interface Collection {
  id: string; slug: string; name: string; status: string; version: string
  category: string; tier: string; qualityScore?: number | null
}

interface TransitionOption {
  to: string; label: string; allowed: boolean; reason?: string
}

interface Wedding { id: string; slug: string; coupleLabel: string }
interface Guest { id: string; displayName: string | null; firstName: string; lastName: string; invitationCode: string }

// ─── Design Token types ──────────────────────────────────────────────────────
interface DesignTokens {
  primaryColor: string; accentColor: string; secondaryColor?: string
  backgroundColor?: string; textColor?: string
  fontDisplay: string; fontBody: string; headingSize?: string; bodySize?: string
  layout: string
  radiusSmall?: string; radiusMedium?: string; radiusLarge?: string
  shadowSoft?: string; shadowMedium?: string; shadowLuxury?: string
  spacing?: string
}

const DEFAULT_TOKENS: DesignTokens = {
  primaryColor: '#D4AF37', accentColor: '#1a1a2e', secondaryColor: '#1a1a2e',
  backgroundColor: '#FAF8F5', textColor: '#1a1a2e',
  fontDisplay: 'Cormorant Garamond', fontBody: 'Inter',
  headingSize: '48px', bodySize: '16px', layout: 'classic',
  radiusSmall: '4px', radiusMedium: '8px', radiusLarge: '16px',
  shadowSoft: '0 1px 2px rgba(0,0,0,0.05)', shadowMedium: '0 4px 6px rgba(0,0,0,0.1)',
  shadowLuxury: '0 10px 25px rgba(212,175,55,0.15)', spacing: '8px',
}

// ─── Section types from LAYOUT_SECTIONS ──────────────────────────────────────
const SECTION_TYPES = [
  { type: 'hero', label: 'Hero', icon: '🏠' },
  { type: 'story', label: 'Notre Histoire', icon: '📖' },
  { type: 'gallery', label: 'Galerie', icon: '🖼️' },
  { type: 'timeline', label: 'Programme', icon: '📅' },
  { type: 'map', label: 'Lieu', icon: '📍' },
  { type: 'guest-auth', label: 'Accès Invités', icon: '🔑' },
]

const LAYOUTS = [
  { value: 'royal', label: 'Royal — 6 sections, luxe cérémoniel' },
  { value: 'classic', label: 'Classique — 6 sections, élégant' },
  { value: 'minimal', label: 'Minimal — 4 sections, éditorial' },
  { value: 'destination', label: 'Destination — 6 sections, galerie en premier' },
  { value: 'modern', label: 'Moderne — 5 sections, programme en premier' },
]

// ─── Semantic roles from design pipeline ─────────────────────────────────────
const SEMANTIC_BINDINGS = [
  { role: 'event.coupleNames', label: 'Noms du couple', dataPath: 'Wedding.coupleLabel', fallback: 'Notre Mariage', required: true },
  { role: 'event.date', label: 'Date', dataPath: 'Wedding.weddingDate', transform: 'formatDate', fallback: 'Date à confirmer', required: true },
  { role: 'event.venue', label: 'Lieu', dataPath: 'Wedding.venueName', fallback: 'Lieu à confirmer', required: false },
  { role: 'guest.name', label: 'Nom invité', dataPath: 'Guest.displayName', fallback: 'Cher invité', required: true },
  { role: 'guest.table', label: 'Table', dataPath: 'Table.name', fallback: '—', required: false },
  { role: 'invitation.qrCode', label: 'QR Code', dataPath: 'Invitation.qrCodeUrl', required: true },
  { role: 'invitation.accessCode', label: 'Code d\'accès', dataPath: 'Guest.invitationCode', required: true },
]

export function ProductionStudioTab({ csrfToken }: Props) {
  const [section, setSection] = useState<StudioSection>('cockpit')
  const [collections, setCollections] = useState<Collection[]>([])
  const [loadingCols, setLoadingCols] = useState(true)
  const [selectedCollection, setSelectedCollection] = useState<Collection | null>(null)
  const [transitions, setTransitions] = useState<TransitionOption[]>([])
  const [loadingTransitions, setLoadingTransitions] = useState(false)

  // Product Builder state
  const [selectedProduct, setSelectedProduct] = useState<string>('WEBSITE')
  const [weddings, setWeddings] = useState<Wedding[]>([])
  const [selectedWeddingId, setSelectedWeddingId] = useState<string | null>(null)
  const [guests, setGuests] = useState<Guest[]>([])
  const [loadingGuests, setLoadingGuests] = useState(false)
  const [selectedGuestId, setSelectedGuestId] = useState<string | null>(null)
  const [sectionOrder, setSectionOrder] = useState(SECTION_TYPES.map(s => ({ ...s, enabled: true })))

  // Design System state
  const [tokens, setTokens] = useState<DesignTokens>(DEFAULT_TOKENS)
  const [savingTokens, setSavingTokens] = useState(false)

  const headers = { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken }

  // ─── Fetch collections ─────────────────────────────────────────────────────
  const fetchCollections = useCallback(async () => {
    setLoadingCols(true)
    try {
      const res = await fetch('/api/platform/collections?includeDrafts=true', { headers })
      if (!res.ok) return
      const data = await res.json()
      setCollections(data.collections || [])
    } catch { toast.error('Erreur de chargement') }
    finally { setLoadingCols(false) }
  }, [csrfToken])

  useEffect(() => { fetchCollections() }, [fetchCollections])

  // ─── Fetch transitions when collection selected ────────────────────────────
  useEffect(() => {
    if (!selectedCollection) { setTransitions([]); return }
    setLoadingTransitions(true)
    fetch(`/api/collections/${selectedCollection.id}/transition`, { headers })
      .then(r => r.json())
      .then(d => setTransitions(d.transitions || []))
      .catch(() => setTransitions([]))
      .finally(() => setLoadingTransitions(false))
  }, [selectedCollection, csrfToken])

  // ─── Fetch weddings for Product Builder ────────────────────────────────────
  useEffect(() => {
    fetch('/api/platform/weddings?limit=100', { headers })
      .then(r => r.json())
      .then(d => setWeddings((d.weddings || []).map((w: Record<string, unknown>) => ({
        id: String(w.id), slug: String(w.slug), coupleLabel: String(w.coupleLabel || w.slug)
      }))))
      .catch(() => {})
  }, [csrfToken])

  // ─── Fetch guests when wedding selected ────────────────────────────────────
  useEffect(() => {
    if (!selectedWeddingId) { setGuests([]); setSelectedGuestId(null); return }
    setLoadingGuests(true)
    fetch(`/api/guests?weddingId=${selectedWeddingId}&limit=100`, { headers })
      .then(r => r.json())
      .then(d => { const list = Array.isArray(d) ? d : (d.guests || []); setGuests(list.map((g: Record<string, unknown>) => ({
        id: String(g.id), displayName: (g.displayName as string | null) || null,
        firstName: String(g.firstName || ''), lastName: String(g.lastName || ''), invitationCode: String(g.invitationCode || '')
      }))); setSelectedGuestId(null) })
      .catch(() => setGuests([]))
      .finally(() => setLoadingGuests(false))
  }, [selectedWeddingId, csrfToken])

  // ─── Transition handler ────────────────────────────────────────────────────
  const handleTransition = async (to: string) => {
    if (!selectedCollection) return
    try {
      const res = await fetch(`/api/collections/${selectedCollection.id}/transition`, {
        method: 'POST', headers, body: JSON.stringify({ to })
      })
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed') }
      toast.success(`${selectedCollection.name} → ${to}`)
      fetchCollections()
      const updated = { ...selectedCollection, status: to }
      setSelectedCollection(updated)
    } catch (e) { toast.error('Erreur: ' + (e instanceof Error ? e.message : 'inconnue')) }
  }

  // ─── Section reordering ────────────────────────────────────────────────────
  const moveSection = (index: number, dir: 'up' | 'down') => {
    const newOrder = [...sectionOrder]
    const target = dir === 'up' ? index - 1 : index + 1
    if (target < 0 || target >= newOrder.length) return
    ;[newOrder[index], newOrder[target]] = [newOrder[target], newOrder[index]]
    setSectionOrder(newOrder)
  }

  const toggleSection = (index: number) => {
    const newOrder = [...sectionOrder]
    newOrder[index].enabled = !newOrder[index].enabled
    setSectionOrder(newOrder)
  }

  // ─── Save tokens ───────────────────────────────────────────────────────────
  const saveTokens = async () => {
    if (!selectedWeddingId) { toast.error('Sélectionnez un mariage'); return }
    setSavingTokens(true)
    try {
      const res = await fetch('/api/theme', {
        method: 'PUT', headers,
        body: JSON.stringify({
          primaryColor: tokens.primaryColor, accentColor: tokens.accentColor,
          fontDisplay: tokens.fontDisplay, fontBody: tokens.fontBody, layout: tokens.layout,
          customizations: {
            secondaryColor: tokens.secondaryColor, backgroundColor: tokens.backgroundColor, textColor: tokens.textColor,
            headingSize: tokens.headingSize, bodySize: tokens.bodySize,
            radiusSmall: tokens.radiusSmall, radiusMedium: tokens.radiusMedium, radiusLarge: tokens.radiusLarge,
            shadowSoft: tokens.shadowSoft, shadowMedium: tokens.shadowMedium, shadowLuxury: tokens.shadowLuxury,
            spacing: tokens.spacing,
          }
        })
      })
      if (!res.ok) throw new Error('Failed')
      toast.success('Tokens sauvegardés — round-trip: edit → API → DB → reload')
    } catch { toast.error('Erreur de sauvegarde') }
    finally { setSavingTokens(false) }
  }

  // ─── Factory Cockpit KPIs ──────────────────────────────────────────────────
  const byStatus = collections.reduce((acc, c) => { acc[c.status] = (acc[c.status] || 0) + 1; return acc }, {} as Record<string, number>)

  const navItems: Array<{ id: StudioSection; label: string; icon: typeof LayoutDashboard }> = [
    { id: 'cockpit', label: 'Cockpit', icon: LayoutDashboard },
    { id: 'collections', label: 'Collections', icon: Crown },
    { id: 'design-system', label: 'Design System', icon: Palette },
    { id: 'product-builder', label: 'Product Builder', icon: Boxes },
  ]

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between p-4 rounded-lg bg-gradient-to-r from-gold/[0.05] to-transparent border border-gold/10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-gold/20 to-rose-gold/10 flex items-center justify-center">
            <Factory className="w-5 h-5 text-gold" />
          </div>
          <div>
            <h2 className="text-lg font-serif font-bold">Production Studio</h2>
            <p className="text-xs text-muted-foreground">Usine de production visuelle souveraine</p>
          </div>
        </div>
        <Badge variant="outline" className="text-[10px] uppercase tracking-wider bg-gold/10 text-gold border-gold/30">PENPOT NOT REQUIRED</Badge>
      </div>

      {/* Secondary Nav */}
      <div className="flex items-center gap-1 p-1 rounded-lg bg-white/[0.02] border border-white/5">
        {navItems.map((item) => (
          <button key={item.id} onClick={() => setSection(item.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm transition-all ${section === item.id ? 'bg-gold/15 text-gold font-medium' : 'text-muted-foreground hover:text-foreground hover:bg-white/5'}`}>
            <item.icon className="w-4 h-4" />{item.label}
          </button>
        ))}
        <span className="ml-auto text-[10px] text-muted-foreground/50 pr-2">Preview · Quality · Exports — à venir</span>
      </div>

      {/* ─── COCKPIT ─────────────────────────────────────────────────────── */}
      {section === 'cockpit' && (
        <div className="space-y-6">
          {loadingCols ? <div className="flex justify-center py-12"><Loader2 className="size-8 animate-spin text-gold" /></div> : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                {[{ l: 'Collections', v: collections.length, s: `${byStatus['COMMERCIALISE']||0} commercialisées`, i: Crown },
                  { l: 'Modules', v: 408, s: '34 slots × 12', i: Boxes },
                  { l: 'Bindings', v: 4, s: 'mariages liés', i: GitBranch },
                  { l: 'Ingestions', v: 1, s: 'jobs complétés', i: Factory },
                  { l: 'Versions', v: 1, s: 'snapshots', i: GitBranch },
                  { l: 'Exports', v: 7, s: 'jobs', i: FileImage },
                ].map((c, i) => (
                  <Card key={i} className="glass-card gold-border"><CardContent className="p-3">
                    <div className="flex items-center gap-1.5 mb-1"><c.i className="w-3.5 h-3.5 text-gold" /><span className="text-[10px] uppercase tracking-wider text-muted-foreground">{c.l}</span></div>
                    <p className="text-xl font-bold">{c.v}</p><p className="text-[10px] text-muted-foreground">{c.s}</p>
                  </CardContent></Card>
                ))}
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <Card className="glass-card gold-border"><CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Activity className="w-4 h-4 text-gold" /> Statuts des Collections</CardTitle></CardHeader>
                  <CardContent className="space-y-1.5">
                    {Object.entries(byStatus).map(([status, count]) => (
                      <div key={status} className="flex items-center justify-between text-xs"><span className="text-muted-foreground">{status}</span><Badge variant="outline" className="text-[10px]">{count}</Badge></div>
                    ))}
                    {(byStatus['EN_COURS'] || 0) > 0 && (
                      <div className="flex items-center gap-2 mt-2 p-2 rounded bg-amber-500/10 border border-amber-500/20">
                        <Clock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                        <span className="text-xs text-amber-300">{byStatus['EN_COURS']} collection(s) prêtes pour validation</span>
                        <Button size="sm" variant="outline" className="ml-auto text-[10px] h-6" onClick={() => setSection('collections')}>Aller</Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
                <Card className="glass-card gold-border"><CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-gold" /> Santé des Moteurs</CardTitle></CardHeader>
                  <CardContent className="space-y-2">
                    <div className="flex items-center justify-between text-xs"><span className="text-muted-foreground">Collection Engine</span><Badge variant="outline" className="text-[10px] bg-emerald-500/15 text-emerald-400 border-emerald-500/30">HEALTHY</Badge></div>
                    <div className="flex items-center justify-between text-xs"><span className="text-muted-foreground">Factory Pipeline</span><Badge variant="outline" className="text-[10px] bg-emerald-500/15 text-emerald-400 border-emerald-500/30">HEALTHY</Badge></div>
                    <div className="flex items-center justify-between text-xs"><span className="text-muted-foreground">QR Engine</span><Badge variant="outline" className="text-[10px] bg-emerald-500/15 text-emerald-400 border-emerald-500/30">HEALTHY</Badge></div>
                    <div className="flex items-center justify-between text-xs"><span className="text-muted-foreground">Export Engine</span><Badge variant="outline" className="text-[10px] bg-amber-500/15 text-amber-400 border-amber-500/30">DEGRADED</Badge><span className="text-[10px] text-amber-400/70">PDF 103MB, no cleanup</span></div>
                  </CardContent>
                </Card>
              </div>
            </>
          )}
        </div>
      )}

      {/* ─── COLLECTIONS WORKSPACE ──────────────────────────────────────── */}
      {section === 'collections' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Left: Collection Explorer */}
          <Card className="glass-card gold-border">
            <CardHeader className="pb-2"><CardTitle className="text-sm">Collection Explorer</CardTitle></CardHeader>
            <CardContent className="space-y-1 max-h-[60vh] overflow-y-auto">
              {loadingCols ? <Loader2 className="size-6 animate-spin text-gold mx-auto" /> : collections.map(c => (
                <button key={c.id} onClick={() => setSelectedCollection(c)}
                  className={`w-full text-left p-2 rounded text-xs transition-all ${selectedCollection?.id === c.id ? 'bg-gold/10 border border-gold/30' : 'hover:bg-white/5 border border-transparent'}`}>
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{c.name}</span>
                    <Badge variant="outline" className="text-[9px] h-4">{c.status}</Badge>
                  </div>
                  <span className="text-muted-foreground text-[10px]">/{c.slug} · v{c.version}</span>
                </button>
              ))}
            </CardContent>
          </Card>

          {/* Center: Collection Overview + Section Tree */}
          <Card className="glass-card gold-border">
            <CardHeader className="pb-2"><CardTitle className="text-sm">Structure & Sections</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {selectedCollection ? (
                <>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div><span className="text-muted-foreground">Slug:</span> {selectedCollection.slug}</div>
                    <div><span className="text-muted-foreground">Version:</span> {selectedCollection.version}</div>
                    <div><span className="text-muted-foreground">Catégorie:</span> {selectedCollection.category}</div>
                    <div><span className="text-muted-foreground">Tier:</span> {selectedCollection.tier}</div>
                  </div>
                  <div className="pt-2 border-t border-white/5">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Section Tree (Website)</p>
                    {sectionOrder.map((s, i) => (
                      <div key={s.type} className="flex items-center gap-2 p-1.5 rounded text-xs hover:bg-white/5">
                        <span className="text-sm">{s.icon}</span>
                        <span className={s.enabled ? '' : 'text-muted-foreground line-through'}>{s.label}</span>
                        <div className="ml-auto flex gap-0.5">
                          <button onClick={() => toggleSection(i)} className="p-0.5 hover:text-gold">
                            <CheckCircle2 className={`w-3 h-3 ${s.enabled ? 'text-emerald-400' : 'text-muted-foreground'}`} />
                          </button>
                          <button onClick={() => moveSection(i, 'up')} disabled={i === 0} className="p-0.5 hover:text-gold disabled:opacity-30"><ChevronUp className="w-3 h-3" /></button>
                          <button onClick={() => moveSection(i, 'down')} disabled={i === sectionOrder.length - 1} className="p-0.5 hover:text-gold disabled:opacity-30"><ChevronDown className="w-3 h-3" /></button>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              ) : <p className="text-xs text-muted-foreground text-center py-8">Sélectionnez une collection</p>}
            </CardContent>
          </Card>

          {/* Right: Lifecycle + Module Inspector */}
          <Card className="glass-card gold-border">
            <CardHeader className="pb-2"><CardTitle className="text-sm">Lifecycle & Modules</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {selectedCollection ? (
                <>
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Statut actuel</p>
                    <Badge variant="outline" className="text-xs">{selectedCollection.status}</Badge>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Transitions disponibles</p>
                    {loadingTransitions ? <Loader2 className="size-4 animate-spin" /> : transitions.filter(t => t.allowed).length === 0 ? (
                      <p className="text-[10px] text-muted-foreground">Aucune transition disponible</p>
                    ) : transitions.filter(t => t.allowed).map(t => (
                      <Button key={t.to} size="sm" variant="outline" className="w-full mb-1 h-7 text-[10px]"
                        onClick={() => handleTransition(t.to)}>{t.label}</Button>
                    ))}
                    {transitions.filter(t => !t.allowed).map(t => (
                      <p key={t.to} className="text-[10px] text-muted-foreground/50 line-through">{t.label} ({t.reason})</p>
                    ))}
                  </div>
                  <div className="pt-2 border-t border-white/5">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Module Packs (34 slots)</p>
                    {[['WEBSITE', 10], ['INVITATIONS', 8], ['PRINT', 8], ['COMMUNICATION', 8]].map(([pack, count]) => (
                      <div key={pack} className="flex items-center justify-between text-[10px] py-0.5">
                        <span className="text-muted-foreground">{pack}</span><span>{count} slots</span>
                      </div>
                    ))}
                  </div>
                </>
              ) : <p className="text-xs text-muted-foreground text-center py-8">—</p>}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ─── DESIGN SYSTEM ──────────────────────────────────────────────── */}
      {section === 'design-system' && (
        <div className="space-y-4">
          <Card className="glass-card gold-border">
            <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Palette className="w-4 h-4 text-gold" /> Design Token Editor — Round-Trip: Edit → DB → Consumer</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {/* Wedding selector for token application */}
              <div className="flex items-center gap-2">
                <Label className="text-xs whitespace-nowrap">Appliquer à:</Label>
                <select value={selectedWeddingId || ''} onChange={(e) => setSelectedWeddingId(e.target.value || null)}
                  className="flex-1 text-xs rounded border border-white/10 bg-white/5 px-2 py-1.5">
                  <option value="">— Sélectionner un mariage —</option>
                  {weddings.map(w => <option key={w.id} value={w.id}>{w.coupleLabel}</option>)}
                </select>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {/* Colors */}
                <div className="space-y-2">
                  <p className="text-[10px] uppercase tracking-wider text-gold/70">Colors</p>
                  {[
                    { key: 'primaryColor', label: 'Primary' }, { key: 'accentColor', label: 'Accent' },
                    { key: 'secondaryColor', label: 'Secondary' }, { key: 'backgroundColor', label: 'Background' },
                    { key: 'textColor', label: 'Text' },
                  ].map(c => (
                    <div key={c.key} className="flex items-center gap-2">
                      <Input type="color" value={(tokens as unknown as Record<string, string>)[c.key] || '#000000'}
                        onChange={(e) => setTokens({ ...tokens, [c.key]: e.target.value })}
                        className="w-10 h-8 p-1" />
                      <Input value={(tokens as unknown as Record<string, string>)[c.key] || ''}
                        onChange={(e) => setTokens({ ...tokens, [c.key]: e.target.value })}
                        className="flex-1 text-xs h-8" placeholder={c.label} />
                      <span className="text-[10px] text-muted-foreground w-16">{c.label}</span>
                    </div>
                  ))}
                </div>

                {/* Typography */}
                <div className="space-y-2">
                  <p className="text-[10px] uppercase tracking-wider text-gold/70">Typography</p>
                  <div><Label className="text-[10px]">Display Font</Label><Input value={tokens.fontDisplay} onChange={(e) => setTokens({ ...tokens, fontDisplay: e.target.value })} className="text-xs h-8" /></div>
                  <div><Label className="text-[10px]">Body Font</Label><Input value={tokens.fontBody} onChange={(e) => setTokens({ ...tokens, fontBody: e.target.value })} className="text-xs h-8" /></div>
                  <div><Label className="text-[10px]">Heading Size</Label><Input value={tokens.headingSize || ''} onChange={(e) => setTokens({ ...tokens, headingSize: e.target.value })} className="text-xs h-8" placeholder="48px" /></div>
                  <div><Label className="text-[10px]">Body Size</Label><Input value={tokens.bodySize || ''} onChange={(e) => setTokens({ ...tokens, bodySize: e.target.value })} className="text-xs h-8" placeholder="16px" /></div>
                </div>

                {/* Shape + Effects + Layout */}
                <div className="space-y-2">
                  <p className="text-[10px] uppercase tracking-wider text-gold/70">Shape & Effects</p>
                  <div><Label className="text-[10px]">Radius Small</Label><Input value={tokens.radiusSmall || ''} onChange={(e) => setTokens({ ...tokens, radiusSmall: e.target.value })} className="text-xs h-8" /></div>
                  <div><Label className="text-[10px]">Radius Medium</Label><Input value={tokens.radiusMedium || ''} onChange={(e) => setTokens({ ...tokens, radiusMedium: e.target.value })} className="text-xs h-8" /></div>
                  <div><Label className="text-[10px]">Radius Large</Label><Input value={tokens.radiusLarge || ''} onChange={(e) => setTokens({ ...tokens, radiusLarge: e.target.value })} className="text-xs h-8" /></div>
                  <div><Label className="text-[10px]">Shadow Luxury</Label><Input value={tokens.shadowLuxury || ''} onChange={(e) => setTokens({ ...tokens, shadowLuxury: e.target.value })} className="text-xs h-8" /></div>
                  <div>
                    <Label className="text-[10px]">Layout</Label>
                    <Select value={tokens.layout} onValueChange={(v) => setTokens({ ...tokens, layout: v })}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>{LAYOUTS.map(l => <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              <Button onClick={saveTokens} disabled={savingTokens || !selectedWeddingId} className="w-full">
                {savingTokens ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                Sauvegarder (Edit → API → DB → Reload → Consumer)
              </Button>
              <p className="text-[10px] text-muted-foreground text-center">
                Tokens consommés par ThemeInjector (--theme-* CSS variables) + SectionRenderer. 13/13 tokens éditables.
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ─── PRODUCT BUILDER ────────────────────────────────────────────── */}
      {section === 'product-builder' && (
        <div className="space-y-4">
          {/* Top bar: product + wedding + guest selectors */}
          <Card className="glass-card gold-border">
            <CardContent className="p-3">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <div>
                  <Label className="text-[10px] uppercase tracking-wider">Product</Label>
                  <Select value={selectedProduct} onValueChange={setSelectedProduct}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="WEBSITE">Website</SelectItem>
                      <SelectItem value="INVITATION">Invitation</SelectItem>
                      <SelectItem value="SAVE_THE_DATE" disabled>Save the Date (à venir)</SelectItem>
                      <SelectItem value="PROGRAM" disabled>Program (à venir)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-[10px] uppercase tracking-wider">Wedding</Label>
                  <select value={selectedWeddingId || ''} onChange={(e) => setSelectedWeddingId(e.target.value || null)}
                    className="w-full text-xs rounded border border-white/10 bg-white/5 px-2 py-1.5 h-8">
                    <option value="">— Sélectionner —</option>
                    {weddings.map(w => <option key={w.id} value={w.id}>{w.coupleLabel}</option>)}
                  </select>
                </div>
                <div>
                  <Label className="text-[10px] uppercase tracking-wider">Guest</Label>
                  <select value={selectedGuestId || ''} onChange={(e) => setSelectedGuestId(e.target.value || null)}
                    disabled={!selectedWeddingId || loadingGuests}
                    className="w-full text-xs rounded border border-white/10 bg-white/5 px-2 py-1.5 h-8 disabled:opacity-50">
                    <option value="">{loadingGuests ? 'Chargement...' : '— Sélectionner —'}</option>
                    {guests.map(g => <option key={g.id} value={g.id}>{g.displayName || `${g.firstName} ${g.lastName}`}</option>)}
                  </select>
                </div>
                <div>
                  <Label className="text-[10px] uppercase tracking-wider">Collection</Label>
                  <select value={selectedCollection?.id || ''} onChange={(e) => { const c = collections.find(c => c.id === e.target.value); setSelectedCollection(c || null) }}
                    className="w-full text-xs rounded border border-white/10 bg-white/5 px-2 py-1.5 h-8">
                    <option value="">— Sélectionner —</option>
                    {collections.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Left: Structure Tree */}
            <Card className="glass-card gold-border">
              <CardHeader className="pb-2"><CardTitle className="text-sm">Structure Tree — {selectedProduct}</CardTitle></CardHeader>
              <CardContent className="space-y-1">
                {sectionOrder.map((s, i) => (
                  <div key={s.type} className="flex items-center gap-2 p-2 rounded text-xs hover:bg-white/5">
                    <span className="text-sm">{s.icon}</span>
                    <span className={s.enabled ? '' : 'text-muted-foreground line-through'}>{s.label}</span>
                    <Badge variant="outline" className="text-[9px] ml-auto">{s.type}</Badge>
                    <div className="flex gap-0.5">
                      <button onClick={() => toggleSection(i)} className="p-0.5"><CheckCircle2 className={`w-3 h-3 ${s.enabled ? 'text-emerald-400' : 'text-muted-foreground'}`} /></button>
                      <button onClick={() => moveSection(i, 'up')} disabled={i === 0} className="p-0.5 disabled:opacity-30"><ChevronUp className="w-3 h-3" /></button>
                      <button onClick={() => moveSection(i, 'down')} disabled={i === sectionOrder.length - 1} className="p-0.5 disabled:opacity-30"><ChevronDown className="w-3 h-3" /></button>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Right: Semantic Data Bindings */}
            <Card className="glass-card gold-border">
              <CardHeader className="pb-2"><CardTitle className="text-sm">Semantic Data Bindings</CardTitle></CardHeader>
              <CardContent className="space-y-1 max-h-[50vh] overflow-y-auto">
                {SEMANTIC_BINDINGS.map(b => (
                  <div key={b.role} className="p-2 rounded border border-white/5 text-xs space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{b.label}</span>
                      <Badge variant="outline" className={`text-[9px] ${b.required ? 'text-amber-400 border-amber-500/30' : 'text-muted-foreground'}`}>{b.required ? 'REQUIRED' : 'optional'}</Badge>
                    </div>
                    <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                      <span className="font-mono">{b.role}</span>
                      <span>→</span>
                      <span className="font-mono">{b.dataPath}</span>
                    </div>
                    {b.fallback && <div className="text-[10px] text-muted-foreground/70">Fallback: "{b.fallback}"</div>}
                  </div>
                ))}
                {selectedWeddingId && selectedGuestId && (
                  <div className="mt-2 p-2 rounded bg-emerald-500/10 border border-emerald-500/20 text-[10px] text-emerald-300">
                    ✅ Context: {weddings.find(w => w.id === selectedWeddingId)?.coupleLabel} · Guest: {guests.find(g => g.id === selectedGuestId)?.displayName || 'N/A'}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  )
}
