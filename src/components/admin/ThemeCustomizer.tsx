'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import {
  Palette,
  Type,
  Layout as LayoutIcon,
  Globe,
  Check,
  Loader2,
  Save,
  Trash2,
  Wand2,
  Lock,
  ExternalLink,
  Sparkles,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  THEME_TEMPLATES,
  FONT_OPTIONS,
  LAYOUT_OPTIONS,
  type ThemeTemplate,
} from '@/lib/themes/templates';
import { validateCustomDomain } from '@/lib/custom-domains';

interface ThemeData {
  primaryColor: string;
  accentColor: string;
  fontDisplay: string;
  fontBody: string;
  layout: string;
}

interface CustomDomainData {
  customDomain: string | null;
  plan: string;
  canUseCustomDomain: boolean;
}

interface ThemeCustomizerProps {
  /** Wedding slug for API calls.
   *  When omitted (e.g. in platform admin's Appearance tab), the component
   *  renders a wedding picker dropdown and defaults to the first available
   *  wedding — never silently hardcodes 'josue-hornella' (Phase 3 ÉTAPE 6 fix).
   */
  slug?: string;
}

interface WeddingOption {
  id: string;
  slug: string;
  coupleLabel: string;
}

export function ThemeCustomizer({ slug: explicitSlug }: ThemeCustomizerProps = {}) {
  const [theme, setTheme] = useState<ThemeData | null>(null);
  const [domain, setDomain] = useState<CustomDomainData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [applyingTemplate, setApplyingTemplate] = useState<string | null>(null);
  const [domainInput, setDomainInput] = useState('');
  const [savingDomain, setSavingDomain] = useState(false);
  // Couple label from settings — avoids leaking "Josué & Hornella" into other
  // weddings' theme preview. Generic "Mariage" fallback before the fetch settles.
  const [coupleLabel, setCoupleLabel] = useState<string>('Mariage');

  // Phase 3 ÉTAPE 6: when no explicit slug is provided (platform admin
  // context), we fetch the list of weddings and let the admin pick which
  // one to edit. The selected slug drives all subsequent API calls — no
  // more silent hardcoded 'josue-hornella' default.
  const [weddingOptions, setWeddingOptions] = useState<WeddingOption[]>([]);
  const [selectedSlug, setSelectedSlug] = useState<string>(explicitSlug ?? '');

  // If parent passes an explicit slug, always use it (tenant admin context).
  // Otherwise use the admin-selected slug, falling back to the first wedding
  // in the list once loaded.
  const slug = explicitSlug ?? selectedSlug;

  const headers = { 'X-Wedding-Slug': slug };

  // Fetch the list of weddings (platform admin context only — when no
  // explicit slug was passed). Best-effort: on failure, leave the picker
  // empty and the rest of the component will show its loading state.
  useEffect(() => {
    if (explicitSlug) return; // tenant admin context — no picker needed
    let cancelled = false;
    fetch('/api/platform/weddings?limit=100', {
      // Public-ish GET — platform-admin gated on the server side. We rely on
      // the httpOnly cookie set by /api/platform/login instead of a Bearer
      // token, because this component is rendered from the platform admin
      // shell which uses cookie-based auth.
      credentials: 'include',
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data?.weddings) return;
        const opts: WeddingOption[] = data.weddings.map((w: { id: string; slug: string; coupleLabel: string }) => ({
          id: w.id,
          slug: w.slug,
          coupleLabel: w.coupleLabel || w.slug,
        }));
        setWeddingOptions(opts);
        // If no slug selected yet, default to the first wedding (NOT to a
        // hardcoded 'josue-hornella').
        setSelectedSlug((prev) => prev || opts[0]?.slug || '');
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [explicitSlug]);

  // Fetch settings to derive the couple label used in the live preview.
  useEffect(() => {
    fetch('/api/settings', { headers })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        const s = data?.settings;
        if (s && typeof s === 'object') {
          const bride = (s.bride_name || '').trim();
          const groom = (s.groom_name || '').trim();
          if (bride && groom) setCoupleLabel(`${groom} & ${bride}`);
          else if (bride || groom) setCoupleLabel(bride || groom);
        }
      })
      .catch(() => {});
  }, [slug]);

  const fetchTheme = useCallback(async () => {
    try {
      const res = await fetch('/api/theme', { headers });
      if (!res.ok) throw new Error('Failed to fetch theme');
      const data = await res.json();
      setTheme({
        primaryColor: data.primaryColor,
        accentColor: data.accentColor,
        fontDisplay: data.fontDisplay,
        fontBody: data.fontBody,
        layout: data.layout,
      });
    } catch {
      toast.error('Impossible de charger le thème');
    }
  }, [slug]);

  const fetchDomain = useCallback(async () => {
    try {
      const res = await fetch('/api/custom-domain', { headers });
      if (!res.ok) throw new Error('Failed to fetch domain');
      const data = await res.json();
      setDomain(data);
      setDomainInput(data.customDomain ?? '');
    } catch {
      toast.error('Impossible de charger le domaine');
    }
  }, [slug]);

  useEffect(() => {
    setLoading(true);
    Promise.all([fetchTheme(), fetchDomain()]).finally(() => setLoading(false));
  }, [fetchTheme, fetchDomain]);

  const handleApplyTemplate = async (template: ThemeTemplate) => {
    setApplyingTemplate(template.id);
    try {
      const res = await fetch('/api/theme/apply-template', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ templateId: template.id }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to apply template');
      }
      const data = await res.json();
      setTheme(data.theme);
      toast.success(`Template "${template.name}" appliqué`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erreur lors de l\'application du template');
    } finally {
      setApplyingTemplate(null);
    }
  };

  const handleSaveTheme = async () => {
    if (!theme) return;
    setSaving(true);
    try {
      const res = await fetch('/api/theme', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify(theme),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to save theme');
      }
      toast.success('Thème enregistré');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erreur lors de l\'enregistrement');
    } finally {
      setSaving(false);
    }
  };

  const handleSetDomain = async () => {
    setSavingDomain(true);
    try {
      const res = await fetch('/api/custom-domain', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ domain: domainInput }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to set domain');
      }
      const data = await res.json();
      setDomain(data);
      toast.success('Domaine personnalisé configuré');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erreur lors de la configuration du domaine');
    } finally {
      setSavingDomain(false);
    }
  };

  const handleClearDomain = async () => {
    setSavingDomain(true);
    try {
      const res = await fetch('/api/custom-domain', {
        method: 'DELETE',
        headers,
      });
      if (!res.ok) throw new Error('Failed to clear domain');
      const data = await res.json();
      setDomain({ ...domain!, customDomain: data.customDomain });
      setDomainInput('');
      toast.success('Domaine personnalisé supprimé');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setSavingDomain(false);
    }
  };

  if (loading || !theme || !domain) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ─── Wedding picker (platform admin context only) ─── */}
      {/* Phase 3 ÉTAPE 6: when no explicit slug is passed (i.e. the platform
          admin's Appearance tab), show a dropdown so the admin can pick which
          wedding's theme to edit. Previously the slug silently defaulted to
          'josue-hornella', which leaked theme edits across weddings. */}
      {!explicitSlug && weddingOptions.length > 0 && (
        <Card className="border-gold/20 bg-gradient-to-br from-card to-card/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Globe className="w-4 h-4 text-gold" />
              Mariage sélectionné
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Vous modifiez le thème du mariage ci-dessous. Toutes les modifications
              (couleurs, polices, layout, domaine) s'appliquent à ce mariage uniquement.
            </p>
          </CardHeader>
          <CardContent>
            <Select value={selectedSlug} onValueChange={setSelectedSlug}>
              <SelectTrigger>
                <SelectValue placeholder="Sélectionnez un mariage" />
              </SelectTrigger>
              <SelectContent>
                {weddingOptions.map((w) => (
                  <SelectItem key={w.id} value={w.slug}>
                    {w.coupleLabel} <span className="text-muted-foreground">— /w/{w.slug}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>
      )}

      {/* ─── Templates ─── */}
      <Card className="border-gold/20 bg-gradient-to-br from-card to-card/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="w-4 h-4 text-gold" />
            Templates de Thème
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Appliquez un modèle complet en un clic — couleurs, polices et layout.
          </p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            {THEME_TEMPLATES.map((template) => (
              <motion.button
                key={template.id}
                whileHover={{ y: -2 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => handleApplyTemplate(template)}
                disabled={applyingTemplate !== null}
                className="group relative text-left rounded-lg overflow-hidden border border-white/10 hover:border-gold/40 transition-colors disabled:opacity-60"
                style={{ background: template.preview.bg }}
              >
                {/* Swatches */}
                <div className="flex h-16">
                  {template.preview.swatch.map((color, i) => (
                    <div
                      key={i}
                      className="flex-1"
                      style={{ background: color }}
                    />
                  ))}
                </div>
                {/* Info */}
                <div className="p-3" style={{ color: template.preview.text }}>
                  <p className="font-display text-sm font-semibold" style={{ fontFamily: `'${template.fontDisplay}', serif` }}>
                    {template.name}
                  </p>
                  <p className="text-[10px] opacity-70 mt-1 line-clamp-2">
                    {template.description}
                  </p>
                </div>
                {/* Loading overlay */}
                {applyingTemplate === template.id && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                    <Loader2 className="w-5 h-5 animate-spin text-white" />
                  </div>
                )}
                {/* Active indicator */}
                {applyingTemplate === null && theme.primaryColor.toUpperCase() === template.primaryColor.toUpperCase() && (
                  <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center">
                    <Check className="w-3 h-3 text-white" />
                  </div>
                )}
              </motion.button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* ─── Colors ─── */}
      <Card className="border-white/10">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Palette className="w-4 h-4 text-gold" />
            Couleurs
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="primary-color">Couleur Principale</Label>
              <div className="flex gap-2">
                <Input
                  id="primary-color"
                  type="color"
                  value={theme.primaryColor}
                  onChange={(e) => setTheme({ ...theme, primaryColor: e.target.value })}
                  className="w-14 h-10 p-1 cursor-pointer"
                />
                <Input
                  value={theme.primaryColor}
                  onChange={(e) => setTheme({ ...theme, primaryColor: e.target.value })}
                  className="flex-1 font-mono"
                  placeholder="#D4A853"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="accent-color">Couleur d&apos;Accent</Label>
              <div className="flex gap-2">
                <Input
                  id="accent-color"
                  type="color"
                  value={theme.accentColor}
                  onChange={(e) => setTheme({ ...theme, accentColor: e.target.value })}
                  className="w-14 h-10 p-1 cursor-pointer"
                />
                <Input
                  value={theme.accentColor}
                  onChange={(e) => setTheme({ ...theme, accentColor: e.target.value })}
                  className="flex-1 font-mono"
                  placeholder="#C8785A"
                />
              </div>
            </div>
          </div>

          {/* Live preview */}
          <div className="mt-4 p-4 rounded-lg border border-white/10" style={{ background: '#1a1410' }}>
            <p className="text-[10px] text-muted-foreground mb-2 uppercase tracking-widest">Aperçu</p>
            <div className="flex items-center gap-4">
              <div className="flex gap-2">
                <div className="w-8 h-8 rounded-full" style={{ background: theme.primaryColor }} />
                <div className="w-8 h-8 rounded-full" style={{ background: theme.accentColor }} />
              </div>
              <div>
                <p
                  className="text-xl font-bold"
                  style={{ color: theme.primaryColor, fontFamily: `'${theme.fontDisplay}', serif` }}
                >
                  {coupleLabel}
                </p>
                <p
                  className="text-xs"
                  style={{ color: theme.accentColor, fontFamily: `'${theme.fontBody}', sans-serif` }}
                >
                  Notre mariage — 28 Juin 2026
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ─── Fonts ─── */}
      <Card className="border-white/10">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Type className="w-4 h-4 text-gold" />
            Polices
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Police d&apos;Affichage (Titres)</Label>
              <Select
                value={theme.fontDisplay}
                onValueChange={(v) => setTheme({ ...theme, fontDisplay: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FONT_OPTIONS.map((font) => (
                    <SelectItem key={font.family} value={font.family}>
                      <span style={{ fontFamily: `'${font.family}', serif` }}>{font.label}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Police de Corps (Texte)</Label>
              <Select
                value={theme.fontBody}
                onValueChange={(v) => setTheme({ ...theme, fontBody: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FONT_OPTIONS.map((font) => (
                    <SelectItem key={font.family} value={font.family}>
                      <span style={{ fontFamily: `'${font.family}', sans-serif` }}>{font.label}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ─── Layout ─── */}
      <Card className="border-white/10">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <LayoutIcon className="w-4 h-4 text-gold" />
            Mise en Page
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {LAYOUT_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                onClick={() => setTheme({ ...theme, layout: opt.id })}
                className={`text-left p-3 rounded-lg border transition-colors ${
                  theme.layout === opt.id
                    ? 'border-gold bg-gold/10'
                    : 'border-white/10 hover:border-white/20'
                }`}
              >
                <p className="font-medium text-sm">{opt.label}</p>
                <p className="text-[11px] text-muted-foreground mt-1">{opt.description}</p>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* ─── Save Button ─── */}
      <Button
        onClick={handleSaveTheme}
        disabled={saving}
        className="w-full bg-gradient-gold hover:opacity-90 text-white"
        size="lg"
      >
        {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
        Enregistrer le Thème
      </Button>

      <Separator />

      {/* ─── Custom Domain ─── */}
      <Card className="border-white/10">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Globe className="w-4 h-4 text-gold" />
            Domaine Personnalisé
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Connectez votre propre nom de domaine (ex: mariage-awa-david.fr).
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {!domain.canUseCustomDomain ? (
            <div className="flex items-center gap-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
              <Lock className="w-5 h-5 text-amber-400 shrink-0" />
              <div>
                <p className="text-sm font-medium text-amber-200">Plan {domain.plan} — indisponible</p>
                <p className="text-[11px] text-amber-300/80">
                  Passez au plan Premium ou Élite pour activer les domaines personnalisés.
                </p>
              </div>
            </div>
          ) : (
            <>
              {domain.customDomain && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                  <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                  <div className="flex-1">
                    <p className="text-sm font-medium">{domain.customDomain}</p>
                    <p className="text-[11px] text-muted-foreground">Domaine actif</p>
                  </div>
                  <a
                    href={`https://${domain.customDomain}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>
                </div>
              )}
              <div className="flex gap-2">
                <Input
                  value={domainInput}
                  onChange={(e) => setDomainInput(e.target.value)}
                  placeholder="mon-mariage.fr"
                  className="flex-1"
                />
                <Button
                  onClick={handleSetDomain}
                  disabled={savingDomain || !domainInput.trim()}
                  variant="default"
                >
                  {savingDomain ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
                  Configurer
                </Button>
                {domain.customDomain && (
                  <Button
                    onClick={handleClearDomain}
                    disabled={savingDomain}
                    variant="outline"
                    className="text-red-400 hover:text-red-300"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                )}
              </div>
              <div className="text-[11px] text-muted-foreground space-y-1">
                <p className="font-medium text-foreground">Instructions DNS :</p>
                <p>1. Créez un enregistrement CNAME pointant votre domaine vers <code className="text-gold">heureuxmariage.aenews.net</code></p>
                <p>2. Ajoutez un enregistrement TXT <code className="text-gold">_heureux-mariage.{domainInput || 'votre-domaine.fr'}</code> avec la valeur <code className="text-gold">hm-verify={slug}</code></p>
                <p>3. Attendez la propagation DNS (5-30 min) puis contactez le support pour activer le SSL.</p>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
