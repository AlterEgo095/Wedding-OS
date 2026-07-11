// ══════════════════════════════════════════════════════════════════════════════
// GOVERNANCE DASHBOARD — Mission 5.8.6 Phase 8
// ══════════════════════════════════════════════════════════════════════════════

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ShieldCheck, GitBranch, Clock, Archive, CheckCircle2, AlertCircle, Loader2, History } from 'lucide-react';
import { toast } from 'sonner';

interface GovernanceData {
  collections: {
    total: number; drafts: number; inReview: number; validation: number;
    published: number; commercialised: number; archived: number;
  };
  versions: { total: number };
  recentAudits: Array<{ id: string; action: string; details: string; userId: string | null; createdAt: string }>;
}

interface VersionHistory {
  id: string; version: string; note: string | null;
  sourceHash: string | null; createdBy: string | null; createdAt: string;
}

export function GovernanceDashboard({ csrfToken }: { csrfToken: string }) {
  const [data, setData] = useState<GovernanceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [history, setHistory] = useState<VersionHistory[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [acting, setActing] = useState(false);

  const headers = { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken };

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/design/governance?action=dashboard', { method: 'POST', headers, body: JSON.stringify({ action: 'dashboard' }) });
      if (res.ok) {
        const d = await res.json();
        setData(d.dashboard);
      }
    } catch { toast.error('Erreur de chargement') }
    finally { setLoading(false) }
  }, [csrfToken]);

  useEffect(() => { fetchData() }, [fetchData]);

  const fetchHistory = async (collectionId: string) => {
    try {
      const res = await fetch(`/api/design/governance?collectionId=${collectionId}`, { headers });
      if (res.ok) {
        const d = await res.json();
        setHistory(d.history || []);
        setShowHistory(true);
      }
    } catch { toast.error('Erreur historique') }
  };

  const govern = async (action: string, collectionId: string, comment?: string) => {
    setActing(true);
    try {
      const res = await fetch('/api/design/governance', {
        method: 'POST', headers,
        body: JSON.stringify({ action, collectionId, comment }),
      });
      const d = await res.json();
      if (d.success) {
        toast.success(`Governance: ${action} OK`);
        fetchData();
      } else {
        toast.error(`Governance: ${d.error || 'failed'}`);
      }
    } catch { toast.error('Erreur') }
    finally { setActing(false) }
  };

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="size-8 animate-spin text-gold" /></div>;
  if (!data) return <p className="text-sm text-muted-foreground text-center py-8">Données non disponibles</p>;

  const kpiCards = [
    { label: 'Total', value: data.collections.total, sub: 'collections', icon: ShieldCheck, color: 'text-gold' },
    { label: 'Drafts', value: data.collections.drafts, sub: 'BROUILLON', icon: Clock, color: 'text-amber-400' },
    { label: 'In Review', value: data.collections.inReview, sub: 'EN_COURS', icon: AlertCircle, color: 'text-blue-400' },
    { label: 'Validation', value: data.collections.validation, sub: 'pending approval', icon: ShieldCheck, color: 'text-purple-400' },
    { label: 'Published', value: data.collections.published, sub: 'PUBLIE', icon: CheckCircle2, color: 'text-emerald-400' },
    { label: 'Active', value: data.collections.commercialised, sub: 'COMMERCIALISE', icon: CheckCircle2, color: 'text-emerald-400' },
    { label: 'Archived', value: data.collections.archived, sub: 'ARCHIVE', icon: Archive, color: 'text-gray-400' },
    { label: 'Versions', value: data.versions.total, sub: 'snapshots', icon: GitBranch, color: 'text-gold' },
  ];

  return (
    <div className="space-y-4">
      {/* Governance KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-2">
        {kpiCards.map((c, i) => (
          <Card key={i} className="glass-card gold-border">
            <CardContent className="p-2">
              <div className="flex items-center gap-1 mb-0.5">
                <c.icon className={`w-3 h-3 ${c.color}`} />
                <span className="text-[9px] uppercase tracking-wider text-muted-foreground">{c.label}</span>
              </div>
              <p className="text-lg font-bold">{c.value}</p>
              <p className="text-[9px] text-muted-foreground">{c.sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Governance Pipeline */}
      <Card className="glass-card gold-border">
        <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-gold" /> Governance Pipeline — Canonical Lifecycle</CardTitle></CardHeader>
        <CardContent>
          <div className="flex items-center gap-1 text-[10px] text-muted-foreground overflow-x-auto pb-2">
            {['DRAFT', 'IN_REVIEW', 'QUALITY_CHECK', 'APPROVED', 'PUBLISHED', 'ACTIVE', 'ARCHIVED', 'RESTORED'].map((s, i) => (
              <span key={s} className="whitespace-nowrap">
                <Badge variant="outline" className="text-[9px] h-5">{s}</Badge>
                {i < 7 && <span className="mx-0.5">→</span>}
              </span>
            ))}
          </div>
          <p className="text-[10px] text-muted-foreground mt-2">
            All transitions go through transitionCollection() with role matrix + completeness gate.
            No direct DB mutation. Every action is audit-logged.
          </p>
        </CardContent>
      </Card>

      {/* Recent Governance Audit Trail */}
      <Card className="glass-card gold-border">
        <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><History className="w-4 h-4 text-gold" /> Recent Governance Actions</CardTitle></CardHeader>
        <CardContent className="space-y-1 max-h-64 overflow-y-auto">
          {data.recentAudits.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">Aucune action de gouvernance récente</p>
          ) : (
            data.recentAudits.map(a => (
              <div key={a.id} className="flex items-start gap-2 p-1.5 rounded text-xs border border-white/5">
                <Badge variant="outline" className="text-[9px] h-4 shrink-0">{a.action.replace('GOVERNANCE_', '')}</Badge>
                <span className="text-muted-foreground truncate flex-1">{a.details}</span>
                <span className="text-[9px] text-muted-foreground/50 shrink-0">{new Date(a.createdAt).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {showHistory && history.length > 0 && (
        <Card className="glass-card gold-border">
          <CardHeader className="pb-2"><CardTitle className="text-sm">Version History</CardTitle></CardHeader>
          <CardContent className="space-y-1 max-h-48 overflow-y-auto">
            {history.map(v => (
              <div key={v.id} className="flex items-center gap-2 p-1.5 rounded text-xs border border-white/5">
                <Badge variant="outline" className="text-[9px] h-4 font-mono">v{v.version}</Badge>
                <span className="text-muted-foreground truncate flex-1">{v.note || 'No comment'}</span>
                <span className="text-[9px] text-muted-foreground/50">{new Date(v.createdAt).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
