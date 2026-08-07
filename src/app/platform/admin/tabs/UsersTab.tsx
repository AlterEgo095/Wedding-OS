'use client'

// UsersTab — extracted from src/app/platform/admin/page.tsx (CONS-3).
// Manages CRUD for platform staff (AdminUser) across all weddings.

import { useState, useEffect, useCallback, useRef } from 'react'
import { motion } from 'framer-motion'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Plus,
  Search,
  Pencil,
  Trash2,
  MoreHorizontal,
  Loader2,
  ChevronLeft,
  ChevronRight,
  KeyRound,
  UserPlus,
  Users as UsersIcon,
} from 'lucide-react'

import Link from 'next/link'
import { formatDate, formatDateTime } from '@/lib/format'
import { ROLE_BADGE_CLASS, getRoleLabel } from '@/lib/ui-labels'

import {
  type UserRow,
  type PaginatedUsers,
  type PaginatedWeddings,
  type FetchWithAuth,
  RoleBadge,
} from './shared'


// ════════════════════════════════════════════════════════════════════════════
// Users tab
// ════════════════════════════════════════════════════════════════════════════

interface UserFormState {
  name: string
  email: string
  password: string
  role: string
  weddingId: string
}

const EMPTY_USER_FORM: UserFormState = {
  name: '',
  email: '',
  password: '',
  role: 'ORGANIZER',
  weddingId: '',
}

const USER_ROLES = [
  { value: 'PLATFORM_ADMIN', label: 'Administrateur Plateforme', needsWedding: false },
  { value: 'ORGANIZER', label: 'Organisateur', needsWedding: true },
  { value: 'RECEPTION', label: 'Réception', needsWedding: true },
  { value: 'CONTROLLER', label: 'Contrôleur', needsWedding: true },
]

