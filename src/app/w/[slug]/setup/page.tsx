'use client';

// ══════════════════════════════════════════════════════════════════════════════
// /w/[slug]/setup — P2-UX + P3-UX (Sprint Premium tranches 1+2) : wizard de configuration mariage
// ══════════════════════════════════════════════════════════════════════════════
//
// The operator journey, densified (PX-2 + PX-6/PX-7 tranche 2). Previously:
// create wedding (single form) → land back on the org dashboard with an EMPTY
// admin. Now the creation flow redirects here and walks the organizer through
// 7 guided steps, each hitting EXISTING production APIs (one new read-only
// catalog endpoint in tranche 2: GET /api/theme/templates):
//
//   1. Profil      → PUT  /api/settings      (site_title, wedding_date, time, venue)
//   2. Histoire    → POST /api/couple-story (chapters, repeatable)
//   3. Chronologie → POST /api/timeline     (moments, repeatable)
//   4. Invités     → POST /api/guests       (bulk paste "Prénom Nom, email")
//   5. Design      → POST /api/theme/apply-template (P3-UX: pick a PUBLISHED
//                    PlatformTheme from GET /api/theme/templates)
//   6. Médias      → POST /api/media        (P3-UX: gallery photos upload,
//                    list via GET /api/media)
//   7. Récap       → GET  /api/admin/setup-progress + mark setup_done
//
// P3-UX PX-7 — multi-session resume:
//   - ?step=N deep-link (from the SetupProgress next-best-action CTA) wins.
//   - Otherwise the last visited step is restored from localStorage so an
//     organizer who leaves mid-configuration resumes where they stopped.
//   - Steps whose server-side milestone (setup-progress) is already done are
//     shown with a checkmark in the stepper — history is visible on return.
//
// Conventions mirrored from the admin shell (which is NOT mounted here):
//   - Auth: GET /api/me on mount → 401 redirects to /w/{slug}/admin/login.
//   - CSRF double-submit: X-CSRF-Token read from the csrf_token cookie.
//   - Tenancy: X-Wedding-Slug attached explicitly to every /api/* call.
//   - Every step is skippable ("Plus tard") — the SetupProgress banner on the
//     dashboard keeps showing what is left, so skipping never loses the user.

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CalendarDays, BookOpen, Clock, UserPlus, PartyPopper, ArrowLeft, ArrowRight,
  Loader2, Plus, ExternalLink, QrCode, Crown, CheckCircle2, Sparkles,
  Palette, ImagePlus,
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
  { id: 5, label: 'Design', icon: Palette },
  { id: 6, label: 'Médias', icon: ImagePlus },
  { id: 7, label: 'Récap', icon: PartyPopper },
] as const;

interface StoryRow { title: string; description: string; date: string }
interface TimelineRow { time: string; activity: string; location: string }
interface GuestLine { firstName: string; lastName: string; email: string; error?: string }
interface TemplateCard {
  slug: string;
  name: string;
  category: string | null;
  tier: string;
  fontDisplay: string | null;
  fontBody: string | null;
  isPremium: boolean;
  isRecommended: boolean;
  palette: { primary: string | null; accent: string | null; surface: string | null; surfaceDeep: string | null };
}
interface MediaItem { id: string; url: string; title?: string | null; type?: string | null }

const inputCls =
  'w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-gold/50 focus:ring-1 focus:ring-gold/30 transition-colors';
const labelCls = 'block text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1.5';
const btnGold =
  'inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold text-[#1a1209] bg-gradient-gold hover:opacity-90 transition-opacity shadow-lg shadow-gold/10 disabled:opacity-40 disabled:pointer-events-none';
const btnGhost =
  'inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors';

