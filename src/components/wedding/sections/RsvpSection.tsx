// ══════════════════════════════════════════════════════════════════════════════
// src/components/wedding/sections/RsvpSection.tsx
// Phase 1E (MISSION 5.9.0) — Standalone RSVP form.
// Phase 3C (MISSION 5.9.0) — Offline-aware submission + background sync.
// ══════════════════════════════════════════════════════════════════════════════
//
// Narrative beat #9 — RSVP. A simpler, public RSVP form (separate from the
// GuestAuthForm / GuestPersonalSpace flow). Designers add this section when
// they want a quick "Confirmer ma présence" card BEFORE the guest-auth
// gate — useful for public weddings or for couples who prefer a frictionless
// first-touch RSVP and only require auth for the personal invitation card.
//
// Backend contract: posts to the EXISTING `/api/guest/rsvp` endpoint (the
// same one GuestPersonalSpace uses). That endpoint REQUIRES a guest session
// cookie — so this form gracefully handles the 401 by:
//   1. Showing a toast inviting the guest to connect first
//   2. Smooth-scrolling to #guest-auth so they can search for their name
//
// The form pre-fills the guest's display name from useGuestAuth() when
// available — when the guest is already authenticated, this acts as a
// streamlined "Confirm / Decline" shortcut (no need to open the personal
// space, just two clicks).
//
// Fields:
//   - name            (text, required when unauthenticated)
//   - attendance      (radio: yes / no — required)
//   - guests          (number, 1–10, only when attendance=yes)
//   - dietary         (textarea, optional)
//   - message         (textarea, optional)
//
// Phase 3C — Offline RSVP (background sync):
//   - If the guest submits while `!navigator.onLine`, the request is queued
//     in the Cache API under a per-version `rsvp-queue` cache (matching the
//     SW's CACHE_VERSION, so old queues don't leak across deploys), and a
//     Background Sync tag `rsvp-sync` is registered with the SW.
//   - The SW replays every queued request when the network comes back; on
//     success, the request is removed from the queue.
//   - The same fallback fires if the fetch throws despite `navigator.onLine`
//     being true (transient network drop mid-request).
//   - The guest session cookie is attached automatically on replay (same-
//     origin), so the API authenticates the queued request normally.
//
// Reduced motion: no flip animations on this form (only the per-section
// scroll-reveal, which is already gated by `useReducedMotion` at the
// motion.div level).
// ══════════════════════════════════════════════════════════════════════════════

'use client';

import { useState, useCallback, useRef } from 'react';
import { motion, useInView, useReducedMotion } from 'framer-motion';
import { toast } from 'sonner';
import { Check, X, Loader2, Heart, ShieldCheck, UserCircle2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useGuestAuth } from '@/components/GuestAuthProvider';
import { RsvpConfetti } from '@/components/wedding/RsvpConfetti';

// ─── Phase 3C: Background Sync type augmentation ────────────────────────────
// The Background Sync API (`ServiceWorkerRegistration.sync`) is implemented in
// Chrome/Edge/Samsung Internet but is still behind a flag in TypeScript's
// lib.dom.d.ts (no `sync` property on ServiceWorkerRegistration). We declare
// a minimal local type so the call site is type-checked without forcing a
// global augmentation. If `reg.sync` is undefined (Safari/Firefox don't
// support Background Sync), the optional chaining short-circuits and the
// queued request will be retried on the next SW activation instead.
//
// The inline eslint-disable on `register` works around a known false-positive
// of the project's `no-unused-vars` rule on TypeScript function-type parameter
// names (the parameter name `tag` is pure documentation in a structural type,
// not a runtime variable — but the JS rule still flags it).
type SyncManagerLike = {
  // eslint-disable-next-line no-unused-vars
  register: (tag: string) => Promise<void>;
};
type ServiceWorkerRegistrationWithSync = ServiceWorkerRegistration & {
  sync?: SyncManagerLike;
};

/** Phase 3C payload shape — matches what the existing /api/guest/rsvp route
 *  reads from the request body (status / message / plusOne). Kept inline so
 *  a refactor of the API contract surfaces here as a TS error. */
interface RsvpPayload {
  status: 'CONFIRMED' | 'DECLINED';
  message: string | null;
  plusOne: boolean;
}

