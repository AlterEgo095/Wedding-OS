'use client';

// ══════════════════════════════════════════════════════════════════════════════
// DietaryPreferences — Guest self-service dietary form (P4.2)
// ══════════════════════════════════════════════════════════════════════════════
//
// Rendered inside the guest portal (GuestPersonalSpace or similar). Lets the
// authenticated guest view + edit their dietary preferences (allergies,
// restrictions, etc.).
//
// API:
//   GET  /api/guest/me/dietary           → { dietary }
//   PUT  /api/guest/me/dietary           → { dietary }
//
// UX:
//   - Loads current value on mount.
//   - Textarea (max 500 chars) with live counter.
//   - Save button (disabled when no change, shows spinner while saving).
//   - Clear button to wipe the field.
//   - Toast on success: "Préférences alimentaires enregistrées."
//   - Toast on error: French message from API response.
//
// No props — the component is self-contained and uses fetch with credentials.
// CSRF: the PUT goes through the guest_session cookie (sameSite=strict), so
// CSRF is already mitigated at the cookie level. No X-CSRF-Token header is
// required (CSRF protection on POSTs is enforced on /api/platform/* admin
// routes, not guest routes).
// ══════════════════════════════════════════════════════════════════════════════

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { Loader2, Save, Trash2, Utensils } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';

const MAX_LENGTH = 500;

export function DietaryPreferences() {
  const [saved, setSaved] = useState<string | null>(null);
  const [draft, setDraft] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/guest/me/dietary', {
        credentials: 'include',
      });
      if (res.status === 401) {
        // Not authenticated — leave the field empty + disable save.
        setSaved(null);
        setDraft('');
        return;
      }
      if (!res.ok) throw new Error('fetch failed');
      const json = await res.json();
      const value = (json.dietary as string | null) ?? '';
      setSaved(value);
      setDraft(value);
    } catch {
      toast.error('Impossible de charger vos préférences alimentaires');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const dirty = draft !== (saved ?? '');

  const save = async () => {
    if (!dirty) return;
    const trimmed = draft.trim();
    if (trimmed.length > MAX_LENGTH) {
      toast.error(`Maximum ${MAX_LENGTH} caractères`);
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/guest/me/dietary', {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dietary: trimmed.length > 0 ? trimmed : null }),
      });
      if (res.status === 401) {
        toast.error('Session expirée, veuillez vous reconnecter');
        return;
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || 'Erreur serveur');
      }
      const json = await res.json();
      const value = (json.dietary as string | null) ?? '';
      setSaved(value);
      setDraft(value);
      toast.success('Préférences alimentaires enregistrées.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setSaving(false);
    }
  };

  const clear = () => {
    setDraft('');
  };

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 md:p-5 space-y-3">
      <div className="flex items-center gap-2">
        <Utensils className="w-4 h-4 text-amber-400" />
        <h3 className="text-sm font-medium text-white">
          Préférences alimentaires
        </h3>
      </div>
      <p className="text-xs text-zinc-400">
        Indiquez vos allergies, restrictions ou préférences (végétarien, sans
        gluten, halal, etc.). Ces informations seront transmises au traiteur
        par les organisateurs.
      </p>

      {loading ? (
        <Skeleton className="h-24 rounded-lg" />
      ) : (
        <>
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={MAX_LENGTH}
            rows={4}
            placeholder="Ex. Allergie aux fruits à coque ; végétarien ; sans gluten…"
            className="bg-white/5 border-white/10 resize-y min-h-[100px]"
            aria-label="Préférences alimentaires"
          />
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] text-zinc-500">
              {draft.length}/{MAX_LENGTH}
            </span>
            <div className="flex items-center gap-2">
              {draft && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clear}
                  disabled={saving}
                  className="text-zinc-400 hover:text-red-400 hover:bg-red-500/10"
                >
                  <Trash2 className="w-3.5 h-3.5 mr-1" />
                  Effacer
                </Button>
              )}
              <Button
                size="sm"
                onClick={save}
                disabled={!dirty || saving}
                className="bg-amber-500/20 text-amber-300 border border-amber-500/30 hover:bg-amber-500/30 disabled:opacity-40"
              >
                {saving ? (
                  <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
                ) : (
                  <Save className="w-3.5 h-3.5 mr-1" />
                )}
                Enregistrer
              </Button>
            </div>
          </div>
          {saved && !dirty && (
            <p className="text-[10px] text-emerald-400/70 italic">
              ✓ Enregistré le {new Date().toLocaleDateString('fr-FR')}
            </p>
          )}
        </>
      )}
    </div>
  );
}
