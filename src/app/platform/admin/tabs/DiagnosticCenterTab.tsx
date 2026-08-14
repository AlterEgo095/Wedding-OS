'use client';

// DiagnosticCenterTab — 5.8.15 No-Code Diagnostic Center.
//
// Single pane of glass for the Super Admin: shows ALL platform health metrics,
// gap findings (P0/P1/P2/P3), and provides one-click fix buttons for
// auto-fixable issues. The goal: NO CODE NEEDED to manage the platform.

import { useState, useEffect, useCallback, type ComponentType } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  HeartPulse,
  Loader2,
  Package,
  Boxes,
  Image as ImageIcon,
  Users,
  Heart,
  Mail,
  UserCheck,
  Database,
  Shield,
  Zap,
  RefreshCw,
  Wrench,
  Sparkles,
  FileText,
  Layers,
  QrCode,
  Server,
  TrendingUp,
} from 'lucide-react';

import { type FetchWithAuth, type TabId, StatusBadge } from './shared';

// ─── Types ────────────────────────────────────────────────────────────────

interface Gap {
  id: string;
  severity: 'P0' | 'P1' | 'P2' | 'P3' | 'OK';
  title: string;
  status: 'PASS' | 'WARN' | 'FAIL';
  description: string;
  fixType: 'auto' | 'manual' | 'none';
  fixEndpoint?: string;
  fixMethod?: 'POST' | 'GET';
  fixLabel?: string;
  fixPayload?: Record<string, unknown>;
}

interface DiagnosticsData {
  timestamp: string;
  counts: {
    weddings: number;
    guests: number;
    invitations: number;
    checkIns: number;
    users: number;
    themes: number;
    templates: number;
    products: number;
    components: number;
    assets: number;
    layouts: number;
    collections: number;
    modules: number;
    variants: number;
    qrScanEvents: number;
    auditLogs: number;
    tables: number;
    weddingsByStatus: Record<string, number>;
  };
  envPerms: string | null;
  gaps: Gap[];
  summary: {
    total: number;
    pass: number;
    warn: number;
    fail: number;
    autoFixable: number;
    healthScore: number;
  };
}

// ─── Component ────────────────────────────────────────────────────────────

