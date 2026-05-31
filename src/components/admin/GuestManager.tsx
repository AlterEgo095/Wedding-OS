'use client'

import { useState, useEffect, useRef } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Plus, Search, Download, Upload, QrCode, MoreHorizontal,
  Pencil, Trash2, ChevronLeft, ChevronRight, Loader2, X, Users,
  Link2, Copy, Check, Share2, Mail, FileText, AlertTriangle,
  CheckCircle2, XCircle, FileUp
} from 'lucide-react'
import { toast } from 'sonner'

interface Guest {
  id: string
  firstName: string
  lastName: string
  phone: string | null
  email: string | null
  tableId: string | null
  seats: number
  category: string
  status: string
  invitationCode: string
  personalMessage: string | null
  checkedIn: boolean
  checkedInAt: string | null
  createdAt: string
  table: { id: string; name: string; number: number } | null
}

interface TableInfo {
  id: string
  name: string
  number: number
  capacity: number
  guestCount: number
}

interface ImportResult {
  tablesCreated: number
  tablesUpdated: number
  guestsCreated: number
  guestsSkipped: number
  duplicatesDetected: string[]
  errors: string[]
  details: {
    table: string
    guestsAdded: string[]
    guestsSkipped: string[]
  }[]
}

interface GuestManagerProps {
  token: string
}

const CATEGORIES = ['VIP', 'FAMILLE', 'AMIS', 'SPONSORS', 'COLLEGUES']
const STATUSES = ['CONFIRMED', 'PENDING', 'DECLINED']

const CATEGORY_LABELS: Record<string, string> = {
  VIP: 'VIP',
  FAMILLE: 'Famille',
  AMIS: 'Amis',
  SPONSORS: 'Sponsors',
  COLLEGUES: 'Collègues',
}

const STATUS_LABELS: Record<string, string> = {
  CONFIRMED: 'Confirmé',
  PENDING: 'En attente',
  DECLINED: 'Refusé',
}

const CATEGORY_COLORS: Record<string, string> = {
  VIP: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  FAMILLE: 'bg-rose-500/20 text-rose-400 border-rose-500/30',
  AMIS: 'bg-teal-500/20 text-teal-400 border-teal-500/30',
  SPONSORS: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  COLLEGUES: 'bg-sky-500/20 text-sky-400 border-sky-500/30',
}

const STATUS_COLORS: Record<string, string> = {
  CONFIRMED: 'bg-green-500/20 text-green-400 border-green-500/30',
  PENDING: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  DECLINED: 'bg-red-500/20 text-red-400 border-red-500/30',
}

