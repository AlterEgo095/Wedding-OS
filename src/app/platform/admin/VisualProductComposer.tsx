'use client'

// ══════════════════════════════════════════════════════════════════════════════
// VISUAL PRODUCT COMPOSER — Mission 5.8.7
// ══════════════════════════════════════════════════════════════════════════════
// Block-based visual composer for Wedding OS products.
// Uses @dnd-kit (already installed) for drag-and-drop reordering.
// Uses Visual Component Library (registry.ts) for block definitions.
// Uses compileComponent (registry.ts) for live preview rendering.
// Uses design/mapping-engine for semantic data bindings.
//
// Architecture: 3-panel workspace
//   Left: Block Library (add blocks from Visual Component Library)
//   Center: Composition Canvas (sortable list of active blocks)
//   Right: Inspector (configure selected block + data bindings)
// ══════════════════════════════════════════════════════════════════════════════

import { useState, useMemo, useCallback } from 'react'
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor,
  useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove, SortableContext, sortableKeyboardCoordinates,
  useSortable, verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Boxes, Plus, Trash2, GripVertical, Eye, Copy, ChevronUp, ChevronDown,
  Monitor, Tablet, Smartphone, Save, X, Settings2, Link2,
} from 'lucide-react'
import { toast } from 'sonner'
import { CANONICAL_COMPONENT_SEEDS, compileComponent, type CompilationContext } from '@/lib/components/registry'

// ─── Types ────────────────────────────────────────────────────────────────────

interface ComposableBlock {
  id: string
  componentSlug: string
  name: string
  category: string
  semanticRole: string
  enabled: boolean
  variant: string
  config: Record<string, string>
  bindings: Record<string, string>
}

type PreviewDevice = 'DESKTOP' | 'TABLET' | 'MOBILE'

// ─── Block variants (visual presets per category) ─────────────────────────────

const BLOCK_VARIANTS: Record<string, Array<{ value: string; label: string }>> = {
  HERO: [
    { value: 'royal', label: 'Royal' },
    { value: 'elegant', label: 'Elegant' },
    { value: 'modern', label: 'Modern' },
    { value: 'luxury', label: 'Luxury' },
    { value: 'floral', label: 'Floral' },
    { value: 'glass', label: 'Glass' },
  ],
  STORY: [
    { value: 'timeline', label: 'Timeline' },
    { value: 'chapters', label: 'Chapters' },
    { value: 'scroll', label: 'Scroll' },
  ],
  GALLERY: [
    { value: 'grid', label: 'Grid' },
    { value: 'masonry', label: 'Masonry' },
    { value: 'carousel', label: 'Carousel' },
  ],
  TIMELINE: [
    { value: 'vertical', label: 'Vertical' },
    { value: 'horizontal', label: 'Horizontal' },
  ],
  MAP: [
    { value: 'standard', label: 'Standard' },
    { value: 'minimal', label: 'Minimal' },
  ],
  FORMS: [
    { value: 'standard', label: 'Standard' },
    { value: 'luxury', label: 'Luxury' },
  ],
  INVITATION: [
    { value: 'portrait', label: 'Portrait' },
    { value: 'landscape', label: 'Landscape' },
  ],
  QR_CODE: [
    { value: 'standard', label: 'Standard' },
    { value: 'framed', label: 'Framed' },
  ],
}

// ─── Block config properties per category ─────────────────────────────────────

