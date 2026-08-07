'use client';

// ══════════════════════════════════════════════════════════════════════════════
// GuestbookTab — Platform admin moderation UI for the wedding Livre d'Or (P4.1)
// ══════════════════════════════════════════════════════════════════════════════
//
// Props: { fetchWithAuth } — same prop signature as AuditTab / WeddingsTab
// (wired into the platform/admin/page.tsx shell via the same `usePlatformFetch`
// hook — orchestrator will add a `guestbook` TabId + a `<GuestbookTab .../>`
// render case in page.tsx when wiring this in).
//
// Layout:
//   1. Wedding selector (fetches /api/platform/weddings?limit=100 on mount).
//      Default = first wedding in the list.
//   2. Stats cards (total / pending / approved / rejected / average rating).
//   3. Filter toggle: PENDING (default) | APPROVED | REJECTED | ALL.
//   4. Entries table with author, message preview, rating stars, IP/UA
//      (truncated), created date, and per-row Approve / Reject / Delete buttons.
//   5. Pagination (20/page).
//
// All writes go through `fetchWithAuth` (auto-attaches credentials + CSRF).
// After each mutation, the stats + list are refreshed.
//
// Lucide icons: BookOpen, Check, X, Star, Trash2, MessageSquare, RefreshCw,
// Loader2, ChevronLeft, ChevronRight.
// ══════════════════════════════════════════════════════════════════════════════

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  BookOpen,
  Check,
  X,
  Star,
  Trash2,
  MessageSquare,
  RefreshCw,
  Loader2,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';

import type { FetchWithAuth } from '@/app/platform/admin/tabs/shared';

interface WeddingOption {
  id: string;
  slug: string;
  coupleLabel: string;
}

interface GuestbookEntry {
  id: string;
  weddingId: string;
  guestId: string | null;
  authorName: string;
  message: string;
  rating: number | null;
  approved: boolean;
  approvedById: string | null;
  approvedAt: string | null;
  rejectedAt: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
  updatedAt: string;
}

interface GuestbookStats {
  total: number;
  pending: number;
  approved: number;
  rejected: number;
  averageRating: number | null;
}

type FilterKey = 'pending' | 'approved' | 'rejected' | 'all';

const PAGE_SIZE = 20;

const FILTER_LABELS: Record<FilterKey, string> = {
  pending: 'En attente',
  approved: 'Approuvés',
  rejected: 'Rejetés',
  all: 'Tous',
};

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function ratingStars(rating: number | null): React.ReactNode {
  if (rating === null || rating === undefined) return null;
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          className={
            i < rating
              ? 'w-3.5 h-3.5 fill-amber-400 text-amber-400'
              : 'w-3.5 h-3.5 text-zinc-600'
          }
        />
      ))}
    </div>
  );
}

