'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog'
import {
  QrCode,
  Download,
  Loader2,
  Users,
  Eye,
  EyeOff,
  Search,
  Printer,
  RefreshCw,
  CheckCircle,
} from 'lucide-react'
import { toast } from 'sonner'

/**
 * QRCodeManager — CONS-5-CLIENT-BACKEND
 *
 * Bulk QR code management for invitations. Lists all guests with their
 * invitation code, lets the organizer:
 *   - Preview the QR code for each guest (existing /api/guests/qrcode/[code]
 *     endpoint, admin-authenticated).
 *   - Download individual QR codes as PNG (fetch + blob).
 *   - Download ALL QR codes as a single multi-page PDF (jszip + jspdf dynamic
 *     import — keeps the bundle small if unused).
 *   - Track invitation viewed status (Guest.invitationViewed).
 *
 * Different from InvitationManager (which is about generating invitation
 * records + bulk invitation generation). QRCodeManager focuses on the QR
 * artefact itself.
 */

interface Guest {
  id: string
  firstName: string
  lastName: string
  invitationCode: string
  category: string
  status: string
  invitationViewed: boolean
  invitationViewCount: number
  lastAccessAt: string | null
  email: string | null
  phone: string | null
}

interface Props {
  weddingId: string
  weddingSlug: string
}

