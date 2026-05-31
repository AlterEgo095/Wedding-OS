'use client'

import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Upload, Trash2, Image as ImageIcon, Film, FileText, Loader2, Plus, X
} from 'lucide-react'
import { toast } from 'sonner'

interface MediaItem {
  id: string
  type: string
  url: string
  title: string | null
  description: string | null
  category: string | null
  order: number
  createdAt: string
}

interface MediaManagerProps {
  token: string
}

const TYPE_ICONS: Record<string, React.ReactNode> = {
  PHOTO: <ImageIcon className="w-5 h-5" />,
  VIDEO: <Film className="w-5 h-5" />,
  LOGO: <ImageIcon className="w-5 h-5" />,
  DOCUMENT: <FileText className="w-5 h-5" />,
}

const TYPE_LABELS: Record<string, string> = {
  PHOTO: 'Photo',
  VIDEO: 'Vidéo',
  LOGO: 'Logo',
  DOCUMENT: 'Document',
}

const CATEGORY_LABELS: Record<string, string> = {
  GALLERY: 'Galerie',
  COUPLE_STORY: 'Histoire du couple',
  DOCUMENT: 'Document',
  OTHER: 'Autre',
}

export default function MediaManager({ token }: MediaManagerProps) {
  const [media, setMedia] = useState<MediaItem[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [showUploadDialog, setShowUploadDialog] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [selectedMedia, setSelectedMedia] = useState<MediaItem | null>(null)

  // Upload form
  const [uploadForm, setUploadForm] = useState({
    title: '',
    description: '',
    type: 'PHOTO',
    category: 'GALLERY',
  })
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const fetchMedia = async () => {
    try {
      const res = await fetch('/api/media', {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.status === 401) { toast.error('Session expirée'); return }
      if (res.ok) {
        const json = await res.json()
        setMedia(json.media)
      }
    } catch {
      toast.error('Erreur de chargement')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchMedia()
  }, [token])

  const handleUpload = async () => {
    if (!uploadFile) {
      toast.error('Veuillez sélectionner un fichier')
      return
    }
    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', uploadFile)
      formData.append('title', uploadForm.title || uploadFile.name)
      formData.append('description', uploadForm.description)
      formData.append('type', uploadForm.type)
      formData.append('category', uploadForm.category)

      const res = await fetch('/api/media', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      })
      const json = await res.json()
      if (res.ok) {
        toast.success('Média uploadé avec succès')
        setShowUploadDialog(false)
        setUploadForm({ title: '', description: '', type: 'PHOTO', category: 'GALLERY' })
        setUploadFile(null)
        fetchMedia()
      } else {
        toast.error(json.error || 'Erreur')
      }
    } catch {
      toast.error('Erreur de connexion')
    } finally {
      setUploading(false)
    }
  }

  const handleDelete = async () => {
    if (!selectedMedia) return
    setUploading(true)
    try {
      const res = await fetch(`/api/media?id=${selectedMedia.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        toast.success('Média supprimé')
        setShowDeleteDialog(false)
        setSelectedMedia(null)
        fetchMedia()
      } else {
        const json = await res.json()
        toast.error(json.error || 'Erreur')
      }
    } catch {
      toast.error('Erreur de connexion')
    } finally {
      setUploading(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-6 p-6">
        <Skeleton className="h-10 w-48" />
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-44 rounded-xl" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4 p-4 md:p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">Gestion des Médias</h2>
          <p className="text-sm text-muted-foreground">{media.length} média{media.length > 1 ? 's' : ''}</p>
        </div>
        <Button onClick={() => setShowUploadDialog(true)} size="sm" className="bg-gradient-gold text-white">
          <Plus className="w-4 h-4 mr-1" /> Upload
        </Button>
      </div>

      {/* Gallery Grid */}
      {media.length === 0 ? (
        <Card className="glass-card gold-border border-0">
          <CardContent className="py-12 text-center text-muted-foreground">
            <ImageIcon className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p>Aucun média uploadé</p>
            <p className="text-xs mt-1">Cliquez sur Upload pour ajouter des fichiers</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4">
          <AnimatePresence>
            {media.map((item, i) => (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ delay: i * 0.03 }}
              >
                <Card className="glass-card gold-border border-0 overflow-hidden group">
                  <div className="relative aspect-video bg-white/5">
                    {item.type === 'PHOTO' || item.type === 'LOGO' ? (
                      <img
                        src={item.url}
                        alt={item.title || 'Media'}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        {TYPE_ICONS[item.type] || <FileText className="w-8 h-8 text-muted-foreground" />}
                      </div>
                    )}
                    {/* Overlay on hover */}
                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9 text-red-400 hover:text-red-300 hover:bg-red-400/20"
                        onClick={() => { setSelectedMedia(item); setShowDeleteDialog(true) }}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                    {/* Type badge */}
                    <Badge
                      variant="outline"
                      className="absolute top-2 left-2 text-xs bg-black/50 border-white/20"
                    >
                      {TYPE_LABELS[item.type] || item.type}
                    </Badge>
                  </div>
                  <CardContent className="p-3">
                    <p className="text-sm font-medium truncate">{item.title || 'Sans titre'}</p>
                    {item.category && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {CATEGORY_LABELS[item.category] || item.category}
                      </p>
                    )}
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* Upload Dialog */}
      <Dialog open={showUploadDialog} onOpenChange={setShowUploadDialog}>
        <DialogContent className="glass-card gold-border max-w-md">
          <DialogHeader>
            <DialogTitle className="gold-gradient">Uploader un média</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Fichier *</Label>
              <div
                className="border-2 border-dashed border-white/20 rounded-lg p-6 text-center cursor-pointer hover:border-gold/40 transition-colors"
                onClick={() => fileInputRef.current?.click()}
              >
                {uploadFile ? (
                  <div className="flex items-center justify-center gap-2">
                    <ImageIcon className="w-4 h-4 text-gold" />
                    <span className="text-sm truncate">{uploadFile.name}</span>
                    <button onClick={(e) => { e.stopPropagation(); setUploadFile(null) }}>
                      <X className="w-4 h-4 text-muted-foreground hover:text-foreground" />
                    </button>
                  </div>
                ) : (
                  <>
                    <Upload className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">Cliquez pour sélectionner un fichier</p>
                  </>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,video/*,.pdf,.doc,.docx"
                  className="hidden"
                  onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Titre</Label>
              <Input value={uploadForm.title} onChange={(e) => setUploadForm({ ...uploadForm, title: e.target.value })} placeholder="Nom du fichier" />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Input value={uploadForm.description} onChange={(e) => setUploadForm({ ...uploadForm, description: e.target.value })} placeholder="Description optionnelle" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Type</Label>
                <Select value={uploadForm.type} onValueChange={(v) => setUploadForm({ ...uploadForm, type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PHOTO">Photo</SelectItem>
                    <SelectItem value="VIDEO">Vidéo</SelectItem>
                    <SelectItem value="LOGO">Logo</SelectItem>
                    <SelectItem value="DOCUMENT">Document</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Catégorie</Label>
                <Select value={uploadForm.category} onValueChange={(v) => setUploadForm({ ...uploadForm, category: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="GALLERY">Galerie</SelectItem>
                    <SelectItem value="COUPLE_STORY">Histoire du couple</SelectItem>
                    <SelectItem value="DOCUMENT">Document</SelectItem>
                    <SelectItem value="OTHER">Autre</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setShowUploadDialog(false)}>Annuler</Button>
            <Button onClick={handleUpload} disabled={uploading || !uploadFile} className="bg-gradient-gold text-white">
              {uploading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Upload className="w-4 h-4 mr-2" />}
              Uploader
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent className="glass-card gold-border max-w-sm">
          <DialogHeader>
            <DialogTitle>Supprimer le média</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Êtes-vous sûr de vouloir supprimer <strong>{selectedMedia?.title || 'ce média'}</strong> ?
          </p>
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setShowDeleteDialog(false)}>Annuler</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={uploading}>
              {uploading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Supprimer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