function statusBadge(e: GuestbookEntry): React.ReactNode {
  if (e.rejectedAt) {
    return (
      <Badge variant="outline" className="text-[10px] uppercase bg-red-500/15 text-red-400 border-red-500/30">
        Rejeté
      </Badge>
    );
  }
  if (e.approved) {
    return (
      <Badge variant="outline" className="text-[10px] uppercase bg-emerald-500/15 text-emerald-400 border-emerald-500/30">
        Approuvé
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-[10px] uppercase bg-amber-500/15 text-amber-400 border-amber-500/30">
      En attente
    </Badge>
  );
}

export function GuestbookTab({ fetchWithAuth }: { fetchWithAuth: FetchWithAuth }) {
  const [weddings, setWeddings] = useState<WeddingOption[]>([]);
  const [weddingsLoading, setWeddingsLoading] = useState(true);
  const [selectedWeddingId, setSelectedWeddingId] = useState<string>('');
  const [filter, setFilter] = useState<FilterKey>('pending');

  const [entries, setEntries] = useState<GuestbookEntry[]>([]);
  const [stats, setStats] = useState<GuestbookStats | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [statsLoading, setStatsLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null); // entryId being mutated
  const [viewEntry, setViewEntry] = useState<GuestbookEntry | null>(null);

  // ─── Load wedding options ─────────────────────────────────────────────────
  const loadWeddings = useCallback(async () => {
    setWeddingsLoading(true);
    try {
      const res = await fetchWithAuth('/api/platform/weddings?limit=100');
      if (!res) return; // fetchWithAuth returned null (401/403 already handled)
      const json = await res.json();
      const list: WeddingOption[] = (json.weddings || []).map(
        (w: {
          id: string;
          slug: string;
          coupleLabel: string;
          brideName?: string;
          groomName?: string;
        }) => ({
          id: w.id,
          slug: w.slug,
          coupleLabel:
            w.coupleLabel ||
            `${w.brideName || ''} & ${w.groomName || ''}`.trim() ||
            w.slug,
        })
      );
      setWeddings(list);
      if (list.length > 0 && !selectedWeddingId) {
        setSelectedWeddingId(list[0].id);
      }
    } catch {
      toast.error('Erreur lors du chargement des mariages');
      setWeddings([]);
    } finally {
      setWeddingsLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchWithAuth]);

  useEffect(() => {
    loadWeddings();
  }, [loadWeddings]);

  // ─── Load entries + stats for the selected wedding ────────────────────────
  const loadEntries = useCallback(async () => {
    if (!selectedWeddingId) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(PAGE_SIZE),
        admin: '1',
        filter,
      });
      const res = await fetchWithAuth(
        `/api/weddings/${selectedWeddingId}/guestbook?${params}`
      );
      if (!res) return;
      const json = await res.json();
      setEntries(json.entries || []);
      setTotal(json.total || 0);
    } catch {
      toast.error('Erreur lors du chargement des entrées');
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, [fetchWithAuth, selectedWeddingId, page, filter]);

  const loadStats = useCallback(async () => {
    if (!selectedWeddingId) return;
    setStatsLoading(true);
    try {
      const res = await fetchWithAuth(
        `/api/weddings/${selectedWeddingId}/guestbook/stats`
      );
      if (!res) return;
      const json = await res.json();
      setStats(json as GuestbookStats);
    } catch {
      setStats(null);
    } finally {
      setStatsLoading(false);
    }
  }, [fetchWithAuth, selectedWeddingId]);

  useEffect(() => {
    if (selectedWeddingId) {
      setPage(1);
      loadEntries();
      loadStats();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedWeddingId, filter]);

  useEffect(() => {
    if (selectedWeddingId) loadEntries();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  const refresh = () => {
    loadEntries();
    loadStats();
  };

  // ─── Mutations ────────────────────────────────────────────────────────────
  const moderate = async (entry: GuestbookEntry, action: 'approve' | 'reject') => {
    setBusy(entry.id);
    try {
      const res = await fetchWithAuth(
        `/api/weddings/${selectedWeddingId}/guestbook/${entry.id}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action }),
        }
      );
      if (!res) return;
      toast.success(
        action === 'approve'
          ? 'Message approuvé et publié'
          : 'Message rejeté'
      );
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setBusy(null);
    }
  };

  const remove = async (entry: GuestbookEntry) => {
    if (
      !confirm(
        `Supprimer définitivement le message de "${entry.authorName}" ? Cette action est irréversible.`
      )
    )
      return;
    setBusy(entry.id);
    try {
      const res = await fetchWithAuth(
        `/api/weddings/${selectedWeddingId}/guestbook/${entry.id}`,
        { method: 'DELETE' }
      );
      if (!res) return;
      toast.success('Message supprimé');
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setBusy(null);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-4 p-4 md:p-6">
      {/* Header + wedding selector */}
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-amber-400" />
            Livre d&apos;Or
          </h2>
          <p className="text-xs text-muted-foreground">
            Modérez les messages laissés par les visiteurs sur la page de chaque mariage.
          </p>
        </div>
        <div className="flex items-end gap-2">
          <div className="w-full md:w-[280px]">
            <Label htmlFor="gb-wedding" className="text-[10px] uppercase text-muted-foreground">
              Mariage
            </Label>
            <Select
              value={selectedWeddingId || '__none__'}
              onValueChange={(v) => setSelectedWeddingId(v === '__none__' ? '' : v)}
              disabled={weddingsLoading}
            >
              <SelectTrigger id="gb-wedding">
                <SelectValue
                  placeholder={weddingsLoading ? 'Chargement…' : 'Sélectionner un mariage'}
                />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">— Aucun —</SelectItem>
                {weddings.map((w) => (
                  <SelectItem key={w.id} value={w.id}>
                    {w.coupleLabel}{' '}
                    <span className="text-[10px] text-muted-foreground">({w.slug})</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button variant="outline" size="icon" onClick={refresh} disabled={!selectedWeddingId}>
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Stats cards */}
      {selectedWeddingId && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <StatCard
            label="Total"
            value={statsLoading ? null : stats?.total ?? 0}
            icon={<MessageSquare className="w-4 h-4" />}
          />
          <StatCard
            label="En attente"
            value={statsLoading ? null : stats?.pending ?? 0}
            icon={<Loader2 className="w-4 h-4" />}
            tone="amber"
          />
          <StatCard
            label="Approuvés"
            value={statsLoading ? null : stats?.approved ?? 0}
            icon={<Check className="w-4 h-4" />}
            tone="emerald"
          />
          <StatCard
            label="Rejetés"
            value={statsLoading ? null : stats?.rejected ?? 0}
            icon={<X className="w-4 h-4" />}
            tone="red"
          />
          <StatCard
            label="Note moyenne"
            value={statsLoading ? null : stats?.averageRating ?? '—'}
            icon={<Star className="w-4 h-4" />}
            tone="amber"
          />
        </div>
      )}

      {/* Filter + table */}
      {selectedWeddingId ? (
        <Card className="glass-card gold-border border-0">
          <CardContent className="p-4 space-y-3">
            <div className="flex gap-2 flex-wrap items-center">
              {(Object.keys(FILTER_LABELS) as FilterKey[]).map((k) => (
                <Button
                  key={k}
                  size="sm"
                  variant={filter === k ? 'default' : 'outline'}
                  onClick={() => setFilter(k)}
                >
                  {FILTER_LABELS[k]}
                </Button>
              ))}
              <div className="ml-auto text-xs text-muted-foreground">
                {total} entrée(s) · page {page}/{totalPages}
              </div>
            </div>

            {loading ? (
              <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-16 rounded-lg" />
                ))}
              </div>
            ) : entries.length === 0 ? (
              <div className="text-center py-12 text-sm text-muted-foreground">
                <MessageSquare className="w-10 h-10 mx-auto mb-2 opacity-50" />
                Aucune entrée {filter !== 'all' ? `dans la catégorie « ${FILTER_LABELS[filter]} »` : ''}.
              </div>
            ) : (
              <div className="rounded-lg border border-white/10 overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[180px]">Auteur</TableHead>
                      <TableHead>Message</TableHead>
                      <TableHead className="w-[100px]">Note</TableHead>
                      <TableHead className="w-[110px]">Statut</TableHead>
                      <TableHead className="w-[140px]">Date</TableHead>
                      <TableHead className="w-[200px]">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {entries.map((e) => (
                      <TableRow key={e.id}>
                        <TableCell>
                          <div className="font-medium truncate max-w-[160px]">
                            {e.authorName}
                          </div>
                          {e.ipAddress && (
                            <div className="text-[10px] font-mono text-muted-foreground truncate max-w-[160px]">
                              {e.ipAddress}
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          <button
                            type="button"
                            onClick={() => setViewEntry(e)}
                            className="text-left text-xs line-clamp-2 hover:text-amber-400 transition-colors"
                            title="Voir le détail"
                          >
                            {e.message}
                          </button>
                        </TableCell>
                        <TableCell>{ratingStars(e.rating)}</TableCell>
                        <TableCell>{statusBadge(e)}</TableCell>
                        <TableCell className="text-[11px] text-muted-foreground">
                          {formatDate(e.createdAt)}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            {!e.approved && !e.rejectedAt && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-8 px-2 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/10"
                                disabled={busy === e.id}
                                onClick={() => moderate(e, 'approve')}
                                title="Approuver"
                              >
                                <Check className="w-3.5 h-3.5" />
                              </Button>
                            )}
                            {!e.rejectedAt && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-8 px-2 text-amber-400 border-amber-500/30 hover:bg-amber-500/10"
                                disabled={busy === e.id}
                                onClick={() => moderate(e, 'reject')}
                                title="Rejeter"
                              >
                                <X className="w-3.5 h-3.5" />
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-8 px-2 text-red-400 hover:bg-red-500/10"
                              disabled={busy === e.id}
                              onClick={() => remove(e)}
                              title="Supprimer"
                            >
                              {busy === e.id ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <Trash2 className="w-3.5 h-3.5" />
                              )}
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            {/* Pagination */}
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">
                {total} entrée(s) au total · page {page}/{totalPages}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1 || loading}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  <ChevronLeft className="w-4 h-4 mr-1" />
                  Précédent
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages || loading}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  Suivant
                  <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card className="glass-card gold-border border-0">
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            Sélectionnez un mariage pour modérer son livre d&apos;or.
          </CardContent>
        </Card>
      )}

      {/* Entry detail modal */}
      <Dialog open={!!viewEntry} onOpenChange={(o) => { if (!o) setViewEntry(null) }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-amber-400" />
              Message de {viewEntry?.authorName}
            </DialogTitle>
          </DialogHeader>
          {viewEntry && (
            <div className="space-y-3 text-sm">
              <div className="flex items-center gap-3">
                {statusBadge(viewEntry)}
                {ratingStars(viewEntry.rating)}
                <span className="text-[11px] text-muted-foreground">
                  {formatDate(viewEntry.createdAt)}
                </span>
              </div>
              <div className="bg-black/30 border border-white/10 rounded p-3 whitespace-pre-wrap">
                {viewEntry.message}
              </div>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <div className="text-muted-foreground uppercase text-[10px]">Adresse IP</div>
                  <div className="font-mono">{viewEntry.ipAddress || '—'}</div>
                </div>
                <div>
                  <div className="text-muted-foreground uppercase text-[10px]">User-Agent</div>
                  <div className="font-mono truncate" title={viewEntry.userAgent ?? ''}>
                    {viewEntry.userAgent || '—'}
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground uppercase text-[10px]">Invité lié</div>
                  <div className="font-mono">{viewEntry.guestId || 'anonyme'}</div>
                </div>
                <div>
                  <div className="text-muted-foreground uppercase text-[10px]">Approuvé par</div>
                  <div className="font-mono">{viewEntry.approvedById || '—'}</div>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            {viewEntry && !viewEntry.approved && !viewEntry.rejectedAt && (
              <Button
                className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/25"
                variant="outline"
                disabled={busy === viewEntry.id}
                onClick={() => {
                  moderate(viewEntry, 'approve');
                  setViewEntry(null);
                }}
              >
                <Check className="w-4 h-4 mr-2" />
                Approuver
              </Button>
            )}
            {viewEntry && !viewEntry.rejectedAt && (
              <Button
                variant="outline"
                className="text-amber-400 border-amber-500/30 hover:bg-amber-500/10"
                disabled={busy === viewEntry.id}
                onClick={() => {
                  moderate(viewEntry, 'reject');
                  setViewEntry(null);
                }}
              >
                <X className="w-4 h-4 mr-2" />
                Rejeter
              </Button>
            )}
            <Button variant="outline" onClick={() => setViewEntry(null)}>
              Fermer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Small stat card sub-component ───────────────────────────────────────────

function StatCard({
  label,
  value,
  icon,
  tone = 'zinc',
}: {
  label: string;
  value: number | string | null;
  icon: React.ReactNode;
  tone?: 'zinc' | 'amber' | 'emerald' | 'red';
}) {
  const toneClass: Record<string, string> = {
    zinc: 'text-zinc-300',
    amber: 'text-amber-400',
    emerald: 'text-emerald-400',
    red: 'text-red-400',
  };
  return (
    <Card className="glass-card gold-border border-0">
      <CardContent className="p-3 flex items-center gap-3">
        <div className={`${toneClass[tone]} opacity-80`}>{icon}</div>
        <div>
          <div className="text-[10px] uppercase text-muted-foreground">{label}</div>
          <div className={`text-xl font-bold ${toneClass[tone]}`}>
            {value === null ? <Skeleton className="h-6 w-12" /> : value}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
