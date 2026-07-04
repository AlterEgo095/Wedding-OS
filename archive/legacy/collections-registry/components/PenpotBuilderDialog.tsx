'use client';

import { useState, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
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
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Loader2,
  Link2,
  Unlink,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  RefreshCw,
  Wand2,
  Info,
} from 'lucide-react';
import { toast } from 'sonner';

// ─── Types (mirror of src/lib/penpot/autoDetect.ts DetectionReport) ─────────

type ModulePack = 'WEBSITE' | 'INVITATIONS' | 'PRINT' | 'COMMUNICATION';

interface DetectionEntry {
  frameId: string;
  frameName: string;
  pageId: string | null;
  pageName: string | null;
  matched: boolean;
  pack?: ModulePack;
  slot?: string;
  canonicalName?: string;
  variant?: string | null;
  reason?: 'no_match' | 'ambiguous';
}

interface MissingSlot {
  pack: ModulePack;
  slot: string;
  label: string;
  acceptedNames: readonly string[];
}

interface DetectionReport {
  detectedAt: string;
  sourceUrl: string;
  fileId: string | null;
  pageId: string | null;
  fileName: string | null;
  mockMode: boolean;
  totalFrames: number;
  matchedCount: number;
  unmatchedCount: number;
  detectedSlotsCount: number;
  missingSlotsCount: number;
  totalSlots: number;
  complete: boolean;
  byPack: Record<ModulePack, { detected: number; total: number; missingSlots: readonly MissingSlot[] }>;
  entries: readonly DetectionEntry[];
  missingSlots: readonly MissingSlot[];
  errors: readonly string[];
  warnings: readonly string[];
}

interface AutoMapResult {
  collectionId: string;
  updated: number;
  preserved: number;
  unmapped: number;
  total: number;
  complete: boolean;
  syncedAt: string;
}

interface QualityReport {
  overall: number;
  validForPublish: boolean;
  publishBlockers: string[];
  sections: Record<string, { label: string; points: number; maxPoints: number; passed: boolean; detail: string }>;
}

interface PenpotBuilderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  collection: {
    id: string;
    name: string;
    slug: string;
    penpotFileUrl?: string | null;
    lastFrameSyncAt?: string | null;
  } | null;
  onSynced?: () => void;
}

// ─── Pack labels ─────────────────────────────────────────────────────────────

const PACK_LABELS: Record<ModulePack, string> = {
  WEBSITE: 'Website',
  INVITATIONS: 'Invitations',
  PRINT: 'Print',
  COMMUNICATION: 'Communication',
};

const PACK_ORDER: ModulePack[] = ['WEBSITE', 'INVITATIONS', 'PRINT', 'COMMUNICATION'];

// ─── Component ───────────────────────────────────────────────────────────────

