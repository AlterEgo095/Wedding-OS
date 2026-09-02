'use client';

// ══════════════════════════════════════════════════════════════════════════════
// /w/[slug]/setup — P2-UX (Sprint Premium) : wizard de configuration mariage
// ══════════════════════════════════════════════════════════════════════════════
//
// The operator journey, densified (PX-2). Previously: create wedding (single
// form) → land back on the org dashboard with an EMPTY admin. Now the creation
// flow redirects here and walks the organizer through 5 guided steps, each
// hitting the EXISTING production APIs (zero new backend surface, zero new
// schema surface):
//
//   1. Profil      → PUT  /api/settings      (site_title, wedding_date, time, venue)
//   2. Histoire    → POST /api/couple-story (chapters, repeatable)
//   3. Chronologie → POST /api/timeline     (moments, repeatable)
//   4. Invités     → POST /api/guests       (bulk paste "Prénom Nom, email")
//   5. Récap       → GET  /api/admin/setup-progress + mark setup_done
//
// Conventions mirrored from the admin shell (which is NOT mounted here):
//   - Auth: GET /api/me on mount → 401 redirects to /w/{slug}/admin/login.
//   - CSRF double-submit: X-CSRF-Token read from the csrf_token cookie.
//   - Tenancy: X-Wedding-Slug attached explicitly to every /api/* call.
//   - Every step is skippable ("Plus tard") — the SetupProgress banner on the
//     dashboard keeps showing what is left, so skipping never loses the user.

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CalendarDays, BookOpen, Clock, UserPlus, PartyPopper, ArrowLeft, ArrowRight,
  Loader2, Plus, Trash2, ExternalLink, QrCode, Crown, CheckCircle2, Sparkles,
} from 'lucide-react';
import { toast } from 'sonner';

// ─── Helpers (mirror the admin shell conventions) ────────────────────────────

function getCsrfToken(): string {
  if (typeof document === 'undefined') return '';
  const match = document.cookie.split('; ').find((row) => row.startsWith('csrf_token='));
  return match ? decodeURIComponent(match.split('=')[1] || '') : '';
}

function apiHeaders(weddingSlug: string): HeadersInit {
  return {
    'Content-Type': 'application/json',
    'X-Wedding-Slug': weddingSlug,
    'X-CSRF-Token': getCsrfToken(),
  };
}

// ─── Step model ──────────────────────────────────────────────────────────────

const STEPS = [
  { id: 1, label: 'Profil', icon: CalendarDays },
  { id: 2, label: 'Histoire', icon: BookOpen },
  { id: 3, label: 'Chronologie', icon: Clock },
  { id: 4, label: 'Invités', icon: UserPlus },
  { id: 5, label: 'Récap', icon: PartyPopper },
] as const;

interface StoryRow { title: string; description: string; date: string }
interface TimelineRow { time: string; activity: string; location: string }
interface GuestLine { firstName: string; lastName: string; email: string; error?: string }

const inputCls =
  'w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-gold/50 focus:ring-1 focus:ring-gold/30 transition-colors';
const labelCls = 'block text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1.5';
const btnGold =
  'inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold text-[#1a1209] bg-gradient-gold hover:opacity-90 transition-opacity shadow-lg shadow-gold/10 disabled:opacity-40 disabled:pointer-events-none';
const btnGhost =
  'inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors';

