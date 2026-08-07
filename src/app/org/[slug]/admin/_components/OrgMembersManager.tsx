'use client';

// ══════════════════════════════════════════════════════════════════════════════
// OrgMembersManager — client island for the org members page
// ══════════════════════════════════════════════════════════════════════════════
//
// Features:
//   - Member table: avatar, name, email, role badge, status badge, joined date,
//     last login. Per-member actions: change role (dropdown), revoke (button).
//   - Invite member dialog: email + role select. POSTs to /api/org/[slug]/members.
//   - Active vs max members counter at the top.
//   - Self-protection: cannot revoke self, cannot demote self (also enforced
//     server-side as defense-in-depth).
//
// All fetches use the global fetch interceptor (auto-attaches CSRF token on
// state-changing requests via the /w/[slug]/admin pattern). HOWEVER, the org
// admin area is a NEW route tree and doesn't install that interceptor. So
// we manually attach credentials + CSRF here.

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Users, Loader2, MoreVertical, ShieldCheck, UserMinus, Mail, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

// ─── Types ────────────────────────────────────────────────────────────────────

type OrgMemberRole = 'ORG_ADMIN' | 'ORG_MEMBER' | 'ORG_VIEWER';
type MemberStatus = 'PENDING' | 'ACTIVE' | 'REVOKED';

export interface MembersOrg {
  id: string;
  slug: string;
  name: string;
  maxMembers: number;
}

export interface MembersCurrentUser {
  id: string;
  role: string;
}

export interface MemberRow {
  id: string;
  role: string;
  status: string;
  invitedAt: string;
  joinedAt: string | null;
  user: {
    id: string;
    email: string;
    name: string;
    role: string;
    lastLoginAt: string | null;
    createdAt: string;
  };
}

export interface OrgMembersManagerProps {
  org: MembersOrg;
  currentUser: MembersCurrentUser;
  members: MemberRow[];
  activeCount: number;
  canManage: boolean;
}

// ─── Role labels ──────────────────────────────────────────────────────────────

const ROLE_LABELS: Record<OrgMemberRole, string> = {
  ORG_ADMIN: 'Admin Organisation',
  ORG_MEMBER: 'Membre',
  ORG_VIEWER: 'Observateur',
};

const ROLE_BADGE_CLASS: Record<OrgMemberRole, string> = {
  ORG_ADMIN: 'bg-gold/15 text-gold border-gold/40',
  ORG_MEMBER: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  ORG_VIEWER: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30',
};

const STATUS_LABELS: Record<MemberStatus, string> = {
  ACTIVE: 'Actif',
  PENDING: 'En attente',
  REVOKED: 'Révoqué',
};

const STATUS_BADGE_CLASS: Record<MemberStatus, string> = {
  ACTIVE: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  PENDING: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  REVOKED: 'bg-red-500/15 text-red-400 border-red-500/30',
};

// ─── Component ────────────────────────────────────────────────────────────────

