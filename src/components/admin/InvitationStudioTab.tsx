'use client';

// ══════════════════════════════════════════════════════════════════════════════
// InvitationStudioTab — MISSION 5.9.2-B/C
// ══════════════════════════════════════════════════════════════════════════════
// The NO-CODE operator interface for the Premium Invitation Factory.
//
// Reuses the EXISTING backend engine (composeInvitationExperience + 5 renderers
// + IdentityInvitation dispatcher) — this component is purely the configuration
// + preview layer that was missing.
//
// Flow:
//   1. Template Selector — card grid of 15 PUBLISHED InvitationTemplates
//   2. Couple Photo Studio — upload photos + assign to semantic slots
//   3. Live Preview — desktop/tablet/mobile WYSIWYG via IdentityInvitation
//   4. Save Draft (PUT) + Publish (POST)
//
// All API calls go to /api/weddings/[id]/invitation-studio (auto-tenant-scoped
// via the X-Wedding-Slug header injected by the admin fetch interceptor).
// ══════════════════════════════════════════════════════════════════════════════

import { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Upload,
  Image as ImageIcon,
  Check,
  Loader2,
  Smartphone,
  Tablet,
  Monitor,
  Save,
  Send,
  RefreshCw,
  X,
  Crown,
  Sparkles,
  Eye,
} from 'lucide-react';
import dynamic from 'next/dynamic';

// Heavy premium renderer — dynamic import (only loaded when preview is used).
const IdentityInvitation = dynamic(
  () => import('@/components/wedding/IdentityInvitation').then((m) => m.IdentityInvitation),
  { ssr: false, loading: () => <div className="p-8 text-center text-sm text-muted-foreground">Chargement du renderer premium…</div> },
);

// ─── Types ────────────────────────────────────────────────────────────────────
interface TemplateCard {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  category: string;
  style: string;
  layout: string;
  identity: string | null;
  tier: string;
  status: string;
  isPremium: boolean;
  isRecommended: boolean;
  isDefault: boolean;
  version: number;
  thumbnailUrl: string | null;
  previewUrl: string | null;
  sectionsCount: number;
  mediaSlotsCount: number;
  dataBindingsCount: number;
  guestBindingsCount: number;
  mediaSlots?: MediaSlotDecl[];
}

interface MediaRow {
  id: string;
  url: string;
  title: string;
  type: string;
  category: string;
  semanticRole: string | null;
  slotId: string | null;
  aspectRatio: string | null;
  sizeBytes: number | null;
  createdAt: string;
}

interface MediaSlotDecl {
  slotId: string;
  semanticRole: string;
  required: boolean;
  aspectRatio?: string;
}

interface SlotAssignment {
  mediaId?: string;
  focalPoint?: { x: number; y: number };
}

interface InvitationStudioTabProps {
  weddingId: string;
  weddingSlug: string;
  csrfToken: string;
  onSessionExpired?: () => void;
}

type ViewportKey = 'mobile-360' | 'mobile-390' | 'mobile-430' | 'tablet-768' | 'desktop-1024' | 'desktop-1440';
const VIEWPORTS: Record<ViewportKey, { label: string; width: number; icon: typeof Smartphone }> = {
  'mobile-360': { label: '360px', width: 360, icon: Smartphone },
  'mobile-390': { label: '390px', width: 390, icon: Smartphone },
  'mobile-430': { label: '430px', width: 430, icon: Smartphone },
  'tablet-768': { label: '768px', width: 768, icon: Tablet },
  'desktop-1024': { label: '1024px', width: 1024, icon: Monitor },
  'desktop-1440': { label: '1440px', width: 1440, icon: Monitor },
};

const CATEGORY_COLORS: Record<string, string> = {
  LUXURY: 'bg-amber-100 text-amber-800 border-amber-300',
  EDITORIAL: 'bg-stone-100 text-stone-800 border-stone-300',
  BOTANICAL: 'bg-emerald-100 text-emerald-800 border-emerald-300',
  CINEMATIC: 'bg-slate-100 text-slate-800 border-slate-400',
  CHAMPAGNE: 'bg-yellow-100 text-yellow-800 border-yellow-300',
};

const TIER_COLORS: Record<string, string> = {
  FREE: 'bg-gray-100 text-gray-700',
  STANDARD: 'bg-blue-100 text-blue-700',
  PREMIUM: 'bg-purple-100 text-purple-700',
  EXCLUSIVE: 'bg-rose-100 text-rose-700',
};