/**
 * Phase 3C — Queues an RSVP submission for background-sync replay.
 *
 * Mechanism:
 *  1. Opens the per-version `rsvp-queue` cache (the SW's CACHE_VERSION prefix
 *     is replicated here as `heureux-mariage-v6-rsvp-queue` — both sides must
 *     agree; the SW header comment documents this contract).
 *  2. Constructs a unique URL by appending `?_queue=<timestamp>-<rand>` so
 *     multiple queued submissions (e.g. guest changes their mind while
 *     offline) don't collide under the same cache key. The /api/guest/rsvp
 *     endpoint only reads `request.json()` (verified in src/app/api/guest/
 *     rsvp/route.ts:40) — query params are ignored, so the URL suffix is
 *     transparent to the API.
 *  3. Stores the POST Request + a placeholder Response. The Response is
 *     required by `cache.put` but is never read by the SW (the SW replays
 *     the Request itself via `fetch(request)`).
 *  4. Registers the `rsvp-sync` background-sync tag. When the browser
 *     detects the network is back, it fires the SW's `sync` event with
 *     that tag → `flushPendingRsvps()` replays every queued request.
 *
 * Resilience:
 *  - If `caches` is unavailable (older browser, private mode), the function
 *    returns `false` and the caller shows the generic error toast instead.
 *  - If `sync.register` rejects (already-registered tag, unsupported
 *    browser), the queued request still persists in the cache and will be
 *    retried on the next SW activation or a manual `registration.sync.register`
 *    from a future session.
 *  - The guest session cookie is attached automatically on replay because
 *    the request is same-origin — the API authenticates normally.
 *
 * @returns `true` if the request was successfully queued, `false` otherwise.
 */
