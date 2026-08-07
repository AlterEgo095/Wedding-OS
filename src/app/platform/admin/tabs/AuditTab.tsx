'use client';

// ════════════════════════════════════════════════════════════════════════════
// AuditTab — P3.12 (Mission 6.0 Phase 3) — full rewrite
// ════════════════════════════════════════════════════════════════════════════
//
// Replaces the "faux ami" version of AuditTab (which only consumed the
// `recentActivity` field of /api/platform/dashboard — last 20 entries, no
// filters, no pagination, no export).
//
// Now a real audit log explorer backed by /api/platform/audit:
//   - Filter bar (sticky): user, wedding, action (with prefix-wildcard
//     support e.g. `guest.*`), date range, full-text search on details.
//   - Results table: timestamp, user (email), action (color-coded badge by
//     category), wedding (coupleLabel, clickable → wedding detail), IP
//     address, user-agent (truncated w/ tooltip), details (truncated →
//     expand in modal showing full JSON / text).
//   - Pagination: prev/next + "page X of Y" + items-per-page selector
//     (25/50/100/200).
//   - Sort: toggle timestamp asc/desc on the column header.
//   - Export: CSV + JSON buttons (calls /api/platform/audit?export=... with
//     current filters → triggers browser download).
//   - Auto-refresh: toggle (default OFF, 30s interval when ON).
//   - Loading skeleton / empty state / error state with retry.
//
// Component shape (props) is unchanged from the previous version so the
// existing page.tsx wiring (`<AuditTab fetchWithAuth={fetchWithAuth} />`)
// keeps working — no edits needed in page.tsx.

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
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
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

import Link from 'next/link';
import {
  ScrollText,
  Filter,
  Download,
  Search,
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  RefreshCw,
  X,
  Loader2,
  ExternalLink,
  AlertCircle,
  Clock,
} from 'lucide-react';

import { formatDateTime } from '@/lib/format';
import { type FetchWithAuth } from './shared';

// ════════════════════════════════════════════════════════════════════════════
// Types
// ════════════════════════════════════════════════════════════════════════════

interface AuditEntry {
  id: string;
  action: string;
  details: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
  weddingId: string | null;
  userId: string | null;
  user: { id: string; email: string; name: string; role: string | null } | null;
  wedding: { id: string; slug: string; coupleLabel: string } | null;
}

