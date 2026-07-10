'use client'

import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Loader2, Crown, Download, FileImage, FileText, CheckCircle2, AlertCircle, Play } from 'lucide-react'
import { toast } from 'sonner'

interface Props { csrfToken: string }

interface Collection {
  id: string
  slug: string
  name: string
  status: string
  version: string
}

interface MasterStatus {
  collectionStatus: string
  version: string
  sourceHash: string | null
  hasIngestedDesign: boolean
  ingestionJobCount: number
  designVersionCount: number
  exportJobCount: number
  latestIngestionJob: { status: string; completedAt: string | null } | null
}

export function DesignFactoryTab({ csrfToken }: Props) {
  const [collections, setCollections] = useState<Collection[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [masterStatus, setMasterStatus] = useState<MasterStatus | null>(null)
  const [ingesting, setIngesting] = useState(false)
  const [approving, setApproving] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [batchExporting, setBatchExporting] = useState(false)
  const [lastExport, setLastExport] = useState<{ pngUrl?: string; pdfUrl?: string; pngSize?: number; pdfSize?: number } | null>(null)
  const [batchResult, setBatchResult] = useState<{ totalGuests: number; completed: number; failed: number; outputs: Array<{ guestName?: string; pngUrl?: string; pdfUrl?: string; error?: string }> } | null>(null)
  // P0-B: real wedding + guest selectors (replaces hardcoded IDs)
  const [weddings, setWeddings] = useState<Array<{ id: string; slug: string; coupleLabel: string }>>([])
  const [selectedWeddingId, setSelectedWeddingId] = useState<string | null>(null)
  const [guests, setGuests] = useState<Array<{ id: string; displayName: string | null; firstName: string; lastName: string; invitationCode: string }>>([])
  const [loadingGuests, setLoadingGuests] = useState(false)
  const [selectedGuestId, setSelectedGuestId] = useState<string | null>(null)

  const fetchCollections = useCallback(async () => {
    try {
      const res = await fetch('/api/platform/collections?includeDrafts=true', {
        headers: { 'X-CSRF-Token': csrfToken },
      })
      if (!res.ok) return
      const data = await res.json()
      setCollections((data.collections || []).slice(0, 6))
    } catch { toast.error('Erreur de chargement') }
    finally { setLoading(false) }
  }, [csrfToken])

  useEffect(() => { fetchCollections() }, [fetchCollections])

  // P0-B: load weddings for selector
  useEffect(() => {
    fetch('/api/platform/weddings?limit=100', { headers: { 'X-CSRF-Token': csrfToken } })
      .then(r => r.json())
      .then(d => setWeddings((d.weddings || []).map((w: Record<string, unknown>) => ({
        id: String(w.id), slug: String(w.slug), coupleLabel: String(w.coupleLabel || w.slug)
      }))))
      .catch(() => {})
  }, [csrfToken])

  // P0-B: load guests when a wedding is selected (tenant-scoped)
  useEffect(() => {
    if (!selectedWeddingId) { setGuests([]); setSelectedGuestId(null); return }
    setLoadingGuests(true)
    fetch(`/api/guests?weddingId=${selectedWeddingId}&limit=100`, { headers: { 'X-CSRF-Token': csrfToken } })
      .then(r => r.json())
      .then(d => {
        const list = Array.isArray(d) ? d : (d.guests || [])
        setGuests(list.map((g: Record<string, unknown>) => ({
          id: String(g.id),
          displayName: (g.displayName as string | null) || null,
          firstName: String(g.firstName || ''),
          lastName: String(g.lastName || ''),
          invitationCode: String(g.invitationCode || '')
        })))
        setSelectedGuestId(null)
      })
      .catch(() => { setGuests([]) })
      .finally(() => setLoadingGuests(false))
  }, [selectedWeddingId, csrfToken])

  const fetchMasterStatus = useCallback(async (collectionId: string) => {
    try {
      const res = await fetch(`/api/design/master-status?collectionId=${collectionId}`, {
        headers: { 'X-CSRF-Token': csrfToken },
      })
      if (res.ok) {
        const data = await res.json()
        setMasterStatus(data.status)
      }
    } catch { /* ignore */ }
  }, [csrfToken])

  useEffect(() => {
    if (selectedId) fetchMasterStatus(selectedId)
  }, [selectedId, fetchMasterStatus])

  const post = async (url: string, body: Record<string, unknown>) => {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
      body: JSON.stringify(body),
    })
    const data = await res.json()
    if (!res.ok) { toast.error(data.error || data.message || 'Erreur'); return null }
    return data
  }

  const handleIngest = async () => {
    if (!selectedId) return
    setIngesting(true)
    try {
      const r = await post('/api/design/ingest', { collectionId: selectedId })
      if (r) {
        toast.success(`Master ingéré: version ${r.version}, hash ${r.sourceHash?.slice(0, 12)}`)
        fetchMasterStatus(selectedId)
        fetchCollections()
      }
    } finally { setIngesting(false) }
  }

  const handleApprove = async () => {
    if (!selectedId) return
    setApproving(true)
    try {
      const r = await post('/api/design/approve', { collectionId: selectedId })
      if (r) {
        toast.success(`Master approuvé: ${r.status} v${r.version}`)
        fetchMasterStatus(selectedId)
        fetchCollections()
      }
    } finally { setApproving(false) }
  }

  const handleExport = async () => {
    if (!selectedId || !selectedWeddingId || !selectedGuestId) return
    setExporting(true)
    setLastExport(null)
    try {
      const r = await post('/api/design/export', {
        collectionId: selectedId,
        weddingId: selectedWeddingId || '',
        guestId: selectedGuestId || '',
        formats: ['PNG', 'PDF'],
      })
      if (r) {
        setLastExport({ pngUrl: r.pngUrl, pdfUrl: r.pdfUrl, pngSize: r.pngSize, pdfSize: r.pdfSize })
        toast.success(`Export: PNG ${r.pngSize ? (r.pngSize / 1024).toFixed(1) + 'KB' : 'N/A'}, PDF ${r.pdfSize ? (r.pdfSize / 1024).toFixed(1) + 'KB' : 'N/A'}`)
        fetchMasterStatus(selectedId)
      }
    } finally { setExporting(false) }
  }

  const handleBatchExport = async () => {
    if (!selectedId || !selectedWeddingId || guests.length === 0) return
    setBatchExporting(true)
    setBatchResult(null)
    try {
      const r = await post('/api/design/batch-export', {
        collectionId: selectedId,
        weddingId: selectedWeddingId || '',
        guestIds: guests.slice(0, 5).map(g => g.id),
        formats: ['PNG', 'PDF'],
      })
      if (r) {
        setBatchResult({ totalGuests: r.totalGuests, completed: r.completed, failed: r.failed, outputs: r.outputs })
        toast.success(`Batch: ${r.completed}/${r.totalGuests} réussis`)
        fetchMasterStatus(selectedId)
      }
    } finally { setBatchExporting(false) }
  }

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="size-8 animate-spin text-gold" /></div>

  const statusColors: Record<string, string> = {
    BROUILLON: 'bg-amber-100 text-amber-800',
    EN_COURS: 'bg-blue-100 text-blue-800',
    VALIDATION: 'bg-purple-100 text-purple-800',
    PUBLIE: 'bg-green-100 text-green-800',
    COMMERCIALISE: 'bg-gold/20 text-gold',
    ARCHIVE: 'bg-gray-100 text-gray-600',
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div>
        <h2 className="text-2xl font-serif flex items-center gap-2">
          <Crown className="w-6 h-6 text-gold" /> Design Factory
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Usine de production visuelle — ingestion, mapping, validation, export
        </p>
      </div>

      {/* Collection selector */}
      <Card className="glass-card gold-border">
        <CardHeader><CardTitle className="text-sm">Sélectionner une Collection</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {collections.map((c) => (
            <button
              key={c.id}
              onClick={() => setSelectedId(c.id)}
              className={`w-full flex items-center justify-between p-3 rounded-lg border transition-all ${
                selectedId === c.id ? 'border-gold bg-gold/10' : 'border-white/10 hover:border-gold/30'
              }`}
            >
              <div>
                <span className="font-medium text-sm">{c.name}</span>
                <span className="text-xs text-muted-foreground ml-2">v{c.version}</span>
              </div>
              <Badge className={`text-xs ${statusColors[c.status] || 'bg-gray-100'}`}>{c.status}</Badge>
            </button>
          ))}
        </CardContent>
      </Card>

      {selectedId && masterStatus && (
        <>
          {/* Master status */}
          <Card className="glass-card gold-border">
            <CardHeader><CardTitle className="text-sm">Statut du Master</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div><p className="text-xs text-muted-foreground">Statut</p><p className="font-medium">{masterStatus.collectionStatus}</p></div>
              <div><p className="text-xs text-muted-foreground">Version</p><p className="font-medium">{masterStatus.version}</p></div>
              <div><p className="text-xs text-muted-foreground">Design ingéré</p><p className="font-medium">{masterStatus.hasIngestedDesign ? 'OUI' : 'NON'}</p></div>
              <div><p className="text-xs text-muted-foreground">Source hash</p><p className="font-mono text-xs">{masterStatus.sourceHash ? masterStatus.sourceHash.slice(0, 16) + '...' : '—'}</p></div>
              <div><p className="text-xs text-muted-foreground">Ingestion jobs</p><p className="font-medium">{masterStatus.ingestionJobCount}</p></div>
              <div><p className="text-xs text-muted-foreground">Design versions</p><p className="font-medium">{masterStatus.designVersionCount}</p></div>
              <div><p className="text-xs text-muted-foreground">Export jobs</p><p className="font-medium">{masterStatus.exportJobCount}</p></div>
              <div><p className="text-xs text-muted-foreground">Dernière ingestion</p><p className="font-medium text-xs">{masterStatus.latestIngestionJob?.completedAt ? new Date(masterStatus.latestIngestionJob.completedAt).toLocaleString('fr-FR') : '—'}</p></div>
            </CardContent>
          </Card>

          {/* Actions */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="glass-card">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center gap-2"><Play className="w-4 h-4 text-gold" /><span className="text-sm font-medium">1. Ingérer</span></div>
                <p className="text-xs text-muted-foreground">Ingère le golden fixture via le pipeline d'ingestion. Crée un IngestionJob + DesignVersion immutable.</p>
                <Button size="sm" className="w-full" onClick={handleIngest} disabled={ingesting}>
                  {ingesting ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Play className="w-3 h-3 mr-1" />}
                  Ingérer le master
                </Button>
              </CardContent>
            </Card>

            <Card className="glass-card">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-gold" /><span className="text-sm font-medium">2. Approuver</span></div>
                <p className="text-xs text-muted-foreground">Approuve le master pour la production (VALIDATION → PUBLIE).</p>
                <Button size="sm" variant="outline" className="w-full" onClick={handleApprove} disabled={approving || masterStatus.collectionStatus !== 'VALIDATION'}>
                  {approving ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <CheckCircle2 className="w-3 h-3 mr-1" />}
                  Approuver
                </Button>
              </CardContent>
            </Card>

            <Card className="glass-card">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center gap-2"><FileImage className="w-4 h-4 text-gold" /><span className="text-sm font-medium">3. Export PNG+PDF</span></div>
                <p className="text-xs text-muted-foreground">Produit de vrais fichiers PNG + PDF (via sharp, server-side).</p>
                {/* P0-B: Real wedding + guest selectors */}
                <div className="space-y-2">
                  <select
                    value={selectedWeddingId || ''}
                    onChange={(e) => setSelectedWeddingId(e.target.value || null)}
                    className="w-full text-xs rounded border border-white/10 bg-white/5 px-2 py-1.5"
                  >
                    <option value="">— Sélectionner un mariage —</option>
                    {weddings.map(w => <option key={w.id} value={w.id}>{w.coupleLabel}</option>)}
                  </select>
                  <select
                    value={selectedGuestId || ''}
                    onChange={(e) => setSelectedGuestId(e.target.value || null)}
                    disabled={!selectedWeddingId || loadingGuests}
                    className="w-full text-xs rounded border border-white/10 bg-white/5 px-2 py-1.5 disabled:opacity-50"
                  >
                    <option value="">{loadingGuests ? 'Chargement...' : '— Sélectionner un invité —'}</option>
                    {guests.map(g => <option key={g.id} value={g.id}>{g.displayName || `${g.firstName} ${g.lastName}`}</option>)}
                  </select>
                </div>
                <Button size="sm" variant="outline" className="w-full" onClick={handleExport} disabled={exporting || !masterStatus.hasIngestedDesign || !selectedWeddingId || !selectedGuestId}>
                  {exporting ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Download className="w-3 h-3 mr-1" />}
                  Exporter (1 invité)
                </Button>
                {lastExport && (
                  <div className="text-xs space-y-1">
                    {lastExport.pngUrl && <a href={lastExport.pngUrl} target="_blank" rel="noopener" className="block text-blue-400 hover:underline">PNG ({(lastExport.pngSize! / 1024).toFixed(1)}KB)</a>}
                    {lastExport.pdfUrl && <a href={lastExport.pdfUrl} target="_blank" rel="noopener" className="block text-blue-400 hover:underline">PDF ({(lastExport.pdfSize! / 1024).toFixed(1)}KB)</a>}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="glass-card">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center gap-2"><FileText className="w-4 h-4 text-gold" /><span className="text-sm font-medium">4. Batch (3 invités)</span></div>
                <p className="text-xs text-muted-foreground">Prouve qu'un master produit plusieurs invitations personnalisées.</p>
                <Button size="sm" variant="outline" className="w-full" onClick={handleBatchExport} disabled={batchExporting || !masterStatus.hasIngestedDesign || !selectedWeddingId || guests.length === 0}>
                  {batchExporting ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Download className="w-3 h-3 mr-1" />}
                  Batch export
                </Button>
                {batchResult && (
                  <div className="text-xs">
                    <p className="font-medium">{batchResult.completed}/{batchResult.totalGuests} réussis</p>
                    {batchResult.failed > 0 && <p className="text-red-400">{batchResult.failed} échoués</p>}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {batchResult && Array.isArray(batchResult.outputs) && batchResult.outputs.length > 0 && (
            <Card className="glass-card gold-border">
              <CardHeader><CardTitle className="text-sm">Résultats du batch ({batchResult.outputs.length} invités)</CardTitle></CardHeader>
              <CardContent className="space-y-2 max-h-64 overflow-y-auto">
                {batchResult.outputs.map((o, i) => (
                  <div key={i} className="flex items-center justify-between p-2 rounded border border-white/5 text-xs">
                    <span>{o.guestName || 'Unknown'}</span>
                    <div className="flex gap-2">
                      {o.pngUrl && <a href={o.pngUrl} target="_blank" rel="noopener" className="text-blue-400">PNG</a>}
                      {o.pdfUrl && <a href={o.pdfUrl} target="_blank" rel="noopener" className="text-blue-400">PDF</a>}
                      {o.error && <span className="text-red-400">ERR</span>}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  )
}