async function queueRsvpOffline(payload: RsvpPayload): Promise<boolean> {
  if (typeof window === 'undefined' || !('caches' in window)) return false;

  try {
    // Cache name MUST match the SW's RSVP_QUEUE_CACHE
    // (`${CACHE_VERSION}-rsvp-queue` = `heureux-mariage-v6-rsvp-queue`).
    // If you bump CACHE_VERSION in sw.js, bump it here too — otherwise
    // queued requests land in a cache the SW won't replay.
    const cache = await caches.open('heureux-mariage-v6-rsvp-queue');

    const queueSuffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const queuedRequest = new Request(`/api/guest/rsvp?_queue=${queueSuffix}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    // Placeholder response — required by cache.put, never read by the SW.
    const placeholder = new Response('{}', {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
    await cache.put(queuedRequest, placeholder);

    // Register background sync (best-effort — Safari/Firefox don't support
    // it; the queued request still persists and will be flushed on next
    // SW activation in those browsers).
    if ('serviceWorker' in navigator) {
      try {
        const reg = (await navigator.serviceWorker.ready) as ServiceWorkerRegistrationWithSync;
        await reg.sync?.register('rsvp-sync');
      } catch {
        // sync.register rejected — non-fatal, the request stays queued.
      }
    }

    return true;
  } catch {
    return false;
  }
}

type Attendance = 'yes' | 'no' | '';

interface FormState {
  name: string;
  attendance: Attendance;
  guests: number;
  dietary: string;
  message: string;
}

const INITIAL_FORM: FormState = {
  name: '',
  attendance: '',
  guests: 1,
  dietary: '',
  message: '',
};

export default function RsvpSection() {
  const sectionRef = useRef<HTMLElement>(null);
  const isInView = useInView(sectionRef, { once: true, margin: '-80px' });
  const prefersReducedMotion = useReducedMotion();

  const { guest, authenticated, loading: authLoading } = useGuestAuth();

  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [submitting, setSubmitting] = useState(false);

  // Phase 3D #5 — confetti trigger. Set to `true` on successful RSVP, reset
  // after 3s. The RsvpConfetti component internally gates on luxury-tier +
  // reduced-motion, so this state can be set unconditionally — the component
  // itself decides whether to render the burst.
  const [showConfetti, setShowConfetti] = useState(false);
  const confettiTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setName = (v: string) => setForm((f) => ({ ...f, name: v }));
  const setAttendance = (v: Attendance) =>
    setForm((f) => ({ ...f, attendance: v }));
  const setGuests = (v: number) =>
    setForm((f) => ({ ...f, guests: Math.max(1, Math.min(10, v)) }));
  const setDietary = (v: string) => setForm((f) => ({ ...f, dietary: v }));
  const setMessage = (v: string) => setForm((f) => ({ ...f, message: v }));

  /** Smooth-scroll to the guest-auth section (used on 401 / unauthenticated
   *  submit). Falls back to a hash change if smooth scroll is unavailable. */
  const scrollToGuestAuth = useCallback(() => {
    const el = document.getElementById('guest-auth');
    if (el) {
      el.scrollIntoView({ behavior: prefersReducedMotion ? 'auto' : 'smooth' });
    } else if (typeof window !== 'undefined') {
      window.location.hash = 'guest-auth';
    }
  }, [prefersReducedMotion]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();

      // Client-side validation
      if (!authenticated && !form.name.trim()) {
        toast.error('Veuillez indiquer votre nom');
        return;
      }
      if (form.attendance === '') {
        toast.error('Veuillez indiquer votre présence');
        return;
      }

      // When unauthenticated, the existing /api/guest/rsvp endpoint will
      // return 401. We attempt the call anyway so the user gets a clear
      // "please connect first" prompt — and we offer to scroll to #guest-auth.
      if (!authenticated) {
        toast.info(
          'Veuillez d\'abord vous connecter à votre espace invité pour confirmer votre présence.',
          {
            duration: 6000,
            action: {
              label: 'Me connecter',
              onClick: scrollToGuestAuth,
            },
          },
        );
        return;
      }

      const rsvpStatus = form.attendance === 'yes' ? 'CONFIRMED' : 'DECLINED';

      // Phase 3C — build the payload ONCE so both the online fetch and the
      // offline queue share the exact same shape (no drift between paths).
      const payload: RsvpPayload = {
        status: rsvpStatus,
        message: form.message.trim() || null,
        plusOne: form.attendance === 'yes' && form.guests > 1,
      };

      setSubmitting(true);
      try {
        // Phase 3C — Offline-aware submission (background sync).
        // If the guest is offline, queue the request and register the
        // `rsvp-sync` tag with the SW. The SW replays the queued request
        // when the network comes back. We return early so the user sees
        // a clear "saved locally, will sync" toast instead of a network
        // error toast.
        if (typeof navigator !== 'undefined' && !navigator.onLine) {
          const queued = await queueRsvpOffline(payload);
          if (queued) {
            toast.success(
              'Vous êtes hors ligne. Votre réponse sera envoyée dès votre retour.',
              { duration: 6000 },
            );
            setForm(INITIAL_FORM);
            return;
          }
          // queueing itself failed (no Cache API) — fall through to the
          // fetch which will throw and surface a network error toast.
        }

        const res = await fetch('/api/guest/rsvp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        const data = await res.json().catch(() => ({}));

        if (res.ok && data.success) {
          toast.success(
            rsvpStatus === 'CONFIRMED'
              ? 'Votre présence est confirmée. Nous sommes ravis de vous compter parmi nos invités !'
              : 'Nous avons bien pris note de votre réponse. Vous nous manquerez !',
          );
          setForm(INITIAL_FORM);
          // Phase 3D #5 — fire the luxury-tier confetti burst on success.
          // RsvpConfetti internally gates on `--motion-tier` (elegant/cinematic
          // only) + prefers-reduced-motion, so this trigger is unconditional.
          setShowConfetti(true);
          if (confettiTimerRef.current) clearTimeout(confettiTimerRef.current);
          confettiTimerRef.current = setTimeout(() => {
            setShowConfetti(false);
            confettiTimerRef.current = null;
          }, 3000);
        } else if (res.status === 401) {
          toast.info(
            'Votre session a expiré. Veuillez vous reconnecter à votre espace invité.',
            {
              duration: 6000,
              action: { label: 'Me connecter', onClick: scrollToGuestAuth },
            },
          );
        } else {
          toast.error(
            (data && (data.error as string)) ||
              'Erreur lors de l\'envoi. Veuillez réessayer.',
          );
        }
      } catch {
        // Phase 3C — Fallback offline queueing if the fetch threw despite
        // navigator.onLine being true (transient network drop, DNS failure,
        // SW request interception edge case, etc.). Same UX path as the
        // pre-flight check above.
        if (typeof navigator !== 'undefined' && !navigator.onLine) {
          const queued = await queueRsvpOffline(payload);
          if (queued) {
            toast.success(
              'Vous êtes hors ligne. Votre réponse sera envoyée dès votre retour.',
              { duration: 6000 },
            );
            setForm(INITIAL_FORM);
            return;
          }
        }
        toast.error('Erreur de connexion au serveur. Veuillez réessayer.');
      } finally {
        setSubmitting(false);
      }
    },
    [authenticated, form, scrollToGuestAuth],
  );

  const fadeUp = prefersReducedMotion
    ? { initial: { opacity: 1 }, animate: { opacity: 1 } }
    : {
        initial: { opacity: 0, y: 30 },
        animate: isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 30 },
      };

  return (
    <section
      ref={sectionRef}
      id="rsvp"
      className="py-20 md:py-32 relative overflow-hidden"
      aria-labelledby="rsvp-title"
    >
      {/* Phase 3D #5 — luxury-tier confetti burst on successful RSVP.
          RsvpConfetti renders null when the wedding's motion tier is subtle/none
          OR when the user has prefers-reduced-motion set — so this is safe to
          mount unconditionally. The component reads `--motion-tier` itself. */}
      <RsvpConfetti trigger={showConfetti} />

      <div className="absolute inset-0 bg-gradient-to-br from-background via-champagne/5 to-background" />

      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        {/* Header */}
        <motion.div
          {...fadeUp}
          transition={{ duration: 0.8 }}
          className="text-center mb-12"
        >
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-gold/15 to-rose-gold/10 mb-6">
            <Heart className="size-8 text-gold" />
          </div>
          <h2 id="rsvp-title" className="font-serif text-3xl md:text-5xl font-bold mb-4">
            <span className="gold-gradient">Confirmer ma présence</span>
          </h2>
          <p className="font-display text-lg text-muted-foreground max-w-lg mx-auto">
            Répondez à l&apos;invitation avant la date limite
          </p>
          <div className="section-divider max-w-xs mx-auto mt-6">
            <span className="flourish text-sm">✦</span>
          </div>
        </motion.div>

        {/* Auth status chip */}
        {authLoading ? null : authenticated && guest ? (
          <motion.div
            {...fadeUp}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="mb-6 flex items-center justify-center gap-2 px-4 py-2.5 rounded-full glass-card gold-border mx-auto w-fit"
          >
            <UserCircle2 className="size-4 text-gold/70" />
            <span className="text-sm font-display text-foreground/80">
              Connecté en tant que{' '}
              <strong className="font-semibold text-foreground">
                {guest.displayName ||
                  `${guest.firstName} ${guest.lastName}`.trim() ||
                  'Invité'}
              </strong>
            </span>
          </motion.div>
        ) : null}

        {/* Form card */}
        <motion.div
          {...fadeUp}
          transition={{ duration: 0.8, delay: 0.2 }}
        >
          <form
            onSubmit={handleSubmit}
            className="glass-card gold-border rounded-2xl p-6 sm:p-8 md:p-10 space-y-6"
            noValidate
          >
            {/* Name (required when unauthenticated; pre-filled when authed) */}
            {!authenticated && (
              <div className="space-y-2">
                <Label htmlFor="rsvp-name" className="text-sm font-display font-bold tracking-wide text-foreground/80 uppercase">
                  Nom et prénom
                </Label>
                <Input
                  id="rsvp-name"
                  type="text"
                  value={form.name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Votre nom complet"
                  required
                  autoComplete="name"
                  className="h-12 font-display glass-card gold-border rounded-xl"
                />
              </div>
            )}

            {/* Attendance radio */}
            <fieldset className="space-y-3">
              <legend className="text-sm font-display font-bold tracking-wide text-foreground/80 uppercase">
                Serez-vous présent ?
              </legend>
              <RadioGroup
                value={form.attendance}
                onValueChange={(v) => setAttendance(v as Attendance)}
                className="grid grid-cols-2 gap-3"
              >
                <label
                  htmlFor="rsvp-yes"
                  className={`flex items-center gap-3 p-4 rounded-xl border cursor-pointer transition-all ${
                    form.attendance === 'yes'
                      ? 'border-gold bg-gold/10 shadow-[0_0_12px_oklch(0.68_0.12_85/15%)]'
                      : 'border-gold/15 hover:border-gold/30 hover:bg-gold/[0.04]'
                  }`}
                >
                  <RadioGroupItem id="rsvp-yes" value="yes" />
                  <Check className="size-4 text-gold" />
                  <span className="font-display text-sm font-medium">Oui, avec plaisir</span>
                </label>
                <label
                  htmlFor="rsvp-no"
                  className={`flex items-center gap-3 p-4 rounded-xl border cursor-pointer transition-all ${
                    form.attendance === 'no'
                      ? 'border-gold bg-gold/10 shadow-[0_0_12px_oklch(0.68_0.12_85/15%)]'
                      : 'border-gold/15 hover:border-gold/30 hover:bg-gold/[0.04]'
                  }`}
                >
                  <RadioGroupItem id="rsvp-no" value="no" />
                  <X className="size-4 text-muted-foreground" />
                  <span className="font-display text-sm font-medium">Non, avec regret</span>
                </label>
              </RadioGroup>
            </fieldset>

            {/* Number of guests (visible only when attending) */}
            {form.attendance === 'yes' && (
              <div className="space-y-2">
                <Label
                  htmlFor="rsvp-guests"
                  className="text-sm font-display font-bold tracking-wide text-foreground/80 uppercase"
                >
                  Nombre de personnes
                </Label>
                <div className="flex items-center gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => setGuests(form.guests - 1)}
                    disabled={form.guests <= 1}
                    aria-label="Diminuer le nombre de personnes"
                  >
                    −
                  </Button>
                  <Input
                    id="rsvp-guests"
                    type="number"
                    min={1}
                    max={10}
                    value={form.guests}
                    onChange={(e) => setGuests(parseInt(e.target.value || '1', 10))}
                    className="w-20 text-center font-display h-11"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => setGuests(form.guests + 1)}
                    disabled={form.guests >= 10}
                    aria-label="Augmenter le nombre de personnes"
                  >
                    +
                  </Button>
                  <span className="text-sm text-muted-foreground ml-2">
                    {form.guests > 1 ? '(vous + accompagnant(s))' : '(vous seul)'}
                  </span>
                </div>
              </div>
            )}

            {/* Dietary restrictions */}
            <div className="space-y-2">
              <Label
                htmlFor="rsvp-dietary"
                className="text-sm font-display font-bold tracking-wide text-foreground/80 uppercase"
              >
                Restrictions alimentaires <span className="text-muted-foreground/60 normal-case font-normal">(optionnel)</span>
              </Label>
              <Textarea
                id="rsvp-dietary"
                value={form.dietary}
                onChange={(e) => setDietary(e.target.value)}
                placeholder="Allergies, régime végétarien, sans gluten…"
                rows={2}
                className="font-display glass-card gold-border rounded-xl resize-y min-h-[60px]"
              />
            </div>

            {/* Message to the couple */}
            <div className="space-y-2">
              <Label
                htmlFor="rsvp-message"
                className="text-sm font-display font-bold tracking-wide text-foreground/80 uppercase"
              >
                Message aux mariés <span className="text-muted-foreground/60 normal-case font-normal">(optionnel)</span>
              </Label>
              <Textarea
                id="rsvp-message"
                value={form.message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Un mot, un vœu, une pensée pour le couple…"
                rows={3}
                maxLength={500}
                className="font-display glass-card gold-border rounded-xl resize-y min-h-[80px]"
              />
            </div>

            {/* Submit */}
            <div className="pt-2">
              <Button
                type="submit"
                size="lg"
                disabled={submitting}
                className="w-full h-12 bg-gradient-gold text-white hover:opacity-90 shadow-lg shadow-gold/25 font-display tracking-wide"
              >
                {submitting ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Envoi en cours…
                  </>
                ) : (
                  <>
                    <Heart className="size-4" />
                    Confirmer ma présence
                  </>
                )}
              </Button>
            </div>

            {/* Trust line */}
            <div className="flex items-center justify-center gap-2 pt-2 text-[10px] font-display tracking-wide text-muted-foreground/60 uppercase">
              <ShieldCheck className="size-3 text-gold/40" />
              <span>Vos réponses sont confidentielles</span>
            </div>
          </form>
        </motion.div>
      </div>
    </section>
  );
}
