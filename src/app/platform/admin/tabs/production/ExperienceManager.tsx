'use client';

// ════════════════════════════════════════════════════════════════════════════
// ExperienceManager — Super Admin Production Studio (Mission 6.0 Phase 3.4).
// A/B variant configuration + event stream + aggregated engagement reports.
// ════════════════════════════════════════════════════════════════════════════
//
// Three sections:
//   1. A/B Variants — table of all ExperienceVariant rows for the selected
//      wedding. Traffic allocation bar (stacked A/B/C). Add/edit/delete +
//      inline trafficPct slider + isActive toggle.
//   2. Event Stream — paginated, filterable table of recent ExperienceEvent
//      rows.
//   3. Reports — aggregated metrics from /reports endpoint. Section engagement
//      table + simple bar chart. Variant conversion rate table.
//
// Follows the pattern of TemplatesManager.tsx (csrfToken prop, fetch with
// credentials, sonner toasts, shadcn/ui components, Lucide icons).

import { useState, useEffect, useCallback, useMemo } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
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
  Activity,
  FlaskConical,
  BarChart3,
  Plus,
  Trash2,
  ToggleLeft,
  RefreshCw,
  Loader2,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────

interface WeddingOption {
  id: string;
  slug: string;
  coupleLabel: string;
}

