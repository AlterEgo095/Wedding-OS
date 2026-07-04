'use client';

/**
 * /platform/ops — Production ops dashboard (P6-4).
 *
 * A SEPARATE route (not a tab in /platform/admin) for production health +
 * security monitoring. Mirrors the auth gate pattern from
 * /platform/admin/page.tsx: client-side fetch /api/me → redirect to
 * /platform/login if not PLATFORM_ADMIN / SUPER_ADMIN. The underlying data
 * sources (the /api/platform/ops + /api/platform/dashboard routes) are
 * server-gated via `requirePlatformAdmin`, so a forged JWT could at worst
 * see the loading skeleton briefly before the redirect — no data leaks.
 *
 * Layout (mobile-first, dark-luxury theme matching /platform/admin):
 *   - Header: title + subtitle + last-refresh timestamp + manual refresh
 *   - KPI grid (grid-cols-2 md:grid-cols-4): status, weddings, deploySha, uptime
 *   - Health detail cards (md:grid-cols-2): DB latency + Schema tables
 *   - Security events section: 24h + 7j counts + per-action breakdown
 *   - Recent security logs table (max-h-[60vh], sticky header)
 *   - DB info card: file size + audit log total
 *   - Footer: link back to /platform/admin
 *
 * Auto-refreshes every 30s. Uses Promise.allSettled so a single endpoint
 * failure doesn't break the whole dashboard — each card shows its own error
 * state instead.
 */

import { useState, useEffect, useCallback, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import { motion } from 'framer-motion';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Activity,
  Shield,
  AlertTriangle,
  Database,
  RefreshCw,
  ArrowLeft,
  CheckCircle2,
  XCircle,
} from 'lucide-react';

// ─── useSyncExternalStore hydration helpers (mirrors /platform/admin) ───────
// SSR returns false (loading skeleton), the first client render returns true.
// This eliminates the hydration mismatch without tripping the
// react-hooks/set-state-in-effect lint rule.
const emptySubscribe = (): (() => void) => () => {};
const getTrue = (): boolean => true;
const getFalse = (): boolean => false;

// ─── Types ──────────────────────────────────────────────────────────────────

interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: string;
  weddingId?: string | null;
}

interface HealthCheck {
  status: 'ok' | 'fail';
  latencyMs?: number;
  error?: string;
  details?: { tablesChecked?: number; missing?: string[]; totalChecked?: number };
}

interface HealthResponse {
  status: 'ok' | 'degraded';
  timestamp: string;
  uptimeSec: number;
  version: string;
  deploySha: string | null;
  env: string;
  weddingsCount: number | null;
  checks: {
    database?: HealthCheck;
    schema?: HealthCheck;
    env?: HealthCheck;
  };
  totalLatencyMs: number;
}

interface DashboardResponse {
  weddings: { total: number; byStatus: Record<string, number>; byPlan: Record<string, number> };
}

interface SecurityLogRow {
  id: string;
  action: string;
  details: string | null;
  ipAddress: string | null;
  createdAt: string; // ISO
  user: { email: string; role: string } | null;
  wedding: { slug: string; brideName: string; groomName: string } | null;
}

interface OpsResponse {
  securityEvents: {
    last24h: number;
    last7d: number;
    byAction: Record<string, number>;
  };
  recentSecurityLogs: SecurityLogRow[];
  auditLogTotal: number;
  dbFileSizeBytes: number;
}

// ─── Formatters ─────────────────────────────────────────────────────────────

