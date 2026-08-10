'use client';

// ══════════════════════════════════════════════════════════════════════════════
// src/components/admin/QualityScorecard.tsx — Phase 4B visual scorecard
// ══════════════════════════════════════════════════════════════════════════════
//
// Renders the 9-dimension quality scorecard inside the Designer tab.
//
// Sections:
//   1. Overview (overall score + canPublish badge + threshold indicator)
//   2. Radar chart (SVG, no external lib) — visualises the 9 dimensions
//   3. 9 dimension cards (score, colored bar, expandable findings)
//   4. Auto-fix list (findings with autoFixable=true, "Corriger" buttons)
//
// The "Forcer la publication" override button is rendered ONLY when
// `isPlatformAdmin` is true. Clicking it calls the optional `onForcePublish`
// callback (wired by the parent DesignerTab to log an audit entry + bypass
// the gate).
//
// All copy is French (the platform's UI language).

import { useEffect, useState, useCallback } from 'react';
import { toast } from 'sonner';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Info,
  Loader2,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  Wrench,
  XCircle,
  Zap,
} from 'lucide-react';
import { authedFetch } from '@/lib/csrf-client';
import type {
  QualityDimension,
  QualityFinding,
  QualityScorecard as QualityScorecardData,
  QualitySeverity,
} from '@/lib/quality/scorecard';

// ─── Props ────────────────────────────────────────────────────────────────────

