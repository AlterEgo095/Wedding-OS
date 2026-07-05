'use client';

import { useState, useEffect, useCallback } from 'react';
import { GripVertical, Eye, Save, Send, RotateCcw, ChevronUp, ChevronDown, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import type { WeddingManifest, ManifestSection, SectionType } from '@/lib/wedding/manifest';

// ══════════════════════════════════════════════════════════════════════════════
// DesignerTab — Real Experience Builder (Slice 2)
// ══════════════════════════════════════════════════════════════════════════════
// Chain: Designer action → /api/weddings/[id]/design → draftManifest →
//        preview (?preview=draft) → publish → manifest → public renderer
//
// Capabilities:
//   - Collection selection (from DB)
//   - Variant selection
//   - Section enable/disable
//   - Section reorder (up/down)
//   - Theme color/font overrides
//   - Save draft
//   - Preview (opens new tab with ?preview=draft)
//   - Publish (draft → published)
//   - Discard draft
// ══════════════════════════════════════════════════════════════════════════════

interface CollectionOption {
  id: string;
  slug: string;
  name: string;
  version: string;
  category: string;
  thumbnailUrl: string | null;
  themeSeed: { primaryColor?: string; accentColor?: string; fontDisplay?: string; fontBody?: string; layout?: string };
  variants: { id: string; code: string; name: string; isDefault: boolean; paletteOverride: Record<string, string> | null }[];
}

interface DesignerData {
  binding: { collectionId: string; collectionVersion: string; status: string; deployedAt: string; hasDraft: boolean } | null;
  publishedManifest: WeddingManifest | null;
  draftManifest: WeddingManifest | null;
  availableCollections: CollectionOption[];
}

const SECTION_LABELS: Record<SectionType, string> = {
  hero: 'Hero — Section d\'ouverture',
  story: 'Notre Histoire — Récit du couple',
  gallery: 'Galerie — Photos premium',
  timeline: 'Programme — Déroulé du jour',
  map: 'Le Lieu — Plan et adresse',
  'guest-auth': 'Authentification — Trouver mon invitation',
};

export function DesignerTab({ weddingId, weddingSlug }: { weddingId: string; weddingSlug: string }) {
  const [data, setData] = useState<DesignerData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);

  // Working copy of the draft manifest (edited by the admin)
  const [draft, setDraft] = useState<WeddingManifest | null>(null);
  const [hasChanges, setHasChanges] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`/api/weddings/${weddingId}/design`, { headers: { 'X-Wedding-Slug': weddingSlug } });
      if (!res.ok) throw new Error('Failed to fetch design data');
      const d: DesignerData = await res.json();
      setData(d);
      // Start from draft if it exists, otherwise from published
      const start = d.draftManifest || d.publishedManifest;
      if (start) {
        setDraft(JSON.parse(JSON.stringify(start)));
      }
      setHasChanges(false);
    } catch (e) {
      toast.error('Erreur: ' + (e instanceof Error ? e.message : 'inconnue'));
    } finally {
      setLoading(false);
    }
  }, [weddingId, weddingSlug]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ─── Section operations ──────────────────────────────────────────────────
  const toggleSection = (id: string) => {
    if (!draft) return;
    setDraft({ ...draft, sections: draft.sections.map(s => s.id === id ? { ...s, enabled: !s.enabled } : s) });
    setHasChanges(true);
  };

  const moveSection = (id: string, direction: 'up' | 'down') => {
    if (!draft) return;
    const sorted = [...draft.sections].sort((a, b) => a.order - b.order);
    const idx = sorted.findIndex(s => s.id === id);
    if (idx < 0) return;
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= sorted.length) return;
    [sorted[idx], sorted[swapIdx]] = [sorted[swapIdx], sorted[idx]];
    // Reassign order
    sorted.forEach((s, i) => { s.order = i; });
    setDraft({ ...draft, sections: sorted });
    setHasChanges(true);
  };

  // ─── Theme operations ────────────────────────────────────────────────────
  const updateTheme = (key: keyof WeddingManifest['theme'], value: string) => {
    if (!draft) return;
    setDraft({ ...draft, theme: { ...draft.theme, [key]: value } });
    setHasChanges(true);
  };

  // ─── Collection change ───────────────────────────────────────────────────
  const changeCollection = async (collectionId: string) => {
    if (!data) return;
    const col = data.availableCollections.find(c => c.id === collectionId);
    if (!col) return;
    // Regenerate manifest from new collection
    try {
      const res = await fetch(`/api/weddings/${weddingId}/design`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'X-Wedding-Slug': weddingSlug },
        body: JSON.stringify({ collectionId }),
      });
      if (!res.ok) throw new Error('Failed to change collection');
      const result = await res.json();
      setDraft(result.draft);
      setHasChanges(false);
      toast.success(`Collection changée vers ${col.name}`);
    } catch (e) {
      toast.error('Erreur: ' + (e instanceof Error ? e.message : 'inconnue'));
    }
  };

  // ─── Save draft ──────────────────────────────────────────────────────────
  const saveDraft = async () => {
    if (!draft) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/weddings/${weddingId}/design`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'X-Wedding-Slug': weddingSlug },
        body: JSON.stringify({ sections: draft.sections, theme: draft.theme }),
      });
      if (!res.ok) throw new Error('Failed to save draft');
      toast.success('Brouillon sauvegardé');
      setHasChanges(false);
    } catch (e) {
      toast.error('Erreur: ' + (e instanceof Error ? e.message : 'inconnue'));
    } finally {
      setSaving(false);
    }
  };

  // ─── Preview ─────────────────────────────────────────────────────────────
  const preview = async () => {
    if (!draft) return;
    // Save first, then open preview
    setSaving(true);
    try {
      const res = await fetch(`/api/weddings/${weddingId}/design`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'X-Wedding-Slug': weddingSlug },
        body: JSON.stringify({ sections: draft.sections, theme: draft.theme }),
      });
      if (!res.ok) throw new Error('Failed to save draft before preview');
      setHasChanges(false);
      // Open preview in new tab
      window.open(`/w/${weddingSlug}?preview=draft`, '_blank');
      toast.success('Aperçu ouvert dans un nouvel onglet');
    } catch (e) {
      toast.error('Erreur: ' + (e instanceof Error ? e.message : 'inconnue'));
    } finally {
      setSaving(false);
    }
  };

  // ─── Publish ─────────────────────────────────────────────────────────────
  const publish = async () => {
    setPublishing(true);
    try {
      // Save first, then publish
      if (hasChanges && draft) {
        await fetch(`/api/weddings/${weddingId}/design`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', 'X-Wedding-Slug': weddingSlug },
          body: JSON.stringify({ sections: draft.sections, theme: draft.theme }),
        });
      }
      const res = await fetch(`/api/weddings/${weddingId}/design`, {
        method: 'POST',
        headers: { 'X-Wedding-Slug': weddingSlug },
      });
      if (!res.ok) throw new Error('Failed to publish');
      toast.success('Design publié — visible publiquement');
      setHasChanges(false);
      await fetchData();
    } catch (e) {
      toast.error('Erreur: ' + (e instanceof Error ? e.message : 'inconnue'));
    } finally {
      setPublishing(false);
    }
  };

  // ─── Discard draft ───────────────────────────────────────────────────────
  const discardDraft = async () => {
    try {
      const res = await fetch(`/api/weddings/${weddingId}/design`, {
        method: 'DELETE',
        headers: { 'X-Wedding-Slug': weddingSlug },
      });
      if (!res.ok) throw new Error('Failed to discard');
      toast.success('Brouillon annulé');
      await fetchData();
    } catch (e) {
      toast.error('Erreur: ' + (e instanceof Error ? e.message : 'inconnue'));
    }
  };

  if (loading) return <div className="p-8 text-center text-muted-foreground">Chargement du Designer…</div>;
  if (!data) return <div className="p-8 text-center text-muted-foreground">Aucune donnée</div>;

  const sortedSections = draft ? [...draft.sections].sort((a, b) => a.order - b.order) : [];
  const publishedSections = data.publishedManifest?.sections.filter(s => s.enabled).length ?? 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-serif text-foreground">Designer</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Contrôlez l'expérience publique de votre mariage
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={discardDraft} disabled={!data.binding?.hasDraft}>
            <RotateCcw className="w-4 h-4 mr-1" /> Annuler le brouillon
          </Button>
          <Button variant="outline" size="sm" onClick={preview} disabled={!draft || saving}>
            <Eye className="w-4 h-4 mr-1" /> {saving ? 'Sauvegarde…' : 'Aperçu'}
          </Button>
          <Button variant="outline" size="sm" onClick={saveDraft} disabled={!draft || !hasChanges || saving}>
            <Save className="w-4 h-4 mr-1" /> Sauver
          </Button>
          <Button size="sm" onClick={publish} disabled={!draft || publishing}>
            <Send className="w-4 h-4 mr-1" /> {publishing ? 'Publication…' : 'Publier'}
          </Button>
        </div>
      </div>

      {/* Status badges */}
      <div className="flex gap-2 flex-wrap">
        {data.binding?.hasDraft ? (
          <Badge variant="secondary" className="bg-amber-100 text-amber-800">Brouillon non publié</Badge>
        ) : (
          <Badge variant="secondary" className="bg-green-100 text-green-800">À jour</Badge>
        )}
        <Badge variant="outline">
          Publié: {publishedSections} sections
        </Badge>
        {hasChanges && <Badge variant="secondary" className="bg-blue-100 text-blue-800">Modifications non sauvées</Badge>}
      </div>

      {/* Collection selector */}
      <Card className="p-4">
        <Label className="text-sm font-medium">Collection</Label>
        <p className="text-xs text-muted-foreground mb-3">
          Changer de collection régénère la structure de base (sections, thème)
        </p>
        <Select
          value={draft?.collectionId || ''}
          onValueChange={changeCollection}
        >
          <SelectTrigger>
            <SelectValue placeholder="Sélectionner une collection" />
          </SelectTrigger>
          <SelectContent>
            {data.availableCollections.map(c => (
              <SelectItem key={c.id} value={c.id}>
                {c.name} <span className="text-muted-foreground ml-1">({c.category})</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Card>

      {/* Sections */}
      {draft && (
        <Card className="p-4">
          <Label className="text-sm font-medium">Sections</Label>
          <p className="text-xs text-muted-foreground mb-3">
            Activez, désactivez et réordonnez les sections de votre page
          </p>
          <div className="space-y-2">
            {sortedSections.map((section, idx) => (
              <div
                key={section.id}
                className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${
                  section.enabled ? 'bg-background border-border' : 'bg-muted/30 border-muted opacity-60'
                }`}
              >
                <GripVertical className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-medium text-foreground">
                    {SECTION_LABELS[section.type] || section.type}
                  </span>
                  <span className="text-xs text-muted-foreground ml-2">/{section.id}</span>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0"
                    onClick={() => moveSection(section.id, 'up')}
                    disabled={idx === 0}
                  >
                    <ChevronUp className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0"
                    onClick={() => moveSection(section.id, 'down')}
                    disabled={idx === sortedSections.length - 1}
                  >
                    <ChevronDown className="w-4 h-4" />
                  </Button>
                  <Switch
                    checked={section.enabled}
                    onCheckedChange={() => toggleSection(section.id)}
                  />
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Theme overrides */}
      {draft && (
        <Card className="p-4">
          <Label className="text-sm font-medium">Thème</Label>
          <p className="text-xs text-muted-foreground mb-3">
            Couleurs et polices de votre collection (substitue les valeurs par défaut)
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label className="text-xs">Couleur primaire</Label>
              <div className="flex gap-2 items-center">
                <Input
                  type="color"
                  value={draft.theme.primaryColor}
                  onChange={e => updateTheme('primaryColor', e.target.value)}
                  className="w-12 h-10 p-1 rounded"
                />
                <Input
                  value={draft.theme.primaryColor}
                  onChange={e => updateTheme('primaryColor', e.target.value)}
                  className="flex-1"
                />
              </div>
            </div>
            <div>
              <Label className="text-xs">Couleur d'accent</Label>
              <div className="flex gap-2 items-center">
                <Input
                  type="color"
                  value={draft.theme.accentColor}
                  onChange={e => updateTheme('accentColor', e.target.value)}
                  className="w-12 h-10 p-1 rounded"
                />
                <Input
                  value={draft.theme.accentColor}
                  onChange={e => updateTheme('accentColor', e.target.value)}
                  className="flex-1"
                />
              </div>
            </div>
            <div>
              <Label className="text-xs">Police d'affichage</Label>
              <Input
                value={draft.theme.fontDisplay}
                onChange={e => updateTheme('fontDisplay', e.target.value)}
              />
            </div>
            <div>
              <Label className="text-xs">Police de corps</Label>
              <Input
                value={draft.theme.fontBody}
                onChange={e => updateTheme('fontBody', e.target.value)}
              />
            </div>
          </div>
        </Card>
      )}

      {/* Info */}
      <div className="text-xs text-muted-foreground p-4 bg-muted/30 rounded-lg">
        <p className="flex items-center gap-1 mb-1">
          <Check className="w-3 h-3 text-green-600" />
          <strong>Sauver</strong> enregistre le brouillon (non visible publiquement)
        </p>
        <p className="flex items-center gap-1 mb-1">
          <Check className="w-3 h-3 text-green-600" />
          <strong>Aperçu</strong> ouvre la page avec le brouillon dans un nouvel onglet
        </p>
        <p className="flex items-center gap-1">
          <Check className="w-3 h-3 text-green-600" />
          <strong>Publier</strong> copie le brouillon vers la version publiée (visible publiquement)
        </p>
      </div>
    </div>
  );
}
