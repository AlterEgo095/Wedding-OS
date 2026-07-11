// ══════════════════════════════════════════════════════════════════════════════
// PREVIEW LAB + QUALITY CENTER — Mission 5.8.5
// ══════════════════════════════════════════════════════════════════════════════
// This file adds two new sections to the Production Studio:
//   1. PREVIEW LAB — live component preview with real/simulated data
//   2. QUALITY CENTER — quality validation with score + publish gate
//
// Both use the SAME compileComponent() pipeline as production — no parallel engine.
// ══════════════════════════════════════════════════════════════════════════════

import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Eye, ShieldCheck, AlertCircle, CheckCircle2, AlertTriangle, XCircle, Loader2, Monitor, Tablet, Smartphone } from 'lucide-react';
import { CANONICAL_COMPONENT_SEEDS, compileComponent, getCategorySummary } from '@/lib/components/registry';
import type { VisualComponent, CompilationContext } from '@/lib/components/registry';
import { runComponentQualityChecks, runProductQualityChecks, summarizeQuality, MIN_PUBLISH_SCORE } from '@/lib/components/quality-engine';
import type { QualityReport, ProductQualitySummary } from '@/lib/components/quality-engine';

// ─── Preview Lab ──────────────────────────────────────────────────────────────

type PreviewDevice = 'DESKTOP' | 'TABLET' | 'MOBILE';
type PreviewTheme = 'LIGHT' | 'DARK';

const DEVICE_WIDTHS: Record<PreviewDevice, string> = {
  DESKTOP: '100%',
  TABLET: '768px',
  MOBILE: '375px',
};