interface QualityScorecardProps {
  /** Wedding slug — used to fetch the scorecard from the API. */
  weddingSlug: string;
  /** True iff the current user is PLATFORM_ADMIN (gates the override button). */
  isPlatformAdmin: boolean;
  /**
   * Optional callback invoked when the user clicks "Forcer la publication".
   * The parent (DesignerTab) wires this to log an audit entry + proceed with
   * the publish despite the low score.
   */
  onForcePublish?: () => void;
  /**
   * Optional callback invoked when the user clicks "Corriger" on an auto-fix
   * finding. The parent passes a `navigateToAdminTab(tabId)` function so the
   * scorecard can deep-link the user to the relevant admin tab (e.g. 'media'
   * to upload more gallery images).
   */
  onNavigateToTab?: (tabId: string) => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const SEVERITY_ICON: Record<QualitySeverity, React.ComponentType<{ className?: string }>> = {
  good: CheckCircle2,
  warning: AlertTriangle,
  critical: XCircle,
};

const SEVERITY_COLOR: Record<QualitySeverity, string> = {
  good: 'text-emerald-600',
  warning: 'text-amber-600',
  critical: 'text-rose-600',
};

/** Tailwind class for the progress bar based on the score. */
function scoreBarClass(score: number, threshold: number): string {
  if (score >= 80) return '[&_[data-slot=progress-indicator]]:bg-emerald-500';
  if (score >= threshold) return '[&_[data-slot=progress-indicator]]:bg-amber-500';
  return '[&_[data-slot=progress-indicator]]:bg-rose-500';
}

/** Big-number color for the overall score badge. */
function overallBadgeClass(score: number, threshold: number): string {
  if (score >= 80) return 'bg-emerald-100 text-emerald-800 border-emerald-200';
  if (score >= threshold) return 'bg-amber-100 text-amber-800 border-amber-200';
  return 'bg-rose-100 text-rose-800 border-rose-200';
}

// ─── Radar chart (pure SVG, no external lib) ──────────────────────────────────

/**
 * Render a 9-axis radar chart as inline SVG. Each axis is one dimension.
 * The polygon's vertices are the dimension scores (0..100, scaled to the
 * chart radius). Axes labels are placed around the perimeter.
 *
 * Layout:
 *   - viewBox 320x320 (centred at 160,160)
 *   - maxRadius = 110
 *   - 4 concentric reference rings at 25/50/75/100
 *   - axis lines from centre to perimeter
 */
function RadarChart({ dimensions }: { dimensions: QualityDimension[] }) {
  const cx = 160;
  const cy = 160;
  const maxRadius = 110;
  const labelRadius = 130; // axis label position (just outside the perimeter)
  const n = dimensions.length;

  // Pre-compute the axis angle (radians) for each dimension. Start at -90deg
  // (top) and go clockwise.
  const axes = dimensions.map((d, i) => {
    const angle = (-90 + (360 / n) * i) * (Math.PI / 180);
    return {
      dimension: d,
      angle,
      // Perimeter point (score=100) — used for axis line + label
      px: cx + Math.cos(angle) * maxRadius,
      py: cy + Math.sin(angle) * maxRadius,
      lx: cx + Math.cos(angle) * labelRadius,
      ly: cy + Math.sin(angle) * labelRadius,
      // Score-scaled point (the polygon vertex)
      vx: cx + Math.cos(angle) * maxRadius * (d.score / 100),
      vy: cy + Math.sin(angle) * maxRadius * (d.score / 100),
    };
  });

  // Polygon points string (for the filled score shape)
  const polygonPoints = axes.map((a) => `${a.vx},${a.vy}`).join(' ');

  // Reference rings (25/50/75/100) — drawn as concentric polygons
  const ringPolygons = [25, 50, 75, 100].map((pct) => {
    const r = maxRadius * (pct / 100);
    const pts = dimensions
      .map((_, i) => {
        const angle = (-90 + (360 / n) * i) * (Math.PI / 180);
        return `${cx + Math.cos(angle) * r},${cy + Math.sin(angle) * r}`;
      })
      .join(' ');
    return { pct, pts };
  });

  // Polygon color based on overall score (computed inline since we don't have
  // the threshold here — caller passes dimensions only).
  const avgScore =
    dimensions.reduce((s, d) => s + d.score, 0) / Math.max(1, dimensions.length);
  const fillColor =
    avgScore >= 80 ? 'rgba(16,185,129,0.25)' : avgScore >= 60 ? 'rgba(245,158,11,0.25)' : 'rgba(244,63,94,0.25)';
  const strokeColor =
    avgScore >= 80 ? 'rgb(16,185,129)' : avgScore >= 60 ? 'rgb(245,158,11)' : 'rgb(244,63,94)';

  return (
    <svg
      viewBox="0 0 320 320"
      className="w-full h-auto max-w-[320px] mx-auto"
      role="img"
      aria-label="Diagramme radar des 9 dimensions de qualité"
    >
      {/* Reference rings */}
      {ringPolygons.map((ring) => (
        <polygon
          key={ring.pct}
          points={ring.pts}
          fill="none"
          stroke="currentColor"
          strokeOpacity={0.15}
          strokeWidth={1}
          className="text-muted-foreground"
        />
      ))}

      {/* Axis lines + labels */}
      {axes.map((a) => (
        <g key={a.dimension.id}>
          <line
            x1={cx}
            y1={cy}
            x2={a.px}
            y2={a.py}
            stroke="currentColor"
            strokeOpacity={0.2}
            strokeWidth={1}
            className="text-muted-foreground"
          />
          <text
            x={a.lx}
            y={a.ly}
            textAnchor={
              a.lx < cx - 5 ? 'end' : a.lx > cx + 5 ? 'start' : 'middle'
            }
            dominantBaseline={
              a.ly < cy - 5 ? 'auto' : a.ly > cy + 5 ? 'hanging' : 'middle'
            }
            className="text-[10px] fill-muted-foreground uppercase tracking-wide"
            style={{ fontWeight: 600 }}
          >
            {a.dimension.label}
          </text>
        </g>
      ))}

      {/* Score polygon */}
      <polygon
        points={polygonPoints}
        fill={fillColor}
        stroke={strokeColor}
        strokeWidth={2}
        strokeLinejoin="round"
      />

      {/* Score vertices */}
      {axes.map((a) => (
        <circle
          key={`vertex-${a.dimension.id}`}
          cx={a.vx}
          cy={a.vy}
          r={3}
          fill={strokeColor}
        />
      ))}
    </svg>
  );
}

// ─── Dimension card ───────────────────────────────────────────────────────────

function DimensionCard({
  dimension,
  threshold,
  weddingSlug,
  onAppliedAutoFix,
  onNavigateToTab,
}: {
  dimension: QualityDimension;
  threshold: number;
  weddingSlug: string;
  onAppliedAutoFix?: (scorecard: QualityScorecardData) => void;
  onNavigateToTab?: (tabId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const autoFixableFindings = dimension.findings.filter((f) => f.autoFixable);

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className="rounded-lg border bg-card text-card-foreground"
    >
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="w-full flex items-center gap-3 p-3 text-left hover:bg-muted/40 transition-colors"
        >
          <span className="text-xs font-mono text-muted-foreground w-16">
            {dimension.id.toUpperCase()}
          </span>
          <span className="flex-1 text-sm font-medium">{dimension.label}</span>
          <span className={`text-sm font-semibold ${SEVERITY_COLOR[dimension.status]}`}>
            {dimension.score}/100
          </span>
          <Progress
            value={dimension.score}
            className={`w-20 h-2 ${scoreBarClass(dimension.score, threshold)}`}
          />
          {open ? (
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
          )}
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="px-3 pb-3 pt-1 space-y-2 border-t">
          {dimension.findings.length === 0 && (
            <p className="text-xs text-muted-foreground italic py-2">
              Aucun contrôle exécuté pour cette dimension.
            </p>
          )}
          {dimension.findings.map((f, i) => (
            <FindingRow
              key={`${dimension.id}-${i}`}
              finding={f}
              weddingSlug={weddingSlug}
              onAppliedAutoFix={onAppliedAutoFix}
              onNavigateToTab={onNavigateToTab}
            />
          ))}
          {autoFixableFindings.length > 0 && (
            <p className="text-[10px] text-muted-foreground pt-1">
              {autoFixableFindings.length} correction(s) disponible(s)
              {autoFixableFindings.some((f) => f.fixType === 'auto')
                ? ' · 1 clic disponible'
                : ''}
            </p>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function FindingRow({
  finding,
  weddingSlug,
  onAppliedAutoFix,
  onNavigateToTab,
}: {
  finding: QualityFinding;
  weddingSlug: string;
  onAppliedAutoFix?: (scorecard: QualityScorecardData) => void;
  onNavigateToTab?: (tabId: string) => void;
}) {
  const Icon = SEVERITY_ICON[finding.severity];
  const isAutoFix = finding.fixType === 'auto';
  const [applying, setApplying] = useState(false);

  async function handleAutoFix() {
    if (!finding.id || applying) return;
    setApplying(true);
    try {
      const res = await authedFetch(
        `/api/platform/quality/${encodeURIComponent(weddingSlug)}/auto-fix`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fixId: finding.id }),
        },
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = (body && typeof body === 'object' && 'error' in body)
          ? String((body as { error: unknown }).error)
          : `Échec de la correction (${res.status})`;
        toast.error('Échec de la correction', { description: msg });
        return;
      }
      // Success: toast + propagate the re-computed scorecard upward so the
      // parent re-renders without a refetch.
      toast.success('Fix appliqué', {
        description: (body && typeof body === 'object' && 'message' in body)
          ? String((body as { message: unknown }).message)
          : 'Le score a été recalculé',
      });
      if (
        body &&
        typeof body === 'object' &&
        'scorecard' in body &&
        (body as { scorecard: unknown }).scorecard
      ) {
        onAppliedAutoFix?.((body as { scorecard: QualityScorecardData }).scorecard);
      }
    } catch (e) {
      toast.error('Échec de la correction', {
        description: e instanceof Error ? e.message : 'Erreur réseau',
      });
    } finally {
      setApplying(false);
    }
  }

  return (
    <div className="flex items-start gap-2 py-1.5">
      <Icon className={`w-4 h-4 mt-0.5 flex-shrink-0 ${SEVERITY_COLOR[finding.severity]}`} />
      <span className="flex-1 text-xs text-foreground/90">{finding.message}</span>
      {isAutoFix && (
        <Badge
          variant="outline"
          className="h-5 px-1.5 text-[9px] font-semibold border-emerald-300 bg-emerald-50 text-emerald-700"
        >
          <Zap className="w-2.5 h-2.5 mr-0.5" />
          1 clic
        </Badge>
      )}
      {finding.autoFixable && finding.fixAdminTab && (isAutoFix || onNavigateToTab) && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                size="sm"
                variant={isAutoFix ? 'default' : 'outline'}
                className="h-6 px-2 text-[10px]"
                disabled={applying}
                onClick={() => {
                  if (isAutoFix) {
                    void handleAutoFix();
                  } else {
                    onNavigateToTab?.(finding.fixAdminTab!);
                  }
                }}
              >
                {applying ? (
                  <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                ) : isAutoFix ? (
                  <Zap className="w-3 h-3 mr-1" />
                ) : (
                  <ArrowRight className="w-3 h-3 mr-1" />
                )}
                {isAutoFix ? 'Corriger auto.' : 'Corriger'}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {finding.fixAction ?? (isAutoFix ? 'Corriger automatiquement (1 clic)' : 'Ouvrir l\'onglet concerné')}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
    </div>
  );
}

// ─── Auto-fix summary row (compact single-line, used in the footer summary) ───

/**
 * Compact single-line variant of `FindingRow` used in the auto-fix summary
 * block at the bottom of the scorecard. Renders the dimension id (mono),
 * the message, and a single button — either "Corriger auto." ( Zap icon,
 * POSTs to /auto-fix) or "Corriger" (ArrowRight icon, navigates to the
 * admin tab).
 *
 * Shares the same auto-fix handler logic as `FindingRow` so behaviour is
 * consistent between the per-dimension cards and the flat summary.
 */
function AutoFixSummaryRow({
  finding,
  dimensionId,
  weddingSlug,
  onAppliedAutoFix,
  onNavigateToTab,
}: {
  finding: QualityFinding;
  dimensionId: string;
  weddingSlug: string;
  onAppliedAutoFix?: (scorecard: QualityScorecardData) => void;
  onNavigateToTab?: (tabId: string) => void;
}) {
  const isAutoFix = finding.fixType === 'auto';
  const [applying, setApplying] = useState(false);

  async function handleAutoFix() {
    if (!finding.id || applying) return;
    setApplying(true);
    try {
      const res = await authedFetch(
        `/api/platform/quality/${encodeURIComponent(weddingSlug)}/auto-fix`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fixId: finding.id }),
        },
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = (body && typeof body === 'object' && 'error' in body)
          ? String((body as { error: unknown }).error)
          : `Échec de la correction (${res.status})`;
        toast.error('Échec de la correction', { description: msg });
        return;
      }
      toast.success('Fix appliqué', {
        description: (body && typeof body === 'object' && 'message' in body)
          ? String((body as { message: unknown }).message)
          : 'Le score a été recalculé',
      });
      if (
        body &&
        typeof body === 'object' &&
        'scorecard' in body &&
        (body as { scorecard: unknown }).scorecard
      ) {
        onAppliedAutoFix?.((body as { scorecard: QualityScorecardData }).scorecard);
      }
    } catch (e) {
      toast.error('Échec de la correction', {
        description: e instanceof Error ? e.message : 'Erreur réseau',
      });
    } finally {
      setApplying(false);
    }
  }

  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <span className="font-mono text-[10px] uppercase text-muted-foreground/70 w-16">
        {dimensionId}
      </span>
      <span className="flex-1">{finding.message}</span>
      {isAutoFix && (
        <Badge
          variant="outline"
          className="h-4 px-1 text-[9px] font-semibold border-emerald-300 bg-emerald-50 text-emerald-700"
        >
          <Zap className="w-2.5 h-2.5 mr-0.5" />
          1 clic
        </Badge>
      )}
      {(isAutoFix || (finding.fixAdminTab && onNavigateToTab)) && (
        <Button
          size="sm"
          variant={isAutoFix ? 'default' : 'outline'}
          className="h-6 px-2 text-[10px]"
          disabled={applying}
          onClick={() => {
            if (isAutoFix) {
              void handleAutoFix();
            } else {
              onNavigateToTab?.(finding.fixAdminTab!);
            }
          }}
        >
          {applying ? (
            <Loader2 className="w-3 h-3 mr-1 animate-spin" />
          ) : isAutoFix ? (
            <Zap className="w-3 h-3 mr-1" />
          ) : (
            <ArrowRight className="w-3 h-3 mr-1" />
          )}
          {isAutoFix ? 'Corriger auto.' : 'Corriger'}
        </Button>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function QualityScorecard({
  weddingSlug,
  isPlatformAdmin,
  onForcePublish,
  onNavigateToTab,
}: QualityScorecardProps) {
  const [scorecard, setScorecard] = useState<QualityScorecardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchScorecard = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/platform/quality/${encodeURIComponent(weddingSlug)}`, {
        credentials: 'include',
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? `Erreur ${res.status}`);
      }
      const data: QualityScorecardData = await res.json();
      setScorecard(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur inconnue');
    } finally {
      setLoading(false);
    }
  }, [weddingSlug]);

  useEffect(() => {
    fetchScorecard();
  }, [fetchScorecard]);

  /**
   * Update the scorecard state in-place when an auto-fix succeeds. The API
   * returns the re-computed scorecard in the response body, so we can update
   * the UI without a second GET round-trip.
   */
  const handleAppliedAutoFix = useCallback(
    (next: QualityScorecardData) => {
      setScorecard(next);
    },
    [],
  );

  // ─── Loading state ──────────────────────────────────────────────────────
  if (loading) {
    return (
      <Card className="p-6">
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <RefreshCw className="w-4 h-4 animate-spin" />
          Calcul du score de qualité…
        </div>
      </Card>
    );
  }

  // ─── Error state ────────────────────────────────────────────────────────
  if (error || !scorecard) {
    return (
      <Card className="p-6 border-amber-200 bg-amber-50/50">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-4 h-4 mt-0.5 text-amber-600 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium text-amber-900">
              Score de qualité indisponible
            </p>
            <p className="text-xs text-amber-800 mt-1">{error ?? 'Aucune donnée'}</p>
            <Button
              size="sm"
              variant="outline"
              className="mt-3 h-7 text-xs"
              onClick={fetchScorecard}
            >
              <RefreshCw className="w-3 h-3 mr-1" /> Réessayer
            </Button>
          </div>
        </div>
      </Card>
    );
  }

  // ─── Compute display state ──────────────────────────────────────────────
  const { dimensions, overall, threshold, canPublish, qualityGateEnabled } = scorecard;
  const criticalCount = dimensions.filter((d) => d.status === 'critical').length;
  const warningCount = dimensions.filter((d) => d.status === 'warning').length;
  const autoFixableFindings = dimensions.flatMap((d) =>
    d.findings
      .filter((f) => f.autoFixable)
      .map((f, i) => ({ ...f, dimensionId: d.id, dimensionLabel: d.label, key: `${d.id}-${i}` })),
  );

  return (
    <Card className="gap-4" data-quality-scorecard>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles className="w-4 h-4 text-primary" />
              Score de qualité
            </CardTitle>
            <CardDescription className="text-xs">
              9 dimensions évaluées · seuil {threshold}/100 ·{' '}
              {qualityGateEnabled ? (
                <span className="text-rose-700 font-medium">gate bloquante active</span>
              ) : (
                <span className="text-muted-foreground">à titre consultatif</span>
              )}
            </CardDescription>
          </div>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-xs"
            onClick={fetchScorecard}
            aria-label="Recalculer le score"
          >
            <RefreshCw className="w-3 h-3 mr-1" /> Recalculer
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* ─── Overview row ─────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 md:grid-cols-[auto_1fr] gap-4 items-center">
          {/* Big overall score */}
          <div className="flex items-center gap-4">
            <div
              className={`flex flex-col items-center justify-center w-24 h-24 rounded-xl border-2 ${overallBadgeClass(overall, threshold)}`}
            >
              <span className="text-3xl font-bold leading-none">{overall}</span>
              <span className="text-[10px] uppercase tracking-wide opacity-70 mt-1">
                / 100
              </span>
            </div>
            <div className="space-y-1.5">
              {canPublish ? (
                <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200">
                  <CheckCircle2 className="w-3 h-3 mr-1" />
                  Publiable
                </Badge>
              ) : (
                <Badge className="bg-rose-100 text-rose-800 border-rose-200">
                  <ShieldAlert className="w-3 h-3 mr-1" />
                  Bloqué
                </Badge>
              )}
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <XCircle className="w-3 h-3 text-rose-600" />
                  {criticalCount} critique(s)
                </span>
                <span className="flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3 text-amber-600" />
                  {warningCount} alerte(s)
                </span>
              </div>
              {qualityGateEnabled ? (
                <p className="text-[10px] text-rose-700 flex items-center gap-1">
                  <Info className="w-3 h-3" />
                  La publication est bloquée tant que le score &lt; {threshold}
                </p>
              ) : (
                <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                  <Info className="w-3 h-3" />
                  Consultatif — la publication n&apos;est pas bloquée
                </p>
              )}
            </div>
          </div>

          {/* Radar chart */}
          <div className="flex justify-center">
            <RadarChart dimensions={dimensions} />
          </div>
        </div>

        {/* ─── Force-publish override (PLATFORM_ADMIN only, when blocked) ── */}
        {!canPublish && isPlatformAdmin && onForcePublish && (
          <div className="rounded-lg border border-rose-200 bg-rose-50/50 p-3 flex items-start gap-3">
            <ShieldAlert className="w-4 h-4 mt-0.5 text-rose-600 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-xs font-medium text-rose-900">
                Override plateforme
              </p>
              <p className="text-[11px] text-rose-800 mt-0.5">
                En tant qu&apos;admin plateforme, vous pouvez forcer la publication
                malgré le score insuffisant. Un audit log sera enregistré.
              </p>
            </div>
            <Button
              size="sm"
              variant="destructive"
              className="h-7 text-xs"
              onClick={onForcePublish}
            >
              Forcer la publication
            </Button>
          </div>
        )}

        {/* ─── Dimension cards ──────────────────────────────────────────── */}
        <div className="space-y-2">
          {dimensions.map((d) => (
            <DimensionCard
              key={d.id}
              dimension={d}
              threshold={threshold}
              weddingSlug={weddingSlug}
              onAppliedAutoFix={handleAppliedAutoFix}
              onNavigateToTab={onNavigateToTab}
            />
          ))}
        </div>

        {/* ─── Auto-fix summary ─────────────────────────────────────────── */}
        {autoFixableFindings.length > 0 && (
          <div className="rounded-lg border bg-muted/30 p-3">
            <p className="text-xs font-medium mb-2 flex items-center gap-1.5">
              <Wrench className="w-3.5 h-3.5 text-primary" />
              Corrections suggérées ({autoFixableFindings.length})
              {autoFixableFindings.some((f) => f.fixType === 'auto') && (
                <Badge
                  variant="outline"
                  className="ml-1 h-4 px-1 text-[9px] font-semibold border-emerald-300 bg-emerald-50 text-emerald-700"
                >
                  <Zap className="w-2.5 h-2.5 mr-0.5" />
                  1 clic
                </Badge>
              )}
            </p>
            <div className="space-y-1">
              {autoFixableFindings.map((f) => (
                <AutoFixSummaryRow
                  key={f.key}
                  finding={f}
                  dimensionId={f.dimensionId}
                  weddingSlug={weddingSlug}
                  onAppliedAutoFix={handleAppliedAutoFix}
                  onNavigateToTab={onNavigateToTab}
                />
              ))}
            </div>
          </div>
        )}

        {/* ─── Footer note ──────────────────────────────────────────────── */}
        <p className="text-[10px] text-muted-foreground italic">
          Calculé à {new Date(scorecard.computedAt).toLocaleTimeString('fr-FR')} ·
          cache 60s · données ISR
        </p>
      </CardContent>
    </Card>
  );
}