interface VariantRow {
  id: string;
  weddingId: string;
  sectionId: string;
  variantCode: 'A' | 'B' | 'C';
  trafficPct: number;
  description: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface EventRow {
  id: string;
  weddingId: string;
  guestId: string | null;
  eventType: string;
  sectionId: string | null;
  variantId: string | null;
  payloadJson: string;
  createdAt: string;
}

interface ReportRow {
  id: string;
  weddingId: string;
  periodStart: string;
  periodEnd: string;
  granularity: string;
  metricsJson: string;
  createdAt: string;
}

interface SectionEngagement {
  views: number;
  avgTimeSec: number;
  bounceRate: number;
  uniqueGuests: number;
}

interface VariantPerformance {
  impressions: number;
  conversions: number;
  conversionRate: number;
}

interface AggregatedMetrics {
  sectionEngagement: Record<string, SectionEngagement>;
  variantPerformance: Record<string, Record<string, VariantPerformance>>;
  topEvents: Array<{ eventType: string; count: number }>;
  totalEvents: number;
  uniqueVisitors: number;
}

interface ReportsSummary {
  totalEvents: number;
  uniqueVisitors: number;
  topSections: Array<{
    sectionId: string;
    views: number;
    avgTimeSec: number;
    bounceRate: number;
  }>;
  topVariants: Array<{
    sectionId: string;
    variantCode: string;
    impressions: number;
    conversions: number;
    conversionRate: number;
  }>;
}

const VARIANT_CODE_COLOR: Record<string, string> = {
  A: 'bg-emerald-500',
  B: 'bg-sky-500',
  C: 'bg-amber-500',
};

const VARIANT_CODE_TEXT: Record<string, string> = {
  A: 'text-emerald-400',
  B: 'text-sky-400',
  C: 'text-amber-400',
};

const EMPTY_NEW_VARIANT: NewVariantForm = {
  sectionId: 'accueil',
  variantCode: 'A',
  trafficPct: 50,
  description: '',
  isActive: true,
};

const SECTION_ID_SUGGESTIONS = [
  'accueil',
  'notre-histoire',
  'galerie',
  'programme',
  'lieu',
  'authentification',
  'hero',
  'story',
  'gallery',
  'timeline',
  'map',
  'guest-auth',
  'rsvp',
];

const EVENT_TYPE_SUGGESTIONS = [
  'ALL',
  'SECTION_VIEW',
  'VIEW',
  'CLICK',
  'SCROLL',
  'TIME_SPENT',
  'DWELL',
  'RSVP_VIEW',
  'RSVP_SUBMIT',
  'CTA_CLICK',
  'PHOTO_TAP',
  'CONVERSION',
];

interface NewVariantForm {
  sectionId: string;
  variantCode: 'A' | 'B' | 'C';
  trafficPct: number;
  description: string;
  isActive: boolean;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function ExperienceManager({ csrfToken }: { csrfToken: string }) {
  // ─── Wedding selector ─────────────────────────────────────────────────────
  const [weddings, setWeddings] = useState<WeddingOption[]>([]);
  const [weddingId, setWeddingId] = useState<string>('');
  const [loadingWeddings, setLoadingWeddings] = useState(true);

  // ─── Variants ──────────────────────────────────────────────────────────────
  const [variants, setVariants] = useState<VariantRow[]>([]);
  const [loadingVariants, setLoadingVariants] = useState(false);
  const [showVariantDialog, setShowVariantDialog] = useState(false);
  const [newVariantForm, setNewVariantForm] = useState<NewVariantForm>(EMPTY_NEW_VARIANT);
  const [savingVariant, setSavingVariant] = useState(false);
  const [dirtyVariants, setDirtyVariants] = useState<Record<string, Partial<VariantRow>>>({});

  // ─── Events ────────────────────────────────────────────────────────────────
  const [events, setEvents] = useState<EventRow[]>([]);
  const [eventsTotal, setEventsTotal] = useState(0);
  const [eventsPage, setEventsPage] = useState(1);
  const [eventsHasMore, setEventsHasMore] = useState(false);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [eventFilterType, setEventFilterType] = useState('ALL');
  const [eventFilterSection, setEventFilterSection] = useState('');

  // ─── Reports ───────────────────────────────────────────────────────────────
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [reportsSummary, setReportsSummary] = useState<ReportsSummary | null>(null);
  const [reportsSource, setReportsSource] = useState<'cache' | 'live' | null>(null);
  const [loadingReports, setLoadingReports] = useState(false);
  const [reportsGranularity, setReportsGranularity] = useState<'DAILY' | 'WEEKLY' | 'MONTHLY'>('DAILY');

  // ─── Active section tab ───────────────────────────────────────────────────
  const [activeSection, setActiveSection] = useState<'variants' | 'events' | 'reports'>('variants');

  // ─── Load wedding list ────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingWeddings(true);
      try {
        const res = await fetch('/api/platform/weddings?limit=100', { credentials: 'include' });
        if (!res.ok) throw new Error('fetch weddings failed');
        const json = await res.json();
        if (cancelled) return;
        const list: WeddingOption[] = (json.weddings || []).map((w: { id: string; slug: string; coupleLabel: string }) => ({
          id: w.id,
          slug: w.slug,
          coupleLabel: w.coupleLabel || w.slug,
        }));
        setWeddings(list);
        if (list.length > 0) setWeddingId(list[0].id);
      } catch {
        if (!cancelled) toast.error('Erreur lors du chargement des mariages');
      } finally {
        if (!cancelled) setLoadingWeddings(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // ─── Load variants when wedding changes ────────────────────────────────────
  const loadVariants = useCallback(async () => {
    if (!weddingId) return;
    setLoadingVariants(true);
    setDirtyVariants({});
    try {
      const res = await fetch(`/api/platform/experience/weddings/${weddingId}/variants`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error('fetch variants failed');
      const json = await res.json();
      setVariants(json.variants || []);
    } catch {
      toast.error('Erreur lors du chargement des variantes');
    } finally {
      setLoadingVariants(false);
    }
  }, [weddingId]);

  // ─── Load events when wedding/filter/page changes ─────────────────────────
  const loadEvents = useCallback(async () => {
    if (!weddingId) return;
    setLoadingEvents(true);
    try {
      const params = new URLSearchParams({
        page: String(eventsPage),
        limit: '20',
      });
      if (eventFilterType !== 'ALL') params.set('eventType', eventFilterType);
      if (eventFilterSection) params.set('sectionId', eventFilterSection);
      const res = await fetch(
        `/api/platform/experience/weddings/${weddingId}/events?${params}`,
        { credentials: 'include' }
      );
      if (!res.ok) throw new Error('fetch events failed');
      const json = await res.json();
      setEvents(json.events || []);
      setEventsTotal(json.total || 0);
      setEventsHasMore(Boolean(json.hasMore));
    } catch {
      toast.error('Erreur lors du chargement des événements');
    } finally {
      setLoadingEvents(false);
    }
  }, [weddingId, eventsPage, eventFilterType, eventFilterSection]);

  // ─── Load reports ──────────────────────────────────────────────────────────
  const loadReports = useCallback(async () => {
    if (!weddingId) return;
    setLoadingReports(true);
    try {
      const params = new URLSearchParams({ granularity: reportsGranularity });
      const res = await fetch(
        `/api/platform/experience/weddings/${weddingId}/reports?${params}`,
        { credentials: 'include' }
      );
      if (!res.ok) throw new Error('fetch reports failed');
      const json = await res.json();
      setReports(json.reports || []);
      setReportsSummary(json.summary || null);
      setReportsSource(json.source || null);
    } catch {
      toast.error('Erreur lors du chargement des rapports');
    } finally {
      setLoadingReports(false);
    }
  }, [weddingId, reportsGranularity]);

  // ─── Reload everything when wedding changes ─────────────────────────────────
  useEffect(() => {
    if (!weddingId) return;
    setEventsPage(1);
    loadVariants();
    loadEvents();
    loadReports();
  }, [weddingId, loadVariants, loadEvents, loadReports]);

  // ─── Reload events when filters change ──────────────────────────────────────
  useEffect(() => {
    if (weddingId) loadEvents();
  }, [eventsPage, eventFilterType, eventFilterSection, weddingId, loadEvents]);

  // ─── Reload reports when granularity changes ────────────────────────────────
  useEffect(() => {
    if (weddingId) loadReports();
  }, [reportsGranularity, weddingId, loadReports]);

  // ─── Variant CRUD ────────────────────────────────────────────────────────
  const submitNewVariant = async () => {
    if (!weddingId) return;
    if (!newVariantForm.sectionId) {
      toast.error('sectionId requis');
      return;
    }
    setSavingVariant(true);
    try {
      const res = await fetch(`/api/platform/experience/weddings/${weddingId}/variants`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': csrfToken,
        },
        body: JSON.stringify(newVariantForm),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || 'Erreur serveur');
      }
      toast.success('Variante créée');
      setShowVariantDialog(false);
      setNewVariantForm(EMPTY_NEW_VARIANT);
      loadVariants();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setSavingVariant(false);
    }
  };

  const deleteVariant = async (v: VariantRow) => {
    if (!weddingId) return;
    if (!confirm(`Supprimer la variante ${v.variantCode} pour la section "${v.sectionId}" ?`)) return;
    try {
      const res = await fetch(
        `/api/platform/experience/weddings/${weddingId}/variants/${v.id}`,
        {
          method: 'DELETE',
          credentials: 'include',
          headers: { 'X-CSRF-Token': csrfToken },
        }
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || 'Erreur serveur');
      }
      toast.success('Variante supprimée');
      loadVariants();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erreur');
    }
  };

  const stageVariantChange = (id: string, patch: Partial<VariantRow>) => {
    setDirtyVariants((d) => ({ ...d, [id]: { ...d[id], ...patch } }));
  };

  const saveDirty = async () => {
    if (!weddingId) return;
    const entries = Object.entries(dirtyVariants);
    if (entries.length === 0) return;
    try {
      const res = await fetch(`/api/platform/experience/weddings/${weddingId}/variants`, {
        method: 'PATCH',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': csrfToken,
        },
        body: JSON.stringify({
          updates: entries.map(([id, patch]) => ({ id, ...patch })),
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || 'Erreur serveur');
      }
      toast.success(`${entries.length} variante(s) mise à jour`);
      setDirtyVariants({});
      loadVariants();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erreur');
    }
  };

  // ─── Derived: variants grouped by sectionId for the traffic allocation bar ──
  const variantsBySection = useMemo(() => {
    const map: Record<string, VariantRow[]> = {};
    for (const v of variants) {
      if (!map[v.sectionId]) map[v.sectionId] = [];
      map[v.sectionId].push(v);
    }
    return map;
  }, [variants]);

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4 p-4 md:p-6">
      {/* Header + wedding selector */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <FlaskConical className="w-5 h-5 text-amber-400" />
            Experience Manager
          </h2>
          <p className="text-xs text-muted-foreground">
            A/B variants, event stream &amp; engagement reports per wedding.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Label className="text-xs text-muted-foreground">Mariage:</Label>
          {loadingWeddings ? (
            <Skeleton className="h-9 w-64" />
          ) : (
            <Select value={weddingId} onValueChange={setWeddingId}>
              <SelectTrigger className="w-64">
                <SelectValue placeholder="Sélectionner un mariage" />
              </SelectTrigger>
              <SelectContent>
                {weddings.map((w) => (
                  <SelectItem key={w.id} value={w.id}>
                    {w.coupleLabel} <span className="text-xs text-muted-foreground">({w.slug})</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      {/* Section tabs */}
      <div className="flex gap-1 border-b border-white/10">
        <SectionTab
          active={activeSection === 'variants'}
          onClick={() => setActiveSection('variants')}
          icon={<FlaskConical className="w-4 h-4" />}
          label="A/B Variants"
        />
        <SectionTab
          active={activeSection === 'events'}
          onClick={() => setActiveSection('events')}
          icon={<Activity className="w-4 h-4" />}
          label="Event Stream"
        />
        <SectionTab
          active={activeSection === 'reports'}
          onClick={() => setActiveSection('reports')}
          icon={<BarChart3 className="w-4 h-4" />}
          label="Reports"
        />
      </div>

      {!weddingId && !loadingWeddings ? (
        <Card className="glass-card gold-border border-0">
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            Aucun mariage disponible. Créez d'abord un mariage via la section Mariages.
          </CardContent>
        </Card>
      ) : activeSection === 'variants' ? (
        <VariantsSection
          loading={loadingVariants}
          variants={variants}
          variantsBySection={variantsBySection}
          dirtyVariants={dirtyVariants}
          onStageChange={stageVariantChange}
          onSaveDirty={saveDirty}
          onDelete={deleteVariant}
          onOpenCreate={() => setShowVariantDialog(true)}
          onReload={loadVariants}
        />
      ) : activeSection === 'events' ? (
        <EventsSection
          loading={loadingEvents}
          events={events}
          total={eventsTotal}
          page={eventsPage}
          hasMore={eventsHasMore}
          filterType={eventFilterType}
          filterSection={eventFilterSection}
          onFilterType={(v) => { setEventFilterType(v); setEventsPage(1); }}
          onFilterSection={(v) => { setEventFilterSection(v); setEventsPage(1); }}
          onPrev={() => setEventsPage((p) => Math.max(1, p - 1))}
          onNext={() => setEventsPage((p) => p + 1)}
          onReload={loadEvents}
        />
      ) : (
        <ReportsSection
          loading={loadingReports}
          reports={reports}
          summary={reportsSummary}
          source={reportsSource}
          granularity={reportsGranularity}
          onGranularity={setReportsGranularity}
          onReload={loadReports}
        />
      )}

      {/* Add variant dialog */}
      <Dialog open={showVariantDialog} onOpenChange={setShowVariantDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Nouvelle variante A/B</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="v-section">Section ID</Label>
              <Input
                id="v-section"
                list="section-suggestions"
                value={newVariantForm.sectionId}
                onChange={(e) => setNewVariantForm({ ...newVariantForm, sectionId: e.target.value })}
                placeholder="accueil"
              />
              <datalist id="section-suggestions">
                {SECTION_ID_SUGGESTIONS.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Variant Code</Label>
                <Select
                  value={newVariantForm.variantCode}
                  onValueChange={(v) => setNewVariantForm({ ...newVariantForm, variantCode: v as 'A' | 'B' | 'C' })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="A">A</SelectItem>
                    <SelectItem value="B">B</SelectItem>
                    <SelectItem value="C">C</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Traffic %: {newVariantForm.trafficPct}</Label>
                <Slider
                  value={[newVariantForm.trafficPct]}
                  min={0}
                  max={100}
                  step={5}
                  onValueChange={(vals) => setNewVariantForm({ ...newVariantForm, trafficPct: vals[0] })}
                />
              </div>
            </div>
            <div>
              <Label htmlFor="v-desc">Description</Label>
              <Textarea
                id="v-desc"
                value={newVariantForm.description}
                onChange={(e) => setNewVariantForm({ ...newVariantForm, description: e.target.value })}
                rows={2}
                placeholder="Variant B: CTA button moved above the fold"
              />
            </div>
            <div className="flex items-center gap-2">
              <Switch
                id="v-active"
                checked={newVariantForm.isActive}
                onCheckedChange={(c) => setNewVariantForm({ ...newVariantForm, isActive: c })}
              />
              <Label htmlFor="v-active">Active</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowVariantDialog(false)}>Annuler</Button>
            <Button onClick={submitNewVariant} disabled={savingVariant}>
              {savingVariant && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Créer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function SectionTab({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
        active
          ? 'border-amber-500 text-amber-400'
          : 'border-transparent text-muted-foreground hover:text-foreground'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function VariantsSection({
  loading,
  variants,
  variantsBySection,
  dirtyVariants,
  onStageChange,
  onSaveDirty,
  onDelete,
  onOpenCreate,
  onReload,
}: {
  loading: boolean;
  variants: VariantRow[];
  variantsBySection: Record<string, VariantRow[]>;
  dirtyVariants: Record<string, Partial<VariantRow>>;
  onStageChange: (id: string, patch: Partial<VariantRow>) => void;
  onSaveDirty: () => void;
  onDelete: (v: VariantRow) => void;
  onOpenCreate: () => void;
  onReload: () => void;
}) {
  const dirtyCount = Object.keys(dirtyVariants).length;
  return (
    <Card className="glass-card gold-border border-0">
      <CardContent className="p-4 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <FlaskConical className="w-4 h-4 text-amber-400" />
              Variantes A/B
            </h3>
            <p className="text-xs text-muted-foreground">
              Configurez la répartition du trafic par section. Le frontend choisit la variante de manière déterministe (hash guestId + sectionId).
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="icon" onClick={onReload}>
              <RefreshCw className="w-4 h-4" />
            </Button>
            <Button onClick={onOpenCreate}>
              <Plus className="w-4 h-4 mr-2" />
              Ajouter
            </Button>
          </div>
        </div>

        {/* Traffic allocation bar per section */}
        {Object.keys(variantsBySection).length > 0 && (
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground uppercase">Répartition du trafic</Label>
            {Object.entries(variantsBySection).map(([sectionId, vs]) => (
              <TrafficBar key={sectionId} sectionId={sectionId} variants={vs} />
            ))}
          </div>
        )}

        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-12 rounded-lg" />
            ))}
          </div>
        ) : variants.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground py-8">
            Aucune variante. La pipeline en crée une par défaut (« A » 100%) lors du publish.
          </p>
        ) : (
          <div className="rounded-lg border border-white/10 overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Section</TableHead>
                  <TableHead>Code</TableHead>
                  <TableHead className="w-48">Traffic %</TableHead>
                  <TableHead>Active</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {variants.map((v) => {
                  const dirty = dirtyVariants[v.id];
                  const pct = dirty?.trafficPct ?? v.trafficPct;
                  const isActive = dirty?.isActive ?? v.isActive;
                  return (
                    <TableRow key={v.id} className={dirty ? 'bg-amber-500/5' : ''}>
                      <TableCell className="font-mono text-xs">{v.sectionId}</TableCell>
                      <TableCell>
                        <span className={`font-bold ${VARIANT_CODE_TEXT[v.variantCode] || ''}`}>
                          {v.variantCode}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Slider
                            value={[pct]}
                            min={0}
                            max={100}
                            step={5}
                            onValueChange={(vals) => onStageChange(v.id, { trafficPct: vals[0] })}
                            className="flex-1"
                          />
                          <span className="text-xs w-8 text-right">{pct}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <ToggleLeft
                            className={`w-4 h-4 ${isActive ? 'text-emerald-400' : 'text-muted-foreground'}`}
                          />
                          <Switch
                            checked={isActive}
                            onCheckedChange={(c) => onStageChange(v.id, { isActive: c })}
                          />
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-xs truncate">
                        {v.description || '—'}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-red-400"
                          onClick={() => onDelete(v)}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}

        {dirtyCount > 0 && (
          <div className="flex justify-end">
            <Button onClick={onSaveDirty}>
              <Loader2 className="w-4 h-4 mr-2 opacity-0" />
              Enregistrer ({dirtyCount})
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function TrafficBar({ sectionId, variants }: { sectionId: string; variants: VariantRow[] }) {
  const active = variants.filter((v) => v.isActive);
  const totalPct = active.reduce((sum, v) => sum + v.trafficPct, 0);
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="font-mono text-muted-foreground">{sectionId}</span>
        <span className="text-muted-foreground">
          {active.length} active · {totalPct}% alloué
        </span>
      </div>
      <div className="flex h-2 rounded-full overflow-hidden bg-zinc-800">
        {active.map((v) => {
          const widthPct = totalPct > 0 ? (v.trafficPct / totalPct) * 100 : 0;
          return (
            <div
              key={v.id}
              className={VARIANT_CODE_COLOR[v.variantCode] || 'bg-zinc-500'}
              style={{ width: `${widthPct}%` }}
              title={`${v.variantCode}: ${v.trafficPct}%`}
            />
          );
        })}
      </div>
    </div>
  );
}

function EventsSection({
  loading,
  events,
  total,
  page,
  hasMore,
  filterType,
  filterSection,
  onFilterType,
  onFilterSection,
  onPrev,
  onNext,
  onReload,
}: {
  loading: boolean;
  events: EventRow[];
  total: number;
  page: number;
  hasMore: boolean;
  filterType: string;
  filterSection: string;
  onFilterType: (v: string) => void;
  onFilterSection: (v: string) => void;
  onPrev: () => void;
  onNext: () => void;
  onReload: () => void;
}) {
  return (
    <Card className="glass-card gold-border border-0">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <Activity className="w-4 h-4 text-emerald-400" />
              Event Stream
            </h3>
            <p className="text-xs text-muted-foreground">
              Flux en direct des ExperienceEvent. {total} événement(s) au total.
            </p>
          </div>
          <Button variant="outline" size="icon" onClick={onReload}>
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>

        <div className="flex gap-2 flex-wrap">
          <Select value={filterType} onValueChange={onFilterType}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Event type" />
            </SelectTrigger>
            <SelectContent>
              {EVENT_TYPE_SUGGESTIONS.map((t) => (
                <SelectItem key={t} value={t}>
                  {t === 'ALL' ? 'Tous les types' : t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            placeholder="Filtrer par sectionId…"
            value={filterSection}
            onChange={(e) => onFilterSection(e.target.value)}
            className="max-w-xs"
          />
        </div>

        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-10 rounded-lg" />
            ))}
          </div>
        ) : events.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground py-8">
            Aucun événement. Déployez un mariage publić et visitez la page pour générer du trafic.
          </p>
        ) : (
          <div className="rounded-lg border border-white/10 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Section</TableHead>
                  <TableHead>Variant</TableHead>
                  <TableHead>Guest</TableHead>
                  <TableHead>Payload</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {events.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(e.createdAt).toLocaleString()}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-[10px] uppercase">
                        {e.eventType}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{e.sectionId || '—'}</TableCell>
                    <TableCell>
                      {e.variantId ? (
                        <span className={`font-bold ${VARIANT_CODE_TEXT[e.variantId] || ''}`}>
                          {e.variantId}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {e.guestId ? e.guestId.slice(0, 8) : 'anon'}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground max-w-xs truncate">
                      {e.payloadJson && e.payloadJson !== '{}' ? e.payloadJson : '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            Page {page} · {total} total
          </span>
          <div className="flex gap-1">
            <Button
              variant="outline"
              size="icon"
              onClick={onPrev}
              disabled={page <= 1 || loading}
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={onNext}
              disabled={!hasMore || loading}
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ReportsSection({
  loading,
  reports,
  summary,
  source,
  granularity,
  onGranularity,
  onReload,
}: {
  loading: boolean;
  reports: ReportRow[];
  summary: ReportsSummary | null;
  source: 'cache' | 'live' | null;
  granularity: 'DAILY' | 'WEEKLY' | 'MONTHLY';
  onGranularity: (g: 'DAILY' | 'WEEKLY' | 'MONTHLY') => void;
  onReload: () => void;
}) {
  return (
    <div className="space-y-4">
      <Card className="glass-card gold-border border-0">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-sky-400" />
                Reports
              </h3>
              <p className="text-xs text-muted-foreground">
                Agrégation par section + variante.{' '}
                {source === 'cache' && (
                  <span className="text-emerald-400">(depuis le cache)</span>
                )}
                {source === 'live' && (
                  <span className="text-amber-400">(calculé à la volée + mis en cache)</span>
                )}
              </p>
            </div>
            <div className="flex gap-2">
              <Select value={granularity} onValueChange={(v) => onGranularity(v as 'DAILY' | 'WEEKLY' | 'MONTHLY')}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="DAILY">Quotidien</SelectItem>
                  <SelectItem value="WEEKLY">Hebdo</SelectItem>
                  <SelectItem value="MONTHLY">Mensuel</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" size="icon" onClick={onReload}>
                <RefreshCw className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* KPI cards */}
          {summary && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <KpiCard label="Total events" value={summary.totalEvents.toLocaleString()} />
              <KpiCard label="Unique visitors" value={summary.uniqueVisitors.toLocaleString()} />
              <KpiCard label="Sections tracked" value={String(summary.topSections.length)} />
              <KpiCard label="Variants tested" value={String(summary.topVariants.length)} />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Section engagement table + bar chart */}
      <Card className="glass-card gold-border border-0">
        <CardContent className="p-4 space-y-3">
          <h4 className="text-sm font-semibold">Section engagement</h4>
          {loading ? (
            <Skeleton className="h-32 rounded-lg" />
          ) : !summary || summary.topSections.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-6">
              Pas encore de données d'engagement. Visitez le site public pour générer des événements.
            </p>
          ) : (
            <>
              {/* Bar chart */}
              <div className="space-y-2">
                {summary.topSections.map((s) => {
                  const maxViews = summary.topSections[0]?.views || 1;
                  const widthPct = (s.views / maxViews) * 100;
                  return (
                    <div key={s.sectionId} className="flex items-center gap-3">
                      <span className="font-mono text-xs w-32 truncate text-muted-foreground">
                        {s.sectionId}
                      </span>
                      <div className="flex-1 h-3 bg-zinc-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-sky-500 rounded-full"
                          style={{ width: `${widthPct}%` }}
                        />
                      </div>
                      <span className="text-xs w-12 text-right">{s.views}</span>
                    </div>
                  );
                })}
              </div>

              <div className="rounded-lg border border-white/10 overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Section</TableHead>
                      <TableHead>Views</TableHead>
                      <TableHead>Avg time (s)</TableHead>
                      <TableHead>Bounce rate</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {summary.topSections.map((s) => (
                      <TableRow key={s.sectionId}>
                        <TableCell className="font-mono text-xs">{s.sectionId}</TableCell>
                        <TableCell>{s.views.toLocaleString()}</TableCell>
                        <TableCell>{s.avgTimeSec.toFixed(1)}</TableCell>
                        <TableCell>{(s.bounceRate * 100).toFixed(1)}%</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Variant performance table */}
      <Card className="glass-card gold-border border-0">
        <CardContent className="p-4 space-y-3">
          <h4 className="text-sm font-semibold">Variant performance</h4>
          {loading ? (
            <Skeleton className="h-24 rounded-lg" />
          ) : !summary || summary.topVariants.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-6">
              Aucune donnée de variante. Configurez des variantes A/B puis visitez le site.
            </p>
          ) : (
            <div className="rounded-lg border border-white/10 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Section</TableHead>
                    <TableHead>Variant</TableHead>
                    <TableHead>Impressions</TableHead>
                    <TableHead>Conversions</TableHead>
                    <TableHead>Conversion rate</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {summary.topVariants.map((v, i) => (
                    <TableRow key={`${v.sectionId}-${v.variantCode}-${i}`}>
                      <TableCell className="font-mono text-xs">{v.sectionId}</TableCell>
                      <TableCell>
                        <span className={`font-bold ${VARIANT_CODE_TEXT[v.variantCode] || ''}`}>
                          {v.variantCode}
                        </span>
                      </TableCell>
                      <TableCell>{v.impressions.toLocaleString()}</TableCell>
                      <TableCell>{v.conversions.toLocaleString()}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span>{(v.conversionRate * 100).toFixed(1)}%</span>
                          <div className="h-1.5 w-16 bg-zinc-800 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-emerald-500"
                              style={{ width: `${Math.min(100, v.conversionRate * 100)}%` }}
                            />
                          </div>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Raw report rows */}
      {reports.length > 0 && (
        <Card className="glass-card gold-border border-0">
          <CardContent className="p-4 space-y-2">
            <h4 className="text-sm font-semibold">Buckets ({reports.length})</h4>
            <div className="rounded-lg border border-white/10 overflow-x-auto max-h-64 overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Period start</TableHead>
                    <TableHead>Period end</TableHead>
                    <TableHead>Events</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reports.map((r) => {
                    const m = (() => {
                      try {
                        return JSON.parse(r.metricsJson) as AggregatedMetrics;
                      } catch {
                        return null;
                      }
                    })();
                    return (
                      <TableRow key={r.id}>
                        <TableCell className="text-xs">{new Date(r.periodStart).toLocaleString()}</TableCell>
                        <TableCell className="text-xs">{new Date(r.periodEnd).toLocaleString()}</TableCell>
                        <TableCell className="text-xs">{m?.totalEvents ?? '—'}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function KpiCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/10 p-3 bg-zinc-900/40">
      <div className="text-[10px] uppercase text-muted-foreground">{label}</div>
      <div className="text-xl font-bold mt-1">{value}</div>
    </div>
  );
}