export default function GuestManager({ token }: GuestManagerProps) {
  const [guests, setGuests] = useState<Guest[]>([])
  const [tables, setTables] = useState<TableInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [total, setTotal] = useState(0)
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [filterCategory, setFilterCategory] = useState<string>('all')
  const [filterTable, setFilterTable] = useState<string>('all')

  // Dialogs
  const [showAddDialog, setShowAddDialog] = useState(false)
  const [showEditDialog, setShowEditDialog] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [showQRDialog, setShowQRDialog] = useState(false)
  const [showImportResult, setShowImportResult] = useState(false)
  const [showImportDialog, setShowImportDialog] = useState(false)
  const [importMergeMode, setImportMergeMode] = useState<string>('merge')
  const [selectedGuest, setSelectedGuest] = useState<Guest | null>(null)
  const [qrCodeData, setQrCodeData] = useState<{ qrCode: string; guest: Guest } | null>(null)
  const [saving, setSaving] = useState(false)
  const [copiedLinkId, setCopiedLinkId] = useState<string | null>(null)
  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  const [importing, setImporting] = useState(false)

  // Generate encrypted invitation link for a guest
  const getInvitationLink = async (guest: Guest): Promise<string> => {
    try {
      const res = await fetch('/api/guest/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ invitationCode: guest.invitationCode }),
      })
      if (res.ok) {
        const data = await res.json()
        if (data.encryptedToken) {
          return `${window.location.origin}?invite=${data.encryptedToken}`
        }
      }
    } catch {
      // Fallback to simple code link
    }
    return `${window.location.origin}?code=${guest.invitationCode}`
  }

  const handleCopyLink = async (guest: Guest) => {
    const link = await getInvitationLink(guest)
    try {
      await navigator.clipboard.writeText(link)
      setCopiedLinkId(guest.id)
      toast.success('Lien copié dans le presse-papiers')
      setTimeout(() => setCopiedLinkId(null), 2000)
    } catch {
      const textArea = document.createElement('textarea')
      textArea.value = link
      document.body.appendChild(textArea)
      textArea.select()
      document.execCommand('copy')
      document.body.removeChild(textArea)
      setCopiedLinkId(guest.id)
      toast.success('Lien copié')
      setTimeout(() => setCopiedLinkId(null), 2000)
    }
  }

  const handleShareLink = async (guest: Guest) => {
    const link = await getInvitationLink(guest)
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Invitation - ${guest.firstName} ${guest.lastName}`,
          text: `Voici votre invitation privée pour le mariage de Josué & Hornella`,
          url: link,
        })
      } catch {
        // User cancelled share
      }
    } else {
      await handleCopyLink(guest)
    }
  }

  const handleSendViaWhatsApp = async (guest: Guest) => {
    const link = await getInvitationLink(guest)
    const message = `Cher(e) ${guest.firstName} ${guest.lastName}, voici votre invitation privée pour le mariage de Josué & Hornella : ${link}`
    const phone = guest.phone?.replace(/\s/g, '').replace(/^\+/, '')
    const url = phone
      ? `https://wa.me/${phone}?text=${encodeURIComponent(message)}`
      : `https://wa.me/?text=${encodeURIComponent(message)}`
    window.open(url, '_blank')
  }

  // Form state
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    phone: '',
    email: '',
    tableId: '',
    seats: 1,
    category: 'AMIS',
    status: 'PENDING',
    personalMessage: '',
  })

  const importRef = useRef<HTMLInputElement>(null)
  const docxImportRef = useRef<HTMLInputElement>(null)

  const fetchGuests = async () => {
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: '15',
      })
      if (search) params.set('search', search)
      if (filterStatus !== 'all') params.set('status', filterStatus)
      if (filterCategory !== 'all') params.set('category', filterCategory)
      if (filterTable !== 'all') params.set('tableId', filterTable)

      const res = await fetch(`/api/guests?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.status === 401) { toast.error('Session expirée'); return }
      const json = await res.json()
      if (res.ok) {
        setGuests(json.guests)
        setTotalPages(json.pagination.totalPages)
        setTotal(json.pagination.total)
      }
    } catch {
      toast.error('Erreur de chargement')
    } finally {
      setLoading(false)
    }
  }

  const fetchTables = async () => {
    try {
      const res = await fetch('/api/tables', {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        const json = await res.json()
        setTables(json.tables)
      }
    } catch {
      // silent
    }
  }

  useEffect(() => {
    fetchGuests()
  }, [page, search, filterStatus, filterCategory, filterTable, token])

  useEffect(() => {
    fetchTables()
  }, [token])

  const resetForm = () => {
    setForm({
      firstName: '', lastName: '', phone: '', email: '',
      tableId: '', seats: 1, category: 'AMIS', status: 'PENDING',
      personalMessage: '',
    })
  }

  const handleAdd = async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/guests', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          ...form,
          tableId: form.tableId || null,
          phone: form.phone || null,
          email: form.email || null,
          personalMessage: form.personalMessage || null,
        }),
      })
      const json = await res.json()
      if (res.ok) {
        toast.success('Invité ajouté avec succès')
        setShowAddDialog(false)
        resetForm()
        fetchGuests()
        fetchTables()
      } else {
        toast.error(json.error || 'Erreur')
      }
    } catch {
      toast.error('Erreur de connexion')
    } finally {
      setSaving(false)
    }
  }

  const handleEdit = async () => {
    if (!selectedGuest) return
    setSaving(true)
    try {
      const res = await fetch(`/api/guests/${selectedGuest.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          ...form,
          tableId: form.tableId || null,
          phone: form.phone || null,
          email: form.email || null,
          personalMessage: form.personalMessage || null,
        }),
      })
      const json = await res.json()
      if (res.ok) {
        toast.success('Invité modifié avec succès')
        setShowEditDialog(false)
        setSelectedGuest(null)
        resetForm()
        fetchGuests()
        fetchTables()
      } else {
        toast.error(json.error || 'Erreur')
      }
    } catch {
      toast.error('Erreur de connexion')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!selectedGuest) return
    setSaving(true)
    try {
      const res = await fetch(`/api/guests/${selectedGuest.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        toast.success('Invité supprimé')
        setShowDeleteDialog(false)
        setSelectedGuest(null)
        fetchGuests()
        fetchTables()
      } else {
        const json = await res.json()
        toast.error(json.error || 'Erreur')
      }
    } catch {
      toast.error('Erreur de connexion')
    } finally {
      setSaving(false)
    }
  }

  const handleExport = async () => {
    try {
      const res = await fetch('/api/guests/export', {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        const blob = await res.blob()
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = 'guests-export.xlsx'
        a.click()
        URL.revokeObjectURL(url)
        toast.success('Export réussi')
      } else {
        toast.error('Erreur d\'export')
      }
    } catch {
      toast.error('Erreur de connexion')
    }
  }

  const handleXlsxImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch('/api/guests/import', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      })
      const json = await res.json()
      if (res.ok) {
        toast.success(`${json.imported} invités importés${json.errors > 0 ? `, ${json.errors} erreurs` : ''}`)
        fetchGuests()
        fetchTables()
      } else {
        toast.error(json.error || 'Erreur d\'import')
      }
    } catch {
      toast.error('Erreur de connexion')
    }
    if (importRef.current) importRef.current.value = ''
  }

  const handleDocxImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setImporting(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('mergeMode', importMergeMode)
      const res = await fetch('/api/guests/import-docx', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      })
      const json = await res.json()
      if (res.ok) {
        setImportResult(json)
        setShowImportResult(true)
        setShowImportDialog(false)
        fetchGuests()
        fetchTables()
        if (json.guestsCreated > 0) {
          toast.success(`${json.guestsCreated} invités importés avec succès !`)
        }
        if (json.errors.length > 0) {
          toast.warning(`${json.errors.length} erreurs détectées`)
        }
      } else {
        toast.error(json.error || 'Erreur d\'import')
      }
    } catch {
      toast.error('Erreur de connexion au serveur')
    } finally {
      setImporting(false)
    }
    if (docxImportRef.current) docxImportRef.current.value = ''
  }

  const handleQRCode = async (guest: Guest) => {
    try {
      const res = await fetch(`/api/guests/qrcode/${guest.invitationCode}`)
      const json = await res.json()
      if (res.ok) {
        setQrCodeData(json)
        setShowQRDialog(true)
      } else {
        toast.error(json.error || 'Erreur QR Code')
      }
    } catch {
      toast.error('Erreur de connexion')
    }
  }

  const openEditDialog = (guest: Guest) => {
    setSelectedGuest(guest)
    setForm({
      firstName: guest.firstName,
      lastName: guest.lastName,
      phone: guest.phone || '',
      email: guest.email || '',
      tableId: guest.tableId || '',
      seats: guest.seats,
      category: guest.category,
      status: guest.status,
      personalMessage: guest.personalMessage || '',
    })
    setShowEditDialog(true)
  }

  const openDeleteDialog = (guest: Guest) => {
    setSelectedGuest(guest)
    setShowDeleteDialog(true)
  }

  const GuestForm = ({ onSave, saveLabel }: { onSave: () => void; saveLabel: string }) => (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <div className="space-y-2">
        <Label>Prénom *</Label>
        <Input value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
      </div>
      <div className="space-y-2">
        <Label>Nom *</Label>
        <Input value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
      </div>
      <div className="space-y-2">
        <Label>Téléphone</Label>
        <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
      </div>
      <div className="space-y-2">
        <Label>Email</Label>
        <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
      </div>
      <div className="space-y-2">
        <Label>Table</Label>
        <Select value={form.tableId || 'none'} onValueChange={(v) => setForm({ ...form, tableId: v === 'none' ? '' : v })}>
          <SelectTrigger><SelectValue placeholder="Sélectionner" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Aucune table</SelectItem>
            {tables.map((t) => (
              <SelectItem key={t.id} value={t.id}>
                Table {t.number} - {t.name} ({t.guestCount}/{t.capacity})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label>Places</Label>
        <Input type="number" min={1} value={form.seats} onChange={(e) => setForm({ ...form, seats: parseInt(e.target.value) || 1 })} />
      </div>
      <div className="space-y-2">
        <Label>Catégorie</Label>
        <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {CATEGORIES.map((c) => (
              <SelectItem key={c} value={c}>{CATEGORY_LABELS[c]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label>Statut</Label>
        <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {STATUSES.map((s) => (
              <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2 sm:col-span-2">
        <Label>Message personnel</Label>
        <Input value={form.personalMessage} onChange={(e) => setForm({ ...form, personalMessage: e.target.value })} />
      </div>
      <div className="sm:col-span-2 flex justify-end gap-2">
        <Button variant="ghost" onClick={() => { setShowAddDialog(false); setShowEditDialog(false); resetForm() }}>
          Annuler
        </Button>
        <Button onClick={onSave} disabled={saving || !form.firstName || !form.lastName} className="bg-gradient-gold text-white">
          {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
          {saveLabel}
        </Button>
      </div>
    </div>
  )

  return (
    <div className="space-y-4 p-4 md:p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold">Gestion des Invités</h2>
          <p className="text-sm text-muted-foreground">{total} invité{total > 1 ? 's' : ''} au total</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button onClick={handleExport} variant="outline" size="sm" className="border-gold/30">
            <Download className="w-4 h-4 mr-1" /> Export
          </Button>
          <Button onClick={() => setShowImportDialog(true)} variant="outline" size="sm" className="border-gold/30">
            <FileUp className="w-4 h-4 mr-1" /> Import Word
          </Button>
          <Button onClick={() => importRef.current?.click()} variant="outline" size="sm" className="border-gold/30">
            <Upload className="w-4 h-4 mr-1" /> Import Excel
          </Button>
          <input ref={importRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleXlsxImport} />
          <input ref={docxImportRef} type="file" accept=".docx,.doc" className="hidden" onChange={handleDocxImport} />
          <Button onClick={() => { resetForm(); setShowAddDialog(true) }} size="sm" className="bg-gradient-gold text-white">
            <Plus className="w-4 h-4 mr-1" /> Ajouter
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card className="glass-card gold-border border-0">
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Rechercher un invité..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1) }}
                className="pl-9"
              />
              {search && (
                <button onClick={() => { setSearch(''); setPage(1) }} className="absolute right-3 top-1/2 -translate-y-1/2">
                  <X className="w-4 h-4 text-muted-foreground hover:text-foreground" />
                </button>
              )}
            </div>
            <Select value={filterStatus} onValueChange={(v) => { setFilterStatus(v); setPage(1) }}>
              <SelectTrigger className="w-full sm:w-40"><SelectValue placeholder="Statut" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les statuts</SelectItem>
                {STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterCategory} onValueChange={(v) => { setFilterCategory(v); setPage(1) }}>
              <SelectTrigger className="w-full sm:w-40"><SelectValue placeholder="Catégorie" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes catégories</SelectItem>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>{CATEGORY_LABELS[c]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterTable} onValueChange={(v) => { setFilterTable(v); setPage(1) }}>
              <SelectTrigger className="w-full sm:w-44"><SelectValue placeholder="Table" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes les tables</SelectItem>
                {tables.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    Table {t.number} - {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card className="glass-card gold-border border-0">
        <CardContent className="p-0">
          {loading ? (
            <div className="space-y-3 p-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : guests.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">
              <Users className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>Aucun invité trouvé</p>
              <p className="text-xs mt-1">Importez un document Word ou ajoutez des invités manuellement</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-white/10 hover:bg-transparent">
                    <TableHead className="text-xs">Nom</TableHead>
                    <TableHead className="text-xs">Table</TableHead>
                    <TableHead className="text-xs hidden sm:table-cell">Catégorie</TableHead>
                    <TableHead className="text-xs">Statut</TableHead>
                    <TableHead className="text-xs hidden md:table-cell">Code</TableHead>
                    <TableHead className="text-xs hidden lg:table-cell">Check-in</TableHead>
                    <TableHead className="text-xs w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {guests.map((guest) => (
                    <TableRow
                      key={guest.id}
                      className="border-white/5 hover:bg-white/5 transition-colors"
                    >
                        <TableCell>
                          <div>
                            <p className="font-medium text-sm">{guest.firstName} {guest.lastName}</p>
                            <p className="text-xs text-muted-foreground">{guest.seats} place{guest.seats > 1 ? 's' : ''}</p>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">
                          {guest.table ? (
                            <span className="text-gold">T{guest.table.number} - {guest.table.name}</span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="hidden sm:table-cell">
                          <Badge variant="outline" className={`text-xs ${CATEGORY_COLORS[guest.category] || ''}`}>
                            {CATEGORY_LABELS[guest.category] || guest.category}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={`text-xs ${STATUS_COLORS[guest.status] || ''}`}>
                            {STATUS_LABELS[guest.status] || guest.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          <code className="text-xs font-mono text-muted-foreground bg-white/5 px-2 py-0.5 rounded">
                            {guest.invitationCode}
                          </code>
                        </TableCell>
                        <TableCell className="hidden lg:table-cell">
                          {guest.checkedIn ? (
                            <Badge className="bg-green-500/20 text-green-400 text-xs">✓</Badge>
                          ) : (
                            <span className="text-muted-foreground text-xs">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="bg-popover border-border">
                              <DropdownMenuItem onClick={() => handleQRCode(guest)}>
                                <QrCode className="w-4 h-4 mr-2" /> QR Code
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleCopyLink(guest)}>
                                {copiedLinkId === guest.id ? (
                                  <Check className="w-4 h-4 mr-2 text-green-500" />
                                ) : (
                                  <Link2 className="w-4 h-4 mr-2" />
                                )}
                                {copiedLinkId === guest.id ? 'Copié !' : 'Copier le lien'}
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleShareLink(guest)}>
                                <Share2 className="w-4 h-4 mr-2" /> Partager
                              </DropdownMenuItem>
                              {guest.phone && (
                                <DropdownMenuItem onClick={() => handleSendViaWhatsApp(guest)}>
                                  <Mail className="w-4 h-4 mr-2" /> WhatsApp
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuItem onClick={() => openEditDialog(guest)}>
                                <Pencil className="w-4 h-4 mr-2" /> Modifier
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => openDeleteDialog(guest)} className="text-red-400">
                                <Trash2 className="w-4 h-4 mr-2" /> Supprimer
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between p-4 border-t border-white/10">
              <p className="text-xs text-muted-foreground">
                Page {page} sur {totalPages}
              </p>
              <div className="flex gap-1">
                <Button
                  variant="ghost" size="icon" className="h-8 w-8"
                  disabled={page <= 1}
                  onClick={() => setPage(page - 1)}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost" size="icon" className="h-8 w-8"
                  disabled={page >= totalPages}
                  onClick={() => setPage(page + 1)}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ─── Import Dialog ─── */}
      <Dialog open={showImportDialog} onOpenChange={setShowImportDialog}>
        <DialogContent className="glass-card gold-border max-w-md">
          <DialogHeader>
            <DialogTitle className="gold-gradient flex items-center gap-2">
              <FileText className="w-5 h-5" />
              Importer un document Word
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              Importez la liste des invités depuis un fichier Word (.docx).
              Le document doit contenir des sections &quot;Table N NOM&quot; suivies des noms des invités.
            </p>

            <div className="space-y-2">
              <Label>Mode d&apos;importation</Label>
              <Select value={importMergeMode} onValueChange={setImportMergeMode}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="merge">
                    Fusionner — Ajouter aux données existantes (recommandé)
                  </SelectItem>
                  <SelectItem value="replace">
                    Remplacer — Supprimer toutes les données actuelles
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {importMergeMode === 'replace' && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-medium text-red-400">Attention</p>
                  <p className="text-xs text-muted-foreground">
                    Ce mode supprimera tous les invités et tables existants avant l&apos;import.
                    Les codes d&apos;invitation existants ne fonctionneront plus.
                  </p>
                </div>
              </div>
            )}

            <div className="flex items-center justify-center p-6 border-2 border-dashed border-gold/20 rounded-xl bg-gold/[0.02]">
              <Button
                onClick={() => docxImportRef.current?.click()}
                disabled={importing}
                className="bg-gradient-gold text-white"
              >
                {importing ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Import en cours...
                  </>
                ) : (
                  <>
                    <FileUp className="w-4 h-4 mr-2" />
                    Choisir un fichier .docx
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ─── Import Results Dialog ─── */}
      <Dialog open={showImportResult} onOpenChange={setShowImportResult}>
        <DialogContent className="glass-card gold-border max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="gold-gradient flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5" />
              Résultat de l&apos;import
            </DialogTitle>
          </DialogHeader>
          {importResult && (
            <div className="space-y-4">
              {/* Summary */}
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-xl bg-green-500/10 border border-green-500/20 text-center">
                  <p className="text-2xl font-bold text-green-400">{importResult.guestsCreated}</p>
                  <p className="text-xs text-muted-foreground">Invités créés</p>
                </div>
                <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/20 text-center">
                  <p className="text-2xl font-bold text-blue-400">{importResult.tablesCreated}</p>
                  <p className="text-xs text-muted-foreground">Tables créées</p>
                </div>
                <div className="p-3 rounded-xl bg-yellow-500/10 border border-yellow-500/20 text-center">
                  <p className="text-2xl font-bold text-yellow-400">{importResult.guestsSkipped}</p>
                  <p className="text-xs text-muted-foreground">Doublons ignorés</p>
                </div>
                <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-center">
                  <p className="text-2xl font-bold text-red-400">{importResult.errors.length}</p>
                  <p className="text-xs text-muted-foreground">Erreurs</p>
                </div>
              </div>

              {/* Details per table */}
              <div className="space-y-3">
                <h4 className="text-sm font-semibold">Détail par table</h4>
                {importResult.details.map((detail, idx) => (
                  <div key={idx} className="p-3 rounded-lg bg-white/[0.02] border border-white/5">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-sm font-medium text-gold">{detail.table}</p>
                      <Badge variant="outline" className="text-xs bg-green-500/10 text-green-400 border-green-500/20">
                        +{detail.guestsAdded.length}
                      </Badge>
                    </div>
                    {detail.guestsAdded.length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-1">
                        {detail.guestsAdded.map((name, i) => (
                          <span key={i} className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-green-500/10 text-green-400 border border-green-500/20">
                            <CheckCircle2 className="w-2.5 h-2.5" />
                            {name}
                          </span>
                        ))}
                      </div>
                    )}
                    {detail.guestsSkipped.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {detail.guestsSkipped.map((name, i) => (
                          <span key={i} className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-yellow-500/10 text-yellow-400 border border-yellow-500/20">
                            <XCircle className="w-2.5 h-2.5" />
                            {name} (doublon)
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Errors */}
              {importResult.errors.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold text-red-400">Erreurs</h4>
                  {importResult.errors.map((err, idx) => (
                    <p key={idx} className="text-xs text-red-400/80 bg-red-500/5 p-2 rounded-lg">{err}</p>
                  ))}
                </div>
              )}

              {/* Duplicates */}
              {importResult.duplicatesDetected.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold text-yellow-400">Doublons détectés</h4>
                  <div className="flex flex-wrap gap-1">
                    {importResult.duplicatesDetected.map((dup, idx) => (
                      <span key={idx} className="text-[10px] px-2 py-0.5 rounded-full bg-yellow-500/10 text-yellow-400 border border-yellow-500/20">
                        {dup}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Add Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="glass-card gold-border max-w-lg">
          <DialogHeader>
            <DialogTitle className="gold-gradient">Ajouter un invité</DialogTitle>
          </DialogHeader>
          <GuestForm onSave={handleAdd} saveLabel="Ajouter" />
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="glass-card gold-border max-w-lg">
          <DialogHeader>
            <DialogTitle className="gold-gradient">Modifier l&apos;invité</DialogTitle>
          </DialogHeader>
          <GuestForm onSave={handleEdit} saveLabel="Enregistrer" />
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent className="glass-card gold-border max-w-sm">
          <DialogHeader>
            <DialogTitle>Confirmer la suppression</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Êtes-vous sûr de vouloir supprimer <strong>{selectedGuest?.firstName} {selectedGuest?.lastName}</strong> ?
          </p>
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setShowDeleteDialog(false)}>Annuler</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Supprimer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* QR Code Dialog */}
      <Dialog open={showQRDialog} onOpenChange={setShowQRDialog}>
        <DialogContent className="glass-card gold-border max-w-sm">
          <DialogHeader>
            <DialogTitle className="gold-gradient">QR Code</DialogTitle>
          </DialogHeader>
          {qrCodeData && (
            <div className="flex flex-col items-center gap-4">
              <div className="bg-white rounded-xl p-4">
                <img src={qrCodeData.qrCode} alt="QR Code" className="w-48 h-48" />
              </div>
              <div className="text-center">
                <p className="font-medium">{qrCodeData.guest.firstName} {qrCodeData.guest.lastName}</p>
                <p className="text-xs text-muted-foreground mt-1">Code: {qrCodeData.guest.invitationCode}</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="border-gold/30"
                onClick={() => {
                  const a = document.createElement('a')
                  a.href = qrCodeData.qrCode
                  a.download = `qr-${qrCodeData.guest.invitationCode}.png`
                  a.click()
                }}
              >
                <Download className="w-4 h-4 mr-1" /> Télécharger
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
