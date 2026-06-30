'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  PenTool,
  Crown,
  ArrowRightCircle,
  Loader2,
  RefreshCw,
  Lock,
  CheckCircle2,
  Archive,
  Send,
  Eye,
} from 'lucide-react';
import { toast } from 'sonner';

// ─── Types (mirrors of src/lib/collections types) ───────────────────────────

type CollectionStatus =
  | 'BROUILLON'
  | 'EN_COURS'
  | 'VALIDATION'
  | 'PUBLIE'
  | 'COMMERCIALISE'
  | 'ARCHIVE';

interface TransitionOption {
  to: CollectionStatus;
  label: string;
  allowed: boolean;
  reason?: string;
}

interface DesignerCollection {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  category: string;
  tier: string;
  status: CollectionStatus;
  version: string;
  authorId: string | null;
  authorName: string | null;
  submittedAt: string | null;
  publishedAt: string | null;
  commercializedAt: string | null;
  archivedAt: string | null;
}

// ─── Status visual config ────────────────────────────────────────────────────

const STATUS_CONFIG: Record<
  CollectionStatus,
  { label: string; color: string; icon: React.ComponentType<{ className?: string }> }
> = {
  BROUILLON: { label: 'Brouillon', color: 'bg-slate-200 text-slate-800', icon: PenTool },
  EN_COURS: { label: 'En cours', color: 'bg-blue-100 text-blue-800', icon: PenTool },
  VALIDATION: { label: 'En validation', color: 'bg-amber-100 text-amber-800', icon: Eye },
  PUBLIE: { label: 'Publié', color: 'bg-purple-100 text-purple-800', icon: CheckCircle2 },
  COMMERCIALISE: { label: 'Commercialisé', color: 'bg-emerald-100 text-emerald-800', icon: Crown },
  ARCHIVE: { label: 'Archivé', color: 'bg-zinc-200 text-zinc-700', icon: Archive },
};

// ─── Component ───────────────────────────────────────────────────────────────