export function OrgMembersManager({
  org,
  currentUser,
  members: initialMembers,
  activeCount: initialActiveCount,
  canManage,
}: OrgMembersManagerProps) {
  const router = useRouter();
  const [members, setMembers] = useState<MemberRow[]>(initialMembers);
  const [activeCount, setActiveCount] = useState(initialActiveCount);

  // ─── Invite dialog state ──────────────────────────────────────────────
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<OrgMemberRole>('ORG_MEMBER');
  const [inviting, setInviting] = useState(false);

  // ─── Revoke dialog state ──────────────────────────────────────────────
  const [revokeTarget, setRevokeTarget] = useState<MemberRow | null>(null);
  const [revoking, setRevoking] = useState(false);

  // ─── Role change in-flight state (per member) ─────────────────────────
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  // ─── Helpers ──────────────────────────────────────────────────────────
  const getCsrfToken = useCallback((): string => {
    if (typeof document === 'undefined') return '';
    const match = document.cookie
      .split('; ')
      .find((row) => row.startsWith('csrf_token='));
    return match ? match.split('=').slice(1).join('=') : '';
  }, []);

  const authedFetch = useCallback(
    async (url: string, init: RequestInit = {}): Promise<Response | null> => {
      const method = (init.method || 'GET').toUpperCase();
      const isStateChanging = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method);
      const headers = new Headers(init.headers || {});
      if (isStateChanging && !headers.has('X-CSRF-Token')) {
        const csrf = getCsrfToken();
        if (csrf) headers.set('X-CSRF-Token', csrf);
      }
      try {
        const res = await fetch(url, {
          ...init,
          headers,
          credentials: 'include',
        });
        if (res.status === 401) {
          toast.error('Session expirée, veuillez vous reconnecter');
          router.replace(`/org/${org.slug}/admin/login`);
          return null;
        }
        return res;
      } catch {
        toast.error('Erreur de connexion au serveur');
        return null;
      }
    },
    [getCsrfToken, org.slug, router]
  );

  // ─── Refresh members list (after invite / role change / revoke) ───────
  const refreshMembers = useCallback(async () => {
    const res = await authedFetch(`/api/org/${org.slug}/members`);
    if (!res) return;
    if (!res.ok) {
      toast.error('Impossible de rafraîchir la liste des membres');
      return;
    }
    const data = await res.json();
    setMembers(data.members);
    setActiveCount(data.members.filter((m: MemberRow) => m.status === 'ACTIVE').length);
  }, [authedFetch, org.slug]);

  // ─── Invite handler ───────────────────────────────────────────────────
  const handleInvite = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!inviteEmail.trim()) {
        toast.error('Email requis');
        return;
      }
      setInviting(true);
      try {
        const res = await authedFetch(`/api/org/${org.slug}/members`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: inviteEmail.trim(), role: inviteRole }),
        });
        if (!res) return;
        const data = await res.json().catch(() => ({}));
        if (res.ok) {
          toast.success(`Membre ajouté : ${inviteEmail}`);
          setInviteEmail('');
          setInviteRole('ORG_MEMBER');
          setInviteOpen(false);
          await refreshMembers();
        } else if (res.status === 404) {
          toast.error(
            "Aucun utilisateur trouvé avec cet email. L'utilisateur doit d'abord créer un compte."
          );
        } else if (res.status === 409) {
          toast.error(data?.error || 'Conflit : cet utilisateur est déjà membre ou la limite est atteinte.');
        } else if (res.status === 403) {
          toast.error("Vous n'avez pas la permission d'inviter des membres");
        } else {
          toast.error(data?.error || "Échec de l'invitation");
        }
      } finally {
        setInviting(false);
      }
    },
    [authedFetch, inviteEmail, inviteRole, org.slug, refreshMembers]
  );

  // ─── Role change handler ──────────────────────────────────────────────
  const handleRoleChange = useCallback(
    async (member: MemberRow, newRole: OrgMemberRole) => {
      if (member.role === newRole) return;
      // Self-demotion guard (also enforced server-side).
      if (member.user.id === currentUser.id && member.role === 'ORG_ADMIN' && newRole !== 'ORG_ADMIN') {
        toast.error("Vous ne pouvez pas rétrograder votre propre rôle d'administrateur");
        return;
      }
      setUpdatingId(member.id);
      try {
        const res = await authedFetch(
          `/api/org/${org.slug}/members/${member.id}`,
          {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ role: newRole }),
          }
        );
        if (!res) return;
        const data = await res.json().catch(() => ({}));
        if (res.ok) {
          toast.success(`Rôle mis à jour : ${ROLE_LABELS[newRole]}`);
          await refreshMembers();
        } else if (res.status === 403) {
          toast.error(data?.error || 'Permission insuffisante');
        } else if (res.status === 409) {
          toast.error(data?.error || 'Action non autorisée');
        } else {
          toast.error(data?.error || 'Échec de la mise à jour');
        }
      } finally {
        setUpdatingId(null);
      }
    },
    [authedFetch, currentUser.id, org.slug, refreshMembers]
  );

  // ─── Revoke handler ───────────────────────────────────────────────────
  const handleRevoke = useCallback(async () => {
    if (!revokeTarget) return;
    setRevoking(true);
    try {
      const res = await authedFetch(
        `/api/org/${org.slug}/members/${revokeTarget.id}`,
        { method: 'DELETE' }
      );
      if (!res) return;
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        toast.success(`Accès révoqué pour ${revokeTarget.user.email}`);
        setRevokeTarget(null);
        await refreshMembers();
      } else if (res.status === 403) {
        toast.error(data?.error || 'Permission insuffisante');
      } else if (res.status === 409) {
        toast.error(data?.error || 'Action non autorisée');
      } else {
        toast.error(data?.error || 'Échec de la révocation');
      }
    } finally {
      setRevoking(false);
    }
  }, [authedFetch, org.slug, revokeTarget, refreshMembers]);

  // ─── Render ───────────────────────────────────────────────────────────
  const slotsUsed = activeCount;
  const slotsTotal = org.maxMembers;
  const slotsFull = slotsUsed >= slotsTotal;

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto space-y-6">
      {/* ─── Header ─────────────────────────────────────────────────── */}
      <header className="flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold gold-gradient font-display tracking-wide flex items-center gap-2">
            <Users className="w-6 h-6" />
            Membres
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Membres de {org.name} · {slotsUsed}/{slotsTotal} sièges utilisés
          </p>
        </div>
        {canManage && (
          <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
            <DialogTrigger asChild>
              <Button className="bg-gradient-gold hover:opacity-90 text-white" disabled={slotsFull}>
                <Plus className="w-4 h-4 mr-2" />
                {slotsFull ? 'Quota atteint' : 'Inviter un membre'}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Inviter un membre</DialogTitle>
                <DialogDescription>
                  L&apos;utilisateur doit déjà avoir un compte sur la plateforme. Saisissez son email et choisissez son rôle dans {org.name}.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleInvite} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="invite-email">Email</Label>
                  <Input
                    id="invite-email"
                    type="email"
                    placeholder="marie@agence-mariage.fr"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    required
                    disabled={inviting}
                    autoFocus
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="invite-role">Rôle</Label>
                  <Select
                    value={inviteRole}
                    onValueChange={(v) => setInviteRole(v as OrgMemberRole)}
                    disabled={inviting}
                  >
                    <SelectTrigger id="invite-role">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ORG_ADMIN">Admin Organisation — gestion complète</SelectItem>
                      <SelectItem value="ORG_MEMBER">Membre — lecture/écriture des mariages</SelectItem>
                      <SelectItem value="ORG_VIEWER">Observateur — lecture seule</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <DialogFooter>
                  <Button type="button" variant="ghost" onClick={() => setInviteOpen(false)} disabled={inviting}>
                    Annuler
                  </Button>
                  <Button type="submit" disabled={inviting} className="bg-gradient-gold hover:opacity-90 text-white">
                    {inviting ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Invitation…
                      </>
                    ) : (
                      <>
                        <Plus className="w-4 h-4 mr-2" />
                        Ajouter
                      </>
                    )}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </header>

      {/* ─── Quota warning ──────────────────────────────────────────── */}
      {slotsFull && canManage && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 flex items-start gap-2 text-sm text-amber-300">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <div>
            <p className="font-medium">Quota de membres atteint ({slotsTotal}/{slotsTotal})</p>
            <p className="text-xs text-amber-300/80 mt-0.5">
              Révoquez un membre existant ou contactez l&apos;administrateur plateforme pour augmenter le quota.
            </p>
          </div>
        </div>
      )}

      {/* ─── Members table ──────────────────────────────────────────── */}
      {members.length === 0 ? (
        <div className="rounded-xl border border-dashed border-white/15 bg-white/[0.02] p-8 text-center">
          <Users className="w-10 h-10 mx-auto text-muted-foreground/50 mb-3" />
          <p className="font-medium text-foreground">Aucun membre pour le moment</p>
          <p className="text-sm text-muted-foreground mt-1">
            Invitez votre premier membre pour commencer à collaborer.
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-white/10 bg-white/[0.02] overflow-hidden">
          {/* Desktop table */}
          <table className="hidden md:table w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 font-medium">Membre</th>
                <th className="px-4 py-3 font-medium">Rôle</th>
                <th className="px-4 py-3 font-medium">Statut</th>
                <th className="px-4 py-3 font-medium">Rejoint</th>
                <th className="px-4 py-3 font-medium">Dernière connexion</th>
                {canManage && <th className="px-4 py-3 font-medium text-right">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {members.map((m) => {
                const isSelf = m.user.id === currentUser.id;
                return (
                  <tr key={m.id} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-white/5 flex items-center justify-center text-xs font-bold text-gold shrink-0">
                          {m.user.name.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <div className="font-medium text-foreground truncate flex items-center gap-1">
                            {m.user.name}
                            {isSelf && (
                              <span className="text-[10px] uppercase tracking-wide text-muted-foreground/70">(vous)</span>
                            )}
                          </div>
                          <div className="text-[11px] text-muted-foreground truncate">{m.user.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="outline" className={`text-[10px] uppercase tracking-wide ${ROLE_BADGE_CLASS[m.role as OrgMemberRole] || ''}`}>
                        {ROLE_LABELS[m.role as OrgMemberRole] || m.role}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="outline" className={`text-[10px] uppercase tracking-wide ${STATUS_BADGE_CLASS[m.status as MemberStatus] || ''}`}>
                        {STATUS_LABELS[m.status as MemberStatus] || m.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">
                      {m.joinedAt ? formatDate(m.joinedAt) : <span className="italic">En attente</span>}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">
                      {m.user.lastLoginAt ? formatRelative(m.user.lastLoginAt) : <span className="italic">Jamais</span>}
                    </td>
                    {canManage && (
                      <td className="px-4 py-3 text-right">
                        <MemberActionsMenu
                          member={m}
                          isSelf={isSelf}
                          updating={updatingId === m.id}
                          onRoleChange={(role) => handleRoleChange(m, role)}
                          onRevoke={() => setRevokeTarget(m)}
                        />
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* Mobile cards */}
          <ul className="md:hidden divide-y divide-white/5">
            {members.map((m) => {
              const isSelf = m.user.id === currentUser.id;
              return (
                <li key={m.id} className="p-4 flex flex-col gap-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-full bg-white/5 flex items-center justify-center text-xs font-bold text-gold shrink-0">
                        {m.user.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div className="font-medium text-foreground truncate flex items-center gap-1">
                          {m.user.name}
                          {isSelf && <span className="text-[10px] uppercase text-muted-foreground/70">(vous)</span>}
                        </div>
                        <div className="text-[11px] text-muted-foreground truncate">{m.user.email}</div>
                      </div>
                    </div>
                    {canManage && (
                      <MemberActionsMenu
                        member={m}
                        isSelf={isSelf}
                        updating={updatingId === m.id}
                        onRoleChange={(role) => handleRoleChange(m, role)}
                        onRevoke={() => setRevokeTarget(m)}
                      />
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <Badge variant="outline" className={`text-[10px] uppercase ${ROLE_BADGE_CLASS[m.role as OrgMemberRole] || ''}`}>
                      {ROLE_LABELS[m.role as OrgMemberRole] || m.role}
                    </Badge>
                    <Badge variant="outline" className={`text-[10px] uppercase ${STATUS_BADGE_CLASS[m.status as MemberStatus] || ''}`}>
                      {STATUS_LABELS[m.status as MemberStatus] || m.status}
                    </Badge>
                    {m.user.lastLoginAt && (
                      <span className="text-muted-foreground">
                        Dernière connexion : {formatRelative(m.user.lastLoginAt)}
                      </span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* ─── Revoke confirmation dialog ─────────────────────────────── */}
      <AlertDialog open={!!revokeTarget} onOpenChange={(open) => !open && setRevokeTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Révoquer l&apos;accès de {revokeTarget?.user.name} ?</AlertDialogTitle>
            <AlertDialogDescription>
              {revokeTarget?.user.email} perdra immédiatement l&apos;accès à {org.name}. Cette action est réversible : vous pourrez le réinviter plus tard avec le même email.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={revoking}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleRevoke();
              }}
              disabled={revoking}
              className="bg-red-500 hover:bg-red-600 text-white"
            >
              {revoking ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Révocation…
                </>
              ) : (
                <>
                  <UserMinus className="w-4 h-4 mr-2" />
                  Révoquer
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── Member actions dropdown ──────────────────────────────────────────────────

function MemberActionsMenu({
  member,
  isSelf,
  updating,
  onRoleChange,
  onRevoke,
}: {
  member: MemberRow;
  isSelf: boolean;
  updating: boolean;
  onRoleChange: (role: OrgMemberRole) => void;
  onRevoke: () => void;
}) {
  return (
    <div className="inline-flex items-center justify-end">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-8 w-8" disabled={updating}>
            {updating ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <MoreVertical className="w-4 h-4" />
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>Changer le rôle</DropdownMenuLabel>
          <DropdownMenuItem
            disabled={member.role === 'ORG_ADMIN'}
            onClick={() => onRoleChange('ORG_ADMIN')}
          >
            <ShieldCheck className="w-3.5 h-3.5 mr-2" />
            Admin Organisation
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={member.role === 'ORG_MEMBER'}
            onClick={() => onRoleChange('ORG_MEMBER')}
          >
            <Users className="w-3.5 h-3.5 mr-2" />
            Membre
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={member.role === 'ORG_VIEWER'}
            onClick={() => onRoleChange('ORG_VIEWER')}
          >
            <Mail className="w-3.5 h-3.5 mr-2" />
            Observateur
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={onRevoke}
            disabled={isSelf || member.status === 'REVOKED'}
            className="text-red-400 focus:text-red-300 focus:bg-red-500/10"
          >
            <UserMinus className="w-3.5 h-3.5 mr-2" />
            {member.status === 'REVOKED' ? 'Déjà révoqué' : 'Révoquer l\'accès'}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

// ─── Date helpers ─────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

function formatRelative(iso: string): string {
  try {
    const d = new Date(iso).getTime();
    const now = Date.now();
    const diffMs = now - d;
    const min = Math.floor(diffMs / 60000);
    if (min < 1) return 'à l\'instant';
    if (min < 60) return `il y a ${min} min`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `il y a ${hr} h`;
    const day = Math.floor(hr / 24);
    if (day < 30) return `il y a ${day} j`;
    return formatDate(iso);
  } catch {
    return iso;
  }
}
