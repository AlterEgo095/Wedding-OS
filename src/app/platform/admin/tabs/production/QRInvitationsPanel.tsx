'use client';

// ════════════════════════════════════════════════════════════════════════════
// QRInvitationsPanel — Super Admin Production Studio (P3.8).
// Cross-tenant supervision of QR codes + invitations across ALL weddings.
// Uses /api/platform/qr/stats + /api/platform/invitations/stats.
// ════════════════════════════════════════════════════════════════════════════

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  QrCode,
  Mail,
  MessageSquare,
  Send,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Link as LinkIcon,
  Phone,
  Smartphone,
} from 'lucide-react';

// ─── Types ──────────────────────────────────────────────────────────────────

interface QrSummary {
  total: number;
  byStatus: { USED: number; UNUSED: number; EXPIRED: number };
  byChannel: Record<string, number>;
  topWeddings: Array<{
    weddingId: string;
    coupleLabel: string;
    slug: string;
    qrCount: number;
    usedCount: number;
    usageRate: number;
  }>;
}

interface QrEvent {
  id: string;
  weddingId: string;
  weddingLabel: string;
  guestId: string | null;
  guestLabel: string;
  action: string;
  details: string | null;
  userAgent: string | null;
  ipAddress: string | null;
  createdAt: string;
}

interface QrStatsResponse {
  summary: QrSummary;
  recentEvents: QrEvent[];
  total: number;
  page: number;
  limit: number;
}

interface InvitationSummary {
  total: number;
  byStatus: Record<string, number>;
  byChannel: Record<string, number>;
  successRate: number;
  topWeddings: Array<{
    weddingId: string;
    coupleLabel: string;
    slug: string;
    invitationsSent: number;
    delivered: number;
    read: number;
    failed: number;
    successRate: number;
  }>;
}

interface FailedDelivery {
  id: string;
  weddingId: string;
  weddingLabel: string;
  guestId: string;
  guestLabel: string;
  channel: string;
  destination: string;
  lastError: string | null;
  attemptCount: number;
  createdAt: string;
}

interface InvitationStatsResponse {
  summary: InvitationSummary;
  failedDeliveries: FailedDelivery[];
  total: number;
  page: number;
  limit: number;
}