export function UsersTab({ fetchWithAuth }: { fetchWithAuth: (url: string, init?: RequestInit) => Promise<Response | null> }) {
  const [users, setUsers] = useState<UserRow[]>([])
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState<string>('ALL')

  // Dialog state
  const [showFormDialog, setShowFormDialog] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [editing, setEditing] = useState<UserRow | null>(null)
  const [deleting, setDeleting] = useState<UserRow | null>(null)
  const [form, setForm] = useState<UserFormState>(EMPTY_USER_FORM)
  const [saving, setSaving] = useState(false)
  const [weddingOptions, setWeddingOptions] = useState<Array<{ id: string; slug: string; coupleLabel: string }>>([])

  const LIMIT = 20
  const searchRef = useRef(search)
  searchRef.current = search

  const load = useCallback(
    async (targetPage: number) => {
      setLoading(true)
      const params = new URLSearchParams({
        page: String(targetPage),
        limit: String(LIMIT),
      })
      if (searchRef.current) params.set('search', searchRef.current)
      if (roleFilter !== 'ALL') params.set('role', roleFilter)

      const res = await fetchWithAuth(`/api/platform/users?${params.toString()}`)
      if (!res) {
        setLoading(false)
        return
      }
      try {
        const json = (await res.json()) as PaginatedUsers
        setUsers(json.users || [])
        setTotal(json.total || 0)
        setTotalPages(Math.max(1, Math.ceil((json.total || 0) / (json.limit || LIMIT))))
        setPage(json.page || targetPage)
      } catch {
        toast.error('Réponse invalide du serveur')
      } finally {
        setLoading(false)
      }
    },
    [fetchWithAuth, roleFilter]
  )

  useEffect(() => {
    load(1)
  }, [roleFilter, load])

  useEffect(() => {
    const t = setTimeout(() => {
      load(1)
    }, 350)
    return () => clearTimeout(t)
  }, [search, load])

  // Fetch weddings for the role↔wedding select (only when opening the form)
  const fetchWeddings = useCallback(async () => {
    if (weddingOptions.length > 0) return
    const res = await fetchWithAuth('/api/platform/weddings?limit=100')
    if (!res) return
    try {
      const json = (await res.json()) as PaginatedWeddings
      setWeddingOptions(
        (json.weddings || []).map((w) => ({ id: w.id, slug: w.slug, coupleLabel: w.coupleLabel }))
      )
    } catch {
      /* ignore — wedding select will just be empty */
    }
  }, [fetchWithAuth, weddingOptions.length])

  const openCreate = useCallback(async () => {
    setEditing(null)
    setForm(EMPTY_USER_FORM)
    setShowFormDialog(true)
    await fetchWeddings()
  }, [fetchWeddings])

  const openEdit = useCallback(
    async (u: UserRow) => {
      setEditing(u)
      setForm({
        name: u.name,
        email: u.email,
        password: '', // blank = keep current
        role: u.role === 'SUPER_ADMIN' ? 'PLATFORM_ADMIN' : u.role,
        weddingId: u.weddingId || '',
      })
      setShowFormDialog(true)
      await fetchWeddings()
    },
    [fetchWeddings]
  )

  const handleSave = async () => {
    const roleConfig = USER_ROLES.find((r) => r.value === form.role)
    if (!form.name.trim() || !form.email.trim()) {
      toast.error('Nom et email sont requis')
      return
    }
    if (!editing && form.password.length < 8) {
      toast.error('Le mot de passe doit faire au moins 8 caractères')
      return
    }
    if (editing && form.password && form.password.length < 8) {
      toast.error('Le mot de passe doit faire au moins 8 caractères')
      return
    }
    if (roleConfig?.needsWedding && !form.weddingId) {
      toast.error('Un mariage est requis pour ce rôle')
      return
    }

    setSaving(true)
    const payload: Record<string, unknown> = {
      name: form.name.trim(),
      email: form.email.trim().toLowerCase(),
      role: form.role,
      weddingId: roleConfig?.needsWedding ? form.weddingId : null,
    }
    if (form.password) {
      payload.password = form.password
    }

    try {
      const url = editing
        ? `/api/platform/users/${editing.id}`
        : '/api/platform/users'
      const method = editing ? 'PUT' : 'POST'
      const res = await fetchWithAuth(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res) {
        setSaving(false)
        return
      }
      const json = await res.json().catch(() => ({}))
      if (res.ok) {
        toast.success(editing ? 'Utilisateur mis à jour' : 'Utilisateur créé')
        setShowFormDialog(false)
        setEditing(null)
        setForm(EMPTY_USER_FORM)
        load(page)
      } else {
        toast.error(json.error || 'Erreur lors de la sauvegarde')
      }
    } catch {
      toast.error('Erreur de connexion')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!deleting) return
    setSaving(true)
    try {
      const res = await fetchWithAuth(`/api/platform/users/${deleting.id}`, {
        method: 'DELETE',
      })
      if (!res) {
        setSaving(false)
        return
      }
      const json = await res.json().catch(() => ({}))
      if (res.ok) {
        toast.success('Utilisateur supprimé')
        setShowDeleteDialog(false)
        setDeleting(null)
        load(1)
      } else {
        toast.error(json.error || 'Erreur lors de la suppression')
      }
    } catch {
      toast.error('Erreur de connexion')
    } finally {
      setSaving(false)
    }
  }

  const selectedRoleConfig = USER_ROLES.find((r) => r.value === form.role)

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-xl font-bold">Utilisateurs</h2>
          <p className="text-sm text-muted-foreground">{total} utilisateur{total > 1 ? 's' : ''}</p>
        </div>
        <Button onClick={openCreate} size="sm" className="bg-gradient-gold text-white shrink-0">
          <UserPlus className="w-4 h-4 mr-1" /> Créer un utilisateur
        </Button>
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Rechercher par nom ou email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 bg-white/5 border-white/10"
          />
        </div>
        <Select value={roleFilter} onValueChange={setRoleFilter}>
          <SelectTrigger className="w-full sm:w-48 bg-white/5 border-white/10">
            <SelectValue placeholder="Rôle" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Tous les rôles</SelectItem>
            <SelectItem value="PLATFORM_ADMIN">Administrateur Plateforme</SelectItem>
            <SelectItem value="ORGANIZER">Organisateur</SelectItem>
            <SelectItem value="RECEPTION">Réception</SelectItem>
            <SelectItem value="CONTROLLER">Contrôleur</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card className="glass-card gold-border border-0">
        <CardContent className="p-0">
          <div className="max-h-[60vh] overflow-y-auto custom-scrollbar">
            <Table>
              <TableHeader className="sticky top-0 bg-background/95 backdrop-blur z-10">
                <TableRow className="border-white/10 hover:bg-transparent">
                  <TableHead className="text-xs">Nom</TableHead>
                  <TableHead className="text-xs hidden md:table-cell">Email</TableHead>
                  <TableHead className="text-xs">Rôle</TableHead>
                  <TableHead className="text-xs hidden lg:table-cell">Mariage</TableHead>
                  <TableHead className="text-xs hidden md:table-cell">Créé le</TableHead>
                  <TableHead className="text-xs w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 6 }).map((_, i) => (
                    <TableRow key={`sk-${i}`} className="border-white/5">
                      <TableCell colSpan={6}>
                        <Skeleton className="h-8 w-full rounded" />
                      </TableCell>
                    </TableRow>
                  ))
                ) : users.length === 0 ? (
                  <TableRow className="border-white/5 hover:bg-transparent">
                    <TableCell colSpan={6} className="py-12 text-center text-muted-foreground">
                      <UsersIcon className="w-10 h-10 mx-auto mb-2 opacity-30" />
                      <p className="text-sm">Aucun utilisateur trouvé</p>
                    </TableCell>
                  </TableRow>
                ) : (
                  users.map((u) => (
                    <TableRow key={u.id} className="border-white/5 hover:bg-white/5 transition-colors">
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-gradient-gold flex items-center justify-center text-white text-xs font-bold shrink-0">
                            {u.name.charAt(0).toUpperCase()}
                          </div>
                          <span className="font-medium text-sm">{u.name}</span>
                        </div>
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                        {u.email}
                      </TableCell>
                      <TableCell>
                        <RoleBadge role={u.role} />
                      </TableCell>
                      <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">
                        {u.wedding ? (
                          <Link
                            href={`/w/${u.wedding.slug}`}
                            target="_blank"
                            className="hover:text-gold transition-colors"
                          >
                            {u.wedding.coupleLabel}
                          </Link>
                        ) : (
                          <span className="text-muted-foreground/50">—</span>
                        )}
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                        {formatDate(u.createdAt)}
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-11 w-11">
                              <MoreHorizontal className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openEdit(u)}>
                              <Pencil className="w-3.5 h-3.5 mr-2" />
                              Modifier
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-red-400 focus:text-red-300"
                              onClick={() => {
                                setDeleting(u)
                                setShowDeleteDialog(true)
                              }}
                            >
                              <Trash2 className="w-3.5 h-3.5 mr-2" />
                              Supprimer
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          Page {page} / {Math.max(totalPages, 1)}
        </p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1 || loading} onClick={() => load(page - 1)}>
            <ChevronLeft className="w-4 h-4 mr-1" /> Précédent
          </Button>
          <Button variant="outline" size="sm" disabled={page >= totalPages || loading} onClick={() => load(page + 1)}>
            Suivant <ChevronRight className="w-4 h-4 ml-1" />
          </Button>
        </div>
      </div>

      {/* Create / Edit dialog */}
      <Dialog open={showFormDialog} onOpenChange={setShowFormDialog}>
        <DialogContent className="glass-card gold-border max-w-lg">
          <DialogHeader>
            <DialogTitle className="gold-gradient flex items-center gap-2">
              <UserPlus className="w-4 h-4" />
              {editing ? "Modifier l'utilisateur" : 'Créer un utilisateur'}
            </DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2 sm:col-span-2">
              <Label>Nom complet *</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Jean Dupont"
                className="bg-white/5 border-white/10"
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>Email *</Label>
              <Input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="jean@exemple.com"
                className="bg-white/5 border-white/10"
              />
            </div>
            <div className="space-y-2">
              <Label>Rôle *</Label>
              <Select
                value={form.role}
                onValueChange={(v) => setForm({ ...form, role: v, weddingId: v === 'PLATFORM_ADMIN' ? '' : form.weddingId })}
              >
                <SelectTrigger className="bg-white/5 border-white/10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {USER_ROLES.map((r) => (
                    <SelectItem key={r.value} value={r.value}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Mariage {selectedRoleConfig?.needsWedding ? '*' : '(non requis)'}</Label>
              <Select
                value={form.weddingId}
                onValueChange={(v) => setForm({ ...form, weddingId: v })}
                disabled={!selectedRoleConfig?.needsWedding}
              >
                <SelectTrigger className="bg-white/5 border-white/10">
                  <SelectValue placeholder="Sélectionner…" />
                </SelectTrigger>
                <SelectContent>
                  {weddingOptions.map((w) => (
                    <SelectItem key={w.id} value={w.id}>
                      {w.coupleLabel} <span className="text-muted-foreground">/w/{w.slug}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label className="flex items-center gap-1.5">
                <KeyRound className="w-3.5 h-3.5 text-muted-foreground" />
                {editing ? 'Mot de passe (laisser vide pour conserver)' : 'Mot de passe *'}
              </Label>
              <Input
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder={editing ? '••••••••' : 'Minimum 8 caractères'}
                className="bg-white/5 border-white/10"
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="ghost"
              onClick={() => {
                setShowFormDialog(false)
                setEditing(null)
              }}
            >
              Annuler
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving || !form.name || !form.email || (!editing && !form.password)}
              className="bg-gradient-gold text-white"
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              {editing ? 'Enregistrer' : 'Créer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent className="glass-card gold-border max-w-sm">
          <DialogHeader>
            <DialogTitle>Confirmer la suppression</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Êtes-vous sûr de vouloir supprimer l&apos;utilisateur{' '}
            <strong className="text-foreground">{deleting?.name}</strong> ({deleting?.email}) ? Cette action est
            irréversible.
          </p>
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setShowDeleteDialog(false)}>Annuler</Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={saving}
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Supprimer définitivement
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