export function DiagnosticCenterTab({
  fetchWithAuth,
  setActiveTab,
}: {
  fetchWithAuth: (url: string, init?: RequestInit) => Promise<Response | null>;
  setActiveTab: (tab: TabId) => void;
}) {
  const [data, setData] = useState<DiagnosticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [fixing, setFixing] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetchWithAuth('/api/platform/diagnostics');
    if (!res) {
      setLoading(false);
      return;
    }
    try {
      const json = (await res.json()) as DiagnosticsData;
      setData(json);
    } catch {
      toast.error('Réponse invalide du serveur');
    } finally {
      setLoading(false);
    }
  }, [fetchWithAuth]);

  useEffect(() => {
    load();
  }, [load]);

  const handleFix = useCallback(
    async (gap: Gap) => {
      if (!gap.fixEndpoint || !gap.fixMethod) return;
      setFixing(gap.id);
      try {
        const res = await fetchWithAuth(gap.fixEndpoint, {
          method: gap.fixMethod,
          headers: { 'Content-Type': 'application/json' },
          body: gap.fixPayload ? JSON.stringify(gap.fixPayload) : undefined,
        });
        if (res && res.ok) {
          const result = await res.json().catch(() => ({}));
          toast.success(result.message || `${gap.title} — correction appliquée`);
          // Reload diagnostics after fix
          setTimeout(() => load(), 500);
        } else {
          toast.error(`Échec de la correction: ${gap.title}`);
        }
      } catch (e) {
        toast.error(`Erreur: ${e instanceof Error ? e.message : String(e)}`);
      } finally {
        setFixing(null);
      }
    },
    [fetchWithAuth, load]
  );

  const handleSeedAll = useCallback(async () => {
    setFixing('seed-all');
    try {
      const res = await fetchWithAuth('/api/platform/seed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ what: 'all' }),
      });
      if (res && res.ok) {
        const result = await res.json().catch(() => ({}));
        toast.success(result.message || 'Seed terminé');
        setTimeout(() => load(), 500);
      } else {
        toast.error('Échec du seed');
      }
    } catch (e) {
      toast.error(`Erreur: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setFixing(null);
    }
  }, [fetchWithAuth, load]);

  if (loading) {
    return (
      <div className="space-y-6 p-4 md:p-6">
        <Skeleton className="h-32 rounded-xl" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-96 rounded-xl" />
      </div>
    );
  }

  if (!data) return null;

  const { counts, gaps, summary, envPerms } = data;
  const hasEmptyCatalog = counts.products === 0 || counts.components === 0 || counts.assets === 0;

  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* ─── Header: Health Score + Quick Actions ─────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <Card className="glass-card gold-border border-0 overflow-hidden">
          <CardContent className="p-6">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-gold/20 to-gold-light/10 flex items-center justify-center">
                  <HeartPulse className="w-8 h-8 text-gold" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold">Centre de Diagnostic</h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    Vue d'ensemble de la santé de la plateforme — {summary.pass} OK ·{' '}
                    <span className="text-amber-500">{summary.warn} avertissements</span> ·{' '}
                    <span className="text-red-500">{summary.fail} problèmes</span>
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-center">
                  <div className="text-4xl font-bold text-gold">{summary.healthScore}</div>
                  <div className="text-xs text-muted-foreground">Score de santé</div>
                </div>
                <Button onClick={load} variant="outline" size="sm" disabled={loading}>
                  <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                  Actualiser
                </Button>
              </div>
            </div>

            {/* Quick action: Seed all if catalog is empty */}
            {hasEmptyCatalog && (
              <div className="mt-4 p-4 rounded-lg bg-amber-500/10 border border-amber-500/30">
                <div className="flex items-center gap-3">
                  <Sparkles className="w-5 h-5 text-amber-500 flex-shrink-0" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-amber-600 dark:text-amber-400">
                      Catalogue vide détecté
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Produits ({counts.products}), Composants ({counts.components}), Assets ({counts.assets}) —
                      cliquez pour tout remplir en un clic.
                    </p>
                  </div>
                  <Button
                    onClick={handleSeedAll}
                    disabled={fixing === 'seed-all'}
                    size="sm"
                  >
                    {fixing === 'seed-all' ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Wrench className="w-4 h-4 mr-2" />
                    )}
                    Seed tout le catalogue
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* ─── KPI Grid ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiCard icon={Heart} label="Mariages" value={counts.weddings} gradient="from-rose-500/20 to-rose-600/10" iconClass="text-rose-400" onClick={() => setActiveTab('weddings')} />
        <KpiCard icon={Users} label="Invités" value={counts.guests} gradient="from-violet-500/20 to-violet-600/10" iconClass="text-violet-400" />
        <KpiCard icon={Mail} label="Invitations" value={counts.invitations} gradient="from-blue-500/20 to-blue-600/10" iconClass="text-blue-400" />
        <KpiCard icon={UserCheck} label="Check-ins" value={counts.checkIns} gradient="from-emerald-500/20 to-emerald-600/10" iconClass="text-emerald-400" />
        <KpiCard icon={QrCode} label="Scans QR" value={counts.qrScanEvents} gradient="from-cyan-500/20 to-cyan-600/10" iconClass="text-cyan-400" />
        <KpiCard icon={Database} label="Logs audit" value={counts.auditLogs} gradient="from-slate-500/20 to-slate-600/10" iconClass="text-slate-400" />
      </div>

      {/* ─── Production Studio Catalog ────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <CatalogCard
          icon={Package}
          title="Produits"
          count={counts.products}
          tabId="products"
          setActiveTab={setActiveTab}
          emptyHint="Aucun produit — seed requis"
          onSeed={() => handleFix(gaps.find((g) => g.id === 'P1-03')!)}
          seeding={fixing === 'P1-03'}
        />
        <CatalogCard
          icon={Boxes}
          title="Composants"
          count={counts.components}
          tabId="components-registry"
          setActiveTab={setActiveTab}
          emptyHint="Aucun composant — seed requis"
          onSeed={() => handleFix(gaps.find((g) => g.id === 'P1-04')!)}
          seeding={fixing === 'P1-04'}
        />
        <CatalogCard
          icon={ImageIcon}
          title="Assets"
          count={counts.assets}
          tabId="assets"
          setActiveTab={setActiveTab}
          emptyHint="Aucun asset — seed requis"
          onSeed={() => handleFix(gaps.find((g) => g.id === 'P1-05')!)}
          seeding={fixing === 'P1-05'}
        />
      </div>

      {/* ─── Design System Counts ─────────────────────────────────────────── */}
      <Card className="glass-card gold-border border-0 overflow-hidden">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Layers className="w-5 h-5 text-gold" />
            Design System & Collections
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <MiniStat label="Collections" value={counts.collections} onClick={() => setActiveTab('collections')} />
            <MiniStat label="Modules" value={counts.modules} />
            <MiniStat label="Variants" value={counts.variants} />
            <MiniStat label="Thèmes" value={counts.themes} onClick={() => setActiveTab('themes')} />
            <MiniStat label="Templates" value={counts.templates} onClick={() => setActiveTab('templates')} />
            <MiniStat label="Layouts" value={counts.layouts} onClick={() => setActiveTab('layouts')} />
          </div>
        </CardContent>
      </Card>

      {/* ─── Gap Analysis ─────────────────────────────────────────────────── */}
      <Card className="glass-card gold-border border-0 overflow-hidden">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Shield className="w-5 h-5 text-gold" />
              Analyse des Gaps ({gaps.length})
            </CardTitle>
            <div className="flex items-center gap-2 text-xs">
              <Badge className="bg-emerald-500/15 text-emerald-500 border-emerald-500/30">
                {summary.pass} OK
              </Badge>
              <Badge className="bg-amber-500/15 text-amber-500 border-amber-500/30">
                {summary.warn} WARN
              </Badge>
              <Badge className="bg-red-500/15 text-red-500 border-red-500/30">
                {summary.fail} FAIL
              </Badge>
              {summary.autoFixable > 0 && (
                <Badge className="bg-blue-500/15 text-blue-500 border-blue-500/30">
                  <Zap className="w-3 h-3 mr-1" />
                  {summary.autoFixable} auto-fixable
                </Badge>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          <AnimatePresence mode="popLayout">
            {gaps.map((gap, i) => (
              <motion.div
                key={gap.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ delay: i * 0.03, duration: 0.2 }}
                className={`p-3 rounded-lg border ${
                  gap.status === 'PASS'
                    ? 'bg-emerald-500/5 border-emerald-500/20'
                    : gap.status === 'WARN'
                      ? 'bg-amber-500/5 border-amber-500/20'
                      : 'bg-red-500/5 border-red-500/20'
                }`}
              >
                <div className="flex items-start gap-3">
                  {/* Status icon */}
                  <div className="flex-shrink-0 mt-0.5">
                    {gap.status === 'PASS' && <CheckCircle2 className="w-5 h-5 text-emerald-500" />}
                    {gap.status === 'WARN' && <AlertTriangle className="w-5 h-5 text-amber-500" />}
                    {gap.status === 'FAIL' && <AlertCircle className="w-5 h-5 text-red-500" />}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                        {gap.severity}
                      </Badge>
                      <span className="font-medium text-sm">{gap.title}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 break-words">
                      {gap.description}
                    </p>
                  </div>

                  {/* Fix button */}
                  {gap.fixType === 'auto' && gap.fixEndpoint && (
                    <Button
                      size="sm"
                      variant="default"
                      className="flex-shrink-0"
                      disabled={fixing === gap.id}
                      onClick={() => handleFix(gap)}
                    >
                      {fixing === gap.id ? (
                        <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                      ) : (
                        <Wrench className="w-3.5 h-3.5 mr-1.5" />
                      )}
                      {gap.fixLabel || 'Corriger'}
                    </Button>
                  )}
                  {gap.fixType === 'manual' && (
                    <Badge variant="outline" className="text-[10px] flex-shrink-0 text-muted-foreground">
                      Manuel
                    </Badge>
                  )}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </CardContent>
      </Card>

      {/* ─── Environment & Security ───────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="glass-card gold-border border-0 overflow-hidden">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Server className="w-5 h-5 text-gold" />
              Environnement
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Row label="Permissions .env" value={envPerms || 'N/A'} status={envPerms === '600' ? 'pass' : 'warn'} />
            <Row label="Node.js" value={typeof process !== 'undefined' ? process.version : 'N/A'} status="pass" />
            <Row label="Statut Docker" value={data.counts.weddings > 0 ? 'Actif' : 'Inactif'} status="pass" />
            <Row label="Dernier audit" value={new Date(data.timestamp).toLocaleString('fr-FR')} status="pass" />
          </CardContent>
        </Card>

        <Card className="glass-card gold-border border-0 overflow-hidden">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <TrendingUp className="w-5 h-5 text-gold" />
              Mariages par Statut
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {Object.entries(data.counts.weddingsByStatus).map(([status, count]) => (
              <Row key={status} label={status} value={String(count)} status="pass" />
            ))}
            {Object.keys(data.counts.weddingsByStatus).length === 0 && (
              <p className="text-sm text-muted-foreground">Aucun mariage</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ─── Quick Links ──────────────────────────────────────────────────── */}
      <Card className="glass-card gold-border border-0 overflow-hidden">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Activity className="w-5 h-5 text-gold" />
            Accès Rapide
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            <QuickLink icon={Heart} label="Mariages" onClick={() => setActiveTab('weddings')} />
            <QuickLink icon={HeartPulse} label="Santé plateforme" onClick={() => setActiveTab('platform-health')} />
            <QuickLink icon={QrCode} label="QR & Invitations" onClick={() => setActiveTab('qr-invitations')} />
            <QuickLink icon={Server} label="Opérations" onClick={() => setActiveTab('ops')} />
            <QuickLink icon={FileText} label="Journal d'audit" onClick={() => setActiveTab('audit')} />
            <QuickLink icon={Users} label="Utilisateurs" onClick={() => setActiveTab('users')} />
            <QuickLink icon={Layers} label="Layouts" onClick={() => setActiveTab('layouts')} />
            <QuickLink icon={Shield} label="Gouvernance" onClick={() => setActiveTab('governance')} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────

function KpiCard({
  icon: Icon,
  label,
  value,
  gradient,
  iconClass,
  onClick,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: number;
  gradient: string;
  iconClass: string;
  onClick?: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={onClick ? { scale: 1.02 } : undefined}
      transition={{ duration: 0.2 }}
    >
      <Card
        className={`glass-card gold-border border-0 overflow-hidden ${onClick ? 'cursor-pointer' : ''}`}
        onClick={onClick}
      >
        <CardContent className="p-3">
          <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${gradient} flex items-center justify-center mb-2`}>
            <Icon className={`w-4 h-4 ${iconClass}`} />
          </div>
          <p className="text-xl font-bold">{value}</p>
          <p className="text-[10px] text-muted-foreground">{label}</p>
        </CardContent>
      </Card>
    </motion.div>
  );
}