// ─── Component ────────────────────────────────────────────────────────────────
export function InvitationStudioTab({
  weddingId,
  weddingSlug,
  csrfToken,
  onSessionExpired,
}: InvitationStudioTabProps) {
  const [loading, setLoading] = useState(true);
  const [templates, setTemplates] = useState<TemplateCard[]>([]);
  const [media, setMedia] = useState<MediaRow[]>([]);
  const [slotDecls, setSlotDecls] = useState<MediaSlotDecl[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [currentTemplateId, setCurrentTemplateId] = useState<string | null>(null);
  const [slotAssignments, setSlotAssignments] = useState<Record<string, SlotAssignment>>({});
  const [publishing, setPublishing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [previewConfig, setPreviewConfig] = useState<any>(null);
  const [viewport, setViewport] = useState<ViewportKey>('mobile-390');
  const [uploadingSlot, setUploadingSlot] = useState<string | null>(null);
  const [assigningSlot, setAssigningSlot] = useState<string | null>(null);
  const previewRef = useRef<HTMLDivElement>(null);

  // ─── Fetch initial data ──────────────────────────────────────────────────
  const fetchStudio = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/weddings/${weddingId}/invitation-studio`, {
        headers: { 'X-Wedding-Slug': weddingSlug },
        credentials: 'include',
      });
      if (res.status === 401) { onSessionExpired?.(); return; }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setTemplates(data.templates || []);
      setMedia(data.media || []);
      setSlotDecls(data.mediaSlotDeclarations || []);
      setCurrentTemplateId(data.wedding?.invitationTemplateId ?? null);
      setSelectedTemplateId(data.wedding?.invitationTemplateId ?? data.currentTemplate?.id ?? null);
      setSlotAssignments(data.wedding?.mediaSlotsJson ?? {});
    } catch (err) {
      toast.error('Erreur lors du chargement du studio d\'invitation');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [weddingId, weddingSlug, onSessionExpired]);

  useEffect(() => { fetchStudio(); }, [fetchStudio]);

  // ─── Save draft ──────────────────────────────────────────────────────────
  const handleSaveDraft = useCallback(async () => {
    setSaving(true);
    try {
      const body: Record<string, unknown> = {};
      if (selectedTemplateId !== currentTemplateId) {
        body.templateId = selectedTemplateId;
      }
      body.mediaSlotsJson = slotAssignments;
      const res = await fetch(`/api/weddings/${weddingId}/invitation-studio`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'X-Wedding-Slug': weddingSlug,
          'X-CSRF-Token': csrfToken,
        },
        credentials: 'include',
        body: JSON.stringify(body),
      });
      if (res.status === 401) { onSessionExpired?.(); return; }
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      const result = await res.json();
      if (selectedTemplateId !== currentTemplateId) {
        setCurrentTemplateId(selectedTemplateId);
      }
      toast.success(result.message || 'Brouillon enregistré');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur lors de l\'enregistrement');
    } finally {
      setSaving(false);
    }
  }, [weddingId, weddingSlug, csrfToken, selectedTemplateId, currentTemplateId, slotAssignments, onSessionExpired]);

  // ─── Publish ─────────────────────────────────────────────────────────────
  const handlePublish = useCallback(async () => {
    // Save draft first, then publish.
    setPublishing(true);
    try {
      // Step 1: save the current draft (template + slots).
      const saveBody: Record<string, unknown> = {
        templateId: selectedTemplateId,
        mediaSlotsJson: slotAssignments,
      };
      const saveRes = await fetch(`/api/weddings/${weddingId}/invitation-studio`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'X-Wedding-Slug': weddingSlug,
          'X-CSRF-Token': csrfToken,
        },
        credentials: 'include',
        body: JSON.stringify(saveBody),
      });
      if (saveRes.status === 401) { onSessionExpired?.(); return; }
      if (!saveRes.ok) {
        const err = await saveRes.json().catch(() => ({}));
        throw new Error(err.error || 'Échec de l\'enregistrement du brouillon');
      }
      if (selectedTemplateId !== currentTemplateId) {
        setCurrentTemplateId(selectedTemplateId);
      }

      // Step 2: publish via the deployment pipeline.
      const pubRes = await fetch(`/api/weddings/${weddingId}/invitation-studio`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Wedding-Slug': weddingSlug,
          'X-CSRF-Token': csrfToken,
        },
        credentials: 'include',
      });
      if (pubRes.status === 401) { onSessionExpired?.(); return; }
      if (!pubRes.ok) {
        const err = await pubRes.json().catch(() => ({}));
        throw new Error(err.error || 'Échec de la publication');
      }
      const result = await pubRes.json();
      toast.success(result.message || 'Invitation publiée avec succès');
      // Refresh to pick up the new snapshot.
      await fetchStudio();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur lors de la publication');
    } finally {
      setPublishing(false);
    }
  }, [weddingId, weddingSlug, csrfToken, selectedTemplateId, currentTemplateId, slotAssignments, onSessionExpired, fetchStudio]);

  // ─── Live preview ────────────────────────────────────────────────────────
  const handlePreview = useCallback(async () => {
    setPreviewing(true);
    try {
      const res = await fetch(`/api/weddings/${weddingId}/invitation-studio/preview`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Wedding-Slug': weddingSlug,
          'X-CSRF-Token': csrfToken,
        },
        credentials: 'include',
        body: JSON.stringify({
          templateId: selectedTemplateId,
          mediaSlotsJson: slotAssignments,
        }),
      });
      if (res.status === 401) { onSessionExpired?.(); return; }
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setPreviewConfig(data.experience);
      toast.success(
        `Aperçu: ${data.templateName} · ${data.resolvedMediaSlotsCount} photos · ${data.sectionsCount} sections`,
      );
      // Scroll to preview.
      setTimeout(() => {
        previewRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur lors de l\'aperçu');
    } finally {
      setPreviewing(false);
    }
  }, [weddingId, weddingSlug, csrfToken, selectedTemplateId, slotAssignments, onSessionExpired]);

  // ─── Photo upload ────────────────────────────────────────────────────────
  const handleUpload = useCallback(async (file: File, semanticRole?: string, slotId?: string) => {
    setUploadingSlot(slotId || semanticRole || 'general');
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('title', file.name.replace(/\.[^.]+$/, ''));
      formData.append('type', 'PHOTO');
      formData.append('category', 'COUPLE_STORY');
      if (semanticRole) formData.append('semanticRole', semanticRole);
      if (slotId) formData.append('slotId', slotId);

      const res = await fetch('/api/media', {
        method: 'POST',
        headers: {
          'X-Wedding-Slug': weddingSlug,
          'X-CSRF-Token': csrfToken,
        },
        credentials: 'include',
        body: formData,
      });
      if (res.status === 401) { onSessionExpired?.(); return; }
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      // Add to media list.
      setMedia((prev) => [data.media, ...prev]);
      // If a slot was specified, auto-assign.
      if (slotId && data.media?.id) {
        setSlotAssignments((prev) => ({
          ...prev,
          [semanticRole || slotId]: { mediaId: data.media.id, focalPoint: { x: 0.5, y: 0.4 } },
        }));
      }
      toast.success(`Photo importée${semanticRole ? ` → ${semanticRole}` : ''}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur lors de l\'import');
    } finally {
      setUploadingSlot(null);
    }
  }, [weddingSlug, csrfToken, onSessionExpired]);

  // ─── Assign media to slot ────────────────────────────────────────────────
  const handleAssign = useCallback((slotKey: string, mediaId: string) => {
    setSlotAssignments((prev) => ({
      ...prev,
      [slotKey]: { mediaId, focalPoint: prev[slotKey]?.focalPoint ?? { x: 0.5, y: 0.4 } },
    }));
    setAssigningSlot(null);
    toast.success(`Photo assignée → ${slotKey}`);
  }, []);

  const handleUnassign = useCallback((slotKey: string) => {
    setSlotAssignments((prev) => {
      const next = { ...prev };
      delete next[slotKey];
      return next;
    });
    toast.success(`Slot ${slotKey} libéré`);
  }, []);

  const handleSetFocalPoint = useCallback((slotKey: string, x: number, y: number) => {
    setSlotAssignments((prev) => ({
      ...prev,
      [slotKey]: { ...prev[slotKey], mediaId: prev[slotKey]?.mediaId, focalPoint: { x, y } },
    }));
  }, []);

  // ─── Render ──────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[...Array(8)].map((_, i) => <Skeleton key={i} className="h-48" />)}
        </div>
      </div>
    );
  }

  const selectedTemplate = templates.find((t) => t.id === selectedTemplateId);
  const hasChanges = selectedTemplateId !== currentTemplateId ||
    JSON.stringify(slotAssignments) !== JSON.stringify({});

  return (
    <div className="space-y-6 p-4 md:p-6 max-w-[1600px] mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-serif flex items-center gap-2">
            <Crown className="w-6 h-6 text-amber-500" />
            Studio d'Invitation Premium
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Choisissez un modèle, importez vos photos, prévisualisez et publiez — sans code.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={handleSaveDraft}
            disabled={saving || !hasChanges}
          >
            {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
            Enregistrer
          </Button>
          <Button
            onClick={handlePublish}
            disabled={publishing}
            className="bg-amber-600 hover:bg-amber-700 text-white"
          >
            {publishing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
            Publier
          </Button>
        </div>
      </div>

      {/* Step 1: Template Selector */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <span className="flex items-center justify-center w-7 h-7 rounded-full bg-amber-100 text-amber-700 text-sm font-bold">1</span>
            Choisir un modèle d'invitation
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {templates.map((tpl) => {
              const isSelected = tpl.id === selectedTemplateId;
              const isCurrent = tpl.id === currentTemplateId;
              return (
                <button
                  key={tpl.id}
                  onClick={() => {
                    setSelectedTemplateId(tpl.id);
                    setSlotDecls(tpl.mediaSlots || []);
                    // Clear slot assignments that don't match the new template's slots.
                    setSlotAssignments((prev) => {
                      const newDecls = tpl.mediaSlots || [];
                      const validRoles = new Set(newDecls.map((s: MediaSlotDecl) => s.semanticRole));
                      const filtered: Record<string, SlotAssignment> = {};
                      for (const [k, v] of Object.entries(prev)) {
                        if (validRoles.has(k)) filtered[k] = v;
                      }
                      return filtered;
                    });
                    setPreviewConfig(null); // invalidate preview
                  }}
                  className={`relative text-left rounded-lg border-2 p-3 transition-all hover:shadow-md ${
                    isSelected ? 'border-amber-500 bg-amber-50/50 shadow-sm' : 'border-border hover:border-amber-300'
                  }`}
                >
                  {/* Preview swatch */}
                  <div className={`aspect-[3/4] rounded-md mb-2 flex items-center justify-center text-white font-serif text-lg ${
                    tpl.category === 'LUXURY' ? 'bg-gradient-to-br from-amber-700 via-amber-500 to-yellow-600' :
                    tpl.category === 'EDITORIAL' ? 'bg-gradient-to-br from-stone-800 to-stone-600' :
                    tpl.category === 'BOTANICAL' ? 'bg-gradient-to-br from-emerald-700 to-green-500' :
                    tpl.category === 'CINEMATIC' ? 'bg-gradient-to-br from-slate-900 to-slate-700' :
                    'bg-gradient-to-br from-yellow-600 to-amber-400'
                  }`}>
                    {tpl.thumbnailUrl ? (
                      <img src={tpl.thumbnailUrl} alt={tpl.name} className="w-full h-full object-cover rounded-md" />
                    ) : (
                      <span className="text-center px-2 text-xs leading-tight opacity-90">{tpl.name}</span>
                    )}
                  </div>
                  {/* Name + badges */}
                  <div className="flex items-start justify-between gap-1">
                    <span className="font-medium text-sm leading-tight line-clamp-2">{tpl.name}</span>
                    {isSelected && <Check className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />}
                  </div>
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded border ${CATEGORY_COLORS[tpl.category] || 'bg-gray-100'}`}>
                      {tpl.category}
                    </span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded ${TIER_COLORS[tpl.tier] || 'bg-gray-100'}`}>
                      {tpl.tier}
                    </span>
                    {tpl.isDefault && <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">★</span>}
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-1">
                    {tpl.sectionsCount} sections · {tpl.mediaSlotsCount} photos
                  </div>
                  {isCurrent && !isSelected && (
                    <div className="absolute top-1.5 right-1.5">
                      <Badge variant="outline" className="text-[9px] bg-white/90">Actuel</Badge>
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Step 2: Couple Photo Studio */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <span className="flex items-center justify-center w-7 h-7 rounded-full bg-amber-100 text-amber-700 text-sm font-bold">2</span>
            Photos du couple
          </CardTitle>
        </CardHeader>
        <CardContent>
          {/* Slot grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {slotDecls.length === 0 && (
              <div className="col-span-full text-center py-8 text-muted-foreground text-sm">
                Aucun slot photo déclaré pour ce template. Sélectionnez un template à l'étape 1.
              </div>
            )}
            {slotDecls.map((slot) => {
              const assignment = slotAssignments[slot.semanticRole];
              const assignedMedia = assignment?.mediaId
                ? media.find((m) => m.id === assignment.mediaId)
                : null;
              const isUploading = uploadingSlot === slot.slotId || uploadingSlot === slot.semanticRole;
              const isAssigning = assigningSlot === slot.semanticRole;
              return (
                <div key={slot.slotId} className={`rounded-lg border-2 p-3 ${slot.required ? 'border-amber-300' : 'border-border'}`}>
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <div className="font-medium text-sm">{slot.semanticRole.replace(/_/g, ' ')}</div>
                      <div className="text-[10px] text-muted-foreground">
                        {slot.slotId} · {slot.aspectRatio || 'auto'}
                        {slot.required && <span className="text-amber-600 ml-1">*requis</span>}
                      </div>
                    </div>
                    {assignedMedia && (
                      <button
                        onClick={() => handleUnassign(slot.semanticRole)}
                        className="text-muted-foreground hover:text-red-500 transition-colors"
                        title="Retirer"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                  {/* Photo area */}
                  <div
                    className={`relative aspect-video rounded-md overflow-hidden bg-muted/50 flex items-center justify-center ${
                      slot.aspectRatio === '4:5' ? 'aspect-[4/5]' : slot.aspectRatio === '1:1' ? 'aspect-square' : 'aspect-video'
                    }`}
                  >
                    {assignedMedia ? (
                      <>
                        <img
                          src={assignedMedia.url}
                          alt={assignedMedia.title}
                          className="w-full h-full object-cover"
                          style={assignment?.focalPoint ? {
                            objectPosition: `${assignment.focalPoint.x * 100}% ${assignment.focalPoint.y * 100}%`,
                          } : undefined}
                        />
                        {/* Focal point overlay */}
                        {assignment?.focalPoint && (
                          <div
                            className="absolute w-3 h-3 border-2 border-white rounded-full pointer-events-none shadow-lg"
                            style={{
                              left: `${assignment.focalPoint.x * 100}%`,
                              top: `${assignment.focalPoint.y * 100}%`,
                              transform: 'translate(-50%, -50%)',
                            }}
                          />
                        )}
                      </>
                    ) : (
                      <ImageIcon className="w-8 h-8 text-muted-foreground/40" />
                    )}
                    {isUploading && (
                      <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                        <Loader2 className="w-6 h-6 text-white animate-spin" />
                      </div>
                    )}
                  </div>
                  {/* Controls */}
                  <div className="flex gap-1.5 mt-2">
                    <label className="flex-1 cursor-pointer">
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        className="sr-only"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) handleUpload(f, slot.semanticRole, slot.slotId);
                          e.target.value = '';
                        }}
                      />
                      <span className="inline-flex items-center justify-center w-full text-xs px-2 py-1.5 rounded border border-border hover:bg-muted/50 transition-colors cursor-pointer">
                        <Upload className="w-3 h-3 mr-1" />
                        {assignedMedia ? 'Remplacer' : 'Importer'}
                      </span>
                    </label>
                    <button
                      onClick={() => setAssigningSlot(isAssigning ? null : slot.semanticRole)}
                      className="text-xs px-2 py-1.5 rounded border border-border hover:bg-muted/50 transition-colors"
                    >
                      {isAssigning ? 'Annuler' : 'Choisir'}
                    </button>
                  </div>
                  {/* Media picker */}
                  {isAssigning && (
                    <div className="mt-2 p-2 rounded border border-border bg-muted/30 max-h-32 overflow-y-auto">
                      <div className="grid grid-cols-3 gap-1.5">
                        {media.length === 0 && (
                          <div className="col-span-full text-center text-[10px] text-muted-foreground py-2">
                            Aucune photo importée. Utilisez « Importer ».
                          </div>
                        )}
                        {media.map((m) => (
                          <button
                            key={m.id}
                            onClick={() => handleAssign(slot.semanticRole, m.id)}
                            className="aspect-square rounded overflow-hidden border border-border hover:border-amber-400 transition-colors"
                          >
                            <img src={m.url} alt={m.title} className="w-full h-full object-cover" />
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {/* Focal point sliders */}
                  {assignedMedia && assignment?.focalPoint && (
                    <div className="mt-2 space-y-1">
                      <div className="flex items-center gap-1.5">
                        <Label className="text-[9px] w-6 text-muted-foreground">X</Label>
                        <input
                          type="range"
                          min="0" max="1" step="0.05"
                          value={assignment.focalPoint.x}
                          onChange={(e) => handleSetFocalPoint(slot.semanticRole, parseFloat(e.target.value), assignment.focalPoint!.y)}
                          className="flex-1 h-1 accent-amber-500"
                        />
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Label className="text-[9px] w-6 text-muted-foreground">Y</Label>
                        <input
                          type="range"
                          min="0" max="1" step="0.05"
                          value={assignment.focalPoint.y}
                          onChange={(e) => handleSetFocalPoint(slot.semanticRole, assignment.focalPoint!.x, parseFloat(e.target.value))}
                          className="flex-1 h-1 accent-amber-500"
                        />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {/* Unassigned media */}
          {media.length > 0 && (
            <div className="mt-4 pt-4 border-t">
              <div className="text-xs text-muted-foreground mb-2">Photos importées (non assignées)</div>
              <div className="flex flex-wrap gap-2">
                {media.map((m) => (
                  <div key={m.id} className="relative w-16 h-16 rounded overflow-hidden border border-border">
                    <img src={m.url} alt={m.title} className="w-full h-full object-cover" />
                    {m.semanticRole && (
                      <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[8px] px-1 py-0.5 truncate">
                        {m.semanticRole}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Step 3: Live Preview */}
      <Card ref={previewRef as any}>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="flex items-center gap-2 text-lg">
              <span className="flex items-center justify-center w-7 h-7 rounded-full bg-amber-100 text-amber-700 text-sm font-bold">3</span>
              Aperçu en direct
            </CardTitle>
            <div className="flex items-center gap-2">
              {/* Viewport toggle */}
              <div className="flex gap-1 p-0.5 rounded-lg bg-muted/50">
                {(Object.entries(VIEWPORTS) as [ViewportKey, typeof VIEWPORTS[ViewportKey]][]).map(([key, vp]) => {
                  const Icon = vp.icon;
                  return (
                    <button
                      key={key}
                      onClick={() => setViewport(key)}
                      className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors ${
                        viewport === key ? 'bg-background shadow-sm font-medium' : 'text-muted-foreground hover:text-foreground'
                      }`}
                      title={vp.label}
                    >
                      <Icon className="w-3 h-3" />
                      <span className="hidden sm:inline">{vp.label}</span>
                    </button>
                  );
                })}
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={handlePreview}
                disabled={previewing}
              >
                {previewing ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Eye className="w-4 h-4 mr-1.5" />}
                Générer l'aperçu
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {!previewConfig ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <Sparkles className="w-10 h-10 mb-3 opacity-40" />
              <p className="text-sm">Cliquez sur « Générer l'aperçu » pour voir le rendu premium</p>
              <p className="text-xs mt-1 opacity-70">
                {selectedTemplate?.name || 'Aucun template sélectionné'}
              </p>
            </div>
          ) : (
            <div className="flex justify-center bg-muted/30 rounded-lg p-4 overflow-x-auto">
              <div
                className="bg-white shadow-xl rounded-lg overflow-hidden transition-all"
                style={{ width: `${VIEWPORTS[viewport].width}px`, maxWidth: '100%' }}
              >
                <div className="overflow-y-auto" style={{ maxHeight: '80vh' }}>
                  <IdentityInvitation config={previewConfig} />
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Status bar */}
      <div className="flex items-center justify-between text-xs text-muted-foreground px-2 pb-4">
        <div className="flex items-center gap-3">
          <span>Template: <strong className="text-foreground">{selectedTemplate?.name || '—'}</strong></span>
          <span>·</span>
          <span>Photos assignées: <strong className="text-foreground">{Object.keys(slotAssignments).length}</strong></span>
          <span>·</span>
          <span>Viewport: <strong className="text-foreground">{VIEWPORTS[viewport].label}</strong></span>
        </div>
        {hasChanges && <span className="text-amber-600">● Modifications non enregistrées</span>}
      </div>
    </div>
  );
}