/** Format uptime seconds as "Xh Ym" (or "Ym" / "Xs" for short uptimes). */
function formatUptime(totalSec: number): string {
  if (!Number.isFinite(totalSec) || totalSec < 0) return '—';
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = Math.floor(totalSec % 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

/** Format a byte count as KB / MB (1 decimal place for MB, integer for KB). */
function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  if (bytes < 1024) return `${bytes} o`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.round(kb)} Ko`;
  const mb = kb / 1024;
  return `${mb.toFixed(1)} Mo`;
}

/** Format an ISO string as "YYYY-MM-DD HH:mm" (locale-independent). */
function formatOpsDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Truncate a string to `max` chars, appending "…" if it was longer. */
function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + '…';
}

// ─── Page component ─────────────────────────────────────────────────────────

export default function PlatformOpsPage() {
  const router = useRouter();

  // Hydration flag — see comment on emptySubscribe above.
  const mounted = useSyncExternalStore(emptySubscribe, getTrue, getFalse);

  // ─── Auth state (mirrors /platform/admin/page.tsx) ────────────────────────
  const [user, setUser] = useState<AuthUser | null>(null);
  const [authChecked, setAuthChecked] = useState(false);

  // ─── Data state ───────────────────────────────────────────────────────────
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);
  const [ops, setOps] = useState<OpsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  // ─── Auth check on mount ──────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/me', { credentials: 'include' });
        if (cancelled) return;
        if (res.ok) {
          const data = await res.json();
          if (data?.user) setUser(data.user as AuthUser);
        }
      } catch {
        /* network error — leave user as null, redirect below */
      } finally {
        if (!cancelled) setAuthChecked(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // ─── Auth gate ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!authChecked) return;
    if (!user) {
      toast.error('Veuillez vous connecter');
      router.replace('/platform/login');
      return;
    }
    if (user.role !== 'PLATFORM_ADMIN' && user.role !== 'SUPER_ADMIN') {
      toast.error('Accès refusé');
      router.replace('/platform/login');
    }
  }, [authChecked, user, router]);

  // ─── Data fetcher — 3 parallel fetches via Promise.allSettled ─────────────
  const fetchAll = useCallback(async (isManual = false) => {
    if (isManual) setRefreshing(true);
    else setLoading(true);

    const [healthRes, dashboardRes, opsRes] = await Promise.allSettled([
      fetch('/api/health', { credentials: 'include' }),
      fetch('/api/platform/dashboard', { credentials: 'include' }),
      fetch('/api/platform/ops', { credentials: 'include' }),
    ]);

    // Health — unauthenticated, 200/503. We parse even on 503 (degraded).
    if (healthRes.status === 'fulfilled') {
      try {
        const json = (await healthRes.value.json()) as HealthResponse;
        setHealth(json);
      } catch {
        setHealth(null);
      }
    } else {
      setHealth(null);
    }

    // Dashboard — PLATFORM_ADMIN-gated. 401/403 surfaces as null (the auth
    // gate effect will redirect).
    if (dashboardRes.status === 'fulfilled' && dashboardRes.value.ok) {
      try {
        const json = (await dashboardRes.value.json()) as DashboardResponse;
        setDashboard(json);
      } catch {
        setDashboard(null);
      }
    } else {
      // Don't toast on 401/403 — the auth gate handles redirects.
      if (dashboardRes.status === 'fulfilled' && !dashboardRes.value.ok && dashboardRes.value.status >= 500) {
        toast.error('Tableau de bord indisponible');
      }
      setDashboard(null);
    }

    // Ops — PLATFORM_ADMIN-gated (same behaviour as dashboard).
    if (opsRes.status === 'fulfilled' && opsRes.value.ok) {
      try {
        const json = (await opsRes.value.json()) as OpsResponse;
        setOps(json);
      } catch {
        setOps(null);
      }
    } else {
      if (opsRes.status === 'fulfilled' && !opsRes.value.ok && opsRes.value.status >= 500) {
        toast.error('Données ops indisponibles');
      }
      setOps(null);
    }

    setLastRefresh(new Date());
    setLoading(false);
    setRefreshing(false);
  }, []);

  // ─── Initial fetch + 30s auto-refresh ─────────────────────────────────────
  useEffect(() => {
    if (!authChecked || !user) return;
    if (user.role !== 'PLATFORM_ADMIN' && user.role !== 'SUPER_ADMIN') return;
    fetchAll(false);
    const id = setInterval(() => fetchAll(false), 30_000);
    return () => clearInterval(id);
  }, [authChecked, user, fetchAll]);

  // ─── Loading / auth gate screen (mirrors /platform/admin) ─────────────────
  if (!mounted || !authChecked || !user || (user.role !== 'PLATFORM_ADMIN' && user.role !== 'SUPER_ADMIN')) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <RefreshCw className="h-6 w-6 animate-spin text-gold" />
          <p className="text-xs text-muted-foreground">Chargement du tableau ops…</p>
        </div>
      </div>
    );
  }

  // ─── Derived display values ───────────────────────────────────────────────
  const statusOk = health?.status === 'ok';
  const weddingsCount = health?.weddingsCount ?? dashboard?.weddings.total ?? null;
  const deploySha = health?.deploySha ?? null;
  const uptimeSec = health?.uptimeSec ?? 0;
  const dbCheck = health?.checks.database;
  const schemaCheck = health?.checks.schema;
  const envCheck = health?.checks.env;
  const secLast24h = ops?.securityEvents.last24h ?? 0;
  const secLast7d = ops?.securityEvents.last7d ?? 0;
  const byAction = ops?.securityEvents.byAction ?? {};
  const auditTotal = ops?.auditLogTotal ?? 0;
  const dbSizeBytes = ops?.dbFileSizeBytes ?? 0;

  const kpiCards = [
    {
      title: 'Statut prod',
      value: statusOk ? 'OK' : 'DOWN',
      subtitle: health?.env ?? '—',
      icon: statusOk ? CheckCircle2 : XCircle,
      iconClass: statusOk ? 'text-emerald-400' : 'text-red-400',
      gradient: statusOk
        ? 'from-emerald-500/20 to-emerald-600/10'
        : 'from-red-500/20 to-red-600/10',
    },
    {
      title: 'Mariages actifs',
      value: weddingsCount ?? '—',
      subtitle: 'total en DB',
      icon: Activity,
      iconClass: 'text-gold',
      gradient: 'from-gold/20 to-gold-light/10',
    },
    {
      title: 'SHA déployé',
      value: deploySha ? deploySha.slice(0, 7) : '—',
      subtitle: 'commit en prod',
      icon: Shield,
      iconClass: 'text-gold',
      gradient: 'from-gold/20 to-gold-light/10',
      mono: true,
    },
    {
      title: 'Uptime',
      value: formatUptime(uptimeSec),
      subtitle: 'depuis dernier restart',
      icon: Activity,
      iconClass: 'text-gold',
      gradient: 'from-gold/20 to-gold-light/10',
    },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* ─── Header ─────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-20 border-b border-border/40 bg-background/80 backdrop-blur">
        <div className="mx-auto max-w-7xl px-4 py-4 md:px-6 md:py-6">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="flex items-center gap-2 text-xl font-bold md:text-2xl">
                <Activity className="h-6 w-6 text-gold" />
                Ops Dashboard
              </h1>
              <p className="text-xs text-muted-foreground md:text-sm">
                Supervision production — santé, sécurité, DB
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {lastRefresh && (
                <span className="text-[10px] text-muted-foreground/70 md:text-xs">
                  Dernière màj : {formatOpsDateTime(lastRefresh.toISOString())}
                </span>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => fetchAll(true)}
                disabled={refreshing}
                className="border-gold/30 text-gold hover:bg-gold/10 hover:text-gold"
              >
                <RefreshCw className={`mr-2 h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
                Rafraîchir
              </Button>
              <Link href="/platform/admin">
                <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground">
                  <ArrowLeft className="mr-2 h-3.5 w-3.5" />
                  Admin
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-6 p-4 md:space-y-8 md:p-6">
        {/* ─── KPI grid (4 cards) ────────────────────────────────────────── */}
        <section
          aria-label="Indicateurs clés"
          className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4"
        >
          {kpiCards.map((card, i) => (
            <motion.div
              key={card.title}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05, duration: 0.3 }}
            >
              <Card className="glass-card gold-border h-full border-0 overflow-hidden">
                <CardContent className="p-4">
                  <div
                    className={`mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br ${card.gradient}`}
                  >
                    <card.icon className={`h-5 w-5 ${card.iconClass}`} />
                  </div>
                  <p
                    className={`text-xl font-bold md:text-2xl ${card.mono ? 'font-mono' : ''}`}
                  >
                    {card.value}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">{card.title}</p>
                  <p className="mt-0.5 text-[10px] text-muted-foreground/70">{card.subtitle}</p>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </section>

        {/* ─── Health detail cards (DB + Schema) ─────────────────────────── */}
        <section
          aria-label="Détails santé"
          className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-6"
        >
          {/* DB card */}
          <Card className="glass-card gold-border border-0">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base font-semibold">
                <Database className="h-4 w-4 text-gold" />
                Base de données
                {dbCheck && (
                  <Badge
                    variant="outline"
                    className={`ml-auto text-[10px] uppercase tracking-wide ${
                      dbCheck.status === 'ok'
                        ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                        : 'border-red-500/30 bg-red-500/10 text-red-400'
                    }`}
                  >
                    {dbCheck.status === 'ok' ? 'OK' : 'FAIL'}
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {loading && !health ? (
                <Skeleton className="h-16 w-full rounded" />
              ) : dbCheck ? (
                <>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Latence</span>
                    <span className="font-mono text-foreground">
                      {dbCheck.latencyMs != null ? `${dbCheck.latencyMs} ms` : '—'}
                    </span>
                  </div>
                  {dbCheck.error && (
                    <p className="text-xs text-red-400">{dbCheck.error}</p>
                  )}
                  {envCheck && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Variables d&apos;env</span>
                      <Badge
                        variant="outline"
                        className={`text-[10px] uppercase ${
                          envCheck.status === 'ok'
                            ? 'border-emerald-500/30 text-emerald-400'
                            : 'border-red-500/30 text-red-400'
                        }`}
                      >
                        {envCheck.status === 'ok' ? 'OK' : 'FAIL'}
                      </Badge>
                    </div>
                  )}
                </>
              ) : (
                <p className="text-xs text-muted-foreground">Santé DB indisponible</p>
              )}
            </CardContent>
          </Card>

          {/* Schema card */}
          <Card className="glass-card gold-border border-0">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base font-semibold">
                <Shield className="h-4 w-4 text-gold" />
                Schéma
                {schemaCheck && (
                  <Badge
                    variant="outline"
                    className={`ml-auto text-[10px] uppercase tracking-wide ${
                      schemaCheck.status === 'ok'
                        ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                        : 'border-red-500/30 bg-red-500/10 text-red-400'
                    }`}
                  >
                    {schemaCheck.status === 'ok' ? 'OK' : 'FAIL'}
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {loading && !health ? (
                <Skeleton className="h-16 w-full rounded" />
              ) : schemaCheck ? (
                <>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Tables vérifiées</span>
                    <span className="font-mono text-foreground">
                      {schemaCheck.details?.tablesChecked ?? '—'}
                    </span>
                  </div>
                  {schemaCheck.status === 'fail' && schemaCheck.details?.missing && (
                    <div className="space-y-1">
                      <p className="text-xs text-red-400">Tables manquantes :</p>
                      <ul className="ml-4 list-disc text-xs text-red-400/80">
                        {schemaCheck.details.missing.map((t) => (
                          <li key={t} className="font-mono">{t}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {schemaCheck.status === 'ok' && (
                    <p className="text-[11px] text-muted-foreground/70">
                      10/10 tables critiques présentes
                    </p>
                  )}
                </>
              ) : (
                <p className="text-xs text-muted-foreground">Santé schéma indisponible</p>
              )}
            </CardContent>
          </Card>
        </section>

        {/* ─── Security events section ──────────────────────────────────── */}
        <section aria-label="Événements de sécurité" className="space-y-3">
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-gold" />
            <h2 className="text-lg font-bold md:text-xl">Événements de sécurité</h2>
          </div>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
            <Card className="glass-card gold-border border-0">
              <CardContent className="p-4">
                <div className="mb-2 flex items-center gap-2">
                  <AlertTriangle
                    className={`h-4 w-4 ${secLast24h > 0 ? 'text-red-400' : 'text-emerald-400'}`}
                  />
                  <span className="text-xs text-muted-foreground">24h</span>
                </div>
                <p
                  className={`text-2xl font-bold ${
                    secLast24h > 0 ? 'text-red-400' : 'text-foreground'
                  }`}
                >
                  {secLast24h}
                </p>
                <p className="mt-0.5 text-[10px] text-muted-foreground/70">
                  événement{secLast24h > 1 ? 's' : ''} dernier 24h
                </p>
              </CardContent>
            </Card>

            <Card className="glass-card gold-border border-0">
              <CardContent className="p-4">
                <div className="mb-2 flex items-center gap-2">
                  <AlertTriangle
                    className={`h-4 w-4 ${secLast7d > 0 ? 'text-amber-400' : 'text-emerald-400'}`}
                  />
                  <span className="text-xs text-muted-foreground">7j</span>
                </div>
                <p
                  className={`text-2xl font-bold ${
                    secLast7d > 0 ? 'text-amber-400' : 'text-foreground'
                  }`}
                >
                  {secLast7d}
                </p>
                <p className="mt-0.5 text-[10px] text-muted-foreground/70">
                  événement{secLast7d > 1 ? 's' : ''} dernier 7 jours
                </p>
              </CardContent>
            </Card>

            <Card className="glass-card gold-border border-0 col-span-2">
              <CardContent className="p-4">
                <p className="mb-2 text-xs text-muted-foreground">Répartition par action (24h)</p>
                {loading && !ops ? (
                  <Skeleton className="h-8 w-full rounded" />
                ) : Object.keys(byAction).length === 0 ? (
                  <p className="text-[11px] text-muted-foreground/70">
                    Aucune action à afficher
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {Object.entries(byAction)
                      .sort((a, b) => b[1] - a[1])
                      .map(([action, count]) => (
                        <Badge
                          key={action}
                          variant="outline"
                          className="border-gold/30 bg-gold/5 text-[10px] text-gold"
                        >
                          <span className="font-mono">{action}</span>
                          <span className="ml-1.5 rounded bg-gold/20 px-1 tabular-nums">
                            {count}
                          </span>
                        </Badge>
                      ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </section>

        {/* ─── Recent security logs table ───────────────────────────────── */}
        <section aria-label="Journal de sécurité récent">
          <Card className="glass-card gold-border border-0">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base font-semibold">
                <AlertTriangle className="h-4 w-4 text-gold" />
                Journal de sécurité (50 derniers)
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="max-h-[60vh] overflow-y-auto custom-scrollbar">
                <Table>
                  <TableHeader className="sticky top-0 z-10 bg-background/95 backdrop-blur">
                    <TableRow className="border-white/10 hover:bg-transparent">
                      <TableHead className="text-xs">Date</TableHead>
                      <TableHead className="text-xs">Action</TableHead>
                      <TableHead className="hidden text-xs md:table-cell">Utilisateur</TableHead>
                      <TableHead className="hidden text-xs lg:table-cell">IP</TableHead>
                      <TableHead className="text-xs">Détails</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading && !ops ? (
                      Array.from({ length: 6 }).map((_, i) => (
                        <TableRow key={`sk-${i}`} className="border-white/5">
                          <TableCell colSpan={5}>
                            <Skeleton className="h-8 w-full rounded" />
                          </TableCell>
                        </TableRow>
                      ))
                    ) : !ops || ops.recentSecurityLogs.length === 0 ? (
                      <TableRow className="hover:bg-transparent">
                        <TableCell
                          colSpan={5}
                          className="py-12 text-center text-muted-foreground"
                        >
                          <Shield className="mx-auto mb-2 h-10 w-10 opacity-30" />
                          <p className="text-sm">Aucun événement de sécurité récent</p>
                        </TableCell>
                      </TableRow>
                    ) : (
                      ops.recentSecurityLogs.map((log) => (
                        <TableRow
                          key={log.id}
                          className="border-white/5 align-top transition-colors hover:bg-white/5"
                        >
                          <TableCell className="whitespace-nowrap font-mono text-[11px] text-muted-foreground">
                            {formatOpsDateTime(log.createdAt)}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant="outline"
                              className="text-[10px] uppercase tracking-wide"
                            >
                              {log.action}
                            </Badge>
                          </TableCell>
                          <TableCell className="hidden md:table-cell">
                            {log.user ? (
                              <span className="text-xs text-foreground">{log.user.email}</span>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell className="hidden lg:table-cell">
                            <span className="font-mono text-[11px] text-muted-foreground">
                              {log.ipAddress ?? '—'}
                            </span>
                          </TableCell>
                          <TableCell
                            className="max-w-xs text-xs text-muted-foreground"
                            title={log.details ?? undefined}
                          >
                            {log.details ? truncate(log.details, 80) : '—'}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* ─── DB info card ──────────────────────────────────────────────── */}
        <section aria-label="Informations base de données">
          <Card className="glass-card gold-border border-0">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base font-semibold">
                <Database className="h-4 w-4 text-gold" />
                Base de données — infos
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loading && !ops ? (
                <Skeleton className="h-12 w-full rounded" />
              ) : (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-muted-foreground">Taille du fichier DB</p>
                    <p className="mt-1 font-mono text-lg font-bold text-foreground">
                      {formatBytes(dbSizeBytes)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Entrées d&apos;audit (total)</p>
                    <p className="mt-1 font-mono text-lg font-bold text-foreground">
                      {auditTotal.toLocaleString('fr-FR')}
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </section>
      </main>

      {/* ─── Footer ─────────────────────────────────────────────────────── */}
      <footer className="mt-auto border-t border-border/40 bg-background/50 px-4 py-6 md:px-6">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-2 text-xs text-muted-foreground sm:flex-row">
          <Link
            href="/platform/admin"
            className="flex items-center gap-1.5 transition-colors hover:text-gold"
          >
            <ArrowLeft className="h-3 w-3" />
            Retour à l&apos;admin
          </Link>
          <p className="text-[10px] text-muted-foreground/60">
            Auto-rafraîchissement toutes les 30 secondes
          </p>
        </div>
      </footer>
    </div>
  );
}