interface AuditListResponse {
  entries: AuditEntry[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  filters: Record<string, unknown>;
}

interface UserOption {
  id: string;
  email: string;
  name: string;
}

interface WeddingOption {
  id: string;
  slug: string;
  coupleLabel: string;
}

interface FilterState {
  userId: string;
  weddingId: string;
  action: string;
  dateFrom: string;
  dateTo: string;
  search: string;
}

const EMPTY_FILTERS: FilterState = {
  userId: '',
  weddingId: '',
  action: '',
  dateFrom: '',
  dateTo: '',
  search: '',
};

const PAGE_SIZE_OPTIONS = [25, 50, 100, 200] as const;
const DEFAULT_PAGE_SIZE = 50;
const AUTO_REFRESH_INTERVAL_MS = 30_000;

// Common actions offered in the action-filter datalist.
const COMMON_ACTIONS = [
  'login',
  'logout',
  'wedding.create',
  'wedding.update',
  'wedding.delete',
  'guest.create',
  'guest.update',
  'guest.delete',
  'guest.import',
  'billing.payment',
  'billing.invoice',
  'platform.login',
  'platform.logout',
  'auth.failed',
  'password.reset',
  // Wildcard examples surfaced in the dropdown so operators discover the feature.
  'wedding.*',
  'guest.*',
  'billing.*',
];

// ════════════════════════════════════════════════════════════════════════════
// Action category → badge color
// ════════════════════════════════════════════════════════════════════════════

type ActionCategory = 'auth' | 'wedding' | 'guest' | 'billing' | 'system';

const CATEGORY_STYLE: Record<ActionCategory, string> = {
  auth: 'bg-sky-500/15 text-sky-400 border-sky-500/30',
  wedding: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  guest: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  billing: 'bg-violet-500/15 text-violet-400 border-violet-500/30',
  system: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30',
};

function categorizeAction(action: string): ActionCategory {
  const a = action.toLowerCase();
  if (
    a.startsWith('login') ||
    a.startsWith('logout') ||
    a.startsWith('auth') ||
    a.startsWith('password') ||
    a.startsWith('2fa') ||
    a.startsWith('platform.login') ||
    a.startsWith('platform.logout')
  ) {
    return 'auth';
  }
  if (a.startsWith('wedding')) return 'wedding';
  if (a.startsWith('guest') || a.startsWith('rsvp') || a.startsWith('checkin')) return 'guest';
  if (
    a.startsWith('billing') ||
    a.startsWith('payment') ||
    a.startsWith('invoice') ||
    a.startsWith('subscription') ||
    a.startsWith('credit') ||
    a.startsWith('order')
  ) {
    return 'billing';
  }
  return 'system';
}

// ════════════════════════════════════════════════════════════════════════════
// Component
// ════════════════════════════════════════════════════════════════════════════

export function AuditTab({
  fetchWithAuth,
}: {
  fetchWithAuth: (url: string, init?: RequestInit) => Promise<Response | null>;
}) {
  // ─── Data state ──
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState<number>(DEFAULT_PAGE_SIZE);
  const [sortBy, setSortBy] = useState<'createdAt' | 'action'>('createdAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // ─── Filter state (live = applied; draft = being edited before "Apply") ──
  const [appliedFilters, setAppliedFilters] = useState<FilterState>(EMPTY_FILTERS);
  const [draftFilters, setDraftFilters] = useState<FilterState>(EMPTY_FILTERS);

  // ─── Async state ──
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState<'csv' | 'json' | null>(null);

  // ─── Dropdown options ──
  const [userOptions, setUserOptions] = useState<UserOption[]>([]);
  const [weddingOptions, setWeddingOptions] = useState<WeddingOption[]>([]);

  // ─── UI state ──
  const [detailEntry, setDetailEntry] = useState<AuditEntry | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(false);

  // Refs to avoid stale closures inside the auto-refresh interval.
  const appliedFiltersRef = useRef(appliedFilters);
  appliedFiltersRef.current = appliedFilters;
  const pageRef = useRef(page);
  pageRef.current = page;
  const limitRef = useRef(limit);
  limitRef.current = limit;
  const sortByRef = useRef(sortBy);
  sortByRef.current = sortBy;
  const sortOrderRef = useRef(sortOrder);
  sortOrderRef.current = sortOrder;

  // ═════════════════════════════════════════════════════════════════════════
  // Data loading
  // ═════════════════════════════════════════════════════════════════════════

  const buildQuery = useCallback(
    (
      filters: FilterState,
      targetPage: number,
      targetLimit: number,
      sb: 'createdAt' | 'action',
      so: 'asc' | 'desc'
    ): string => {
      const params = new URLSearchParams({
        page: String(targetPage),
        limit: String(targetLimit),
        sortBy: sb,
        sortOrder: so,
      });
      if (filters.userId) params.set('userId', filters.userId);
      if (filters.weddingId) params.set('weddingId', filters.weddingId);
      if (filters.action) params.set('action', filters.action);
      if (filters.dateFrom) params.set('dateFrom', filters.dateFrom);
      if (filters.dateTo) params.set('dateTo', filters.dateTo);
      if (filters.search) params.set('search', filters.search);
      return params.toString();
    },
    []
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const query = buildQuery(
      appliedFiltersRef.current,
      pageRef.current,
      limitRef.current,
      sortByRef.current,
      sortOrderRef.current
    );
    const res = await fetchWithAuth(`/api/platform/audit?${query}`);
    if (!res) {
      setLoading(false);
      setError('Échec de la requête');
      return;
    }
    try {
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error || `HTTP ${res.status}`);
      }
      const json = (await res.json()) as AuditListResponse;
      setEntries(json.entries || []);
      setTotal(json.total || 0);
      setTotalPages(json.totalPages || 1);
      setPage(json.page || pageRef.current);
      setLimit(json.limit || limitRef.current);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Réponse invalide du serveur';
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [fetchWithAuth, buildQuery]);

  // Initial load + reload on filter / page / sort changes.
  useEffect(() => {
    load();
  }, [appliedFilters, page, limit, sortBy, sortOrder, load]);

  // ─── Fetch dropdown options (users + weddings) on mount ──
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [usersRes, weddingsRes] = await Promise.all([
          fetchWithAuth('/api/platform/users?limit=100'),
          fetchWithAuth('/api/platform/weddings?limit=100'),
        ]);
        if (cancelled) return;

        if (usersRes && usersRes.ok) {
          const u = (await usersRes.json()) as {
            users: Array<{ id: string; email: string; name: string }>;
          };
          if (!cancelled) setUserOptions(u.users || []);
        }
        if (weddingsRes && weddingsRes.ok) {
          const w = (await weddingsRes.json()) as {
            weddings: Array<{ id: string; slug: string; coupleLabel: string }>;
          };
          if (!cancelled) setWeddingOptions(w.weddings || []);
        }
      } catch {
        // Non-fatal — the dropdowns just stay empty.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchWithAuth]);

  // ─── Auto-refresh ──
  useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(() => {
      load();
    }, AUTO_REFRESH_INTERVAL_MS);
    return () => clearInterval(id);
  }, [autoRefresh, load]);

  // ═════════════════════════════════════════════════════════════════════════
  // Filter handlers
  // ═════════════════════════════════════════════════════════════════════════

  const updateDraft = (patch: Partial<FilterState>) => {
    setDraftFilters((prev) => ({ ...prev, ...patch }));
  };

  const applyFilters = () => {
    setAppliedFilters(draftFilters);
    setPage(1);
  };

  const clearFilters = () => {
    setDraftFilters(EMPTY_FILTERS);
    setAppliedFilters(EMPTY_FILTERS);
    setPage(1);
  };

  const hasActiveFilters = useMemo(() => {
    const f = appliedFilters;
    return Boolean(
      f.userId || f.weddingId || f.action || f.dateFrom || f.dateTo || f.search
    );
  }, [appliedFilters]);

  const toggleTimestampSort = () => {
    setSortBy('createdAt');
    setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
  };

  // ═════════════════════════════════════════════════════════════════════════
  // Export
  // ═════════════════════════════════════════════════════════════════════════

  const handleExport = async (format: 'csv' | 'json') => {
    setExporting(format);
    try {
      const query = buildQuery(appliedFilters, 1, 1, sortBy, sortOrder);
      // Strip page/limit/sort from the export URL — exports return the full set.
      const params = new URLSearchParams(query);
      params.delete('page');
      params.delete('limit');
      params.set('export', format);
      const url = `/api/platform/audit?${params.toString()}`;

      const res = await fetchWithAuth(url);
      if (!res || !res.ok) {
        const body = (await res?.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error || 'Export failed');
      }
      const blob = await res.blob();
      // Trigger browser download.
      const ts = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `audit-export-${ts}.${format}`;
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(objectUrl);
      toast.success(`Export ${format.toUpperCase()} téléchargé`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Échec de l\'export';
      toast.error(msg);
    } finally {
      setExporting(null);
    }
  };

  // ═════════════════════════════════════════════════════════════════════════
  // Render helpers
  // ═════════════════════════════════════════════════════════════════════════

  const truncate = (s: string | null, n: number): string => {
    if (!s) return '—';
    return s.length > n ? s.slice(0, n) + '…' : s;
  };

  // ═════════════════════════════════════════════════════════════════════════
  // Render
  // ═════════════════════════════════════════════════════════════════════════

  return (
    <div className="space-y-4 p-4 md:p-6">
      {/* ── Header ── */}
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <ScrollText className="w-5 h-5 text-gold" />
            Journal d&apos;audit
          </h2>
          <p className="text-sm text-muted-foreground">
            Explorateur complet du journal d&apos;audit — filtres, pagination, export CSV/JSON
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Clock className="w-3.5 h-3.5" />
            <span>Auto-rafraîchissement</span>
            <Switch checked={autoRefresh} onCheckedChange={setAutoRefresh} aria-label="Auto-refresh toggle" />
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => load()}
            disabled={loading}
            className="gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Rafraîchir
          </Button>
        </div>
      </div>

      {/* ── Filter bar (sticky) ── */}
      <Card className="glass-card gold-border border-0 sticky top-0 z-20">
        <CardContent className="p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
            {/* User selector */}
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Utilisateur</Label>
              <Select
                value={draftFilters.userId}
                onValueChange={(v) => updateDraft({ userId: v === '__all__' ? '' : v })}
              >
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="Tous les utilisateurs" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Tous les utilisateurs</SelectItem>
                  {userOptions.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Wedding selector */}
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Mariage</Label>
              <Select
                value={draftFilters.weddingId}
                onValueChange={(v) => updateDraft({ weddingId: v === '__all__' ? '' : v })}
              >
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="Tous les mariages" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Tous les mariages</SelectItem>
                  {weddingOptions.map((w) => (
                    <SelectItem key={w.id} value={w.id}>
                      {w.coupleLabel}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Action filter with autocomplete */}
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Action</Label>
              <Input
                list="audit-action-list"
                placeholder="ex : guest.*"
                value={draftFilters.action}
                onChange={(e) => updateDraft({ action: e.target.value })}
                className="h-9 text-sm"
              />
              <datalist id="audit-action-list">
                {COMMON_ACTIONS.map((a) => (
                  <option key={a} value={a} />
                ))}
              </datalist>
            </div>

            {/* Date from */}
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Date de</Label>
              <Input
                type="date"
                value={draftFilters.dateFrom}
                onChange={(e) => updateDraft({ dateFrom: e.target.value })}
                className="h-9 text-sm"
              />
            </div>

            {/* Date to */}
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Date jusqu&apos;à</Label>
              <Input
                type="date"
                value={draftFilters.dateTo}
                onChange={(e) => updateDraft({ dateTo: e.target.value })}
                className="h-9 text-sm"
              />
            </div>

            {/* Search */}
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Recherche (détails)</Label>
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="contenu…"
                  value={draftFilters.search}
                  onChange={(e) => updateDraft({ search: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') applyFilters();
                  }}
                  className="h-9 text-sm pl-8"
                />
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap items-center justify-between gap-2 mt-3 pt-3 border-t border-white/5">
            <div className="flex items-center gap-2">
              <Button size="sm" onClick={applyFilters} className="gap-1.5">
                <Filter className="w-3.5 h-3.5" />
                Appliquer les filtres
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={clearFilters}
                disabled={!hasActiveFilters}
                className="gap-1.5"
              >
                <X className="w-3.5 h-3.5" />
                Réinitialiser
              </Button>
              {hasActiveFilters && (
                <Badge variant="outline" className="text-[10px] bg-gold/10 text-gold border-gold/30">
                  {total} résultat{total > 1 ? 's' : ''}
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleExport('csv')}
                disabled={exporting !== null || total === 0}
                className="gap-1.5"
              >
                {exporting === 'csv' ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Download className="w-3.5 h-3.5" />
                )}
                Export CSV
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleExport('json')}
                disabled={exporting !== null || total === 0}
                className="gap-1.5"
              >
                {exporting === 'json' ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Download className="w-3.5 h-3.5" />
                )}
                Export JSON
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Error state ── */}
      {error && !loading && (
        <Card className="glass-card gold-border border-0">
          <CardContent className="p-8 flex flex-col items-center justify-center gap-3 text-center">
            <AlertCircle className="w-10 h-10 text-red-400" />
            <div>
              <p className="text-sm font-medium">Échec du chargement</p>
              <p className="text-xs text-muted-foreground mt-1">{error}</p>
            </div>
            <Button size="sm" variant="outline" onClick={() => load()} className="gap-1.5">
              <RefreshCw className="w-3.5 h-3.5" />
              Réessayer
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ── Results table ── */}
      {!error && (
        <Card className="glass-card gold-border border-0">
          <CardContent className="p-0">
            <div className="max-h-[60vh] overflow-auto custom-scrollbar">
              <Table>
                <TableHeader className="sticky top-0 bg-background/95 backdrop-blur z-10">
                  <TableRow className="border-white/10 hover:bg-transparent">
                    <TableHead className="text-xs w-44">
                      <button
                        type="button"
                        onClick={toggleTimestampSort}
                        className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
                      >
                        Horodatage
                        {sortBy === 'createdAt' ? (
                          sortOrder === 'asc' ? (
                            <ArrowUp className="w-3 h-3 text-gold" />
                          ) : (
                            <ArrowDown className="w-3 h-3 text-gold" />
                          )
                        ) : (
                          <ArrowUpDown className="w-3 h-3 opacity-50" />
                        )}
                      </button>
                    </TableHead>
                    <TableHead className="text-xs">Utilisateur</TableHead>
                    <TableHead className="text-xs">Action</TableHead>
                    <TableHead className="text-xs hidden lg:table-cell">Mariage</TableHead>
                    <TableHead className="text-xs hidden md:table-cell">IP</TableHead>
                    <TableHead className="text-xs hidden xl:table-cell">User-Agent</TableHead>
                    <TableHead className="text-xs">Détails</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    Array.from({ length: 8 }).map((_, i) => (
                      <TableRow key={`sk-${i}`} className="border-white/5">
                        {Array.from({ length: 7 }).map((__, j) => (
                          <TableCell key={`skc-${i}-${j}`}>
                            <Skeleton className="h-5 w-full rounded" />
                          </TableCell>
                        ))}
                      </TableRow>
                    ))
                  ) : entries.length === 0 ? (
                    <TableRow className="border-white/5 hover:bg-transparent">
                      <TableCell colSpan={7} className="py-16 text-center text-muted-foreground">
                        <ScrollText className="w-10 h-10 mx-auto mb-2 opacity-30" />
                        <p className="text-sm font-medium">Aucune entrée d&apos;audit</p>
                        <p className="text-xs mt-1">
                          {hasActiveFilters
                            ? "Aucune entrée ne correspond à vos filtres"
                            : 'Le journal d\'audit est vide'}
                        </p>
                        {hasActiveFilters && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={clearFilters}
                            className="mt-3 gap-1.5"
                          >
                            <X className="w-3.5 h-3.5" />
                            Réinitialiser les filtres
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ) : (
                    entries.map((log) => {
                      const category = categorizeAction(log.action);
                      return (
                        <TableRow
                          key={log.id}
                          className="border-white/5 hover:bg-white/5 transition-colors align-top"
                        >
                          {/* Timestamp */}
                          <TableCell className="text-xs text-muted-foreground whitespace-nowrap font-mono">
                            {formatDateTime(log.createdAt)}
                          </TableCell>

                          {/* User */}
                          <TableCell>
                            {log.user ? (
                              <div className="flex flex-col">
                                <span className="text-sm font-medium truncate max-w-[180px]">
                                  {log.user.name || log.user.email}
                                </span>
                                <span className="text-xs text-muted-foreground truncate max-w-[180px]">
                                  {log.user.email}
                                </span>
                              </div>
                            ) : (
                              <span className="text-xs text-muted-foreground">Système</span>
                            )}
                          </TableCell>

                          {/* Action */}
                          <TableCell>
                            <Badge
                              variant="outline"
                              className={`text-[10px] uppercase tracking-wide ${CATEGORY_STYLE[category]}`}
                            >
                              {log.action}
                            </Badge>
                          </TableCell>

                          {/* Wedding */}
                          <TableCell className="hidden lg:table-cell text-sm">
                            {log.wedding ? (
                              <Link
                                href={`/w/${log.wedding.slug}`}
                                target="_blank"
                                className="inline-flex items-center gap-1 text-gold/90 hover:text-gold transition-colors"
                              >
                                <span className="truncate max-w-[160px]">
                                  {log.wedding.coupleLabel}
                                </span>
                                <ExternalLink className="w-3 h-3 flex-shrink-0" />
                              </Link>
                            ) : log.weddingId ? (
                              <span className="font-mono text-[10px] text-muted-foreground/70">
                                #{log.weddingId.slice(-6)}
                              </span>
                            ) : (
                              <span className="text-gold/70 text-xs">Plateforme</span>
                            )}
                          </TableCell>

                          {/* IP */}
                          <TableCell className="hidden md:table-cell text-xs font-mono text-muted-foreground">
                            {log.ipAddress || '—'}
                          </TableCell>

                          {/* User Agent */}
                          <TableCell className="hidden xl:table-cell text-xs text-muted-foreground max-w-[200px]">
                            <TooltipProvider delayDuration={200}>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="cursor-help truncate inline-block max-w-[200px]">
                                    {truncate(log.userAgent, 40)}
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent side="top" className="max-w-md">
                                  <p className="text-xs break-words">{log.userAgent || '—'}</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </TableCell>

                          {/* Details */}
                          <TableCell className="text-xs text-muted-foreground max-w-xs">
                            <button
                              type="button"
                              onClick={() => setDetailEntry(log)}
                              className="text-left hover:text-foreground transition-colors cursor-pointer"
                              title="Cliquez pour voir les détails complets"
                            >
                              {truncate(log.details, 60)}
                            </button>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>

            {/* ── Pagination ── */}
            {!loading && entries.length > 0 && (
              <>
                <Separator className="bg-white/5" />
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between p-3">
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span>
                      {total} entrée{total > 1 ? 's' : ''} • page {page} / {totalPages}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <span>par page</span>
                      <Select
                        value={String(limit)}
                        onValueChange={(v) => {
                          setLimit(Number(v));
                          setPage(1);
                        }}
                      >
                        <SelectTrigger className="h-7 w-[72px] text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {PAGE_SIZE_OPTIONS.map((n) => (
                            <SelectItem key={n} value={String(n)}>
                              {n}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={page <= 1 || loading}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      className="gap-1.5"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                      Précédent
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={page >= totalPages || loading}
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      className="gap-1.5"
                    >
                      Suivant
                      <ChevronRight className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Details modal ── */}
      <Dialog open={detailEntry !== null} onOpenChange={(open) => !open && setDetailEntry(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ScrollText className="w-4 h-4 text-gold" />
              Détail de l&apos;entrée d&apos;audit
            </DialogTitle>
          </DialogHeader>
          {detailEntry && (
            <div className="space-y-3 max-h-[60vh] overflow-y-auto">
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <Label className="text-muted-foreground">Horodatage</Label>
                  <p className="font-mono mt-1">{formatDateTime(detailEntry.createdAt)}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Action</Label>
                  <div className="mt-1">
                    <Badge
                      variant="outline"
                      className={`text-[10px] uppercase tracking-wide ${
                        CATEGORY_STYLE[categorizeAction(detailEntry.action)]
                      }`}
                    >
                      {detailEntry.action}
                    </Badge>
                  </div>
                </div>
                <div>
                  <Label className="text-muted-foreground">Utilisateur</Label>
                  <div className="mt-1">
                    {detailEntry.user ? (
                      <div className="flex flex-col">
                        <span className="text-sm font-medium">{detailEntry.user.name || '—'}</span>
                        <span className="text-xs text-muted-foreground">{detailEntry.user.email}</span>
                      </div>
                    ) : (
                      <span className="text-muted-foreground">Système</span>
                    )}
                  </div>
                </div>
                <div>
                  <Label className="text-muted-foreground">Mariage</Label>
                  <div className="mt-1">
                    {detailEntry.wedding ? (
                      <Link
                        href={`/w/${detailEntry.wedding.slug}`}
                        target="_blank"
                        className="inline-flex items-center gap-1 text-gold hover:underline"
                      >
                        {detailEntry.wedding.coupleLabel}
                        <ExternalLink className="w-3 h-3" />
                      </Link>
                    ) : detailEntry.weddingId ? (
                      <span className="font-mono text-[10px] text-muted-foreground">
                        #{detailEntry.weddingId.slice(-6)}
                      </span>
                    ) : (
                      <span className="text-gold/70 text-xs">Plateforme</span>
                    )}
                  </div>
                </div>
                <div>
                  <Label className="text-muted-foreground">Adresse IP</Label>
                  <p className="font-mono mt-1">{detailEntry.ipAddress || '—'}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">ID entrée</Label>
                  <p className="font-mono mt-1 text-[10px]">{detailEntry.id}</p>
                </div>
              </div>

              <Separator className="bg-white/5" />

              <div>
                <Label className="text-muted-foreground">User-Agent</Label>
                <p className="text-xs mt-1 break-words font-mono bg-black/30 p-2 rounded">
                  {detailEntry.userAgent || '—'}
                </p>
              </div>

              <div>
                <Label className="text-muted-foreground">Détails</Label>
                <pre className="text-xs mt-1 whitespace-pre-wrap break-words bg-black/30 p-3 rounded font-mono max-h-64 overflow-y-auto">
                  {detailEntry.details || '—'}
                </pre>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDetailEntry(null)}>
              Fermer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
