'use client'

import { useState, useEffect } from 'react'
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
  Plus, Pencil, Trash2, Loader2, Shield, Users
} from 'lucide-react'
import { toast } from 'sonner'
import { isPlatformAdmin } from '@/lib/types'

interface AdminUser {
  id: string
  email: string
  name: string
  role: string
  createdAt: string
  updatedAt: string
}

interface UserManagerProps {
  token: string
  userRole: string
  onSessionExpired: () => void
}

// Phase 3 ÉTAPE 6: list both canonical PLATFORM_ADMIN and legacy SUPER_ADMIN.
// The UI sends PLATFORM_ADMIN by default; SUPER_ADMIN is accepted by the API
// for backward compat with existing DB rows seeded before Phase 3.
const ROLES = ['PLATFORM_ADMIN', 'SUPER_ADMIN', 'ORGANIZER', 'RECEPTION', 'CONTROLLER']

const ROLE_LABELS: Record<string, string> = {
  PLATFORM_ADMIN: 'Admin Plateforme',
  SUPER_ADMIN: 'Super Admin (legacy)',
  ORGANIZER: 'Organisateur',
  RECEPTION: 'Réception',
  CONTROLLER: 'Contrôleur',
}

const ROLE_COLORS: Record<string, string> = {
  PLATFORM_ADMIN: 'bg-gold/20 text-gold border-gold/30',
  SUPER_ADMIN: 'bg-gold/20 text-gold border-gold/30',
  ORGANIZER: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  RECEPTION: 'bg-teal-500/20 text-teal-400 border-teal-500/30',
  CONTROLLER: 'bg-sky-500/20 text-sky-400 border-sky-500/30',
}

export default function UserManager({ token, userRole, onSessionExpired }: UserManagerProps) {
  const [users, setUsers] = useState<AdminUser[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // Dialogs
  const [showAddDialog, setShowAddDialog] = useState(false)
  const [showEditDialog, setShowEditDialog] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null)

  // Form
  const [form, setForm] = useState({
    email: '',
    name: '',
    password: '',
    role: 'CONTROLLER',
  })

  const isSuperAdmin = isPlatformAdmin(userRole)

  const fetchUsers = async () => {
    try {
      const res = await fetch('/api/admin/users', {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.status === 401) { onSessionExpired(); return }
      if (res.status === 403) {
        toast.error('Accès refusé')
        setLoading(false)
        return
      }
      if (res.ok) {
        const json = await res.json()
        setUsers(json.users)
      }
    } catch {
      toast.error('Erreur de chargement')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (isSuperAdmin) fetchUsers()
  }, [token, isSuperAdmin])

  const resetForm = () => {
    setForm({ email: '', name: '', password: '', role: 'CONTROLLER' })
  }

  const handleAdd = async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(form),
      })
      const json = await res.json()
      if (res.ok) {
        toast.success('Utilisateur créé')
        setShowAddDialog(false)
        resetForm()
        fetchUsers()
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
    if (!selectedUser) return
    setSaving(true)
    try {
      const body: Record<string, string> = {
        id: selectedUser.id,
        name: form.name,
        role: form.role,
        email: form.email,
      }
      if (form.password) body.password = form.password

      const res = await fetch('/api/admin/users', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (res.ok) {
        toast.success('Utilisateur modifié')
        setShowEditDialog(false)
        setSelectedUser(null)
        resetForm()
        fetchUsers()
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
    if (!selectedUser) return
    setSaving(true)
    try {
      const res = await fetch(`/api/admin/users?id=${selectedUser.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      const json = await res.json()
      if (res.ok) {
        toast.success('Utilisateur supprimé')
        setShowDeleteDialog(false)
        setSelectedUser(null)
        fetchUsers()
      } else {
        toast.error(json.error || 'Erreur')
      }
    } catch {
      toast.error('Erreur de connexion')
    } finally {
      setSaving(false)
    }
  }

  if (!isSuperAdmin) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="text-center">
          <Shield className="w-12 h-12 mx-auto mb-3 text-muted-foreground opacity-30" />
          <p className="text-muted-foreground">Accès réservé aux Super Admins</p>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="space-y-3 p-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full rounded-xl" />
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-4 p-4 md:p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">Gestion des Utilisateurs</h2>
          <p className="text-sm text-muted-foreground">{users.length} utilisateur{users.length > 1 ? 's' : ''}</p>
        </div>
        <Button onClick={() => { resetForm(); setShowAddDialog(true) }} size="sm" className="bg-gradient-gold text-white">
          <Plus className="w-4 h-4 mr-1" /> Ajouter
        </Button>
      </div>

      {/* Users Table */}
      <Card className="glass-card gold-border border-0">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-white/10 hover:bg-transparent">
                  <TableHead className="text-xs">Nom</TableHead>
                  <TableHead className="text-xs hidden sm:table-cell">Email</TableHead>
                  <TableHead className="text-xs">Rôle</TableHead>
                  <TableHead className="text-xs w-20"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((user) => (
                  <TableRow
                    key={user.id}
                    className="border-white/5 hover:bg-white/5 transition-colors"
                  >
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-gradient-gold flex items-center justify-center text-white text-xs font-bold">
                            {user.name.charAt(0).toUpperCase()}
                          </div>
                          <span className="font-medium text-sm">{user.name}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground hidden sm:table-cell">{user.email}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`text-xs ${ROLE_COLORS[user.role] || ''}`}>
                          {ROLE_LABELS[user.role] || user.role}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => {
                              setSelectedUser(user)
                              setForm({ email: user.email, name: user.name, password: '', role: user.role })
                              setShowEditDialog(true)
                            }}
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-red-400 hover:text-red-300"
                            onClick={() => { setSelectedUser(user); setShowDeleteDialog(true) }}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </div>
          {users.length === 0 && (
            <div className="py-12 text-center text-muted-foreground">
              <Users className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>Aucun utilisateur</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="glass-card gold-border max-w-sm">
          <DialogHeader>
            <DialogTitle className="gold-gradient">Ajouter un utilisateur</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nom *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Email *</Label>
              <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Mot de passe *</Label>
              <Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Rôle *</Label>
              <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ROLES.map((r) => (
                    <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setShowAddDialog(false)}>Annuler</Button>
            <Button onClick={handleAdd} disabled={saving || !form.email || !form.name || !form.password} className="bg-gradient-gold text-white">
              {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Créer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="glass-card gold-border max-w-sm">
          <DialogHeader>
            <DialogTitle className="gold-gradient">Modifier l&apos;utilisateur</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nom *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Email *</Label>
              <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Mot de passe (laisser vide pour ne pas changer)</Label>
              <Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="••••••••" />
            </div>
            <div className="space-y-2">
              <Label>Rôle *</Label>
              <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ROLES.map((r) => (
                    <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setShowEditDialog(false)}>Annuler</Button>
            <Button onClick={handleEdit} disabled={saving || !form.email || !form.name} className="bg-gradient-gold text-white">
              {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Enregistrer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent className="glass-card gold-border max-w-sm">
          <DialogHeader>
            <DialogTitle>Confirmer la suppression</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Êtes-vous sûr de vouloir supprimer <strong>{selectedUser?.name}</strong> ?
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
    </div>
  )
}
