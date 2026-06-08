'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Music, Upload, Play, Pause, Trash2, Volume2, VolumeX,
  RefreshCw, Check, AlertCircle, FileAudio, Loader2, X
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'

interface MusicManagerProps {
  token: string
  onSessionExpired: () => void
}

interface MusicSettings {
  music_enabled: string
  music_volume: string
  music_file: string
  music_original_name: string
}

export default function MusicManager({ token, onSessionExpired }: MusicManagerProps) {
  const [settings, setSettings] = useState<MusicSettings>({
    music_enabled: 'false',
    music_volume: '0.25',
    music_file: '',
    music_original_name: '',
  })
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [previewPlaying, setPreviewPlaying] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const fetchSettings = useCallback(async () => {
    try {
      const res = await fetch('/api/music')
      if (res.status === 401) { onSessionExpired(); return }
      if (res.ok) {
        const data = await res.json()
        setSettings(data.music)
      }
    } catch (error) {
      console.error('Fetch music settings error:', error)
      toast.error('Erreur lors du chargement des paramètres')
    } finally {
      setLoading(false)
    }
  }, [onSessionExpired])

  useEffect(() => {
    fetchSettings()
  }, [fetchSettings])

  // Cleanup audio on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current = null
      }
    }
  }, [])

  const handleUpload = async (file: File) => {
    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)

      const res = await fetch('/api/music', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      })

      if (res.status === 401) { onSessionExpired(); return }

      const data = await res.json()

      if (res.ok) {
        setSettings(data.music)
        toast.success(`Musique "${file.name}" importée avec succès`)
      } else {
        toast.error(data.error || 'Erreur lors de l\'import')
      }
    } catch (error) {
      console.error('Upload music error:', error)
      toast.error('Erreur lors de l\'import de la musique')
    } finally {
      setUploading(false)
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleUpload(file)
    // Reset input so same file can be re-selected
    e.target.value = ''
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (file) handleUpload(file)
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(true)
  }

  const handleDragLeave = () => setDragOver(false)

  const handleToggleEnabled = async () => {
    setSaving(true)
    try {
      const newEnabled = settings.music_enabled !== 'true'
      const res = await fetch('/api/music', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ enabled: newEnabled }),
      })

      if (res.status === 401) { onSessionExpired(); return }

      if (res.ok) {
        const data = await res.json()
        setSettings(data.music)
        toast.success(newEnabled ? 'Musique d\'ambiance activée' : 'Musique d\'ambiance désactivée')
      }
    } catch (error) {
      console.error('Toggle music error:', error)
      toast.error('Erreur lors de la modification')
    } finally {
      setSaving(false)
    }
  }

  const handleVolumeChange = async (volume: number) => {
    // Optimistic update
    setSettings(prev => ({ ...prev, music_volume: volume.toFixed(2) }))
    // Update preview audio volume too
    if (audioRef.current) audioRef.current.volume = volume

    try {
      await fetch('/api/music', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ volume }),
      })
    } catch (error) {
      console.error('Volume update error:', error)
    }
  }

  const handleDelete = async () => {
    if (!settings.music_file) return
    setDeleting(true)
    try {
      const res = await fetch('/api/music', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })

      if (res.status === 401) { onSessionExpired(); return }

      if (res.ok) {
        const data = await res.json()
        setSettings(data.music)
        stopPreview()
        toast.success('Musique supprimée')
      }
    } catch (error) {
      console.error('Delete music error:', error)
      toast.error('Erreur lors de la suppression')
    } finally {
      setDeleting(false)
    }
  }

  const togglePreview = () => {
    if (!settings.music_file) return

    if (previewPlaying) {
      stopPreview()
    } else {
      if (!audioRef.current) {
        audioRef.current = new Audio(settings.music_file)
        audioRef.current.volume = parseFloat(settings.music_volume) || 0.25
        audioRef.current.loop = true
        audioRef.current.onended = () => setPreviewPlaying(false)
      }
      audioRef.current.play().then(() => {
        setPreviewPlaying(true)
      }).catch((err) => {
        console.error('Preview play error:', err)
        toast.error('Impossible de lire la prévisualisation')
      })
    }
  }

  const stopPreview = () => {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.currentTime = 0
      audioRef.current = null
    }
    setPreviewPlaying(false)
  }

  const isEnabled = settings.music_enabled === 'true'
  const volume = parseFloat(settings.music_volume) || 0.25
  const hasMusic = !!settings.music_file

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-gold" />
      </div>
    )
  }

  return (
    <div className="p-4 sm:p-6 max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-gold/10 flex items-center justify-center">
          <Music className="w-5 h-5 text-gold" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-foreground">Musique d&apos;Ambiance</h2>
          <p className="text-sm text-muted-foreground">Gérez la musique de fond de votre plateforme</p>
        </div>
      </div>

      {/* Enable/Disable Toggle */}
      <div
        className="rounded-xl border border-white/10 bg-white/[0.02] p-4 cursor-pointer hover:bg-white/[0.04] transition-colors"
        onClick={handleToggleEnabled}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {isEnabled ? (
              <Volume2 className="w-5 h-5 text-emerald-400" />
            ) : (
              <VolumeX className="w-5 h-5 text-muted-foreground" />
            )}
            <div>
              <p className="text-sm font-medium">
                Musique d&apos;ambiance
              </p>
              <p className="text-xs text-muted-foreground">
                {isEnabled ? 'Active — les visiteurs entendront la musique' : 'Désactivée — aucun son ne sera joué'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {saving && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
            {/* Toggle Switch */}
            <div
              className={`relative w-11 h-6 rounded-full transition-colors ${
                isEnabled ? 'bg-emerald-500' : 'bg-white/10'
              }`}
            >
              <motion.div
                className="absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-md"
                animate={{ left: isEnabled ? '22px' : '2px' }}
                transition={{ type: 'spring', stiffness: 500, damping: 30 }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Upload Zone */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          Fichier Audio
        </h3>

        <AnimatePresence mode="wait">
          {hasMusic ? (
            <motion.div
              key="current-file"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="rounded-xl border border-white/10 bg-white/[0.02] p-4 space-y-4"
            >
              {/* File info */}
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-gold/10 flex items-center justify-center shrink-0">
                  <FileAudio className="w-5 h-5 text-gold" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">
                    {settings.music_original_name || 'Musique d\'ambiance'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {settings.music_file.split('/').pop()}
                  </p>
                </div>
              </div>

              {/* Preview + Actions */}
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={togglePreview}
                  className="gap-1.5 border-gold/20 text-gold hover:bg-gold/10"
                >
                  {previewPlaying ? (
                    <><Pause className="w-3.5 h-3.5" /> Pause</>
                  ) : (
                    <><Play className="w-3.5 h-3.5" /> Prévisualiser</>
                  )}
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="gap-1.5 border-white/10 text-muted-foreground hover:text-foreground hover:border-white/20"
                >
                  {uploading ? (
                    <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Importation...</>
                  ) : (
                    <><RefreshCw className="w-3.5 h-3.5" /> Remplacer</>
                  )}
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDelete}
                  disabled={deleting}
                  className="gap-1.5 border-red-500/20 text-red-400 hover:bg-red-500/10 hover:border-red-500/30 ml-auto"
                >
                  {deleting ? (
                    <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Suppression...</>
                  ) : (
                    <><Trash2 className="w-3.5 h-3.5" /> Supprimer</>
                  )}
                </Button>
              </div>

              {/* Volume Slider */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Volume par défaut</span>
                  <span className="text-xs font-mono text-gold">{Math.round(volume * 100)}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={volume}
                  onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
                  className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
                  style={{
                    background: `linear-gradient(to right, #C4A265 ${volume * 100}%, rgba(255,255,255,0.1) ${volume * 100}%)`,
                  }}
                />
                <div className="flex justify-between text-[10px] text-muted-foreground/50">
                  <span>Silencieux</span>
                  <span>Doux</span>
                  <span>Fort</span>
                </div>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="upload-zone"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className={`rounded-xl border-2 border-dashed transition-all ${
                dragOver
                  ? 'border-gold/50 bg-gold/5'
                  : 'border-white/10 bg-white/[0.02] hover:border-white/20'
              } p-8 text-center cursor-pointer`}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onClick={() => fileInputRef.current?.click()}
            >
              {uploading ? (
                <div className="space-y-3">
                  <Loader2 className="w-10 h-10 animate-spin text-gold mx-auto" />
                  <p className="text-sm text-muted-foreground">Importation en cours...</p>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="w-14 h-14 rounded-full bg-gold/10 flex items-center justify-center mx-auto">
                    <Upload className="w-6 h-6 text-gold" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">
                      Glissez-déposez un fichier audio ici
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      ou cliquez pour sélectionner un fichier
                    </p>
                  </div>
                  <p className="text-[10px] text-muted-foreground/50">
                    MP3, WAV, OGG, M4A — Maximum 30 MB
                  </p>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        <input
          ref={fileInputRef}
          type="file"
          accept=".mp3,.wav,.ogg,.m4a,.aac,audio/*"
          onChange={handleFileChange}
          className="hidden"
        />
      </div>

      {/* Info Card */}
      <div className="rounded-xl border border-white/5 bg-white/[0.01] p-4">
        <div className="flex gap-3">
          <AlertCircle className="w-4 h-4 text-gold/60 shrink-0 mt-0.5" />
          <div className="space-y-1.5 text-xs text-muted-foreground/70">
            <p>🎵 La musique démarre automatiquement quand un visiteur arrive sur le site (si le navigateur le permet).</p>
            <p>🔇 Si le navigateur bloque l&apos;autoplay, un bouton &quot;Activer la musique&quot; sera affiché.</p>
            <p>💾 Le choix de chaque visiteur (musique activée/désactivée) est mémorisé automatiquement.</p>
            <p>🔄 Le fichier audio se joue en boucle continue pendant toute la navigation.</p>
          </div>
        </div>
      </div>
    </div>
  )
}
