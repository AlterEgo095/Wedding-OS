'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Globe,
  Mail,
  Printer,
  Megaphone,
  Sparkles,
  CheckCircle2,
  Circle,
  Loader2,
  Save,
  Lock,
} from 'lucide-react';
import { toast } from 'sonner';
import type {
  CollectionModulePublic,
  CompletenessReport,
  ModulePack,
} from '@/lib/collections';

interface CollectionModulesManagerProps {
  /** The Collection to manage modules for. */
  collectionId: string | null;
  collectionName?: string;
  collectionSlug?: string;
  /** Controlled open state — the parent (CollectionLibrary) toggles this. */
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const PACK_META: Record<
  ModulePack,
  { label: string; icon: React.ComponentType<{ className?: string }>; description: string }
> = {
  WEBSITE: {
    label: 'Website',
    icon: Globe,
    description: '10 modules — site web public du mariage',
  },
  INVITATIONS: {
    label: 'Invitations',
    icon: Mail,
    description: '8 modules — déployées selon le tier du guest',
  },
  PRINT: {
    label: 'Print',
    icon: Printer,
    description: '8 modules — supports physiques pour le jour J',
  },
  COMMUNICATION: {
    label: 'Communication',
    icon: Megaphone,
    description: '8 modules — supports de communication marketing',
  },
};

/**
 * CollectionModulesManager — admin UI to view + edit the 34 module slots of a
 * Collection Product.
 *
 * Phase 2 scope:
 *   - Shows the 5 packs (4 frame-based + 1 luxury data-only)
 *   - Each pack lists its slots with a Penpot frameId input
 *   - Live completeness progress bar (per pack + global)
 *   - Save per slot (PATCH /api/collections/[id]/modules)
 *   - Read-only for non-PLATFORM_ADMIN (frameId inputs disabled)
 *
 * What it does NOT do (deferred):
 *   - Bulk import from Penpot file (designer picks frames visually)
 *   - Live Penpot frame preview (Phase 3+)
 *   - Publish gating (the completeness report is shown but publish is not blocked yet)
 */
export function CollectionModulesManager({
  collectionId,
  collectionName,
  collectionSlug,
  open,
  onOpenChange,
}: CollectionModulesManagerProps) {
  const [modules, setModules] = useState<CollectionModulePublic[]>([]);
  const [report, setReport] = useState<CompletenessReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  // Lazy initializer — reads role synchronously on first client render so the
  // inputs are enabled immediately when the modal opens (no flash of disabled state).
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(() => {
    if (typeof window === 'undefined') return false;
    try {
      const raw = localStorage.getItem('admin_user');
      if (!raw) return false;
      const u = JSON.parse(raw);
      return u?.role === 'PLATFORM_ADMIN' || u?.role === 'SUPER_ADMIN';
    } catch {
      return false;
    }
  });

  // Re-check on every open (in case the user logged in/out since mount)
  useEffect(() => {
    if (!open) return;
    try {
      const raw = localStorage.getItem('admin_user');
      if (raw) {
        const u = JSON.parse(raw);
        setIsPlatformAdmin(u?.role === 'PLATFORM_ADMIN' || u?.role === 'SUPER_ADMIN');
      } else {
        setIsPlatformAdmin(false);
      }
    } catch {
      setIsPlatformAdmin(false);
    }
  }, [open]);

  const loadModules = useCallback(async () => {
    if (!collectionId) return;
    setLoading(true);
    try {
      const [modRes, repRes] = await Promise.all([
        fetch(`/api/collections/${collectionId}/modules`),
        fetch(`/api/collections/${collectionId}/completeness`),
      ]);
      if (!modRes.ok || !repRes.ok) throw new Error('Failed to load modules');
      const [modData, repData] = await Promise.all([modRes.json(), repRes.json()]);
      setModules(modData.modules || []);
      setReport(repData.report || null);
      // Initialize drafts from loaded frameIds
      const initialDrafts: Record<string, string> = {};
      for (const m of modData.modules || []) {
        initialDrafts[`${m.pack}|${m.slot}`] = m.frameId ?? '';
      }
      setDrafts(initialDrafts);
    } catch {
      toast.error('Impossible de charger les modules de la Collection');
    } finally {
      setLoading(false);
    }
  }, [collectionId]);

  useEffect(() => {
    if (open && collectionId) {
      loadModules();
    }
  }, [open, collectionId, loadModules]);

  const handleSave = async (pack: ModulePack, slot: string) => {
    const key = `${pack}|${slot}`;
    const frameId = drafts[key] ?? '';
    setSavingKey(key);
    try {
      const res = await fetch(`/api/collections/${collectionId}/modules`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pack, slot, frameId: frameId || null }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to save');
      }
      const { module: updated } = await res.json();
      setModules((prev) =>
        prev.map((m) =>
          m.pack === pack && m.slot === slot ? updated : m
        )
      );
      toast.success(`Slot "${slot}" → ${frameId ? 'mappé' : 'non mappé'}`);
      // Refresh completeness report
      const repRes = await fetch(`/api/collections/${collectionId}/completeness`);
      if (repRes.ok) {
        const repData = await repRes.json();
        setReport(repData.report || null);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erreur lors de la sauvegarde');
    } finally {
      setSavingKey(null);
    }
  };

  const packModules = (pack: ModulePack) =>
    modules.filter((m) => m.pack === pack).sort((a, b) => a.sortOrder - b.sortOrder);

  const globalProgress = report
    ? report.total > 0
      ? Math.round((report.filled / report.total) * 100)
      : 0
    : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-amber-500" />
            Modules — {collectionName || 'Collection'}
          </DialogTitle>
          <DialogDescription>
            5 packs · 34 slots Penpot + 1 luxury preset (data-only). Collection{' '}
            <code className="text-xs bg-muted px-1 py-0.5 rounded">
              {collectionSlug}
            </code>
            {!isPlatformAdmin && (
              <span className="ml-2 inline-flex items-center gap-1 text-xs text-muted-foreground">
                <Lock className="h-3 w-3" /> Lecture seule — admin plateforme requis pour mapper
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        {/* Global completeness progress */}
        {report && (
          <Card className="border-dashed">
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">Complétude globale</span>
                <Badge variant={report.complete ? 'default' : 'secondary'}>
                  {report.filled} / {report.total}
                </Badge>
              </div>
              <Progress value={globalProgress} className="h-2" />
              <p className="text-xs text-muted-foreground mt-2">
                {report.complete
                  ? '✅ Collection complète — prête à être publiée (§4.8)'
                  : `${report.missing} slot(s) non mappé(s) — le rendu utilise les composants existants (fallback zéro régression)`}
              </p>
            </CardContent>
          </Card>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <ScrollArea className="flex-1 max-h-[55vh] pr-4">
            <Tabs defaultValue="WEBSITE" className="w-full">
              <TabsList className="grid w-full grid-cols-4">
                {(Object.keys(PACK_META) as ModulePack[]).map((pack) => {
                  const Icon = PACK_META[pack].icon;
                  const packReport = report?.byPack[pack];
                  return (
                    <TabsTrigger key={pack} value={pack} className="gap-1.5">
                      <Icon className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">{PACK_META[pack].label}</span>
                      {packReport && (
                        <Badge
                          variant={packReport.complete ? 'default' : 'outline'}
                          className="ml-1 h-4 px-1 text-[10px]"
                        >
                          {packReport.filled}/{packReport.total}
                        </Badge>
                      )}
                    </TabsTrigger>
                  );
                })}
              </TabsList>

              {(Object.keys(PACK_META) as ModulePack[]).map((pack) => {
                const Icon = PACK_META[pack].icon;
                const packReport = report?.byPack[pack];
                const packProgress = packReport && packReport.total > 0
                  ? Math.round((packReport.filled / packReport.total) * 100)
                  : 0;
                return (
                  <TabsContent key={pack} value={pack} className="mt-4">
                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="flex items-center justify-between text-base">
                          <span className="flex items-center gap-2">
                            <Icon className="h-4 w-4" />
                            {PACK_META[pack].label}
                          </span>
                          {packReport && (
                            <Badge variant={packReport.complete ? 'default' : 'secondary'}>
                              {packReport.filled}/{packReport.total}
                            </Badge>
                          )}
                        </CardTitle>
                        <p className="text-xs text-muted-foreground">
                          {PACK_META[pack].description}
                        </p>
                        {packReport && (
                          <Progress value={packProgress} className="h-1.5 mt-2" />
                        )}
                      </CardHeader>
                      <CardContent className="space-y-2">
                        {packModules(pack).map((m) => {
                          const key = `${m.pack}|${m.slot}`;
                          const isFilled = !!m.frameId;
                          const isSaving = savingKey === key;
                          const hasDraft = drafts[key] !== (m.frameId ?? '');
                          return (
                            <div
                              key={m.id}
                              className="flex flex-col sm:flex-row sm:items-center gap-2 p-2 rounded-md border bg-card hover:bg-accent/30 transition-colors"
                            >
                              <div className="flex items-start gap-2 flex-1 min-w-0">
                                {isFilled ? (
                                  <CheckCircle2 className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" />
                                ) : (
                                  <Circle className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                                )}
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <Label className="text-sm font-medium leading-tight">
                                      {m.slot}
                                    </Label>
                                    {m.guestTier && (
                                      <Badge variant="outline" className="h-4 px-1 text-[10px]">
                                        {m.guestTier}
                                      </Badge>
                                    )}
                                  </div>
                                  <p className="text-xs text-muted-foreground truncate">
                                    {m.label}
                                  </p>
                                </div>
                              </div>
                              <div className="flex items-center gap-1.5 sm:w-80">
                                <Input
                                  value={drafts[key] ?? ''}
                                  onChange={(e) =>
                                    setDrafts((prev) => ({ ...prev, [key]: e.target.value }))
                                  }
                                  placeholder="Penpot frame ID"
                                  disabled={!isPlatformAdmin || isSaving}
                                  className="h-8 text-xs font-mono"
                                />
                                <Button
                                  size="sm"
                                  variant={hasDraft ? 'default' : 'outline'}
                                  onClick={() => handleSave(m.pack, m.slot)}
                                  disabled={!isPlatformAdmin || isSaving || !hasDraft}
                                  className="h-8 px-2 shrink-0"
                                >
                                  {isSaving ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  ) : (
                                    <Save className="h-3.5 w-3.5" />
                                  )}
                                </Button>
                              </div>
                            </div>
                          );
                        })}
                      </CardContent>
                    </Card>
                  </TabsContent>
                );
              })}
            </Tabs>

            {/* Pack 5 — Luxury (data-only, read-only display) */}
            <Accordion type="single" collapsible className="mt-4">
              <AccordionItem value="luxury">
                <AccordionTrigger className="text-sm">
                  <span className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    Pack 5 — Luxury Preset (data-only)
                  </span>
                </AccordionTrigger>
                <AccordionContent className="text-xs text-muted-foreground">
                  Le luxury preset est stocké directement dans la Collection (champ{' '}
                  <code className="bg-muted px-1 rounded">luxuryPreset</code>) et hydrate le
                  LuxuryVisualEngine existant via ThemeInjector. Aucune frame Penpot nécessaire —
                  c&apos;est de la data JSON qui configure les effets visuels (starrySky,
                  goldenDust, microSparkles, luminousHalos, globalBreathing, etc.).
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  );
}
