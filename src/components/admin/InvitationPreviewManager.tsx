'use client';

// ══════════════════════════════════════════════════════════════════════════════
// InvitationPreviewManager — Phase 3 admin preview component (GAP-5)
// ══════════════════════════════════════════════════════════════════════════════
// Lets the organizer (or Platform Admin) pick any guest from their wedding
// and see exactly what that guest will see when they open their invitation
// link — without impersonating the guest or creating a guest_session cookie.
//
// Architecture:
//   1. Fetches the wedding's guest list via /api/guests (admin-scoped via
//      the X-Wedding-Slug fetch interceptor).
//   2. Searchable guest picker (Select dropdown + text filter).
//   3. On guest select, fetches /api/admin/preview-invitation?guestId=...
//      which returns { guest, settings, theme, preview: true }.
//   4. Renders <GuestPersonalSpace guest={...} settings={...} theme={...}
//      previewMode onLogout={() => {}} /> inline inside a bordered container.
//   5. The previewMode flag suppresses session-mutating side effects in
//      GuestPersonalSpace (no QR fetch, no RSVP POST, no envelope animation).
//
// Layout: a 2-pane layout on desktop (guest list left, preview right) and a
// stacked layout on mobile (picker on top, preview below). The preview pane
// is wrapped in a scrollable container with a max-height so long invitation
// cards don't push the page footer off-screen.

import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, Loader2, AlertCircle, Eye, User, Crown,
  Sparkles, RotateCcw, ChevronRight, Users,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import GuestPersonalSpace from '@/components/GuestPersonalSpace';
import type { ThemeData } from '@/lib/use-theme';

interface GuestListItem {
  id: string;
  firstName: string;
  lastName: string;
  displayName: string | null;
  invitationType: string;
  category: string;
  status: string;
  seats: number;
  table: { id: string; name: string; number: number } | null;
}

interface GuestPayload {
  id: string;
  firstName: string;
  lastName: string;
  displayName?: string | null;
  invitationType?: string | null;
  invitationCode: string;
  seats: number;
  category: string;
  status: string;
  personalMessage: string | null;
  checkedIn: boolean;
  table: { id: string; name: string; number: number } | null;
  invitationViewed: boolean;
  invitationViewCount: number;
  lastAccessAt: string | null;
  encryptedLink?: string;
}

interface PreviewResponse {
  guest: GuestPayload;
  settings: Record<string, string>;
  theme: ThemeData | null;
  preview: true;
}

interface InvitationPreviewManagerProps {
  /** Bearer token (always '' under cookie auth, kept for API compat). */
  token: string;
  /** Called when the admin's session has expired. */
  onSessionExpired: () => void;
}

const CATEGORY_LABELS: Record<string, string> = {
  VIP: 'VIP',
  FAMILLE: 'Famille',
  AMIS: 'Amis',
  COUPLE: 'Couple',
};

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  PENDING: { label: 'En attente', color: 'text-amber-400' },
  CONFIRMED: { label: 'Confirmé', color: 'text-emerald-400' },
  DECLINED: { label: 'Décliné', color: 'text-rose-400' },
};