interface WeddingOption {
  id: string;
  coupleLabel: string;
  slug: string;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const QR_STATUS_BADGE: Record<string, string> = {
  USED: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  UNUSED: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  EXPIRED: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30',
};

const INVITATION_STATUS_BADGE: Record<string, string> = {
  PENDING: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30',
  SENT: 'bg-sky-500/15 text-sky-400 border-sky-500/30',
  DELIVERED: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  READ: 'bg-green-500/15 text-green-400 border-green-500/30',
  FAILED: 'bg-red-500/15 text-red-400 border-red-500/30',
  CANCELLED: 'bg-zinc-700/15 text-zinc-500 border-zinc-700/30',
};

const CHANNEL_ICON: Record<string, typeof QrCode> = {
  LINK: LinkIcon,
  QR: QrCode,
  EMAIL: Mail,
  SMS: MessageSquare,
  WHATSAPP: Smartphone,
};

const CHANNEL_LABEL: Record<string, string> = {
  LINK: 'Lien',
  QR: 'QR',
  EMAIL: 'Email',
  SMS: 'SMS',
  WHATSAPP: 'WhatsApp',
};

function successRateColor(rate: number): string {
  if (rate >= 80) return 'text-emerald-400';
  if (rate >= 60) return 'text-amber-400';
  return 'text-red-400';
}

function successRateBg(rate: number): string {
  if (rate >= 80) return 'from-emerald-500/20 to-emerald-500/5 border-emerald-500/30';
  if (rate >= 60) return 'from-amber-500/20 to-amber-500/5 border-amber-500/30';
  return 'from-red-500/20 to-red-500/5 border-red-500/30';
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function buildParams(
  base: Record<string, string | number>,
  weddingId: string,
  status: string,
  channel: string,
  dateFrom: string,
  dateTo: string,
  page: number,
  limit: number
): URLSearchParams {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(base)) p.set(k, String(v));
  if (weddingId) p.set('weddingId', weddingId);
  if (status && status !== 'ALL') p.set('status', status);
  if (channel && channel !== 'ALL') p.set('channel', channel);
  if (dateFrom) p.set('dateFrom', dateFrom);
  if (dateTo) p.set('dateTo', dateTo);
  p.set('page', String(page));
  p.set('limit', String(limit));
  return p;
}

// ─── Channel breakdown bars ─────────────────────────────────────────────────

function ChannelBreakdown({ byChannel }: { byChannel: Record<string, number> }) {
  const total = Object.values(byChannel).reduce((a, b) => a + b, 0);
  const entries = Object.entries(byChannel).filter(([, v]) => v > 0);
  if (total === 0) {
    return (
      <p className="text-xs text-muted-foreground italic">
        Aucune donnée de canal.
      </p>
    );
  }
  return (
    <div className="space-y-2">
      {entries.length === 0 ? (
        <p className="text-xs text-muted-foreground italic">Aucun canal enregistré.</p>
      ) : (
        entries
          .sort((a, b) => b[1] - a[1])
          .map(([ch, count]) => {
            const pct = total > 0 ? (count / total) * 100 : 0;
            const Icon = CHANNEL_ICON[ch] || MessageSquare;
            return (
              <div key={ch} className="flex items-center gap-2 text-xs">
                <Icon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                <span className="w-20 text-muted-foreground">
                  {CHANNEL_LABEL[ch] || ch}
                </span>
                <div className="flex-1 h-2 rounded-full bg-white/5 overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-amber-500/60 to-amber-400/80"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="w-12 text-right tabular-nums text-muted-foreground">
                  {count}
                </span>
                <span className="w-12 text-right tabular-nums text-muted-foreground/60">
                  {pct.toFixed(1)}%
                </span>
              </div>
            );
          })
      )}
    </div>
  );
}

// ─── Summary card ───────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  icon: Icon,
  tone = 'default',
}: {
  label: string;
  value: number | string;
  icon: typeof QrCode;
  tone?: 'default' | 'success' | 'warning' | 'danger';
}) {
  const toneClasses = {
    default: 'text-foreground',
    success: 'text-emerald-400',
    warning: 'text-amber-400',
    danger: 'text-red-400',
  }[tone];
  return (
    <Card className="glass-card gold-border border-0">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-1">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
              {label}
            </p>
            <p className={`text-2xl font-bold tabular-nums ${toneClasses}`}>
              {value}
            </p>
          </div>
          <Icon className="w-5 h-5 text-muted-foreground/60 shrink-0" />
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Filters bar ────────────────────────────────────────────────────────────

function FiltersBar({
  weddingId,
  setWeddingId,
  status,
  setStatus,
  channel,
  setChannel,
  dateFrom,
  setDateFrom,
  dateTo,
  setDateTo,
  statusOptions,
  weddings,
  onReset,
}: {
  weddingId: string;
  setWeddingId: (v: string) => void;
  status: string;
  setStatus: (v: string) => void;
  channel: string;
  setChannel: (v: string) => void;
  dateFrom: string;
  setDateFrom: (v: string) => void;
  dateTo: string;
  setDateTo: (v: string) => void;
  statusOptions: Array<{ value: string; label: string }>;
  weddings: WeddingOption[];
  onReset: () => void;
}) {
  return (
    <div className="flex flex-wrap gap-2 items-end">
      <div className="flex flex-col gap-1">
        <Label className="text-[10px] uppercase text-muted-foreground">Mariage</Label>
        <Select value={weddingId || 'ALL'} onValueChange={(v) => setWeddingId(v === 'ALL' ? '' : v)}>
          <SelectTrigger className="w-[220px]">
            <SelectValue placeholder="Tous les mariages" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Tous les mariages</SelectItem>
            {weddings.map((w) => (
              <SelectItem key={w.id} value={w.id}>
                {w.coupleLabel || w.slug}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-1">
        <Label className="text-[10px] uppercase text-muted-foreground">Statut</Label>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Statut" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Tous</SelectItem>
            {statusOptions.map((s) => (
              <SelectItem key={s.value} value={s.value}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-1">
        <Label className="text-[10px] uppercase text-muted-foreground">Canal</Label>
        <Select value={channel} onValueChange={setChannel}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Canal" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Tous</SelectItem>
            <SelectItem value="LINK">Lien</SelectItem>
            <SelectItem value="QR">QR</SelectItem>
            <SelectItem value="EMAIL">Email</SelectItem>
            <SelectItem value="SMS">SMS</SelectItem>
            <SelectItem value="WHATSAPP">WhatsApp</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-1">
        <Label className="text-[10px] uppercase text-muted-foreground">Du</Label>
        <Input
          type="date"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          className="w-[150px]"
        />
      </div>

      <div className="flex flex-col gap-1">
        <Label className="text-[10px] uppercase text-muted-foreground">Au</Label>
        <Input
          type="date"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          className="w-[150px]"
        />
      </div>

      <Button variant="outline" size="sm" onClick={onReset}>
        Réinitialiser
      </Button>
    </div>
  );
}

// ─── Pagination ─────────────────────────────────────────────────────────────

function Pagination({
  page,
  total,
  limit,
  onPage,
}: {
  page: number;
  total: number;
  limit: number;
  onPage: (p: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(total / limit));
  return (
    <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
      <span>
        {total} entrée(s) — page {page}/{totalPages}
      </span>
      <div className="flex gap-1">
        <Button
          variant="outline"
          size="icon"
          className="h-7 w-7"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
        >
          <ChevronLeft className="w-3.5 h-3.5" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="h-7 w-7"
          disabled={page >= totalPages}
          onClick={() => onPage(page + 1)}
        >
          <ChevronRight className="w-3.5 h-3.5" />
        </Button>
      </div>
    </div>
  );
}

// ─── QR Codes sub-tab ───────────────────────────────────────────────────────

function QrCodesTab({
  csrfToken: _csrfToken,
  weddings,
}: {
  csrfToken: string;
  weddings: WeddingOption[];
}) {
  const [data, setData] = useState<QrStatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [weddingId, setWeddingId] = useState('');
  const [status, setStatus] = useState('ALL');
  const [channel, setChannel] = useState('ALL');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);
  const limit = 50;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = buildParams(
        {},
        weddingId,
        status,
        channel,
        dateFrom,
        dateTo,
        page,
        limit
      );
      const res = await fetch(`/api/platform/qr/stats?${params}`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error('fetch failed');
      const json: QrStatsResponse = await res.json();
      setData(json);
    } catch {
      toast.error('Erreur lors du chargement des stats QR');
    } finally {
      setLoading(false);
    }
  }, [weddingId, status, channel, dateFrom, dateTo, page]);

  useEffect(() => {
    load();
  }, [load]);

  const resetFilters = () => {
    setWeddingId('');
    setStatus('ALL');
    setChannel('ALL');
    setDateFrom('');
    setDateTo('');
    setPage(1);
  };

  const summary = data?.summary;
  const s = summary?.byStatus || { USED: 0, UNUSED: 0, EXPIRED: 0 };

  return (
    <div className="space-y-4">
      <FiltersBar
        weddingId={weddingId}
        setWeddingId={(v) => {
          setWeddingId(v);
          setPage(1);
        }}
        status={status}
        setStatus={(v) => {
          setStatus(v);
          setPage(1);
        }}
        channel={channel}
        setChannel={(v) => {
          setChannel(v);
          setPage(1);
        }}
        dateFrom={dateFrom}
        setDateFrom={setDateFrom}
        dateTo={dateTo}
        setDateTo={setDateTo}
        statusOptions={[
          { value: 'USED', label: 'Utilisé' },
          { value: 'UNUSED', label: 'Non utilisé' },
          { value: 'EXPIRED', label: 'Expiré' },
        ]}
        weddings={weddings}
        onReset={resetFilters}
      />

      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-lg" />
          ))}
        </div>
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard
              label="Total QR générés"
              value={summary?.total ?? 0}
              icon={QrCode}
            />
            <StatCard
              label="Utilisés"
              value={s.USED}
              icon={CheckCircle2}
              tone="success"
            />
            <StatCard
              label="Non utilisés"
              value={s.UNUSED}
              icon={AlertTriangle}
              tone="warning"
            />
            <StatCard
              label="Expirés"
              value={s.EXPIRED}
              icon={XCircle}
              tone="danger"
            />
          </div>

          {/* Channel breakdown + usage rate */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Card className="glass-card gold-border border-0">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Send className="w-4 h-4" />
                  Répartition par canal (livraisons)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ChannelBreakdown byChannel={summary?.byChannel || {}} />
              </CardContent>
            </Card>

            <Card className="glass-card gold-border border-0">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4" />
                  Taux d&rsquo;utilisation global
                </CardTitle>
              </CardHeader>
              <CardContent>
                {(() => {
                  const total = summary?.total ?? 0;
                  const rate =
                    total > 0 ? Math.round((s.USED / total) * 1000) / 10 : 0;
                  return (
                    <div className="space-y-2">
                      <div
                        className={`text-4xl font-bold tabular-nums ${successRateColor(rate)}`}
                      >
                        {rate.toFixed(1)}%
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {s.USED} scans sur {total} QR livrés
                      </div>
                      <div className="h-2 rounded-full bg-white/5 overflow-hidden">
                        <div
                          className={`h-full ${
                            rate >= 80
                              ? 'bg-emerald-500/80'
                              : rate >= 60
                              ? 'bg-amber-500/80'
                              : 'bg-red-500/80'
                          }`}
                          style={{ width: `${rate}%` }}
                        />
                      </div>
                    </div>
                  );
                })()}
              </CardContent>
            </Card>
          </div>

          {/* Top weddings */}
          <Card className="glass-card gold-border border-0">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">
                Top 10 mariages (par nombre de QR)
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loading || !summary?.topWeddings?.length ? (
                <p className="text-xs text-muted-foreground italic py-4 text-center">
                  Aucune donnée.
                </p>
              ) : (
                <div className="rounded-lg border border-white/10 overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Mariage</TableHead>
                        <TableHead className="text-right">QR générés</TableHead>
                        <TableHead className="text-right">Utilisés</TableHead>
                        <TableHead className="text-right">Taux</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {summary.topWeddings.map((w) => (
                        <TableRow key={w.weddingId}>
                          <TableCell className="font-medium">
                            {w.coupleLabel || w.slug}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {w.qrCount}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {w.usedCount}
                          </TableCell>
                          <TableCell
                            className={`text-right tabular-nums ${successRateColor(
                              w.usageRate
                            )}`}
                          >
                            {w.usageRate.toFixed(1)}%
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Recent QR scan events */}
          <Card className="glass-card gold-border border-0">
            <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-sm font-semibold">
                Événements de scan QR récents
              </CardTitle>
              <Button variant="outline" size="icon" className="h-7 w-7" onClick={load}>
                <RefreshCw className="w-3.5 h-3.5" />
              </Button>
            </CardHeader>
            <CardContent className="space-y-3">
              {loading ? (
                <div className="space-y-2">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <Skeleton key={i} className="h-10 rounded-lg" />
                  ))}
                </div>
              ) : !data?.recentEvents?.length ? (
                <p className="text-xs text-muted-foreground italic py-4 text-center">
                  Aucun événement de scan QR.
                </p>
              ) : (
                <>
                  <div className="rounded-lg border border-white/10 overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Mariage</TableHead>
                          <TableHead>Invité</TableHead>
                          <TableHead>Action</TableHead>
                          <TableHead>IP</TableHead>
                          <TableHead>Date</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {data.recentEvents.map((e) => (
                          <TableRow key={e.id}>
                            <TableCell className="font-medium text-xs">
                              {e.weddingLabel}
                            </TableCell>
                            <TableCell className="text-xs">{e.guestLabel}</TableCell>
                            <TableCell>
                              <Badge
                                variant="outline"
                                className="text-[10px] uppercase bg-emerald-500/10 text-emerald-300 border-emerald-500/30"
                              >
                                {e.action}
                              </Badge>
                            </TableCell>
                            <TableCell className="font-mono text-[10px] text-muted-foreground">
                              {e.ipAddress || '—'}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {formatDate(e.createdAt)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  <Pagination
                    page={page}
                    total={data?.total ?? 0}
                    limit={limit}
                    onPage={setPage}
                  />
                </>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

// ─── Invitations sub-tab ────────────────────────────────────────────────────

function InvitationsTab({
  csrfToken: _csrfToken,
  weddings,
}: {
  csrfToken: string;
  weddings: WeddingOption[];
}) {
  const [data, setData] = useState<InvitationStatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [weddingId, setWeddingId] = useState('');
  const [status, setStatus] = useState('ALL');
  const [channel, setChannel] = useState('ALL');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);
  const limit = 50;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = buildParams(
        {},
        weddingId,
        status,
        channel,
        dateFrom,
        dateTo,
        page,
        limit
      );
      const res = await fetch(`/api/platform/invitations/stats?${params}`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error('fetch failed');
      const json: InvitationStatsResponse = await res.json();
      setData(json);
    } catch {
      toast.error('Erreur lors du chargement des stats d\'invitations');
    } finally {
      setLoading(false);
    }
  }, [weddingId, status, channel, dateFrom, dateTo, page]);

  useEffect(() => {
    load();
  }, [load]);

  const resetFilters = () => {
    setWeddingId('');
    setStatus('ALL');
    setChannel('ALL');
    setDateFrom('');
    setDateTo('');
    setPage(1);
  };

  const summary = data?.summary;
  const bs = summary?.byStatus || {};

  return (
    <div className="space-y-4">
      <FiltersBar
        weddingId={weddingId}
        setWeddingId={(v) => {
          setWeddingId(v);
          setPage(1);
        }}
        status={status}
        setStatus={(v) => {
          setStatus(v);
          setPage(1);
        }}
        channel={channel}
        setChannel={(v) => {
          setChannel(v);
          setPage(1);
        }}
        dateFrom={dateFrom}
        setDateFrom={setDateFrom}
        dateTo={dateTo}
        setDateTo={setDateTo}
        statusOptions={[
          { value: 'PENDING', label: 'En attente' },
          { value: 'SENT', label: 'Envoyée' },
          { value: 'DELIVERED', label: 'Livrée' },
          { value: 'READ', label: 'Lue' },
          { value: 'FAILED', label: 'Échec' },
          { value: 'CANCELLED', label: 'Annulée' },
        ]}
        weddings={weddings}
        onReset={resetFilters}
      />

      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-lg" />
          ))}
        </div>
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <StatCard
              label="Total envoyées"
              value={summary?.total ?? 0}
              icon={Send}
            />
            <StatCard
              label="Envoyées"
              value={bs.SENT ?? 0}
              icon={Send}
              tone="default"
            />
            <StatCard
              label="Livrées"
              value={bs.DELIVERED ?? 0}
              icon={CheckCircle2}
              tone="success"
            />
            <StatCard
              label="Lues"
              value={bs.READ ?? 0}
              icon={Mail}
              tone="success"
            />
            <StatCard
              label="Échecs"
              value={bs.FAILED ?? 0}
              icon={AlertTriangle}
              tone="danger"
            />
          </div>

          {/* Success rate gauge + channel breakdown */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Card
              className={`glass-card border bg-gradient-to-br ${successRateBg(
                summary?.successRate ?? 0
              )}`}
            >
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4" />
                  Taux de succès livraison
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div
                    className={`text-5xl font-bold tabular-nums ${successRateColor(
                      summary?.successRate ?? 0
                    )}`}
                  >
                    {(summary?.successRate ?? 0).toFixed(1)}%
                  </div>
                  <div className="text-xs text-muted-foreground">
                    (SENT + DELIVERED + READ) / total
                  </div>
                  <div className="h-3 rounded-full bg-white/10 overflow-hidden">
                    <div
                      className={`h-full ${
                        (summary?.successRate ?? 0) >= 80
                          ? 'bg-emerald-500/80'
                          : (summary?.successRate ?? 0) >= 60
                          ? 'bg-amber-500/80'
                          : 'bg-red-500/80'
                      }`}
                      style={{ width: `${summary?.successRate ?? 0}%` }}
                    />
                  </div>
                  <div className="text-[10px] text-muted-foreground/70 pt-1">
                    {summary && summary.successRate >= 80
                      ? 'Système sain'
                      : summary && summary.successRate >= 60
                      ? 'Surveillance requise'
                      : 'Action corrective requise'}
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="glass-card gold-border border-0">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <MessageSquare className="w-4 h-4" />
                  Répartition par canal
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ChannelBreakdown byChannel={summary?.byChannel || {}} />
              </CardContent>
            </Card>
          </div>

          {/* Top weddings */}
          <Card className="glass-card gold-border border-0">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">
                Top 10 mariages (par nombre d&rsquo;invitations)
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loading || !summary?.topWeddings?.length ? (
                <p className="text-xs text-muted-foreground italic py-4 text-center">
                  Aucune donnée.
                </p>
              ) : (
                <div className="rounded-lg border border-white/10 overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Mariage</TableHead>
                        <TableHead className="text-right">Envoyées</TableHead>
                        <TableHead className="text-right">Livrées</TableHead>
                        <TableHead className="text-right">Lues</TableHead>
                        <TableHead className="text-right">Échecs</TableHead>
                        <TableHead className="text-right">Taux</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {summary.topWeddings.map((w) => (
                        <TableRow key={w.weddingId}>
                          <TableCell className="font-medium">
                            {w.coupleLabel || w.slug}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {w.invitationsSent}
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-emerald-400/80">
                            {w.delivered}
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-green-400/80">
                            {w.read}
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-red-400/80">
                            {w.failed}
                          </TableCell>
                          <TableCell
                            className={`text-right tabular-nums ${successRateColor(
                              w.successRate
                            )}`}
                          >
                            {w.successRate.toFixed(1)}%
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Recent failed deliveries */}
          <Card className="glass-card gold-border border-0">
            <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-400" />
                Livraisons échouées récentes
              </CardTitle>
              <Button variant="outline" size="icon" className="h-7 w-7" onClick={load}>
                <RefreshCw className="w-3.5 h-3.5" />
              </Button>
            </CardHeader>
            <CardContent className="space-y-3">
              {loading ? (
                <div className="space-y-2">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <Skeleton key={i} className="h-10 rounded-lg" />
                  ))}
                </div>
              ) : !data?.failedDeliveries?.length ? (
                <p className="text-xs text-muted-foreground italic py-4 text-center">
                  Aucune livraison échouée.
                </p>
              ) : (
                <>
                  <div className="rounded-lg border border-white/10 overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Mariage</TableHead>
                          <TableHead>Invité</TableHead>
                          <TableHead>Canal</TableHead>
                          <TableHead>Destinataire</TableHead>
                          <TableHead>Erreur</TableHead>
                          <TableHead>Tentatives</TableHead>
                          <TableHead>Date</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {data.failedDeliveries.map((d) => {
                          const Icon = CHANNEL_ICON[d.channel] || MessageSquare;
                          return (
                            <TableRow key={d.id}>
                              <TableCell className="font-medium text-xs">
                                {d.weddingLabel}
                              </TableCell>
                              <TableCell className="text-xs">{d.guestLabel}</TableCell>
                              <TableCell>
                                <span className="inline-flex items-center gap-1 text-[10px] uppercase">
                                  <Icon className="w-3 h-3" />
                                  {CHANNEL_LABEL[d.channel] || d.channel}
                                </span>
                              </TableCell>
                              <TableCell className="font-mono text-[10px] text-muted-foreground">
                                {d.destination}
                              </TableCell>
                              <TableCell
                                className="text-[10px] text-red-400/80 max-w-[280px] truncate"
                                title={d.lastError || ''}
                              >
                                {d.lastError || '—'}
                              </TableCell>
                              <TableCell className="text-right tabular-nums text-xs">
                                {d.attemptCount}
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground">
                                {formatDate(d.createdAt)}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                  <Pagination
                    page={page}
                    total={data?.total ?? 0}
                    limit={limit}
                    onPage={setPage}
                  />
                </>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

// ─── Main panel ─────────────────────────────────────────────────────────────

export function QRInvitationsPanel({ csrfToken }: { csrfToken: string }) {
  const [tab, setTab] = useState<'qr' | 'invitations'>('qr');
  const [weddings, setWeddings] = useState<WeddingOption[]>([]);
  const [weddingsLoading, setWeddingsLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/platform/weddings?limit=200', {
          credentials: 'include',
        });
        if (!res.ok) throw new Error('fetch failed');
        const json = await res.json();
        setWeddings(
          (json.weddings || []).map((w: { id: string; coupleLabel: string; slug: string }) => ({
            id: w.id,
            coupleLabel: w.coupleLabel,
            slug: w.slug,
          }))
        );
      } catch {
        // Non-fatal — wedding selector just stays empty.
        toast.error('Impossible de charger la liste des mariages');
      } finally {
        setWeddingsLoading(false);
      }
    })();
  }, []);

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div>
        <h2 className="text-xl font-bold flex items-center gap-2">
          <QrCode className="w-5 h-5" />
          QR &amp; Invitations
        </h2>
        <p className="text-xs text-muted-foreground">
          Supervision cross-tenant des codes QR et des invitations envoyées sur
          toutes les mariages de la plateforme.
        </p>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as 'qr' | 'invitations')}>
        <TabsList>
          <TabsTrigger value="qr">
            <QrCode className="w-3.5 h-3.5" />
            Codes QR
          </TabsTrigger>
          <TabsTrigger value="invitations">
            <Send className="w-3.5 h-3.5" />
            Invitations
          </TabsTrigger>
        </TabsList>
        <TabsContent value="qr">
          {weddingsLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-12 rounded-lg" />
              ))}
            </div>
          ) : (
            <QrCodesTab csrfToken={csrfToken} weddings={weddings} />
          )}
        </TabsContent>
        <TabsContent value="invitations">
          {weddingsLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-12 rounded-lg" />
              ))}
            </div>
          ) : (
            <InvitationsTab csrfToken={csrfToken} weddings={weddings} />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