export function PenpotBuilderDialog({
  open,
  onOpenChange,
  collection,
  onSynced,
}: PenpotBuilderDialogProps) {
  const [fileUrl, setFileUrl] = useState('');
  const [tokenId, setTokenId] = useState('');
  const [linking, setLinking] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [report, setReport] = useState<DetectionReport | null>(null);
  const [mapping, setMapping] = useState<AutoMapResult | null>(null);
  const [quality, setQuality] = useState<QualityReport | null>(null);
  const [clientState, setClientState] = useState<string>('');
  const [overrideManual, setOverrideManual] = useState(false);

  // Reset state when dialog opens for a different collection
  const resetState = useCallback(() => {
    setReport(null);
    setMapping(null);
    setQuality(null);
    setClientState('');
    setFileUrl(collection?.penpotFileUrl ?? '');
    setTokenId('');
    setOverrideManual(false);
  }, [collection]);

  // ─── Actions ──────────────────────────────────────────────────────────────

  const linkPenpot = useCallback(async () => {
    if (!collection) return;
    if (!fileUrl.trim()) {
      toast.error('URL Penpot requise');
      return;
    }
    setLinking(true);
    try {
      const res = await fetch(`/api/collections/${collection.id}/penpot-link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileUrl: fileUrl.trim(),
          tokenId: tokenId.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Échec de la liaison');
      toast.success(`Fichier Penpot lié (fileId: ${data.fileId || 'invalide'})`);
      onSynced?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setLinking(false);
    }
  }, [collection, fileUrl, tokenId, onSynced]);

  const unlinkPenpot = useCallback(async () => {
    if (!collection) return;
    setLinking(true);
    try {
      const res = await fetch(`/api/collections/${collection.id}/penpot-link`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Échec du déliement');
      toast.success('Fichier Penpot délié');
      setFileUrl('');
      setReport(null);
      setMapping(null);
      setQuality(null);
      onSynced?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setLinking(false);
    }
  }, [collection, onSynced]);

  const runAutoDetect = useCallback(async () => {
    if (!collection) return;
    setDetecting(true);
    setReport(null);
    setMapping(null);
    setQuality(null);
    try {
      const body: Record<string, unknown> = {
        applyMapping: true,
        overrideManual,
      };
      // Only send fileUrl if user typed a new one (otherwise reuse linked URL)
      if (fileUrl.trim() && fileUrl.trim() !== collection.penpotFileUrl) {
        body.fileUrl = fileUrl.trim();
      }
      const res = await fetch(`/api/collections/${collection.id}/auto-detect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Échec de l\'auto-détection');
      setReport(data.report);
      setMapping(data.mapping);
      setQuality(data.quality);
      setClientState(data.clientState || '');
      if (data.mapping) {
        toast.success(
          `${data.mapping.updated} slots mis à jour, ${data.mapping.preserved} preserves, ${data.mapping.unmapped} démapper. ` +
          (data.quality ? `Qualité: ${data.quality.overall}/100` : '')
        );
        onSynced?.();
      } else {
        toast.info(`Dry-run: ${data.report.detectedSlotsCount}/${data.report.totalSlots} slots détectés`);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setDetecting(false);
    }
  }, [collection, fileUrl, overrideManual, onSynced]);

  // ─── Derived display values ───────────────────────────────────────────────

  const isLinked = !!(collection?.penpotFileUrl || fileUrl.trim());
  const lastSync = collection?.lastFrameSyncAt
    ? new Date(collection.lastFrameSyncAt).toLocaleString('fr-FR')
    : null;

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (v) resetState();
        onOpenChange(v);
      }}
    >
      <DialogContent className="sm:max-w-[760px] max-h-[92vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wand2 className="h-5 w-5" />
            Penpot Builder — {collection?.name}
          </DialogTitle>
          <DialogDescription>
            Collez une URL Penpot, lancez l'auto-détection, Wedding OS construit automatiquement
            la Collection. Aucun Frame ID manuel.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 pr-2 -mr-2">
          <div className="space-y-4 py-2">
            {/* ─── Step 1: Link Penpot file ─────────────────────────────────── */}
            <Card className="border-l-4 border-l-blue-400">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-100 text-blue-700 text-xs font-bold">1</span>
                  <h4 className="text-sm font-semibold flex items-center gap-1.5">
                    <Link2 className="h-4 w-4" />
                    Lier le fichier Penpot
                  </h4>
                  {isLinked && (
                    <Badge variant="outline" className="text-[10px] gap-1 ml-auto">
                      <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                      Lié
                    </Badge>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="penpot-url" className="text-xs">
                    URL Penpot (view / share / editor)
                  </Label>
                  <Input
                    id="penpot-url"
                    placeholder="https://design.penpot.app/#/view?file-id=abc123&page-id=def456"
                    value={fileUrl}
                    onChange={(e) => setFileUrl(e.target.value)}
                    disabled={linking || detecting}
                    className="font-mono text-xs"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    L'URL est parsée automatiquement pour extraire <code>file-id</code> et <code>page-id</code>.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="penpot-token" className="text-xs">
                    Token Penpot (optionnel — sinon utilisation du token global)
                  </Label>
                  <Input
                    id="penpot-token"
                    placeholder="Penpot access token (Profile → Access Tokens)"
                    value={tokenId}
                    onChange={(e) => setTokenId(e.target.value)}
                    disabled={linking || detecting}
                    className="font-mono text-xs"
                    type="password"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    onClick={linkPenpot}
                    disabled={linking || detecting || !fileUrl.trim()}
                  >
                    {linking ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Link2 className="h-4 w-4 mr-1" />}
                    Lier le fichier
                  </Button>
                  {isLinked && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={unlinkPenpot}
                      disabled={linking || detecting}
                    >
                      <Unlink className="h-4 w-4 mr-1" />
                      Délier
                    </Button>
                  )}
                  {lastSync && (
                    <span className="text-[11px] text-muted-foreground ml-auto flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      Dernier sync: {lastSync}
                    </span>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* ─── Step 2: Auto-detect ──────────────────────────────────────── */}
            <Card className="border-l-4 border-l-purple-400">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-purple-100 text-purple-700 text-xs font-bold">2</span>
                  <h4 className="text-sm font-semibold flex items-center gap-1.5">
                    <Sparkles className="h-4 w-4" />
                    Auto-détection des frames
                  </h4>
                </div>

                <p className="text-xs text-muted-foreground">
                  Wedding OS scanne le fichier Penpot, reconnaît les frames par leur nom
                  (convention §2.3 du spec), et mappe automatiquement les 34 slots.
                </p>

                <label className="flex items-center gap-2 text-xs cursor-pointer">
                  <input
                    type="checkbox"
                    checked={overrideManual}
                    onChange={(e) => setOverrideManual(e.target.checked)}
                    disabled={detecting}
                    className="rounded"
                  />
                  <span>
                    Écraser les mappings manuels (défaut: <strong>préserver</strong> les overrides designer)
                  </span>
                </label>

                <Button
                  size="sm"
                  onClick={runAutoDetect}
                  disabled={detecting || !isLinked}
                >
                  {detecting ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-1" />
                  ) : (
                    <Wand2 className="h-4 w-4 mr-1" />
                  )}
                  {detecting ? 'Analyse en cours…' : 'Lancer l\'auto-détection'}
                </Button>

                {clientState && (
                  <div className="text-[11px] text-muted-foreground bg-muted/40 rounded p-2 font-mono">
                    {clientState}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* ─── Step 3: Detection report ─────────────────────────────────── */}
            {report && (
              <Card className="border-l-4 border-l-emerald-400">
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 text-xs font-bold">3</span>
                    <h4 className="text-sm font-semibold flex items-center gap-1.5">
                      <CheckCircle2 className="h-4 w-4" />
                      Rapport d'auto-détection
                    </h4>
                    <Badge
                      variant="outline"
                      className={`ml-auto text-[10px] ${
                        report.complete
                          ? 'border-emerald-300 text-emerald-700'
                          : 'border-amber-300 text-amber-700'
                      }`}
                    >
                      {report.detectedSlotsCount}/{report.totalSlots} slots
                    </Badge>
                  </div>

                  {/* Summary row */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                    <div className="rounded-md border p-2">
                      <div className="text-muted-foreground">Frames scannées</div>
                      <div className="font-bold text-base">{report.totalFrames}</div>
                    </div>
                    <div className="rounded-md border p-2">
                      <div className="text-muted-foreground">Reconnues</div>
                      <div className="font-bold text-base text-emerald-600">{report.matchedCount}</div>
                    </div>
                    <div className="rounded-md border p-2">
                      <div className="text-muted-foreground">Non reconnues</div>
                      <div className="font-bold text-base text-amber-600">{report.unmatchedCount}</div>
                    </div>
                    <div className="rounded-md border p-2">
                      <div className="text-muted-foreground">Slots manquants</div>
                      <div className="font-bold text-base text-rose-600">{report.missingSlotsCount}</div>
                    </div>
                  </div>

                  {/* Errors / warnings */}
                  {report.errors.length > 0 && (
                    <div className="rounded-md border border-rose-200 bg-rose-50 p-2 space-y-1">
                      {report.errors.map((e, i) => (
                        <div key={i} className="text-xs text-rose-800 flex items-start gap-1.5">
                          <XCircle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                          <span>{e}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {report.warnings.length > 0 && (
                    <div className="rounded-md border border-amber-200 bg-amber-50 p-2 space-y-1">
                      {report.warnings.map((w, i) => (
                        <div key={i} className="text-xs text-amber-800 flex items-start gap-1.5">
                          <AlertTriangle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                          <span>{w}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Per-pack progress */}
                  <div className="space-y-2">
                    {PACK_ORDER.map((pack) => {
                      const info = report.byPack[pack];
                      const pct = info.total > 0 ? (info.detected / info.total) * 100 : 0;
                      return (
                        <div key={pack}>
                          <div className="flex items-center justify-between text-xs mb-1">
                            <span className="font-medium">{PACK_LABELS[pack]}</span>
                            <span className={pct === 100 ? 'text-emerald-600' : pct > 0 ? 'text-amber-600' : 'text-muted-foreground'}>
                              {info.detected}/{info.total}
                            </span>
                          </div>
                          <Progress value={pct} className="h-1.5" />
                        </div>
                      );
                    })}
                  </div>

                  {/* Mapping result */}
                  {mapping && (
                    <div className="rounded-md border border-blue-200 bg-blue-50 p-2 text-xs text-blue-800 flex items-center gap-2">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      <span>
                        Mapping appliqué: <strong>{mapping.updated}</strong> mis à jour,
                        {' '}<strong>{mapping.preserved}</strong> preserves (overrides),
                        {' '}<strong>{mapping.unmapped}</strong> démapper.
                        {mapping.complete && ' ✓ Collection complète.'}
                      </span>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* ─── Step 4: Quality score ────────────────────────────────────── */}
            {quality && (
              <Card className="border-l-4 border-l-amber-400">
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-100 text-amber-700 text-xs font-bold">4</span>
                    <h4 className="text-sm font-semibold flex items-center gap-1.5">
                      <RefreshCw className="h-4 w-4" />
                      Score de qualité
                    </h4>
                    <Badge
                      variant="outline"
                      className={`ml-auto text-xs font-bold ${
                        quality.overall >= 80
                          ? 'border-emerald-300 text-emerald-700'
                          : quality.overall >= 50
                          ? 'border-amber-300 text-amber-700'
                          : 'border-rose-300 text-rose-700'
                      }`}
                    >
                      {quality.overall}/100
                    </Badge>
                  </div>

                  {/* Overall progress */}
                  <div>
                    <Progress value={quality.overall} className="h-2" />
                  </div>

                  {/* Per-section grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                    {Object.entries(quality.sections).map(([name, s]) => (
                      <div
                        key={name}
                        className={`rounded-md border p-2 ${
                          s.passed ? 'border-emerald-200 bg-emerald-50/50' : 'border-rose-200 bg-rose-50/50'
                        }`}
                      >
                        <div className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                          {s.passed ? (
                            <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                          ) : (
                            <XCircle className="h-3 w-3 text-rose-600" />
                          )}
                          {s.label}
                        </div>
                        <div className="font-bold text-sm mt-0.5">
                          {s.points}/{s.maxPoints}
                        </div>
                        <div className="text-[10px] text-muted-foreground">{s.detail}</div>
                      </div>
                    ))}
                  </div>

                  {/* Publish readiness */}
                  <div
                    className={`rounded-md border p-2 text-xs ${
                      quality.validForPublish
                        ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                        : 'border-rose-300 bg-rose-50 text-rose-800'
                    }`}
                  >
                    {quality.validForPublish ? (
                      <span className="flex items-center gap-1.5">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        <strong>Prête à publier</strong> — peut transiter vers PUBLIE.
                      </span>
                    ) : (
                      <div className="space-y-1">
                        <div className="flex items-center gap-1.5 font-medium">
                          <AlertTriangle className="h-3.5 w-3.5" />
                          Non publiable — blockers:
                        </div>
                        <ul className="list-disc list-inside ml-2 space-y-0.5">
                          {quality.publishBlockers.map((b, i) => (
                            <li key={i}>{b}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* ─── Detection entries detail (collapsible) ───────────────────── */}
            {report && report.entries.length > 0 && (
              <Accordion type="single" collapsible>
                <AccordionItem value="entries">
                  <AccordionTrigger className="text-xs">
                    Détail des {report.entries.length} frames analysées
                  </AccordionTrigger>
                  <AccordionContent>
                    <Tabs defaultValue="matched">
                      <TabsList className="grid w-full grid-cols-3 h-8">
                        <TabsTrigger value="matched" className="text-[11px]">
                          Reconnues ({report.entries.filter(e => e.matched).length})
                        </TabsTrigger>
                        <TabsTrigger value="unmatched" className="text-[11px]">
                          Non reconnues ({report.entries.filter(e => !e.matched).length})
                        </TabsTrigger>
                        <TabsTrigger value="missing" className="text-[11px]">
                          Manquantes ({report.missingSlots.length})
                        </TabsTrigger>
                      </TabsList>

                      <TabsContent value="matched" className="mt-2 max-h-60 overflow-y-auto">
                        <table className="w-full text-xs">
                          <thead className="text-[10px] uppercase text-muted-foreground">
                            <tr>
                              <th className="text-left p-1">Pack/Slot</th>
                              <th className="text-left p-1">Frame Penpot</th>
                              <th className="text-left p-1">Frame ID</th>
                            </tr>
                          </thead>
                          <tbody>
                            {report.entries.filter(e => e.matched).map((e, i) => (
                              <tr key={i} className="border-t">
                                <td className="p-1 font-mono text-[10px]">
                                  {e.pack}/{e.slot}
                                  {e.variant && <Badge variant="outline" className="ml-1 text-[9px]">{e.variant}</Badge>}
                                </td>
                                <td className="p-1 font-mono text-[10px]">{e.frameName}</td>
                                <td className="p-1 font-mono text-[10px] text-muted-foreground">{e.frameId}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </TabsContent>

                      <TabsContent value="unmatched" className="mt-2 max-h-60 overflow-y-auto">
                        {report.entries.filter(e => !e.matched).length === 0 ? (
                          <div className="text-xs text-muted-foreground text-center py-4">
                            Aucune frame non reconnue. Toutes les frames du fichier Penpot sont mappées.
                          </div>
                        ) : (
                          <table className="w-full text-xs">
                            <thead className="text-[10px] uppercase text-muted-foreground">
                              <tr>
                                <th className="text-left p-1">Frame</th>
                                <th className="text-left p-1">Page</th>
                                <th className="text-left p-1">Raison</th>
                              </tr>
                            </thead>
                            <tbody>
                              {report.entries.filter(e => !e.matched).map((e, i) => (
                                <tr key={i} className="border-t">
                                  <td className="p-1 font-mono text-[10px]">{e.frameName}</td>
                                  <td className="p-1 text-[10px]">{e.pageName ?? '—'}</td>
                                  <td className="p-1 text-[10px] text-amber-700">
                                    {e.reason === 'ambiguous' ? 'Ambiguë' : 'Aucun slot correspondant'}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </TabsContent>

                      <TabsContent value="missing" className="mt-2 max-h-60 overflow-y-auto">
                        {report.missingSlots.length === 0 ? (
                          <div className="text-xs text-emerald-700 text-center py-4 flex items-center justify-center gap-1">
                            <CheckCircle2 className="h-4 w-4" />
                            Aucun slot manquant. Collection complète.
                          </div>
                        ) : (
                          <table className="w-full text-xs">
                            <thead className="text-[10px] uppercase text-muted-foreground">
                              <tr>
                                <th className="text-left p-1">Pack/Slot</th>
                                <th className="text-left p-1">Label</th>
                                <th className="text-left p-1">Noms acceptés</th>
                              </tr>
                            </thead>
                            <tbody>
                              {report.missingSlots.map((m, i) => (
                                <tr key={i} className="border-t">
                                  <td className="p-1 font-mono text-[10px]">{m.pack}/{m.slot}</td>
                                  <td className="p-1 text-[10px]">{m.label}</td>
                                  <td className="p-1 font-mono text-[10px] text-muted-foreground">
                                    {m.acceptedNames.join(' · ')}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </TabsContent>
                    </Tabs>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            )}

            {/* ─── Help / convention reminder ──────────────────────────────── */}
            <div className="rounded-md border border-blue-200 bg-blue-50/50 p-3 text-xs text-blue-900 flex items-start gap-2">
              <Info className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <div>
                <strong>Convention de nommage Penpot:</strong> le designer nomme ses frames selon
                le spec §2.3 (ex: <code>hero</code>, <code>invitation-vip</code>, <code>place-card</code>,
                <code>roll-up</code>). Variante: préfixe <code>A/</code>, <code>B/</code> accepté.
                Insensible à la casse. Wedding OS détecte automatiquement — aucun Frame ID manuel.
              </div>
            </div>
          </div>
        </ScrollArea>

        <DialogFooter className="border-t pt-3">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Fermer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