export function DesignerPortal() {
  const [collections, setCollections] = useState<DesignerCollection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<string>('CONTROLLER');
  const [transitionTarget, setTransitionTarget] = useState<DesignerCollection | null>(null);
  const [transitions, setTransitions] = useState<TransitionOption[]>([]);
  const [transitionLoading, setTransitionLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  // Read admin_user role from localStorage (same pattern as CollectionModulesManager)
  useEffect(() => {
    try {
      const raw = localStorage.getItem('admin_user');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?.role) setUserRole(parsed.role);
      }
    } catch {
      // ignore — fail-safe to CONTROLLER
    }
  }, []);

  const fetchCollections = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/designer/collections', { cache: 'no-store' });
      if (res.status === 403) {
        setError('Accès réservé aux designers et directeurs artistiques.');
        setCollections([]);
        return;
      }
      if (!res.ok) throw new Error('Échec du chargement');
      const data = await res.json();
      setCollections(data.collections ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur inconnue');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCollections();
  }, [fetchCollections]);

  const openTransitionDialog = useCallback(async (collection: DesignerCollection) => {
    setTransitionTarget(collection);
    setDialogOpen(true);
    setTransitions([]);
    try {
      const res = await fetch(`/api/collections/${collection.id}/transition`, { cache: 'no-store' });
      if (!res.ok) throw new Error('Échec du chargement des transitions');
      const data = await res.json();
      setTransitions(data.transitions ?? []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erreur transitions');
    }
  }, []);

  const executeTransition = useCallback(
    async (to: CollectionStatus) => {
      if (!transitionTarget) return;
      setTransitionLoading(true);
      try {
        const res = await fetch(`/api/collections/${transitionTarget.id}/transition`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ to }),
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || 'Échec de la transition');
        }
        toast.success(
          `${transitionTarget.name}: ${data.fromLabel} → ${data.toLabel}` +
            (data.version ? ` (v${data.version})` : '')
        );
        setDialogOpen(false);
        setTransitionTarget(null);
        await fetchCollections();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Erreur');
      } finally {
        setTransitionLoading(false);
      }
    },
    [transitionTarget, fetchCollections]
  );

  // ─── Stats ─────────────────────────────────────────────────────────────────

  const stats = {
    total: collections.length,
    byStatus: (Object.keys(STATUS_CONFIG) as CollectionStatus[]).reduce(
      (acc, s) => {
        acc[s] = collections.filter((c) => c.status === s).length;
        return acc;
      },
      {} as Record<CollectionStatus, number>
    ),
  };

  // ─── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <span className="ml-2 text-muted-foreground">Chargement du Designer Portal…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-md border border-amber-200 bg-amber-50 p-6 text-center">
        <Lock className="mx-auto h-8 w-8 text-amber-600 mb-2" />
        <p className="text-sm text-amber-900">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header + refresh */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <PenTool className="h-5 w-5" />
            Designer Portal — Cycle de vie des Collections
          </h3>
          <p className="text-sm text-muted-foreground mt-1">
            6 états: Brouillon → En cours → Validation → Publié → Commercialisé → Archivé.
            Chaque transition est journalisée.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchCollections}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Rafraîchir
        </Button>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
        {(Object.keys(STATUS_CONFIG) as CollectionStatus[]).map((s) => {
          const cfg = STATUS_CONFIG[s];
          const Icon = cfg.icon;
          const count = stats.byStatus[s] ?? 0;
          return (
            <Card key={s} className="py-3">
              <CardContent className="p-3 text-center">
                <Icon className="h-4 w-4 mx-auto mb-1 text-muted-foreground" />
                <div className="text-2xl font-bold">{count}</div>
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground mt-0.5">
                  {cfg.label}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Collections list */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center justify-between">
            <span>Collections ({stats.total})</span>
            <span className="text-xs font-normal text-muted-foreground">
              Rôle courant: <code className="bg-muted px-1 py-0.5 rounded">{userRole}</code>
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <ScrollArea className="h-[480px]">
            <div className="divide-y">
              {collections.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground text-sm">
                  Aucune Collection.
                </div>
              ) : (
                collections.map((c) => {
                  const cfg = STATUS_CONFIG[c.status];
                  const Icon = cfg.icon;
                  return (
                    <div
                      key={c.id}
                      className="flex items-center gap-4 p-4 hover:bg-accent/50 transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium truncate">{c.name}</span>
                          <Badge variant="outline" className="text-[10px] font-mono">
                            {c.slug}
                          </Badge>
                          <Badge variant="outline" className="text-[10px]">
                            v{c.version}
                          </Badge>
                          <Badge className={`${cfg.color} text-[10px] gap-1`}>
                            <Icon className="h-3 w-3" />
                            {cfg.label}
                          </Badge>
                          <Badge variant="secondary" className="text-[10px]">
                            {c.category}
                          </Badge>
                          <Badge variant="secondary" className="text-[10px]">
                            {c.tier}
                          </Badge>
                        </div>
                        <div className="text-xs text-muted-foreground mt-1 truncate">
                          {c.description ?? '—'}
                          {c.authorName && ` · Auteur: ${c.authorName}`}
                          {c.publishedAt &&
                            ` · Publié le ${new Date(c.publishedAt).toLocaleDateString('fr-FR')}`}
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => openTransitionDialog(c)}
                      >
                        <ArrowRightCircle className="h-4 w-4 mr-1" />
                        Transition
                      </Button>
                    </div>
                  );
                })
              )}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Transition dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ArrowRightCircle className="h-5 w-5" />
              Transition de cycle de vie
            </DialogTitle>
            <DialogDescription>
              {transitionTarget && (
                <>
                  Collection: <strong>{transitionTarget.name}</strong> · État courant:{' '}
                  <Badge className={`${STATUS_CONFIG[transitionTarget.status].color} text-[10px]`}>
                    {STATUS_CONFIG[transitionTarget.status].label}
                  </Badge>{' '}
                  (v{transitionTarget.version})
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 py-2">
            {transitions.length === 0 ? (
              <div className="text-center text-sm text-muted-foreground py-4">
                <Loader2 className="h-4 w-4 animate-spin mx-auto mb-2" />
                Chargement des transitions…
              </div>
            ) : (
              transitions.map((t) => {
                const targetCfg = STATUS_CONFIG[t.to];
                const TargetIcon = targetCfg.icon;
                return (
                  <TooltipProvider key={t.to} delayDuration={200}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div
                          className={`flex items-center gap-3 rounded-md border p-3 transition-colors ${
                            t.allowed
                              ? 'hover:bg-accent cursor-pointer'
                              : 'opacity-60 cursor-not-allowed bg-muted/30'
                          }`}
                          onClick={() => t.allowed && !transitionLoading && executeTransition(t.to)}
                        >
                          <TargetIcon className="h-4 w-4 text-muted-foreground" />
                          <div className="flex-1">
                            <div className="text-sm font-medium">{t.label}</div>
                            <div className="text-xs text-muted-foreground">
                              vers {targetCfg.label}
                            </div>
                          </div>
                          {t.allowed ? (
                            transitionLoading ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <ArrowRightCircle className="h-4 w-4" />
                            )
                          ) : (
                            <Lock className="h-4 w-4 text-muted-foreground" />
                          )}
                        </div>
                      </TooltipTrigger>
                      {!t.allowed && t.reason && (
                        <TooltipContent side="left">
                          <span className="text-xs">{t.reason}</span>
                        </TooltipContent>
                      )}
                    </Tooltip>
                  </TooltipProvider>
                );
              })
            )}
          </div>

          <DialogFooter className="text-xs text-muted-foreground">
            <Send className="h-3 w-3 inline mr-1" />
            Chaque transition est journalisée dans l'AuditLog pour traçabilité.
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
