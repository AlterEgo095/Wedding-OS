'use client'

// ══════════════════════════════════════════════════════════════════════════════
// ASSET STUDIO — Mission 5.8.8
// ══════════════════════════════════════════════════════════════════════════════
// Digital Asset Management for Wedding OS Production Studio.
// 3-panel workspace: Explorer | Grid | Inspector
// Reuses existing Media model + /api/media endpoint.
// ══════════════════════════════════════════════════════════════════════════════

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2, ImageIcon, Upload, Search, Trash2, Download, Eye, FolderClosed, Tag, BarChart3 } from 'lucide-react'
import { toast } from 'sonner'

interface Asset {
  id: string
  type: string
  category: string | null
  url: string
  title: string | null
  description: string | null
  sizeBytes: number
  mime: string | null
  storageProvider: string
  weddingId: string
  collectionId: string | null
  createdAt: string
}

interface Props { csrfToken: string }

const ASSET_CATEGORIES = ['ALL', 'GALLERY', 'COUPLE_STORY', 'DOCUMENT', 'LOGO', 'FONT', 'SVG', 'OTHER']
const ASSET_TYPES = ['ALL', 'PHOTO', 'VIDEO', 'LOGO', 'DOCUMENT']

export function AssetStudio({ csrfToken }: Props) {
  const [assets, setAssets] = useState<Asset[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null)
  const [search, setSearch] = useState('')
  const [filterCategory, setFilterCategory] = useState('ALL')
  const [filterType, setFilterType] = useState('ALL')
  const [uploading, setUploading] = useState(false)
  const [stats, setStats] = useState({ total: 0, totalSize: 0, byType: {} as Record<string, number> })

  const headers = { 'X-CSRF-Token': csrfToken }

  const fetchAssets = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/media?limit=100', { headers })
      if (!res.ok) return
      const data = await res.json()
      const list = Array.isArray(data) ? data : (data.media || data.assets || [])
      setAssets(list)
      // Compute stats
      const byType: Record<string, number> = {}
      let totalSize = 0
      for (const a of list) {
        byType[a.type] = (byType[a.type] || 0) + 1
        totalSize += a.sizeBytes || 0
      }
      setStats({ total: list.length, totalSize, byType })
    } catch { toast.error('Erreur de chargement des assets') }
    finally { setLoading(false) }
  }, [csrfToken])

  useEffect(() => { fetchAssets() }, [fetchAssets])

  const filteredAssets = assets.filter(a => {
    if (filterCategory !== 'ALL' && a.category !== filterCategory) return false
    if (filterType !== 'ALL' && a.type !== filterType) return false
    if (search && !a.title?.toLowerCase().includes(search.toLowerCase()) && !a.url.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('type', file.type.startsWith('image/') ? 'PHOTO' : file.type.startsWith('video/') ? 'VIDEO' : 'DOCUMENT')
      formData.append('category', 'OTHER')

      const res = await fetch('/api/media', {
        method: 'POST',
        headers,
        body: formData,
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error || 'Upload failed')
      }
      toast.success(`Asset uploadé: ${file.name}`)
      fetchAssets()
    } catch (err) {
      toast.error(`Upload échoué: ${err instanceof Error ? err.message : 'erreur'}`)
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  const handleDelete = async (asset: Asset) => {
    if (!confirm(`Supprimer cet asset ? (${asset.title || asset.url})`)) return
    try {
      const res = await fetch(`/api/media/${asset.id}`, { method: 'DELETE', headers })
      if (!res.ok) throw new Error('Delete failed')
      toast.success('Asset supprimé')
      setSelectedAsset(null)
      fetchAssets()
    } catch { toast.error('Erreur de suppression') }
  }

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`
  }

  return (
    <div className="space-y-3">
      {/* Top bar: stats + upload */}
      <div className="flex items-center gap-3 p-2 rounded-lg bg-white/[0.02] border border-white/5">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-gold" />
          <span className="text-xs text-muted-foreground">{stats.total} assets · {formatSize(stats.totalSize)}</span>
          {Object.entries(stats.byType).map(([type, count]) => (
            <Badge key={type} variant="outline" className="text-[9px] h-4">{type}: {count}</Badge>
          ))}
        </div>
        <div className="ml-auto">
          <Label htmlFor="asset-upload" className="cursor-pointer">
            <Button size="sm" variant="outline" className="h-7 text-[10px]" disabled={uploading} asChild>
              <span>
                {uploading ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Upload className="w-3 h-3 mr-1" />}
                Uploader
              </span>
            </Button>
          </Label>
          <Input id="asset-upload" type="file" className="hidden" onChange={handleUpload} accept="image/*,video/*,.pdf,.svg,.woff,.woff2,.ttf" />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
        {/* Left: Explorer / Filters */}
        <Card className="glass-card gold-border lg:col-span-3">
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><FolderClosed className="w-4 h-4 text-gold" /> Explorer</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher..." className="h-7 text-xs pl-7" />
            </div>
            <div>
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Type</Label>
              <div className="flex flex-wrap gap-1 mt-1">
                {ASSET_TYPES.map(t => (
                  <button key={t} onClick={() => setFilterType(t)}
                    className={`px-2 py-0.5 rounded text-[10px] ${filterType === t ? 'bg-gold/15 text-gold' : 'bg-white/5 text-muted-foreground hover:bg-white/10'}`}>
                    {t}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Catégorie</Label>
              <div className="flex flex-wrap gap-1 mt-1">
                {ASSET_CATEGORIES.map(c => (
                  <button key={c} onClick={() => setFilterCategory(c)}
                    className={`px-2 py-0.5 rounded text-[10px] ${filterCategory === c ? 'bg-gold/15 text-gold' : 'bg-white/5 text-muted-foreground hover:bg-white/10'}`}>
                    {c}
                  </button>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Center: Asset Grid */}
        <Card className="glass-card gold-border lg:col-span-6">
          <CardHeader className="pb-2"><CardTitle className="text-sm">Assets — {filteredAssets.length} trouvés</CardTitle></CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex justify-center py-12"><Loader2 className="size-8 animate-spin text-gold" /></div>
            ) : filteredAssets.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <ImageIcon className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p className="text-xs">Aucun asset trouvé</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 max-h-[60vh] overflow-y-auto">
                {filteredAssets.map(asset => (
                  <button key={asset.id} onClick={() => setSelectedAsset(asset)}
                    className={`p-2 rounded-lg border transition-all text-left ${selectedAsset?.id === asset.id ? 'border-gold bg-gold/10' : 'border-white/10 hover:border-white/20'}`}>
                    <div className="aspect-square rounded bg-white/5 flex items-center justify-center mb-1 overflow-hidden">
                      {asset.type === 'PHOTO' || asset.mime?.startsWith('image/') ? (
                        <img src={asset.url} alt={asset.title || ''} className="w-full h-full object-cover" />
                      ) : (
                        <ImageIcon className="w-6 h-6 text-muted-foreground/50" />
                      )}
                    </div>
                    <p className="text-[10px] font-medium truncate">{asset.title || asset.url.split('/').pop()}</p>
                    <div className="flex items-center gap-1 mt-0.5">
                      <Badge variant="outline" className="text-[8px] h-3">{asset.type}</Badge>
                      <span className="text-[8px] text-muted-foreground">{formatSize(asset.sizeBytes)}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Right: Inspector */}
        <Card className="glass-card gold-border lg:col-span-3">
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Eye className="w-4 h-4 text-gold" /> Inspecteur</CardTitle></CardHeader>
          <CardContent>
            {selectedAsset ? (
              <div className="space-y-2">
                <div className="aspect-square rounded-lg bg-white/5 flex items-center justify-center overflow-hidden">
                  {selectedAsset.type === 'PHOTO' || selectedAsset.mime?.startsWith('image/') ? (
                    <img src={selectedAsset.url} alt={selectedAsset.title || ''} className="w-full h-full object-contain" />
                  ) : (
                    <ImageIcon className="w-8 h-8 text-muted-foreground/50" />
                  )}
                </div>
                <div className="space-y-1 text-[10px]">
                  <div className="flex justify-between"><span className="text-muted-foreground">Titre:</span><span>{selectedAsset.title || '—'}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Type:</span><Badge variant="outline" className="text-[8px] h-3">{selectedAsset.type}</Badge></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Catégorie:</span><span>{selectedAsset.category || '—'}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">MIME:</span><span className="font-mono">{selectedAsset.mime || '—'}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Taille:</span><span>{formatSize(selectedAsset.sizeBytes)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Stockage:</span><span>{selectedAsset.storageProvider}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Collection:</span><span>{selectedAsset.collectionId ? 'OUI' : 'non'}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Créé:</span><span>{new Date(selectedAsset.createdAt).toLocaleDateString('fr-FR')}</span></div>
                </div>
                <div className="pt-1 border-t border-white/5">
                  <p className="text-[9px] text-muted-foreground/70 truncate font-mono">{selectedAsset.url}</p>
                </div>
                <div className="flex gap-1 pt-1">
                  <Button size="sm" variant="outline" className="flex-1 h-7 text-[10px]" asChild>
                    <a href={selectedAsset.url} target="_blank" rel="noopener"><Download className="w-3 h-3 mr-1" />Ouvrir</a>
                  </Button>
                  <Button size="sm" variant="outline" className="h-7 text-[10px] text-red-400 hover:bg-red-400/10" onClick={() => handleDelete(selectedAsset)}>
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground text-center py-8">Sélectionnez un asset</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