function CatalogCard({
  icon: Icon,
  title,
  count,
  tabId,
  setActiveTab,
  emptyHint,
  onSeed,
  seeding,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  count: number;
  tabId: TabId;
  setActiveTab: (tab: TabId) => void;
  emptyHint: string;
  onSeed?: () => void;
  seeding: boolean;
}) {
  const isEmpty = count === 0;
  return (
    <Card className={`glass-card border-0 overflow-hidden ${isEmpty ? 'border border-red-500/30' : 'gold-border'}`}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className={`w-9 h-9 rounded-lg ${isEmpty ? 'bg-red-500/10' : 'bg-emerald-500/10'} flex items-center justify-center`}>
              <Icon className={`w-4 h-4 ${isEmpty ? 'text-red-400' : 'text-emerald-400'}`} />
            </div>
            <div>
              <p className="text-sm font-medium">{title}</p>
              <p className="text-xs text-muted-foreground">{count} entrée{count !== 1 ? 's' : ''}</p>
            </div>
          </div>
          {isEmpty ? (
            <Badge className="bg-red-500/15 text-red-500 border-red-500/30 text-[10px]">VIDE</Badge>
          ) : (
            <Badge className="bg-emerald-500/15 text-emerald-500 border-emerald-500/30 text-[10px]">OK</Badge>
          )}
        </div>
        {isEmpty ? (
          <div className="space-y-2">
            <p className="text-[11px] text-muted-foreground">{emptyHint}</p>
            {onSeed && (
              <Button size="sm" variant="default" onClick={onSeed} disabled={seeding} className="w-full">
                {seeding ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Wrench className="w-3.5 h-3.5 mr-1.5" />}
                Seed maintenant
              </Button>
            )}
          </div>
        ) : (
          <Button size="sm" variant="outline" onClick={() => setActiveTab(tabId)} className="w-full">
            Gérer
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

function MiniStat({ label, value, onClick }: { label: string; value: number; onClick?: () => void }) {
  return (
    <div
      className={`p-3 rounded-lg bg-muted/30 border border-border/50 ${onClick ? 'cursor-pointer hover:bg-muted/50 transition-colors' : ''}`}
      onClick={onClick}
    >
      <p className="text-2xl font-bold text-gold">{value}</p>
      <p className="text-[10px] text-muted-foreground mt-0.5">{label}</p>
    </div>
  );
}

function Row({ label, value, status }: { label: string; value: string; status: 'pass' | 'warn' | 'fail' }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-border/30 last:border-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium">{value}</span>
        {status === 'pass' && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />}
        {status === 'warn' && <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />}
        {status === 'fail' && <AlertCircle className="w-3.5 h-3.5 text-red-500" />}
      </div>
    </div>
  );
}

function QuickLink({ icon: Icon, label, onClick }: { icon: ComponentType<{ className?: string }>; label: string; onClick: () => void }) {
  return (
    <Button
      variant="outline"
      onClick={onClick}
      className="justify-start h-auto py-3"
    >
      <Icon className="w-4 h-4 mr-2 text-gold" />
      <span className="text-xs">{label}</span>
    </Button>
  );
}