export default function QRCodeManager({ weddingId, weddingSlug }: Props) {
  const [guests, setGuests] = useState<Guest[]>([])
  const [loading, setLoading] = useState(true)
  const [downloadingAll, setDownloadingAll] = useState(false)
  const [downloadingId, setDownloadingId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [filterViewed, setFilterViewed] = useState<'all' | 'viewed' | 'not-viewed'>('all')
  const [previewGuest, setPreviewGuest] = useState<Guest | null>(null)

  const fetchGuests = useCallback(async () => {
    try {
      // Reuse the existing /api/guests endpoint — the global fetch interceptor
      // adds X-Wedding-Slug for tenant scoping.
      const res = await fetch('/api/guests?limit=500')
      if (res.ok) {
        const json = await res.json()
        // The guests endpoint returns either { guests } (offset) or { guests, nextCursor } (cursor).
        const list = (json.guests || []) as Guest[]
        setGuests(list)
      } else {
        toast.error('Erreur de chargement des invités')
      }
    } catch {
      toast.error('Erreur de connexion')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchGuests()
  }, [fetchGuests])

  /** Build the QR code URL for a guest (admin-authenticated via cookie). */
  const qrUrl = (code: string) => `/api/guests/qrcode/${encodeURIComponent(code)}?wedding=${encodeURIComponent(weddingSlug)}&format=png`

  /** Download a single QR code as a PNG file. */
  const downloadOne = async (g: Guest) => {
    setDownloadingId(g.id)
    try {
      const res = await fetch(qrUrl(g.invitationCode))
      if (!res.ok) throw new Error('QR fetch failed')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `qr-${g.firstName}-${g.lastName}-${g.invitationCode}.png`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      toast.success(`QR de ${g.firstName} ${g.lastName} téléchargé`)
    } catch {
      toast.error('Échec du téléchargement du QR code')
    } finally {
      setDownloadingId(null)
    }
  }

  /** Download ALL guest QR codes as a single multi-page PDF. */
  const downloadAllPdf = async () => {
    if (guests.length === 0) return
    setDownloadingAll(true)
    try {
      // Dynamic import — keeps jspdf out of the main bundle.
      const { jsPDF } = await import('jspdf')
      const pdf = new jsPDF({ unit: 'mm', format: 'a4' })
      const pageWidth = pdf.internal.pageSize.getWidth()
      const pageHeight = pdf.internal.pageSize.getHeight()
      const margin = 15
      const imgSize = 80 // mm
      const perPage = 4 // 2x2 grid

      for (let i = 0; i < guests.length; i++) {
        const g = guests[i]
        const pageIndex = i % perPage
        if (i > 0 && pageIndex === 0) {
          pdf.addPage()
        }
        const col = pageIndex % 2
        const row = Math.floor(pageIndex / 2)
        const x = margin + col * (imgSize + 20)
        const y = margin + row * (imgSize + 40)

        // Fetch the QR PNG as a data URL.
        const res = await fetch(qrUrl(g.invitationCode))
        if (!res.ok) continue
        const blob = await res.blob()
        const dataUrl = await blobToDataUrl(blob)
        pdf.addImage(dataUrl, 'PNG', x, y, imgSize, imgSize)
        pdf.setFontSize(11)
        pdf.setTextColor(20)
        pdf.text(`${g.firstName} ${g.lastName}`, x, y + imgSize + 6)
        pdf.setFontSize(8)
        pdf.setTextColor(120)
        pdf.text(`Code: ${g.invitationCode}`, x, y + imgSize + 11)
      }

      pdf.save(`qr-codes-${weddingSlug}.pdf`)
      toast.success(`${guests.length} QR codes exportés en PDF`)
    } catch (err) {
      console.error('PDF export failed', err)
      toast.error('Échec de l’export PDF')
    } finally {
      setDownloadingAll(false)
    }
  }

  /** Print-friendly view: open a window with all QR codes and trigger print. */
  const printAll = async () => {
    if (guests.length === 0) return
    setDownloadingAll(true)
    try {
      const win = window.open('', '_blank', 'width=800,height=900')
      if (!win) {
        toast.error('Veuillez autoriser les pop-ups pour imprimer')
        return
      }
      const items = await Promise.all(
        guests.map(async (g) => {
          const res = await fetch(qrUrl(g.invitationCode))
          if (!res.ok) return null
          const blob = await res.blob()
          const dataUrl = await blobToDataUrl(blob)
          return `<div class="qr-card">
            <img src="${dataUrl}" alt="QR ${g.invitationCode}" />
            <div class="name">${escapeHtml(g.firstName + ' ' + g.lastName)}</div>
            <div class="code">${escapeHtml(g.invitationCode)}</div>
          </div>`
        }),
      )
      const valid = items.filter(Boolean).join('')
      win.document.write(`<!doctype html>
<html><head><title>QR Codes — ${escapeHtml(weddingSlug)}</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 0; padding: 16px; background: #fff; color: #111; }
  h1 { font-size: 18px; margin: 0 0 16px 0; }
  .grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; }
  .qr-card { border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px; text-align: center; page-break-inside: avoid; }
  .qr-card img { width: 180px; height: 180px; }
  .name { font-weight: 600; margin-top: 8px; font-size: 14px; }
  .code { font-family: monospace; color: #6b7280; font-size: 12px; margin-top: 4px; }
  @media print { body { padding: 0; } .qr-card { border-color: #ccc; } }
</style></head><body>
<h1>QR Codes d’invitation — ${escapeHtml(weddingSlug)} (${guests.length} invités)</h1>
<div class="grid">${valid}</div>
<script>window.onload = () => { window.print(); };</script>
</body></html>`)
      win.document.close()
      toast.success(`${guests.length} QR codes prêts à imprimer`)
    } catch (err) {
      console.error('Print failed', err)
      toast.error('Échec de l’impression')
    } finally {
      setDownloadingAll(false)
    }
  }

  const filtered = guests.filter((g) => {
    if (filterViewed === 'viewed' && !g.invitationViewed) return false
    if (filterViewed === 'not-viewed' && g.invitationViewed) return false
    if (search) {
      const q = search.toLowerCase()
      return (
        g.firstName.toLowerCase().includes(q) ||
        g.lastName.toLowerCase().includes(q) ||
        g.invitationCode.toLowerCase().includes(q)
      )
    }
    return true
  })

  const viewedCount = guests.filter((g) => g.invitationViewed).length

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold gold-gradient font-display flex items-center gap-2">
            <QrCode className="w-6 h-6" />
            QR Codes
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Générez, prévisualisez et téléchargez les QR codes d’invitation de vos invités.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={printAll}
            disabled={downloadingAll || guests.length === 0}
            variant="outline"
            className="border-white/15 hover:bg-white/5"
          >
            {downloadingAll ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Printer className="w-4 h-4 mr-2" />}
            Imprimer tout
          </Button>
          <Button
            onClick={downloadAllPdf}
            disabled={downloadingAll || guests.length === 0}
            className="bg-gradient-gold text-white"
          >
            {downloadingAll ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
            Export PDF ({guests.length})
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <Card className="bg-white/[0.02] border-white/10">
          <CardContent className="pt-6 flex items-center gap-3">
            <Users className="w-8 h-8 text-gold-light" />
            <div>
              <div className="text-2xl font-bold">{guests.length}</div>
              <div className="text-xs text-muted-foreground">Invités</div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-white/[0.02] border-white/10">
          <CardContent className="pt-6 flex items-center gap-3">
            <Eye className="w-8 h-8 text-emerald-400" />
            <div>
              <div className="text-2xl font-bold">{viewedCount}</div>
              <div className="text-xs text-muted-foreground">Invitations consultées</div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-white/[0.02] border-white/10">
          <CardContent className="pt-6 flex items-center gap-3">
            <EyeOff className="w-8 h-8 text-amber-400" />
            <div>
              <div className="text-2xl font-bold">{guests.length - viewedCount}</div>
              <div className="text-xs text-muted-foreground">Non consultées</div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Rechercher un invité ou un code…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Button
          size="sm"
          variant={filterViewed === 'all' ? 'default' : 'outline'}
          className={filterViewed === 'all' ? 'bg-gradient-gold text-white' : 'border-white/15 hover:bg-white/5'}
          onClick={() => setFilterViewed('all')}
        >
          Tous
        </Button>
        <Button
          size="sm"
          variant={filterViewed === 'viewed' ? 'default' : 'outline'}
          className={filterViewed === 'viewed' ? 'bg-gradient-gold text-white' : 'border-white/15 hover:bg-white/5'}
          onClick={() => setFilterViewed('viewed')}
        >
          Consultés
        </Button>
        <Button
          size="sm"
          variant={filterViewed === 'not-viewed' ? 'default' : 'outline'}
          className={filterViewed === 'not-viewed' ? 'bg-gradient-gold text-white' : 'border-white/15 hover:bg-white/5'}
          onClick={() => setFilterViewed('not-viewed')}
        >
          Non consultés
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="text-muted-foreground hover:bg-white/5"
          onClick={() => { setSearch(''); setFilterViewed('all') }}
        >
          <RefreshCw className="w-3.5 h-3.5 mr-1" />
          Réinitialiser
        </Button>
      </div>

      {/* List */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-40" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card className="bg-white/[0.02] border-white/10">
          <CardContent className="pt-10 pb-10 text-center">
            <QrCode className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground">
              {guests.length === 0
                ? 'Aucun invité pour le moment. Ajoutez des invités pour générer leurs QR codes.'
                : 'Aucun invité ne correspond à ces critères.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <AnimatePresence>
            {filtered.map((g) => (
              <motion.div
                key={g.id}
                layout
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
              >
                <Card className="bg-white/[0.02] border-white/10 hover:border-gold-light/40 transition-colors h-full">
                  <CardContent className="pt-4 pb-4 flex items-start gap-4">
                    <div className="shrink-0">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={qrUrl(g.invitationCode)}
                        alt={`QR ${g.invitationCode}`}
                        width={80}
                        height={80}
                        className="rounded-md bg-white p-1"
                        onError={(e) => {
                          // Hide broken images (e.g. when not authed)
                          ;(e.target as HTMLImageElement).style.visibility = 'hidden'
                        }}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold truncate">
                          {g.firstName} {g.lastName}
                        </h3>
                        {g.invitationViewed && (
                          <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground font-mono mt-0.5 truncate">
                        {g.invitationCode}
                      </p>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <Badge variant="outline" className="text-xs">
                          {g.category}
                        </Badge>
                        <Badge
                          variant="outline"
                          className={
                            g.status === 'CONFIRMED'
                              ? 'text-emerald-300 border-emerald-500/30'
                              : g.status === 'DECLINED'
                                ? 'text-rose-300 border-rose-500/30'
                                : 'text-amber-300 border-amber-500/30'
                          }
                        >
                          {g.status}
                        </Badge>
                      </div>
                      <div className="flex gap-1 mt-3">
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-white/15 hover:bg-white/5 h-7"
                          onClick={() => setPreviewGuest(g)}
                        >
                          <Eye className="w-3.5 h-3.5 mr-1" />
                          Voir
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-white/15 hover:bg-white/5 h-7"
                          disabled={downloadingId === g.id}
                          onClick={() => downloadOne(g)}
                        >
                          {downloadingId === g.id ? (
                            <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
                          ) : (
                            <Download className="w-3.5 h-3.5 mr-1" />
                          )}
                          PNG
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* Preview Dialog */}
      <Dialog open={!!previewGuest} onOpenChange={(o) => !o && setPreviewGuest(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              QR Code — {previewGuest?.firstName} {previewGuest?.lastName}
            </DialogTitle>
            <DialogDescription>
              Scannez ce code pour accéder à l’invitation personnelle de l’invité.
              Code d’invitation : <span className="font-mono">{previewGuest?.invitationCode}</span>
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col items-center gap-3 py-2">
            {previewGuest && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={qrUrl(previewGuest.invitationCode)}
                alt="QR code"
                width={240}
                height={240}
                className="rounded-lg bg-white p-2"
              />
            )}
            {previewGuest && previewGuest.invitationViewCount > 0 && (
              <p className="text-xs text-muted-foreground">
                Consulté {previewGuest.invitationViewCount} fois.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => previewGuest && downloadOne(previewGuest)}
              disabled={downloadingId === previewGuest?.id}
            >
              {downloadingId === previewGuest?.id ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Download className="w-4 h-4 mr-2" />
              )}
              Télécharger PNG
            </Button>
            <Button onClick={() => setPreviewGuest(null)}>Fermer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}