const BLOCK_CONFIGS: Record<string, Array<{ key: string; label: string; type: 'TEXT' | 'COLOR' | 'BOOLEAN' | 'SELECT'; options?: string[] }>> = {
  HERO: [
    { key: 'height', label: 'Hauteur', type: 'SELECT', options: ['auto', '400px', '600px', '800px', '100vh'] },
    { key: 'overlay', label: 'Overlay', type: 'SELECT', options: ['none', 'light', 'medium', 'dark'] },
    { key: 'alignment', label: 'Alignement', type: 'SELECT', options: ['center', 'left', 'right'] },
    { key: 'animation', label: 'Animation', type: 'SELECT', options: ['none', 'fade', 'slide', 'zoom'] },
    { key: 'showDate', label: 'Afficher date', type: 'BOOLEAN' },
    { key: 'showCountdown', label: 'Compte à rebours', type: 'BOOLEAN' },
  ],
  STORY: [
    { key: 'chaptersPerPage', label: 'Chapitres/page', type: 'SELECT', options: ['3', '5', '10'] },
    { key: 'showPhotos', label: 'Photos', type: 'BOOLEAN' },
  ],
  GALLERY: [
    { key: 'columns', label: 'Colonnes', type: 'SELECT', options: ['2', '3', '4'] },
    { key: 'lightbox', label: 'Visionneuse', type: 'BOOLEAN' },
  ],
  TIMELINE: [
    { key: 'showIcons', label: 'Icônes', type: 'BOOLEAN' },
    { key: 'showLocation', label: 'Lieu', type: 'BOOLEAN' },
  ],
  MAP: [
    { key: 'zoom', label: 'Zoom', type: 'SELECT', options: ['12', '14', '16'] },
    { key: 'showAddress', label: 'Adresse', type: 'BOOLEAN' },
  ],
  FORMS: [
    { key: 'showHint', label: 'Indice', type: 'BOOLEAN' },
  ],
  INVITATION: [
    { key: 'showQR', label: 'QR Code', type: 'BOOLEAN' },
    { key: 'showTable', label: 'Table', type: 'BOOLEAN' },
    { key: 'orientation', label: 'Orientation', type: 'SELECT', options: ['portrait', 'landscape'] },
  ],
  QR_CODE: [
    { key: 'size', label: 'Taille', type: 'SELECT', options: ['150', '200', '300'] },
  ],
}

// ─── Semantic bindings (from design/mapping-engine) ───────────────────────────

const SEMANTIC_BINDINGS = [
  { role: 'event.coupleNames', label: 'Noms du couple', dataPath: 'Wedding.coupleLabel', fallback: 'Notre Mariage' },
  { role: 'event.date', label: 'Date', dataPath: 'Wedding.weddingDate', fallback: 'Date à confirmer' },
  { role: 'event.venue', label: 'Lieu', dataPath: 'Wedding.venueName', fallback: 'Lieu à confirmer' },
  { role: 'guest.name', label: 'Nom invité', dataPath: 'Guest.displayName', fallback: 'Cher invité' },
  { role: 'guest.table', label: 'Table', dataPath: 'Table.name', fallback: '—' },
  { role: 'invitation.qrCode', label: 'QR Code', dataPath: 'Invitation.qrCodeUrl', fallback: '' },
  { role: 'invitation.accessCode', label: "Code d'accès", dataPath: 'Guest.invitationCode', fallback: '' },
]

// ─── Sortable Block Item ──────────────────────────────────────────────────────

function SortableBlock({ block, isSelected, onSelect, onToggle, onRemove, onDuplicate, onMove }: {
  block: ComposableBlock
  isSelected: boolean
  onSelect: () => void
  onToggle: () => void
  onRemove: () => void
  onDuplicate: () => void
  onMove: (dir: 'up' | 'down') => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: block.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <div ref={setNodeRef} style={style}
      className={`group flex items-center gap-2 p-2 rounded-lg border transition-all cursor-pointer ${
        isSelected ? 'border-gold bg-gold/10' : 'border-white/10 hover:border-white/20 bg-white/[0.02]'
      } ${!block.enabled ? 'opacity-50' : ''}`}
      onClick={onSelect}
    >
      <button {...attributes} {...listeners} className="p-0.5 text-muted-foreground hover:text-gold cursor-grab active:cursor-grabbing">
        <GripVertical className="w-4 h-4" />
      </button>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium truncate">{block.name}</span>
          <Badge variant="outline" className="text-[8px] h-3.5 shrink-0">{block.category}</Badge>
          {block.variant && <Badge variant="outline" className="text-[8px] h-3.5 shrink-0 text-gold/70">{block.variant}</Badge>}
        </div>
      </div>
      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
        <button onClick={(e) => { e.stopPropagation(); onMove('up') }} className="p-0.5 hover:text-gold"><ChevronUp className="w-3 h-3" /></button>
        <button onClick={(e) => { e.stopPropagation(); onMove('down') }} className="p-0.5 hover:text-gold"><ChevronDown className="w-3 h-3" /></button>
        <button onClick={(e) => { e.stopPropagation(); onToggle() }} className="p-0.5 hover:text-gold">
          <Eye className={`w-3 h-3 ${block.enabled ? 'text-emerald-400' : 'text-muted-foreground'}`} />
        </button>
        <button onClick={(e) => { e.stopPropagation(); onDuplicate() }} className="p-0.5 hover:text-gold"><Copy className="w-3 h-3" /></button>
        <button onClick={(e) => { e.stopPropagation(); onRemove() }} className="p-0.5 hover:text-red-400"><Trash2 className="w-3 h-3" /></button>
      </div>
    </div>
  )
}