export function PreviewLab({ csrfToken }: { csrfToken: string }) {
  const [selectedSlug, setSelectedSlug] = useState<string>(CANONICAL_COMPONENT_SEEDS[0]?.slug || '');
  const [device, setDevice] = useState<PreviewDevice>('DESKTOP');
  const [theme, setTheme] = useState<PreviewTheme>('LIGHT');
  const [useRealData, setUseRealData] = useState(false);
  const [selectedWeddingId, setSelectedWeddingId] = useState<string | null>(null);

  const component = useMemo(
    () => CANONICAL_COMPONENT_SEEDS.find(c => c.slug === selectedSlug),
    [selectedSlug]
  );

  // Build compilation context
  const context: CompilationContext = useMemo(() => ({
    tokens: {
      primaryColor: '#D4AF37',
      accentColor: '#1a1a2e',
      secondaryColor: '#1a1a2e',
      backgroundColor: theme === 'DARK' ? '#0a0a0a' : '#FAF8F5',
      textColor: theme === 'DARK' ? '#FAF8F5' : '#1a1a2e',
      fontDisplay: 'Cormorant Garamond',
      fontBody: 'Inter',
      radiusLarge: '16px',
    },
    config: {},
    data: useRealData
      ? { 'event.coupleNames': 'Sarah & Michael', 'event.date': '15 juin 2027', 'event.venue': 'Château de Versailles', 'guest.name': 'Michael Brown', 'guest.table': 'Table 1', 'invitation.qrCode': 'https://example.com/qr', 'invitation.accessCode': '050AC028' }
      : { 'event.coupleNames': 'Notre Mariage', 'event.date': 'Date à confirmer', 'event.venue': 'Lieu à confirmer', 'guest.name': 'Cher invité', 'guest.table': '—', 'invitation.qrCode': '', 'invitation.accessCode': 'CODE' },
    layout: 'royal',
    productType: component?.compatibleProducts[0] || 'WEBSITE',
    format: device,
  }), [component, theme, useRealData, device]);

  // Compile using the SAME pipeline as production
  const result = useMemo(
    () => component ? compileComponent(component, context) : null,
    [component, context]
  );

  const categories = getCategorySummary();

  return (
    <div className="space-y-4">
      {/* Component selector */}
      <Card className="glass-card gold-border">
        <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Eye className="w-4 h-4 text-gold" /> Preview Lab — Live Component Rendering</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Component</label>
              <select value={selectedSlug} onChange={(e) => setSelectedSlug(e.target.value)}
                className="w-full text-xs rounded border border-white/10 bg-white/5 px-2 py-1.5 mt-1">
                {CANONICAL_COMPONENT_SEEDS.map(c => <option key={c.slug} value={c.slug}>{c.name} ({c.category})</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Device</label>
              <div className="flex gap-1 mt-1">
                {([['DESKTOP', Monitor], ['TABLET', Tablet], ['MOBILE', Smartphone]] as const).map(([d, Icon]) => (
                  <button key={d} onClick={() => setDevice(d)}
                    className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] ${device === d ? 'bg-gold/15 text-gold' : 'text-muted-foreground hover:bg-white/5'}`}>
                    <Icon className="w-3 h-3" />{d}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Theme & Data</label>
              <div className="flex gap-1 mt-1">
                <button onClick={() => setTheme(t => t === 'LIGHT' ? 'DARK' : 'LIGHT')}
                  className="px-2 py-1 rounded text-[10px] bg-white/5 hover:bg-white/10">{theme}</button>
                <button onClick={() => setUseRealData(v => !v)}
                  className={`px-2 py-1 rounded text-[10px] ${useRealData ? 'bg-emerald-500/15 text-emerald-400' : 'bg-white/5'}`}>{useRealData ? 'REAL DATA' : 'SIMULATED'}</button>
              </div>
            </div>
          </div>

          {/* Component metadata */}
          {component && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[10px] text-muted-foreground">
              <div>Slug: <span className="text-foreground font-mono">{component.slug}</span></div>
              <div>Version: <span className="text-foreground">{component.version}</span></div>
              <div>Renderer: <span className="text-foreground font-mono">{component.rendererKey}</span></div>
              <div>Tokens: <span className="text-foreground">{component.tokens.length} declared</span></div>
            </div>
          )}

          {/* Preview viewport */}
          <div className="rounded-lg border border-white/10 overflow-hidden bg-white/[0.02]">
            <div className="p-1 bg-white/[0.03] border-b border-white/5 flex items-center gap-2">
              <span className="text-[10px] text-muted-foreground">{device} · {theme}</span>
              <span className="text-[10px] text-muted-foreground ml-auto">{result?.warnings.length || 0} warnings · {result?.errors.length || 0} errors</span>
            </div>
            <div className="flex justify-center p-4" style={{ background: theme === 'DARK' ? '#0a0a0a' : '#FAF8F5' }}>
              <div style={{ width: DEVICE_WIDTHS[device], maxWidth: '100%', transition: 'width 0.3s' }}>
                {result && result.errors.length === 0 ? (
                  <div className="p-4 rounded text-center" style={{
                    background: theme === 'DARK' ? '#1a1a2e' : '#fff',
                    color: theme === 'DARK' ? '#FAF8F5' : '#1a1a2e',
                    fontFamily: `'${context.tokens.fontBody}', sans-serif`,
                    border: `1px solid ${context.tokens.primaryColor}33`,
                  }}>
                    <div style={{ fontFamily: `'${context.tokens.fontDisplay}', serif`, fontSize: '24px', color: context.tokens.primaryColor, marginBottom: '8px' }}>
                      {useRealData ? 'Sarah & Michael' : 'Notre Mariage'}
                    </div>
                    <div style={{ fontSize: '12px', opacity: 0.8 }}>
                      Component: {component?.slug} · Renderer: {component?.rendererKey}
                    </div>
                    <div style={{ fontSize: '10px', opacity: 0.5, marginTop: '4px' }}>
                      Tokens: {result.tokensUsed.join(', ')}
                    </div>
                    {result.warnings.length > 0 && (
                      <div style={{ fontSize: '9px', color: '#f59e0b', marginTop: '8px' }}>
                        ⚠ {result.warnings.length} warning(s)
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="p-4 text-center text-red-400 text-xs">
                    <XCircle className="w-6 h-6 mx-auto mb-2" />
                    {result?.errors.join(', ') || 'Compilation failed'}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Compilation details */}
          {result && (
            <div className="grid grid-cols-3 gap-2 text-[10px]">
              <div className="p-2 rounded bg-white/[0.02]">
                <span className="text-muted-foreground">Tokens Used:</span><br />
                <span className="text-foreground">{result.tokensUsed.join(', ') || 'none'}</span>
              </div>
              <div className="p-2 rounded bg-white/[0.02]">
                <span className="text-muted-foreground">Bindings Resolved:</span><br />
                <span className="text-foreground">{result.bindingsResolved.join(', ') || 'none'}</span>
              </div>
              <div className="p-2 rounded bg-white/[0.02]">
                <span className="text-muted-foreground">Output:</span><br />
                <span className="text-foreground">{result.html.length} chars</span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Component Registry Browser */}
      <Card className="glass-card gold-border">
        <CardHeader className="pb-2"><CardTitle className="text-sm">Component Registry — {CANONICAL_COMPONENT_SEEDS.length} components across {categories.length} categories</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {categories.map(cat => (
              <div key={cat.category} className="p-2 rounded border border-white/5 text-[10px]">
                <span className="text-muted-foreground">{cat.category}</span>
                <span className="ml-auto float-right text-foreground">{cat.active}/{cat.count}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Quality Center ───────────────────────────────────────────────────────────

export function QualityCenter({ csrfToken }: { csrfToken: string }) {
  const [selectedSlug, setSelectedSlug] = useState<string>('');
  const [report, setReport] = useState<QualityReport | null>(null);
  const [summary, setSummary] = useState<ProductQualitySummary | null>(null);
  const [running, setRunning] = useState(false);

  const runCheck = () => {
    setRunning(true);
    // Build context with default tokens
    const context: CompilationContext = {
      tokens: {
        primaryColor: '#D4AF37', accentColor: '#1a1a2e',
        fontDisplay: 'Cormorant Garamond', fontBody: 'Inter',
        radiusLarge: '16px',
      },
      config: {},
      data: {
        'event.coupleNames': 'Test Couple', 'event.date': '2027-06-15',
        'guest.name': 'Test Guest', 'invitation.qrCode': 'test',
        'invitation.accessCode': 'TEST',
      },
      layout: 'royal',
      productType: 'WEBSITE',
    };

    if (selectedSlug) {
      const component = CANONICAL_COMPONENT_SEEDS.find(c => c.slug === selectedSlug);
      if (component) {
        const r = runComponentQualityChecks(component, context);
        setReport(r);
      }
    } else {
      // Run all
      const reports = runProductQualityChecks(context);
      const s = summarizeQuality(reports);
      setSummary(s);
    }
    setRunning(false);
  };

  return (
    <div className="space-y-4">
      {/* Quality Check Runner */}
      <Card className="glass-card gold-border">
        <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-gold" /> Quality Center — Validation Engine</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-3">
            <select value={selectedSlug} onChange={(e) => setSelectedSlug(e.target.value)}
              className="flex-1 text-xs rounded border border-white/10 bg-white/5 px-2 py-1.5">
              <option value="">All components (product-level)</option>
              {CANONICAL_COMPONENT_SEEDS.map(c => <option key={c.slug} value={c.slug}>{c.name}</option>)}
            </select>
            <Button size="sm" onClick={runCheck} disabled={running}>
              {running ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <ShieldCheck className="w-3 h-3 mr-1" />}
              Run Quality Check
            </Button>
          </div>

          {/* Publish Gate */}
          {summary && (
            <div className={`p-3 rounded-lg border ${summary.canPublish ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-red-500/10 border-red-500/30'}`}>
              <div className="flex items-center gap-3">
                {summary.canPublish ? <CheckCircle2 className="w-5 h-5 text-emerald-400" /> : <XCircle className="w-5 h-5 text-red-400" />}
                <div>
                  <p className={`text-sm font-medium ${summary.canPublish ? 'text-emerald-300' : 'text-red-300'}`}>
                    {summary.canPublish ? 'PUBLISH APPROVED' : 'PUBLISH BLOCKED'}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    Score: {summary.averageScore}/100 (min: {MIN_PUBLISH_SCORE}) · {summary.passed} passed · {summary.warnings} warnings · {summary.failed} failed · {summary.blocked} blocked
                  </p>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Single component report */}
      {report && (
        <Card className="glass-card gold-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">
              {report.componentSlug} v{report.componentVersion} — Score: {report.score}/100
              {report.blocked && <Badge variant="outline" className="ml-2 text-[9px] bg-red-500/15 text-red-400 border-red-500/30">BLOCKED</Badge>}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 max-h-96 overflow-y-auto">
            {report.checks.map(check => (
              <div key={check.id} className="flex items-start gap-2 p-2 rounded text-xs border border-white/5">
                {check.status === 'PASS' && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />}
                {check.status === 'WARN' && <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />}
                {check.status === 'FAIL' && <XCircle className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />}
                {check.status === 'SKIP' && <AlertCircle className="w-3.5 h-3.5 text-gray-400 shrink-0 mt-0.5" />}
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{check.name}</span>
                    <Badge variant="outline" className="text-[9px] h-4">{check.category}</Badge>
                    <Badge variant="outline" className={`text-[9px] h-4 ${check.severity === 'CRITICAL' ? 'text-red-400' : check.severity === 'HIGH' ? 'text-orange-400' : 'text-muted-foreground'}`}>{check.severity}</Badge>
                  </div>
                  <p className="text-muted-foreground text-[10px] mt-0.5">{check.message}</p>
                  {check.detail && <p className="text-muted-foreground/70 text-[10px] font-mono">{check.detail}</p>}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Product-level summary */}
      {summary && !report && (
        <Card className="glass-card gold-border">
          <CardHeader className="pb-2"><CardTitle className="text-sm">Product Quality Summary — {summary.checked} components checked</CardTitle></CardHeader>
          <CardContent className="space-y-1 max-h-96 overflow-y-auto">
            {summary.reports.map(r => (
              <div key={r.componentSlug} className="flex items-center justify-between p-2 rounded text-xs border border-white/5">
                <span className="font-medium">{r.componentSlug}</span>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-muted-foreground">{r.passed}✓ {r.warnings}⚠ {r.failed}✗</span>
                  <Badge variant="outline" className={`text-[9px] h-4 ${r.score >= MIN_PUBLISH_SCORE ? 'text-emerald-400' : 'text-red-400'}`}>{r.score}/100</Badge>
                  {r.blocked && <Badge variant="outline" className="text-[9px] h-4 bg-red-500/15 text-red-400">BLOCKED</Badge>}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
