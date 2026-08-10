'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { GripVertical, Eye, Save, Send, RotateCcw, ChevronUp, ChevronDown, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { publishToast } from '@/lib/toast/publish-toast';
import type { WeddingManifest, SectionType } from '@/lib/wedding/manifest';
import { isPlatformAdmin } from '@/lib/types';
import { QualityScorecard } from '@/components/admin/QualityScorecard';
import type { QualityScorecard as QualityScorecardData } from '@/lib/quality/scorecard';

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
  couple: 'Le Couple — Présentation des mariés',
  countdown: 'Compte à rebours — Avant le grand jour',
  story: 'Notre Histoire — Récit du couple',
  gallery: 'Galerie — Photos premium',
  timeline: 'Programme — Déroulé du jour',
  venue: 'Le Lieu — Adresse et informations',
  map: 'Le Lieu — Plan et adresse',
  invitation: 'Invitation — Carte d\'invitation formelle',
  rsvp: 'RSVP — Confirmation de présence',
  'guest-auth': 'Authentification — Trouver mon invitation',
  'guest-experience': 'Espace Invité — Espace personnel',
  guestbook: 'Livre d\'Or — Messages des invités',
  cta: 'Appel à l\'action — Partage et remerciements',
};

interface DesignerTabProps {
  weddingId: string;
  weddingSlug: string;
  /** Current user's role (e.g. 'PLATFORM_ADMIN', 'ORGANIZER'). Used to gate the
   * "Forcer la publication" override button inside the quality gate modal. */
  userRole?: string;
  /** Optional callback to switch the active admin tab (used by the quality
   * scorecard's "Corriger" buttons to deep-link into the relevant tab). */
  onNavigateToTab?: (tabId: string) => void;
}