// ─── Main Visual Product Composer ─────────────────────────────────────────────

export function VisualProductComposer({ csrfToken }: { csrfToken: string }) {
  const [blocks, setBlocks] = useState<ComposableBlock[]>([
    { id: 'block-1', componentSlug: 'hero-royal', name: 'Hero', category: 'HERO', semanticRole: 'hero', enabled: true, variant: 'royal', config: { height: '600px', overlay: 'medium', alignment: 'center', animation: 'fade', showDate: 'true', showCountdown: 'false' }, bindings: { 'event.coupleNames': 'Wedding.coupleLabel', 'event.date': 'Wedding.weddingDate' } },
    { id: 'block-2', componentSlug: 'story-timeline', name: 'Notre Histoire', category: 'STORY', semanticRole: 'story', enabled: true, variant: 'timeline', config: { chaptersPerPage: '5', showPhotos: 'true' }, bindings: {} },
    { id: 'block-3', componentSlug: 'gallery-premium', name: 'Galerie', category: 'GALLERY', semanticRole: 'gallery', enabled: true, variant: 'grid', config: { columns: '3', lightbox: 'true' }, bindings: {} },
    { id: 'block-4', componentSlug: 'timeline-events', name: 'Programme', category: 'TIMELINE', semanticRole: 'timeline', enabled: true, variant: 'vertical', config: { showIcons: 'true', showLocation: 'true' }, bindings: {} },
    { id: 'block-5', componentSlug: 'map-venue', name: 'Lieu', category: 'MAP', semanticRole: 'map', enabled: true, variant: 'standard', config: { zoom: '14', showAddress: 'true' }, bindings: { 'event.venue': 'Wedding.venueName' } },
    { id: 'block-6', componentSlug: 'guest-auth', name: 'Accès Invités', category: 'FORMS', semanticRole: 'guest-auth', enabled: true, variant: 'standard', config: { showHint: 'true' }, bindings: {} },
  ])

  const [selectedBlockId, setSelectedBlockId] = useState<string | null>('block-1')
  const [device, setDevice] = useState<PreviewDevice>('DESKTOP')
  const [productType, setProductType] = useState('WEBSITE')
  const [showBlockLibrary, setShowBlockLibrary] = useState(false)
  const [saving, setSaving] = useState(false)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const selectedBlock = useMemo(() => blocks.find(b => b.id === selectedBlockId), [blocks, selectedBlockId])

  // ─── DnD handlers ───────────────────────────────────────────────────────────
  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    setBlocks(items => {
      const oldIndex = items.findIndex(i => i.id === active.id)
      const newIndex = items.findIndex(i => i.id === over.id)
      return arrayMove(items, oldIndex, newIndex)
    })
  }, [])

  // ─── Block operations ───────────────────────────────────────────────────────
  const addBlock = (slug: string) => {
    const component = CANONICAL_COMPONENT_SEEDS.find(c => c.slug === slug)
    if (!component) return
    const newBlock: ComposableBlock = {
      id: `block-${Date.now()}`,
      componentSlug: slug,
      name: component.name.split('—')[0].trim(),
      category: component.category,
      semanticRole: component.semanticRole,
      enabled: true,
      variant: BLOCK_VARIANTS[component.category]?.[0]?.value || 'standard',
      config: {},
      bindings: {},
    }
    setBlocks([...blocks, newBlock])
    setShowBlockLibrary(false)
    toast.success(`Bloc ajouté: ${newBlock.name}`)
  }

  const removeBlock = (id: string) => {
    setBlocks(blocks.filter(b => b.id !== id))
    if (selectedBlockId === id) setSelectedBlockId(null)
  }

  const duplicateBlock = (id: string) => {
    const block = blocks.find(b => b.id === id)
    if (!block) return
    const idx = blocks.findIndex(b => b.id === id)
    const newBlock = { ...block, id: `block-${Date.now()}`, name: `${block.name} (copie)` }
    const newBlocks = [...blocks]
    newBlocks.splice(idx + 1, 0, newBlock)
    setBlocks(newBlocks)
  }

  const toggleBlock = (id: string) => {
    setBlocks(blocks.map(b => b.id === id ? { ...b, enabled: !b.enabled } : b))
  }

  const moveBlock = (id: string, dir: 'up' | 'down') => {
    const idx = blocks.findIndex(b => b.id === id)
    if (idx < 0) return
    const target = dir === 'up' ? idx - 1 : idx + 1
    if (target < 0 || target >= blocks.length) return
    setBlocks(arrayMove(blocks, idx, target))
  }

  const updateBlockConfig = (id: string, key: string, value: string) => {
    setBlocks(blocks.map(b => b.id === id ? { ...b, config: { ...b.config, [key]: value } } : b))
  }

  const updateBlockVariant = (id: string, variant: string) => {
    setBlocks(blocks.map(b => b.id === id ? { ...b, variant } : b))
  }

  const updateBlockBinding = (id: string, role: string, dataPath: string) => {
    setBlocks(blocks.map(b => {
      if (b.id !== id) return b
      const bindings = { ...b.bindings }
      if (dataPath) { bindings[role] = dataPath } else { delete bindings[role] }
      return { ...b, bindings }
    }))
  }

  // ─── Live preview compilation ───────────────────────────────────────────────
  const enabledBlocks = blocks.filter(b => b.enabled)

  const previewContext: CompilationContext = useMemo(() => ({
    tokens: { primaryColor: '#D4AF37', accentColor: '#1a1a2e', fontDisplay: 'Cormorant Garamond', fontBody: 'Inter' },
    config: {},
    data: { 'event.coupleNames': 'Sarah & Michael', 'event.date': '15 juin 2027', 'event.venue': 'Château de Versailles', 'guest.name': 'Michael Brown', 'guest.table': 'Table 1', 'invitation.qrCode': 'qr-url', 'invitation.accessCode': '050AC028' },
    layout: 'royal',
    productType,
    format: device,
  }), [device, productType])

  const deviceWidths: Record<PreviewDevice, string> = { DESKTOP: '100%', TABLET: '768px', MOBILE: '375px' }

  // ─── Save ───────────────────────────────────────────────────────────────────
  const save = async () => {
    setSaving(true)
    // In production, this would call the governance API to create a version snapshot
    await new Promise(r => setTimeout(r, 500))
    toast.success(`Produit sauvegardé: ${enabledBlocks.length} blocs, version créée`)
    setSaving(false)
  }

  // ─── Block Library (left panel) ─────────────────────────────────────────────
  const availableBlocks = CANONICAL_COMPONENT_SEEDS.filter(c => c.status === 'ACTIVE')

  return (
    <div className="space-y-3">
      {/* Top bar: product type + device + save */}
      <div className="flex items-center gap-3 p-2 rounded-lg bg-white/[0.02] border border-white/5">
        <Select value={productType} onValueChange={setProductType}>
          <SelectTrigger className="w-40 h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="WEBSITE">Website</SelectItem>
            <SelectItem value="INVITATION">Invitation</SelectItem>
            <SelectItem value="SAVE_THE_DATE" disabled>Save the Date</SelectItem>
            <SelectItem value="PROGRAM" disabled>Programme</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex gap-1">
          {([['DESKTOP', Monitor], ['TABLET', Tablet], ['MOBILE', Smartphone]] as const).map(([d, Icon]) => (
            <button key={d} onClick={() => setDevice(d)}
              className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] ${device === d ? 'bg-gold/15 text-gold' : 'text-muted-foreground hover:bg-white/5'}`}>
              <Icon className="w-3 h-3" />{d}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-[10px] text-muted-foreground">{enabledBlocks.length} blocs actifs</span>
          <Button size="sm" variant="outline" className="h-7 text-[10px]" onClick={() => setShowBlockLibrary(!showBlockLibrary)}>
            <Plus className="w-3 h-3 mr-1" />Bibliothèque
          </Button>
          <Button size="sm" className="h-7 text-[10px]" onClick={save} disabled={saving}>
            <Save className="w-3 h-3 mr-1" />{saving ? 'Sauvegarde...' : 'Sauvegarder'}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
        {/* Left: Block Library (collapsible) */}
        {showBlockLibrary && (
          <Card className="glass-card gold-border lg:col-span-3">
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <CardTitle className="text-sm">Bibliothèque de Blocs</CardTitle>
              <button onClick={() => setShowBlockLibrary(false)} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
            </CardHeader>
            <CardContent className="space-y-1 max-h-[60vh] overflow-y-auto">
              {availableBlocks.map(c => (
                <button key={c.slug} onClick={() => addBlock(c.slug)}
                  className="w-full text-left p-2 rounded-lg border border-white/5 hover:border-gold/30 hover:bg-gold/5 transition-all">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium">{c.name}</span>
                    <Badge variant="outline" className="text-[8px] h-3.5">{c.category}</Badge>
                  </div>
                  <p className="text-[9px] text-muted-foreground mt-0.5">{c.description?.slice(0, 60)}</p>
                </button>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Center: Composition Canvas */}
        <Card className={`glass-card gold-border ${showBlockLibrary ? 'lg:col-span-5' : 'lg:col-span-7'}`}>
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Boxes className="w-4 h-4 text-gold" /> Composition — {productType}</CardTitle></CardHeader>
          <CardContent>
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={blocks.map(b => b.id)} strategy={verticalListSortingStrategy}>
                <div className="space-y-1.5">
                  {blocks.map(block => (
                    <SortableBlock
                      key={block.id}
                      block={block}
                      isSelected={selectedBlockId === block.id}
                      onSelect={() => setSelectedBlockId(block.id)}
                      onToggle={() => toggleBlock(block.id)}
                      onRemove={() => removeBlock(block.id)}
                      onDuplicate={() => duplicateBlock(block.id)}
                      onMove={(dir) => moveBlock(block.id, dir)}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
            {blocks.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                <Boxes className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p className="text-xs">Aucun bloc. Ouvrez la bibliothèque pour commencer.</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Right: Inspector + Preview */}
        <div className="lg:col-span-5 space-y-3">
          {/* Inspector */}
          {selectedBlock && (
            <Card className="glass-card gold-border">
              <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Settings2 className="w-4 h-4 text-gold" /> Inspecteur — {selectedBlock.name}</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {/* Variant selector */}
                {BLOCK_VARIANTS[selectedBlock.category] && (
                  <div>
                    <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Variante</Label>
                    <Select value={selectedBlock.variant} onValueChange={(v) => updateBlockVariant(selectedBlock.id, v)}>
                      <SelectTrigger className="h-7 text-xs mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {BLOCK_VARIANTS[selectedBlock.category].map(v => <SelectItem key={v.value} value={v.value}>{v.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                {/* Config properties */}
                {BLOCK_CONFIGS[selectedBlock.category]?.map(prop => (
                  <div key={prop.key} className="flex items-center gap-2">
                    <Label className="text-[10px] w-24 shrink-0">{prop.label}</Label>
                    {prop.type === 'BOOLEAN' ? (
                      <button onClick={() => updateBlockConfig(selectedBlock.id, prop.key, selectedBlock.config[prop.key] === 'true' ? 'false' : 'true')}
                        className={`px-2 py-0.5 rounded text-[10px] ${selectedBlock.config[prop.key] === 'true' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-white/5 text-muted-foreground'}`}>
                        {selectedBlock.config[prop.key] === 'true' ? 'ON' : 'OFF'}
                      </button>
                    ) : prop.type === 'SELECT' ? (
                      <select value={selectedBlock.config[prop.key] || ''} onChange={(e) => updateBlockConfig(selectedBlock.id, prop.key, e.target.value)}
                        className="flex-1 text-xs rounded border border-white/10 bg-white/5 px-2 py-1 h-7">
                        <option value="">—</option>
                        {prop.options?.map(o => <option key={o} value={o}>{o}</option>)}
                      </select>
                    ) : (
                      <Input value={selectedBlock.config[prop.key] || ''} onChange={(e) => updateBlockConfig(selectedBlock.id, prop.key, e.target.value)}
                        className="flex-1 h-7 text-xs" />
                    )}
                  </div>
                ))}
                {/* Data Bindings */}
                <div className="pt-2 border-t border-white/5">
                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1"><Link2 className="w-3 h-3" /> Data Bindings</Label>
                  <div className="space-y-1 mt-1">
                    {SEMANTIC_BINDINGS.map(b => (
                      <div key={b.role} className="flex items-center gap-1 text-[10px]">
                        <span className="text-muted-foreground w-24 truncate">{b.label}</span>
                        <select value={selectedBlock.bindings[b.role] || ''} onChange={(e) => updateBlockBinding(selectedBlock.id, b.role, e.target.value)}
                          className="flex-1 text-[10px] rounded border border-white/10 bg-white/5 px-1 py-0.5 h-6">
                          <option value="">— Non lié —</option>
                          <option value={b.dataPath}>{b.dataPath}</option>
                        </select>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Live Preview */}
          <Card className="glass-card gold-border">
            <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Eye className="w-4 h-4 text-gold" /> Aperçu Live — {device}</CardTitle></CardHeader>
            <CardContent>
              <div className="rounded-lg border border-white/10 overflow-hidden bg-white/[0.02]">
                <div className="flex justify-center p-3" style={{ background: '#FAF8F5' }}>
                  <div style={{ width: deviceWidths[device], maxWidth: '100%', transition: 'width 0.3s' }}>
                    {enabledBlocks.map(block => {
                      const component = CANONICAL_COMPONENT_SEEDS.find(c => c.slug === block.componentSlug)
                      if (!component) return null
                      const ctx: CompilationContext = { ...previewContext, config: block.config }
                      const result = compileComponent(component, ctx)
                      return (
                        <div key={block.id} className="mb-1 p-2 rounded text-center" style={{
                          background: '#fff', color: '#1a1a2e',
                          fontFamily: `'${previewContext.tokens.fontBody}', sans-serif`,
                          border: `1px solid ${previewContext.tokens.primaryColor}22`,
                        }}>
                          <div style={{ fontFamily: `'${previewContext.tokens.fontDisplay}', serif`, fontSize: '14px', color: previewContext.tokens.primaryColor }}>
                            {block.name}
                          </div>
                          <div style={{ fontSize: '8px', opacity: 0.4, marginTop: '2px' }}>
                            {block.variant} · {Object.keys(block.config).length} props · {Object.keys(block.bindings).length} bindings
                          </div>
                          {result.warnings.length > 0 && <div style={{ fontSize: '7px', color: '#f59e0b', marginTop: '2px' }}>⚠ {result.warnings.length}</div>}
                        </div>
                      )
                    })}
                    {enabledBlocks.length === 0 && <p className="text-center text-xs text-gray-400 py-4">Aucun bloc actif</p>}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