export default function SetupWizardPage() {
  const { slug } = useParams<{ slug: string }>() as { slug: string };
  const router = useRouter();

  const [ready, setReady] = useState(false);
  const [authed, setAuthed] = useState(false);
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);

  // Step 1 — Profil
  const [siteTitle, setSiteTitle] = useState('');
  const [weddingDate, setWeddingDate] = useState('');
  const [weddingTime, setWeddingTime] = useState('');
  const [venueName, setVenueName] = useState('');
  const [venueCity, setVenueCity] = useState('');

  // Step 2 — Histoire
  const [stories, setStories] = useState<StoryRow[]>([]);
  const [storyDraft, setStoryDraft] = useState<StoryRow>({ title: '', description: '', date: '' });

  // Step 3 — Chronologie
  const [events, setEvents] = useState<TimelineRow[]>([]);
  const [eventDraft, setEventDraft] = useState<TimelineRow>({ time: '', activity: '', location: '' });

  // Step 4 — Invités
  const [guestsRaw, setGuestsRaw] = useState('');
  const [guestsCreated, setGuestsCreated] = useState(0);

  // Step 5 — Récap
  const [percent, setPercent] = useState<number | null>(null);

  const parsedGuests: GuestLine[] = useMemo(() => {
    return guestsRaw
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [names, email] = line.split(',').map((p) => (p || '').trim());
        const nameParts = (names || '').split(/\s+/).filter(Boolean);
        if (nameParts.length === 0) {
          return { firstName: '', lastName: '?', email: email || '', error: 'Ligne vide' };
        }
        const firstName = nameParts[0];
        const lastName = nameParts.slice(1).join(' ') || '—';
        if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          return { firstName, lastName, email, error: 'Email invalide' };
        }
        return { firstName, lastName, email: email || '', error: undefined };
      });
  }, [guestsRaw]);

  // ─── Loaders ───────────────────────────────────────────────────────────────

  const loadAll = useCallback(async () => {
    try {
      const meRes = await fetch('/api/me', { credentials: 'include' });
      if (meRes.status === 401) {
        router.replace(`/w/${slug}/admin/login`);
        return;
      }
      setAuthed(true);

      const headers = apiHeaders(slug);
      const [settingsRes, storyRes, timelineRes, progressRes] = await Promise.all([
        fetch('/api/settings', { headers, credentials: 'include' }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
        fetch('/api/couple-story', { headers, credentials: 'include' }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
        fetch('/api/timeline', { headers, credentials: 'include' }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
        fetch('/api/admin/setup-progress', { headers, credentials: 'include' }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      ]);

      if (settingsRes?.settings) {
        const obj: Record<string, string> = {};
        if (Array.isArray(settingsRes.settings)) {
          for (const s of settingsRes.settings) obj[s.key] = s.value;
        } else {
          Object.assign(obj, settingsRes.settings);
        }
        setSiteTitle(obj.site_title || '');
        setWeddingDate(obj.wedding_date || '');
        setWeddingTime(obj.wedding_time || '');
        setVenueName(obj.venue_name || '');
        setVenueCity(obj.venue_city || '');
      }
      if (storyRes) {
        const list = Array.isArray(storyRes) ? storyRes : storyRes.stories || [];
        setStories(
          list.map((s: { title?: string; description?: string; date?: string | null }) => ({
            title: s.title || '',
            description: s.description || '',
            date: s.date || '',
          }))
        );
      }
      if (timelineRes?.events) {
        setEvents(
          timelineRes.events.map((e: { time?: string; activity?: string; location?: string | null }) => ({
            time: e.time || '',
            activity: e.activity || '',
            location: e.location || '',
          }))
        );
      }
      if (progressRes && typeof progressRes.percent === 'number') {
        setPercent(progressRes.percent);
      }
    } finally {
      setReady(true);
    }
  }, [router, slug]);

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Step savers (each returns true to advance) ────────────────────────────

  const saveProfile = async (): Promise<boolean> => {
    const settings: Record<string, string> = {};
    if (siteTitle.trim()) settings.site_title = siteTitle.trim();
    if (weddingDate) settings.wedding_date = weddingDate;
    if (weddingTime.trim()) settings.wedding_time = weddingTime.trim();
    if (venueName.trim()) settings.venue_name = venueName.trim();
    if (venueCity.trim()) settings.venue_city = venueCity.trim();
    if (Object.keys(settings).length === 0) {
      toast.info('Aucune modification à enregistrer');
      return true;
    }
    const res = await fetch('/api/settings', {
      method: 'PUT',
      headers: apiHeaders(slug),
      credentials: 'include',
      body: JSON.stringify({ settings }),
    });
    if (!res.ok) {
      const json = await res.json().catch(() => null);
      toast.error(json?.error || 'Enregistrement impossible');
      return false;
    }
    return true;
  };

  const addStory = async (): Promise<boolean> => {
    if (!storyDraft.title.trim() || !storyDraft.description.trim()) {
      // Nothing typed — skipping is fine.
      return true;
    }
    const res = await fetch('/api/couple-story', {
      method: 'POST',
      headers: apiHeaders(slug),
      credentials: 'include',
      body: JSON.stringify({
        title: storyDraft.title.trim(),
        description: storyDraft.description.trim(),
        ...(storyDraft.date ? { date: storyDraft.date } : {}),
        order: stories.length,
      }),
    });
    if (!res.ok) {
      const json = await res.json().catch(() => null);
      toast.error(json?.error || 'Ajout du chapitre impossible');
      return false;
    }
    setStories((prev) => [...prev, { ...storyDraft }]);
    setStoryDraft({ title: '', description: '', date: '' });
    toast.success('Chapitre ajouté');
    return true;
  };

  const addTimelineEvent = async (): Promise<boolean> => {
    if (!eventDraft.time.trim() || !eventDraft.activity.trim()) return true;
    const res = await fetch('/api/timeline', {
      method: 'POST',
      headers: apiHeaders(slug),
      credentials: 'include',
      body: JSON.stringify({
        time: eventDraft.time.trim(),
        activity: eventDraft.activity.trim(),
        ...(eventDraft.location.trim() ? { location: eventDraft.location.trim() } : {}),
        order: events.length,
      }),
    });
    if (!res.ok) {
      const json = await res.json().catch(() => null);
      toast.error(json?.error || 'Ajout du moment impossible');
      return false;
    }
    setEvents((prev) => [...prev, { ...eventDraft }]);
    setEventDraft({ time: '', activity: '', location: '' });
    toast.success('Moment ajouté');
    return true;
  };

  const createGuests = async (): Promise<boolean> => {
    const valid = parsedGuests.filter((g) => !g.error && g.firstName);
    if (valid.length === 0) {
      if (guestsRaw.trim()) toast.error('Aucune ligne valide — format attendu : Prénom Nom, email');
      return true;
    }
    setSaving(true);
    let created = 0;
    let quotaHit = false;
    for (const g of valid) {
      const res = await fetch('/api/guests', {
        method: 'POST',
        headers: apiHeaders(slug),
        credentials: 'include',
        body: JSON.stringify({
          firstName: g.firstName,
          lastName: g.lastName,
          ...(g.email ? { email: g.email } : {}),
        }),
      });
      if (res.status === 201 || res.ok) {
        created += 1;
      } else if (res.status === 403) {
        quotaHit = true;
        break;
      }
    }
    setSaving(false);
    setGuestsCreated((n) => n + created);
    if (quotaHit) {
      toast.error("Limite d'invités atteinte pour votre plan — import partiel");
    } else if (created > 0) {
      toast.success(`${created} invité${created > 1 ? 's' : ''} ajouté${created > 1 ? 's' : ''}`);
      setGuestsRaw('');
    }
    return true;
  };

  const finish = async () => {
    try {
      await fetch('/api/settings', {
        method: 'PUT',
        headers: apiHeaders(slug),
        credentials: 'include',
        body: JSON.stringify({ settings: { setup_done: 'true' } }),
      });
    } catch {
      // Non-blocking.
    }
    router.push(`/w/${slug}/admin`);
    router.refresh();
  };

  const next = async () => {
    setSaving(true);
    try {
      let ok = true;
      if (step === 1) ok = await saveProfile();
      if (step === 2) ok = await addStory();
      if (step === 3) ok = await addTimelineEvent();
      if (step === 4) ok = await createGuests();
      if (ok) setStep((s) => Math.min(5, s + 1));
    } finally {
      setSaving(false);
    }
  };

  // ─── Render ────────────────────────────────────────────────────────────────

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0d0a14]">
        <Loader2 className="w-8 h-8 text-gold animate-spin" />
      </div>
    );
  }

  if (!authed) return null;

  const StepIcon = STEPS[step - 1].icon;

  return (
    <div className="min-h-screen bg-[#0d0a14] relative overflow-hidden">
      {/* Ambient gold glows — same language as the admin couple banner */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(212,168,83,0.08)_0%,transparent_55%)] pointer-events-none" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_right,rgba(212,168,83,0.05)_0%,transparent_50%)] pointer-events-none" />

      <div className="relative max-w-2xl mx-auto px-4 py-10 md:py-14">
        {/* Stepper header */}
        <div className="flex items-center justify-center gap-1.5 md:gap-3 mb-8">
          {STEPS.map((s, i) => {
            const done = s.id < step;
            const active = s.id === step;
            return (
              <div key={s.id} className="flex items-center gap-1.5 md:gap-3">
                <button
                  type="button"
                  onClick={() => s.id < step && setStep(s.id)}
                  className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium border transition-colors ${
                    active
                      ? 'border-gold/60 bg-gold/10 text-gold'
                      : done
                        ? 'border-gold/30 text-gold/80 hover:bg-gold/5 cursor-pointer'
                        : 'border-white/10 text-muted-foreground'
                  }`}
                >
                  {done ? <CheckCircle2 className="w-3.5 h-3.5" /> : <s.icon className="w-3.5 h-3.5" />}
                  <span className="hidden sm:inline">{s.label}</span>
                  <span className="sm:hidden">{s.id}</span>
                </button>
                {i < STEPS.length - 1 && <span className="h-px w-3 md:w-6 bg-white/10" />}
              </div>
            );
          })}
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -24 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
            className="glass-card gold-border border-0 rounded-2xl p-6 md:p-8"
          >
            {/* Step heading */}
            <div className="flex items-center gap-3 mb-6">
              <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-gold/20 to-gold-light/10 flex items-center justify-center">
                <StepIcon className="w-5 h-5 text-gold" />
              </div>
              <div>
                <h1 className="font-display text-xl font-semibold gold-gradient">
                  {STEPS[step - 1].label}
                </h1>
                <p className="text-xs text-muted-foreground">
                  Étape {step} sur 5 — tout est modifiable plus tard dans l&apos;admin.
                </p>
              </div>
            </div>

            {/* ── Step 1 : Profil ── */}
            {step === 1 && (
              <div className="space-y-4">
                <div>
                  <label className={labelCls}>Titre du site</label>
                  <input className={inputCls} value={siteTitle} onChange={(e) => setSiteTitle(e.target.value)} placeholder="Josué & Hornella" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className={labelCls}>Date du mariage</label>
                    <input type="date" className={inputCls} value={weddingDate} onChange={(e) => setWeddingDate(e.target.value)} />
                  </div>
                  <div>
                    <label className={labelCls}>Heure (optionnel)</label>
                    <input className={inputCls} value={weddingTime} onChange={(e) => setWeddingTime(e.target.value)} placeholder="15:00" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className={labelCls}>Lieu</label>
                    <input className={inputCls} value={venueName} onChange={(e) => setVenueName(e.target.value)} placeholder="Salle Royaume" />
                  </div>
                  <div>
                    <label className={labelCls}>Ville</label>
                    <input className={inputCls} value={venueCity} onChange={(e) => setVenueCity(e.target.value)} placeholder="Kinshasa" />
                  </div>
                </div>
              </div>
            )}

            {/* ── Step 2 : Histoire ── */}
            {step === 2 && (
              <div className="space-y-4">
                {stories.length > 0 && (
                  <div className="rounded-xl border border-gold/20 bg-gold/5 p-3 space-y-1.5">
                    {stories.map((s, i) => (
                      <p key={i} className="text-sm text-gold/90 flex items-center gap-2">
                        <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                        <span className="font-medium">{s.title}</span>
                      </p>
                    ))}
                  </div>
                )}
                <div>
                  <label className={labelCls}>Titre du chapitre</label>
                  <input className={inputCls} value={storyDraft.title} onChange={(e) => setStoryDraft({ ...storyDraft, title: e.target.value })} placeholder="Notre première rencontre" />
                </div>
                <div>
                  <label className={labelCls}>Racontez ce moment</label>
                  <textarea className={`${inputCls} min-h-[110px] resize-y`} value={storyDraft.description} onChange={(e) => setStoryDraft({ ...storyDraft, description: e.target.value })} placeholder="Tout a commencé un…" />
                </div>
                <p className="text-xs text-muted-foreground">Laissez vide pour passer — vous pourrez ajouter d&apos;autres chapitres dans l&apos;onglet Histoire.</p>
              </div>
            )}

            {/* ── Step 3 : Chronologie ── */}
            {step === 3 && (
              <div className="space-y-4">
                {events.length > 0 && (
                  <div className="rounded-xl border border-gold/20 bg-gold/5 p-3 space-y-1.5">
                    {events.map((e, i) => (
                      <p key={i} className="text-sm text-gold/90 flex items-center gap-2">
                        <Clock className="w-3.5 h-3.5 shrink-0" />
                        <span className="font-mono text-xs">{e.time}</span> — {e.activity}
                      </p>
                    ))}
                  </div>
                )}
                <div className="grid grid-cols-[100px_1fr] gap-4">
                  <div>
                    <label className={labelCls}>Heure</label>
                    <input className={inputCls} value={eventDraft.time} onChange={(e) => setEventDraft({ ...eventDraft, time: e.target.value })} placeholder="14:00" />
                  </div>
                  <div>
                    <label className={labelCls}>Moment</label>
                    <input className={inputCls} value={eventDraft.activity} onChange={(e) => setEventDraft({ ...eventDraft, activity: e.target.value })} placeholder="Arrivée des invités" />
                  </div>
                </div>
                <div>
                  <label className={labelCls}>Lieu (optionnel)</label>
                  <input className={inputCls} value={eventDraft.location} onChange={(e) => setEventDraft({ ...eventDraft, location: e.target.value })} placeholder="Cour principale" />
                </div>
                <p className="text-xs text-muted-foreground">Un moment à la fois — cliquez « Continuer » après chaque ajout, ou passez.</p>
              </div>
            )}

            {/* ── Step 4 : Invités ── */}
            {step === 4 && (
              <div className="space-y-4">
                {guestsCreated > 0 && (
                  <p className="text-sm text-gold flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4" /> {guestsCreated} invité{guestsCreated > 1 ? 's' : ''} déjà ajouté{guestsCreated > 1 ? 's' : ''}
                  </p>
                )}
                <div>
                  <label className={labelCls}>Une ligne par invité — Prénom Nom, email (optionnel)</label>
                  <textarea
                    className={`${inputCls} min-h-[150px] resize-y font-mono text-xs`}
                    value={guestsRaw}
                    onChange={(e) => setGuestsRaw(e.target.value)}
                    placeholder={`Marie Kalala, marie@exemple.com\nJean Mbala\nGrace Ilunga, grace@exemple.com`}
                  />
                </div>
                {parsedGuests.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    {parsedGuests.filter((g) => !g.error).length} ligne(s) valide(s) sur {parsedGuests.length}
                    {parsedGuests.some((g) => g.error) && ' — les lignes invalides seront ignorées'}
                  </p>
                )}
                <p className="text-xs text-muted-foreground">Vous pourrez aussi importer un fichier XLSX dans l&apos;onglet Invités.</p>
              </div>
            )}

            {/* ── Step 5 : Récap ── */}
            {step === 5 && (
              <div className="space-y-6 text-center">
                <div className="w-16 h-16 mx-auto rounded-full bg-gradient-to-br from-gold/20 to-gold-light/10 flex items-center justify-center">
                  <Sparkles className="w-7 h-7 text-gold" />
                </div>
                <div>
                  <p className="font-display text-lg font-semibold text-foreground">Configuration enregistrée</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {percent !== null ? `Votre mariage est déjà ${percent}% prêt — continuez là où vous étiez.` : 'Votre parcours continue dans l\'admin.'}
                  </p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <Link href={`/w/${slug}`} target="_blank" className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm hover:border-gold/40 transition-colors flex flex-col items-center gap-1.5">
                    <ExternalLink className="w-4 h-4 text-gold" /> Voir le site
                  </Link>
                  <Link href={`/w/${slug}/admin`} className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm hover:border-gold/40 transition-colors flex flex-col items-center gap-1.5">
                    <Crown className="w-4 h-4 text-gold" /> Ouvrir l&apos;admin
                  </Link>
                  <Link href={`/w/${slug}/admin`} className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm hover:border-gold/40 transition-colors flex flex-col items-center gap-1.5">
                    <QrCode className="w-4 h-4 text-gold" /> QR & invitations
                  </Link>
                </div>
              </div>
            )}

            {/* Footer nav */}
            <div className="flex items-center justify-between mt-8 pt-5 border-t border-white/10">
              <div>
                {step > 1 && step < 5 && (
                  <button type="button" className={btnGhost} onClick={() => setStep((s) => s - 1)} disabled={saving}>
                    <ArrowLeft className="w-4 h-4" /> Retour
                  </button>
                )}
              </div>
              <div className="flex items-center gap-3">
                {step < 5 && (
                  <button type="button" className={btnGhost} onClick={() => setStep((s) => s + 1)} disabled={saving}>
                    Plus tard
                  </button>
                )}
                {step < 5 ? (
                  <button type="button" className={btnGold} onClick={next} disabled={saving}>
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                    {step === 1 ? 'Enregistrer & continuer' : step === 4 ? 'Ajouter les invités' : 'Continuer'}
                    {step === 1 && <ArrowRight className="w-4 h-4" />}
                  </button>
                ) : (
                  <button type="button" className={btnGold} onClick={finish}>
                    Terminer <ArrowRight className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        </AnimatePresence>

        {/* Back to admin */}
        <div className="text-center mt-6">
          <Link href={`/w/${slug}/admin`} className="text-xs text-muted-foreground hover:text-gold transition-colors inline-flex items-center gap-1.5">
            <ArrowLeft className="w-3 h-3" /> Retour au tableau de bord
          </Link>
        </div>
      </div>
    </div>
  );
}