export function DesignerTab({ weddingId, weddingSlug, userRole, onNavigateToTab }: DesignerTabProps) {
  const [data, setData] = useState<DesignerData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);

  // Working copy of the draft manifest (edited by the admin)
  const [draft, setDraft] = useState<WeddingManifest | null>(null);
  const [hasChanges, setHasChanges] = useState(false);

  // ─── Phase 4B: Quality gate state ────────────────────────────────────────
  // The quality gate modal opens when the user clicks "Publier" AND the
  // scorecard's `canPublish === false` AND `qualityGateEnabled === true`
  // (blocking mode). In advisory mode (qualityGateEnabled === false), a
  // warning toast is shown but publish proceeds without a modal.
  const [qualityModalOpen, setQualityModalOpen] = useState(false);
  const [pendingScorecard, setPendingScorecard] = useState<QualityScorecardData | null>(null);
  // Ref holding the latest scorecard snapshot — set by the QualityScorecard
  // child via the onScorecardChange callback so the publish handler can read
  // it without an extra fetch. The ref is updated on every scorecard refresh.
  const scorecardRef = useRef<QualityScorecardData | null>(null);
  const userIsPlatformAdmin = isPlatformAdmin(userRole || '');

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

  // ─── Publish (core lifecycle, lifted into its own function so the quality
  // gate can call it after the user confirms the override) ────────────────────
  // The `forceOverride` parameter is documentation-only — it signals that the
  // caller has already written an audit log entry via POST /api/platform/quality/[slug].
  // The function body does NOT branch on it; the audit entry is the only side
  // effect of the override (no Prisma changes, no API route changes).
  const doPublish = useCallback(async () => {
    setPublishing(true);
    try {
      // Phase 3D #3: wrap the entire publish lifecycle (save + POST) in a
      // single publishToast() so the user sees a 3-state progress toast:
      // "Préparation de la publication…" → "Site publié avec succès ! 🎉"
      // → (or "Échec de la publication" on error). publishToast handles
      // the success + error toasts; the outer catch is a no-op for toast
      // purposes (the error is already surfaced by sonner).
      //
      // Phase 4B: when invoked from handleForcePublish, the caller has already
      // written an audit log entry via POST /api/platform/quality/[slug] — we
      // just proceed with the normal publish flow. The audit entry is the only
      // side effect of the override (no Prisma changes, no API route changes).
      await publishToast(
        (async () => {
          // Save first (if there are unsaved changes), then publish.
          if (hasChanges && draft) {
            const saveRes = await fetch(`/api/weddings/${weddingId}/design`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json', 'X-Wedding-Slug': weddingSlug },
              body: JSON.stringify({ sections: draft.sections, theme: draft.theme }),
            });
            if (!saveRes.ok) throw new Error('Failed to save draft before publish');
          }
          const res = await fetch(`/api/weddings/${weddingId}/design`, {
            method: 'POST',
            headers: { 'X-Wedding-Slug': weddingSlug },
          });
          if (!res.ok) throw new Error('Failed to publish');
        })(),
      );
      setHasChanges(false);
      await fetchData();
    } catch {
      // publishToast already showed the "Échec de la publication" toast.
      // The state stays as-is (hasChanges unchanged, draft preserved) so
      // the user can retry without losing their edits.
    } finally {
      setPublishing(false);
    }
  }, [hasChanges, draft, weddingId, weddingSlug, fetchData]);

  // ─── Phase 4B: Publish handler with quality gate ───────────────────────────
  // Flow:
  //   1. Fetch the latest scorecard (independent of the QualityScorecard
  //      component's internal state — guarantees freshness at click time).
  //   2. canPublish === true → proceed with publish.
  //   3. canPublish === false + qualityGateEnabled === false (advisory) →
  //      warn toast + proceed (constraint: "advisory by default, warn but
  //      allow").
  //   4. canPublish === false + qualityGateEnabled === true (blocking) →
  //      open the AlertDialog modal. "Forcer" (PLATFORM_ADMIN only) writes
  //      the audit log + proceeds. "Améliorer" + "Annuler" close the modal.
  const publish = useCallback(async () => {
    let scorecard: QualityScorecardData | null = scorecardRef.current;
    // Always fetch fresh scorecard at click time — the ref may be stale
    // (e.g. if the QualityScorecard component hasn't mounted yet, or if the
    // user changed something since the last fetch). Fail-open on fetch error
    // (treat as advisory + proceed) so we never block publish due to a
    // transient API failure.
    try {
      const res = await fetch(`/api/platform/quality/${encodeURIComponent(weddingSlug)}`, {
        credentials: 'include',
      });
      if (res.ok) {
        scorecard = (await res.json()) as QualityScorecardData;
        scorecardRef.current = scorecard;
        setPendingScorecard(scorecard);
      } else if (res.status === 403) {
        // Non-PLATFORM_ADMIN: the API returns 403, so we can't fetch the
        // scorecard. Treat as advisory + proceed — the gate is advisory by
        // default, and non-admins don't get the override button anyway.
        scorecard = null;
      } else {
        toast.warning('Score de qualité indisponible — publication en mode advisory');
        scorecard = null;
      }
    } catch {
      toast.warning('Impossible de vérifier le score de qualité — publication en mode advisory');
      scorecard = null;
    }

    // Case 1: no scorecard (fetch failed or 403) → advisory + proceed.
    if (!scorecard) {
      await doPublish();
      return;
    }

    // Case 2: canPublish === true → proceed.
    if (scorecard.canPublish) {
      await doPublish();
      return;
    }

    // Case 3: canPublish === false + advisory → warn + proceed.
    if (!scorecard.qualityGateEnabled) {
      toast.warning(
        `Score de qualité insuffisant (${scorecard.overall}/100) — publication consultative`,
      );
      await doPublish();
      return;
    }

    // Case 4: canPublish === false + blocking → open modal.
    setPendingScorecard(scorecard);
    setQualityModalOpen(true);
  }, [weddingSlug, doPublish]);

  // ─── Phase 4B: Force-publish override (PLATFORM_ADMIN only) ────────────────
  // Writes the audit log via POST /api/platform/quality/[slug], then proceeds
  // with the normal publish flow. The audit entry records the scorecard
  // summary so investigators can reconstruct what was overridden.
  const handleForcePublish = useCallback(async () => {
    if (!userIsPlatformAdmin) {
      toast.error('Réservé à l\'admin plateforme');
      return;
    }
    setQualityModalOpen(false);
    try {
      // Best-effort audit log — non-blocking. If the audit endpoint fails,
      // we still proceed with the publish (the override intent is clear).
      if (pendingScorecard) {
        await fetch(`/api/platform/quality/${encodeURIComponent(weddingSlug)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            overall: pendingScorecard.overall,
            threshold: pendingScorecard.threshold,
            dimensions: pendingScorecard.dimensions.map((d) => ({
              id: d.id,
              label: d.label,
              score: d.score,
              status: d.status,
            })),
          }),
        });
      }
    } catch {
      // Audit log failure is non-fatal — proceed with publish anyway.
      toast.warning('Audit log non écrit — publication forcée sans traçabilité');
    }
    toast.info('Publication forcée par admin plateforme');
    await doPublish();
  }, [userIsPlatformAdmin, pendingScorecard, weddingSlug, doPublish]);

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

      {/* Phase 4B — Quality Scorecard (top of designer tab) */}
      <QualityScorecard
        weddingSlug={weddingSlug}
        isPlatformAdmin={userIsPlatformAdmin}
        onForcePublish={handleForcePublish}
        onNavigateToTab={onNavigateToTab}
      />

      {/* Phase 4B — Quality gate modal (blocking mode only) */}
      <AlertDialog open={qualityModalOpen} onOpenChange={setQualityModalOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Score de qualité insuffisant</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <span className="block text-sm">
                Le score global est de{' '}
                <strong className="text-rose-700">
                  {pendingScorecard?.overall ?? '?'}/100
                </strong>{' '}
                (seuil {pendingScorecard?.threshold ?? 60}). La qualité gate est
                activée pour ce mariage — la publication est bloquée tant que le
                score est inférieur au seuil.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          {pendingScorecard && (
            <div className="max-h-40 overflow-y-auto rounded-md border bg-muted/30 p-3 text-xs space-y-1">
              {pendingScorecard.dimensions
                .filter((d) => d.status !== 'good')
                .map((d) => (
                  <div key={d.id} className="flex items-center gap-2">
                    <span
                      className={`font-mono text-[10px] uppercase w-14 ${
                        d.status === 'critical' ? 'text-rose-600' : 'text-amber-600'
                      }`}
                    >
                      {d.id}
                    </span>
                    <span className="flex-1 text-muted-foreground">{d.label}</span>
                    <span
                      className={`font-semibold ${
                        d.status === 'critical' ? 'text-rose-600' : 'text-amber-600'
                      }`}
                    >
                      {d.score}/100
                    </span>
                  </div>
                ))}
            </div>
          )}
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setQualityModalOpen(false);
                // Scroll to the quality scorecard section so the user can
                // review findings + click "Corriger" buttons.
                if (typeof document !== 'undefined') {
                  document
                    .querySelector('[data-quality-scorecard]')
                    ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
              }}
            >
              Améliorer
            </Button>
            {userIsPlatformAdmin ? (
              <AlertDialogAction
                onClick={handleForcePublish}
                className="bg-rose-600 hover:bg-rose-700 text-white"
              >
                Forcer la publication
              </AlertDialogAction>
            ) : (
              <span
                className="text-xs text-muted-foreground italic px-3"
                title="Réservé à l'admin plateforme"
              >
                Override réservé à l&rsquo;admin plateforme
              </span>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