// P3-UX PX-7 — localStorage key holding the last visited step per wedding so
// the wizard resumes mid-configuration across sessions (cleared on finish).
const resumeKey = (s: string) => `wedding-setup-resume-${s}`;

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

  // Step 5 — Design (P3-UX)
  const [templates, setTemplates] = useState<TemplateCard[]>([]);
  const [templatesLoaded, setTemplatesLoaded] = useState(false);
  const [appliedTemplate, setAppliedTemplate] = useState<string | null>(null);
  const [applying, setApplying] = useState<string | null>(null);

  // Step 6 — Médias (P3-UX)
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
  const [mediaLoaded, setMediaLoaded] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadedCount, setUploadedCount] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Step 7 — Récap
  const [percent, setPercent] = useState<number | null>(null);
  // Milestones from /api/admin/setup-progress (P3-UX PX-7): power the
  // "already done" checkmarks in the stepper so returning organizers see
  // their history, not just their current position.
  const [milestones, setMilestones] = useState<Record<string, boolean>>({});

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
      if (progressRes && Array.isArray(progressRes.milestones)) {
        setMilestones(
          Object.fromEntries(
            (progressRes.milestones as { id: string; done: boolean }[]).map((m) => [m.id, m.done])
          )
        );
      }
    } finally {
      setReady(true);
    }
  }, [router, slug]);

  useEffect(() => {
    loadAll().then(() => {
      // P3-UX PX-7 — multi-session resume. Priority: ?step= deep-link
      // (SetupProgress next-best-action CTA) > localStorage last step.
      const qsStep = parseInt(new URLSearchParams(window.location.search).get('step') || '', 10);
      if (qsStep >= 1 && qsStep <= STEPS.length) {
        setStep(qsStep);
        return;
      }
      const saved = parseInt(window.localStorage.getItem(resumeKey(slug)) || '', 10);
      if (saved >= 2 && saved <= STEPS.length) {
        setStep(saved);
        toast.info(`Reprise du parcours — étape ${STEPS[saved - 1].label}`);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist the current step so the next visit resumes here (PX-7).
  useEffect(() => {
    if (ready && authed) window.localStorage.setItem(resumeKey(slug), String(step));
  }, [step, ready, authed, slug]);

  // Lazy-load the Design catalog (step 5) and the existing media (step 6)
  // the first time each step is reached — keeps the initial page light.
  useEffect(() => {
    if (!ready || !authed) return;
    if (step === 5 && !templatesLoaded) {
      setTemplatesLoaded(true);
      loadTemplates();
    }
    if (step === 6 && !mediaLoaded) {
      setMediaLoaded(true);
      loadMedia();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, ready, authed, templatesLoaded, mediaLoaded]);

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

  // ─── P3-UX PX-6 — Design step: catalog load + template apply ────────────────

  const loadTemplates = useCallback(async () => {
    try {
      const res = await fetch('/api/theme/templates', { headers: apiHeaders(slug), credentials: 'include' });
      if (res.ok) {
        const json = await res.json().catch(() => null);
        if (json && Array.isArray(json.templates)) setTemplates(json.templates);
      }
    } catch {
      // Non-blocking: the Design step renders a graceful empty state and the
      // organizer can still personalize colors in the admin (Apparence).
    }
  }, [slug]);

  const applyTemplate = async (templateSlug: string): Promise<void> => {
    setApplying(templateSlug);
    try {
      const res = await fetch('/api/theme/apply-template', {
        method: 'POST',
        headers: apiHeaders(slug),
        credentials: 'include',
        body: JSON.stringify({ templateId: templateSlug }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        toast.error(json?.error || 'Application du thème impossible');
        return;
      }
      setAppliedTemplate(templateSlug);
      toast.success('Thème appliqué — personnalisez-le dans l\'admin (Apparence)');
    } finally {
      setApplying(null);
    }
  };

  // ─── P3-UX PX-6 — Médias step: list + upload ───────────────────────────────

  const loadMedia = useCallback(async () => {
    try {
      const res = await fetch('/api/media', { headers: apiHeaders(slug), credentials: 'include' });
      if (res.ok) {
        const json = await res.json().catch(() => null);
        if (json && Array.isArray(json.media)) setMediaItems(json.media);
      }
    } catch {
      // Non-blocking: empty grid, upload still possible.
    }
  }, [slug]);

  const uploadFiles = async (files: FileList | null): Promise<void> => {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      // Sequential uploads — POST /api/media is rate-limited (30/min) and
      // each response can fail individually (magic bytes, quota 403, size).
      let okCount = 0;
      let lastError = '';
      for (const file of Array.from(files)) {
        const fd = new FormData();
        fd.append('file', file);
        fd.append('title', file.name.replace(/\.[^.]+$/, ''));
        fd.append('type', 'PHOTO');
        fd.append('category', 'GALLERY');
        // Multipart: do NOT set Content-Type (browser sets the boundary).
        const res = await fetch('/api/media', {
          method: 'POST',
          headers: { 'X-Wedding-Slug': slug, 'X-CSRF-Token': getCsrfToken() },
          credentials: 'include',
          body: fd,
        });
        if (res.ok) {
          okCount += 1;
        } else {
          const json = await res.json().catch(() => null);
          lastError = json?.error || `Erreur ${res.status}`;
        }
      }
      if (okCount > 0) {
        setUploadedCount((c) => c + okCount);
        toast.success(`${okCount} photo${okCount > 1 ? 's' : ''} envoyée${okCount > 1 ? 's' : ''}`);
        await loadMedia();
      }
      if (okCount < files.length) {
        toast.error(lastError || 'Certaines photos n\'ont pas pu être envoyées');
      }
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
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
    window.localStorage.removeItem(resumeKey(slug));
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
      // Steps 5 (Design) and 6 (Médias) save immediately per action
      // (apply per card / upload per file) — "Continuer" just advances.
      if (ok) setStep((s) => Math.min(STEPS.length, s + 1));
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
            // P3-UX PX-7 — a step is "done" when the organizer passed it OR
            // when its server-side milestone is already satisfied (setup
            // progress), so a returning organizer sees their real history.
            const milestoneDone =
              (s.id === 1 && milestones['profil']) ||
              (s.id === 2 && milestones['histoire']) ||
              (s.id === 3 && milestones['chronologie']) ||
              (s.id === 4 && milestones['invites']) ||
              (s.id === 6 && (mediaItems.length > 0 || uploadedCount > 0)) ||
              false;
            const done = s.id < step || milestoneDone || (s.id === 5 && appliedTemplate !== null);
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
                  Étape {step} sur {STEPS.length} — tout est modifiable plus tard dans l&apos;admin.
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

            {/* ── Step 5 : Design (P3-UX) ── */}
            {step === 5 && (
              <div className="space-y-4">
                <p className="text-xs text-muted-foreground">
                  Choisissez l&apos;ambiance visuelle de votre site — appliquée instantanément, personnalisable plus tard dans l&apos;admin (Apparence).
                </p>
                {!templatesLoaded ? (
                  <div className="flex items-center justify-center py-8 text-muted-foreground">
                    <Loader2 className="w-5 h-5 animate-spin" />
                  </div>
                ) : templates.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">
                    Aucun template publié pour le moment — personnalisez les couleurs directement dans l&apos;admin (Apparence).
                  </p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {templates.map((t) => {
                      const selected = appliedTemplate === t.slug;
                      const swatches = [t.palette.primary, t.palette.accent, t.palette.surface, t.palette.surfaceDeep].filter(
                        (c): c is string => typeof c === 'string' && c.length > 0
                      );
                      return (
                        <div
                          key={t.slug}
                          className={`rounded-xl border p-4 transition-colors ${
                            selected
                              ? 'border-gold/60 bg-gold/10'
                              : 'border-white/10 bg-white/5 hover:border-gold/30'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <p className="text-sm font-semibold text-foreground">{t.name}</p>
                              <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
                                {t.category || t.tier}
                              </p>
                            </div>
                            {t.isRecommended && (
                              <span className="rounded-full border border-gold/40 bg-gold/10 px-2 py-0.5 text-[10px] font-medium text-gold">
                                Recommandé
                              </span>
                            )}
                          </div>
                          <div className="flex gap-1.5 mt-3">
                            {swatches.length > 0 ? (
                              swatches.map((c, i) => (
                                <span
                                  key={i}
                                  className="w-6 h-6 rounded-full border border-white/20"
                                  style={{ backgroundColor: c }}
                                />
                              ))
                            ) : (
                              <span className="w-6 h-6 rounded-full border border-white/20 bg-gradient-to-br from-gold/40 to-gold-light/20" />
                            )}
                            {t.fontDisplay && (
                              <span className="ml-2 text-[11px] text-muted-foreground self-center">{t.fontDisplay}</span>
                            )}
                          </div>
                          <button
                            type="button"
                            className={`${selected ? btnGold : btnGhost} w-full justify-center mt-3`}
                            onClick={() => applyTemplate(t.slug)}
                            disabled={applying !== null}
                          >
                            {applying === t.slug ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : selected ? (
                              <>
                                <CheckCircle2 className="w-4 h-4" /> Thème appliqué
                              </>
                            ) : (
                              'Appliquer ce thème'
                            )}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* ── Step 6 : Médias (P3-UX) ── */}
            {step === 6 && (
              <div className="space-y-4">
                {mediaItems.length > 0 && (
                  <p className="text-sm text-gold flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4" /> {mediaItems.length} photo{mediaItems.length > 1 ? 's' : ''} dans la galerie
                  </p>
                )}
                <label className="block">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={(e) => uploadFiles(e.target.files)}
                    disabled={uploading}
                  />
                  <span className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-white/20 bg-white/5 px-4 py-8 cursor-pointer hover:border-gold/40 hover:bg-gold/5 transition-colors">
                    {uploading ? (
                      <Loader2 className="w-6 h-6 text-gold animate-spin" />
                    ) : (
                      <ImagePlus className="w-6 h-6 text-gold" />
                    )}
                    <span className="text-sm font-medium text-foreground">
                      {uploading ? 'Envoi en cours…' : 'Choisir des photos'}
                    </span>
                    <span className="text-xs text-muted-foreground">JPG, PNG ou WebP — jusqu&apos;à 10 Mo par photo</span>
                  </span>
                </label>
                {mediaItems.length > 0 && (
                  <div className="grid grid-cols-4 sm:grid-cols-5 gap-2">
                    {mediaItems
                      .filter((m) => m.type !== 'VIDEO')
                      .slice(0, 10)
                      .map((m) => (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          key={m.id}
                          src={m.url}
                          alt={m.title || 'Photo du mariage'}
                          className="w-full h-16 object-cover rounded-lg border border-white/10"
                        />
                      ))}
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  Vos photos alimentent la galerie du site. Gestion complète dans l&apos;admin → Médias.
                </p>
              </div>
            )}

            {/* ── Step 7 : Récap ── */}
            {step === 7 && (
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
                {step > 1 && step < STEPS.length && (
                  <button type="button" className={btnGhost} onClick={() => setStep((s) => s - 1)} disabled={saving}>
                    <ArrowLeft className="w-4 h-4" /> Retour
                  </button>
                )}
              </div>
              <div className="flex items-center gap-3">
                {step < STEPS.length && (
                  <button type="button" className={btnGhost} onClick={() => setStep((s) => s + 1)} disabled={saving}>
                    Plus tard
                  </button>
                )}
                {step < STEPS.length ? (
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