export function InvitationPreviewManager({ token, onSessionExpired }: InvitationPreviewManagerProps) {
  const [guests, setGuests] = useState<GuestListItem[]>([]);
  const [loadingGuests, setLoadingGuests] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedGuestId, setSelectedGuestId] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  // Load the guest list — fetch up to 100 guests for the picker. We don't
  // paginate because admin previews typically pick from a small set; if the
  // wedding has more, the search field filters by name server-side.
  const fetchGuests = useCallback(async () => {
    setLoadingGuests(true);
    try {
      const params = new URLSearchParams({
        page: '1',
        limit: '100',
      });
      if (search.trim()) params.set('search', search.trim());
      const res = await fetch(`/api/guests?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401) { onSessionExpired(); return; }
      const json = await res.json();
      if (res.ok) {
        setGuests(json.guests || []);
      } else {
        toast.error(json.error || 'Erreur de chargement des invités');
      }
    } catch {
      toast.error('Erreur réseau');
    } finally {
      setLoadingGuests(false);
    }
  }, [token, onSessionExpired, search]);

  // Debounce the search to avoid hammering /api/guests on every keystroke.
  useEffect(() => {
    const t = setTimeout(() => { fetchGuests(); }, 250);
    return () => clearTimeout(t);
  }, [search, fetchGuests]);

  // Fetch the preview payload when a guest is selected.
  useEffect(() => {
    if (!selectedGuestId) {
      setPreview(null);
      setPreviewError(null);
      return;
    }
    let cancelled = false;
    setPreviewLoading(true);
    setPreviewError(null);
    (async () => {
      try {
        const res = await fetch(
          `/api/admin/preview-invitation?guestId=${encodeURIComponent(selectedGuestId)}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (res.status === 401) { if (!cancelled) onSessionExpired(); return; }
        const json = await res.json();
        if (cancelled) return;
        if (res.ok) {
          setPreview(json as PreviewResponse);
        } else {
          setPreviewError(json.error || 'Erreur lors du chargement de l\'aperçu');
        }
      } catch {
        if (!cancelled) setPreviewError('Erreur réseau');
      } finally {
        if (!cancelled) setPreviewLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [selectedGuestId, token, onSessionExpired]);

  const selectedGuest = useMemo(
    () => guests.find((g) => g.id === selectedGuestId) || null,
    [guests, selectedGuestId]
  );

  const handleReset = () => {
    setSelectedGuestId(null);
    setPreview(null);
    setPreviewError(null);
  };

  return (
    <div className="space-y-4 p-4 sm:p-6">
      {/* ─── Header ─────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-amber-500/20 to-amber-700/20 flex items-center justify-center shrink-0">
            <Eye className="w-5 h-5 text-amber-400" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              Aperçu de l'invitation
              <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/20">
                Mode aperçu
              </span>
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              Visualisez exactement ce que verra un invité lorsqu'il ouvre son lien
              d'invitation — sans créer de session invité ni déclencher de journal
              d'accès invité. L'aperçu utilise la Collection actuellement déployée
              sur ce mariage.
            </p>
          </div>
        </div>
      </div>

      {/* ─── 2-pane layout: picker | preview ───────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4">
        {/* LEFT: Guest picker */}
        <div className="rounded-xl border border-white/10 bg-white/[0.02] overflow-hidden flex flex-col max-h-[calc(100vh-220px)]">
          <div className="p-3 border-b border-white/10 space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <User className="w-3.5 h-3.5" />
              Choisir un invité
            </label>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Rechercher par nom..."
                className="pl-8 h-9 bg-white/5 border-white/10 text-white placeholder:text-muted-foreground"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar">
            {loadingGuests ? (
              <div className="flex items-center justify-center py-8 text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                Chargement...
              </div>
            ) : guests.length === 0 ? (
              <div className="text-center py-8 text-sm text-muted-foreground px-4">
                {search ? 'Aucun invité ne correspond à votre recherche.' : 'Aucun invité dans ce mariage.'}
              </div>
            ) : (
              <ul className="divide-y divide-white/5">
                {guests.map((g) => {
                  const isActive = g.id === selectedGuestId;
                  const label =
                    g.displayName ||
                    `${g.firstName} ${g.lastName}`.trim() ||
                    '(sans nom)';
                  const sub = [
                    CATEGORY_LABELS[g.category?.toUpperCase()] || g.category,
                    g.table?.name ? `Table ${g.table.name}` : null,
                    `${g.seats} place${g.seats > 1 ? 's' : ''}`,
                  ].filter(Boolean).join(' · ');
                  const statusInfo = STATUS_LABELS[g.status] || STATUS_LABELS.PENDING;
                  return (
                    <li key={g.id}>
                      <button
                        onClick={() => setSelectedGuestId(g.id)}
                        className={`w-full text-left px-3 py-2.5 transition-colors flex items-center gap-2 ${
                          isActive
                            ? 'bg-amber-500/15 text-amber-200'
                            : 'hover:bg-white/5 text-white'
                        }`}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate flex items-center gap-1.5">
                            {g.invitationType === 'couple' && <Crown className="w-3 h-3 text-amber-400 shrink-0" />}
                            {label}
                          </div>
                          <div className="text-[11px] text-muted-foreground truncate">{sub}</div>
                        </div>
                        <div className="flex flex-col items-end gap-1 shrink-0">
                          <span className={`text-[10px] uppercase tracking-wider ${statusInfo.color}`}>
                            {statusInfo.label}
                          </span>
                          {isActive && <ChevronRight className="w-3 h-3 text-amber-300" />}
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="p-2 border-t border-white/10 text-[10px] text-muted-foreground text-center">
            {guests.length} invité{guests.length > 1 ? 's' : ''} affiché{guests.length > 1 ? 's' : ''}
          </div>
        </div>

        {/* RIGHT: Preview pane */}
        <div className="rounded-xl border border-white/10 bg-white/[0.02] overflow-hidden flex flex-col min-h-[400px]">
          {!selectedGuestId && !previewLoading && (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-8 text-muted-foreground">
              <div className="w-14 h-14 rounded-full bg-white/5 flex items-center justify-center mb-3">
                <Eye className="w-7 h-7 opacity-50" />
              </div>
              <p className="text-sm">Sélectionnez un invité à gauche pour afficher l'aperçu de son invitation.</p>
              <p className="text-xs mt-2 opacity-70">L'aperçu reflète la Collection déployée sur ce mariage.</p>
            </div>
          )}

          {selectedGuestId && previewLoading && (
            <div className="flex-1 flex items-center justify-center text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin mr-2" />
              Chargement de l'aperçu...
            </div>
          )}

          {selectedGuestId && !previewLoading && previewError && (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
              <AlertCircle className="w-10 h-10 text-rose-400 mb-3" />
              <p className="text-sm text-rose-300">{previewError}</p>
              <Button variant="outline" size="sm" onClick={handleReset} className="mt-4">
                <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
                Réinitialiser
              </Button>
            </div>
          )}

          {selectedGuestId && !previewLoading && preview && (
            <>
              {/* Preview toolbar */}
              <div className="px-3 py-2 border-b border-white/10 flex items-center gap-2 bg-white/[0.02]">
                <Sparkles className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <div className="flex-1 min-w-0 text-xs">
                  <span className="text-muted-foreground">Aperçu pour</span>{' '}
                  <strong className="text-white">
                    {preview.guest.displayName || `${preview.guest.firstName} ${preview.guest.lastName}`}
                  </strong>
                  {preview.theme && (
                    <>
                      {' · '}
                      <span className="text-muted-foreground">Collection active :</span>{' '}
                      <span
                        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium"
                        style={{
                          background: `color-mix(in srgb, ${preview.theme.primaryColor} 15%, transparent)`,
                          color: preview.theme.primaryColor,
                          border: `1px solid color-mix(in srgb, ${preview.theme.primaryColor} 30%, transparent)`,
                        }}
                      >
                        <span
                          className="inline-block w-2 h-2 rounded-full"
                          style={{ background: preview.theme.primaryColor }}
                        />
                        {preview.theme.primaryColor.toUpperCase()}
                      </span>
                    </>
                  )}
                </div>
                <Button variant="ghost" size="sm" onClick={handleReset} className="h-7 text-xs">
                  <RotateCcw className="w-3 h-3 mr-1" />
                  Changer
                </Button>
              </div>

              {/* Preview surface — note the white background wrapper so the
                  invitation card (which expects a light background) renders
                  correctly inside the dark admin shell. */}
              <div className="flex-1 overflow-y-auto custom-scrollbar bg-white">
                <div className="max-w-2xl mx-auto">
                  <GuestPersonalSpace
                    guest={preview.guest}
                    settings={preview.settings}
                    theme={preview.theme}
                    previewMode
                    onLogout={() => {
                      toast.info('Déconnexion indisponible en mode aperçu');
                    }}
                  />
                </div>
              </div>

              {/* Preview footer */}
              <div className="px-3 py-2 border-t border-white/10 bg-amber-500/5 text-[11px] text-amber-200/80 flex items-center gap-1.5">
                <AlertCircle className="w-3 h-3 shrink-0" />
                <span>
                  Aperçu administrateur — aucune session invité n'est créée. Le
                  bouton « Télécharger » n'est pas disponible en mode aperçu.
                </span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* ─── Helper note ──────────────────────────────────────────── */}
      <div className="rounded-lg border border-white/5 bg-white/[0.01] p-3 text-xs text-muted-foreground flex items-start gap-2">
        <Users className="w-3.5 h-3.5 mt-0.5 shrink-0 opacity-60" />
        <div>
          <strong className="text-foreground">Astuce :</strong> l'aperçu utilise
          la Collection actuellement déployée sur ce mariage. Pour changer
          l'apparence de l'invitation, ouvrez l'onglet <em>Collections</em>,
          déployez une autre Collection, puis revenez ici — l'aperçu reflétera
          automatiquement le nouveau thème.
        </div>
      </div>
    </div>
  );
}

export default InvitationPreviewManager;
