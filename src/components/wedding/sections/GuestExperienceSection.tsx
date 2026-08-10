// ══════════════════════════════════════════════════════════════════════════════
// src/components/wedding/sections/GuestExperienceSection.tsx
// Phase 1E (MISSION 5.9.0) — Manifest-registered wrapper for GuestPersonalSpace.
// ══════════════════════════════════════════════════════════════════════════════
//
// Narrative beat #11 — GUEST-EXPERIENCE. Lets designers place the
// GuestPersonalSpace (the envelope reveal + invitation card + RSVP) AS A
// SECTION in the manifest flow, instead of as a fixed post-render appendage.
//
// Three render branches:
//
//   1. `loading`                → shimmer placeholder card.
//   2. `!authenticated || !guest` → "Connectez-vous" prompt with a CTA that
//                                   smooth-scrolls to #guest-auth.
//   3. `authenticated && guest`   → fetches the wedding's settings (so
//                                   GuestPersonalSpace can render the
//                                   invitation card with the couple's
//                                   names/photos/venue), then renders
//                                   <GuestPersonalSpace />.
//
// This is a thin wrapper — the heavy lifting (envelope animation, QR code,
// invitation card, share menu) all lives in GuestPersonalSpace. We only:
//   - subscribe to the GuestAuthContext
//   - load /api/settings when needed (one fetch, only when authed)
//   - pass an onLogout that clears the session and refreshes the page
//
// Multi-tenant safety: settings fetch is tenant-scoped automatically by the
// /w/[slug]/page.tsx fetch interceptor (X-Wedding-Slug header). Empty settings
// are tolerated by GuestPersonalSpace (it has its own empty-string fallbacks).
// ══════════════════════════════════════════════════════════════════════════════

'use client';

import { useEffect, useState, useCallback } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { LogIn, MailOpen, ShieldCheck, Loader2, Heart } from 'lucide-react';
import { Button } from '@/components/ui/button';

import { useGuestAuth } from '@/components/GuestAuthProvider';
import GuestPersonalSpace from '@/components/GuestPersonalSpace';

/** Settings shape expected by GuestPersonalSpace. */
interface GuestSpaceSettings {
  [key: string]: string | undefined;
}

/** Normalise the /api/settings response into a flat string-keyed map.
 *  The endpoint returns either { settings: {key: value} } or an array of
 *  {key, value} rows — we accept both shapes (the page.tsx fetcher does
 *  the same). */
function normalizeSettings(payload: unknown): GuestSpaceSettings | null {
  if (!payload || typeof payload !== 'object') return null;
  const root = payload as Record<string, unknown>;
  const maybeSettings = root.settings ?? root;
  if (Array.isArray(maybeSettings)) {
    const obj: Record<string, string> = {};
    for (const item of maybeSettings) {
      if (
        item &&
        typeof item === 'object' &&
        typeof (item as { key?: unknown }).key === 'string' &&
        typeof (item as { value?: unknown }).value === 'string'
      ) {
        obj[(item as { key: string }).key] = (item as { value: string }).value;
      }
    }
    return obj;
  }
  if (maybeSettings && typeof maybeSettings === 'object') {
    return maybeSettings as GuestSpaceSettings;
  }
  return null;
}

export default function GuestExperienceSection() {
  const prefersReducedMotion = useReducedMotion();
  const { guest, authenticated, loading: authLoading, logout } = useGuestAuth();
  const [settings, setSettings] = useState<GuestSpaceSettings | null>(null);
  const [settingsLoading, setSettingsLoading] = useState(false);

  // Fetch /api/settings only when the guest is actually authenticated.
  // The page-level fetch interceptor (in /w/[slug]/page.tsx) injects the
  // X-Wedding-Slug header so the request resolves to this wedding's Settings
  // rows — no manual slug passing needed.
  useEffect(() => {
    if (!authenticated) {
      setSettings(null);
      return;
    }
    let cancelled = false;
    setSettingsLoading(true);
    fetch('/api/settings')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled) return;
        setSettings(normalizeSettings(data));
      })
      .catch(() => {
        if (!cancelled) setSettings(null);
      })
      .finally(() => {
        if (!cancelled) setSettingsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [authenticated]);

  const scrollToGuestAuth = useCallback(() => {
    const el = document.getElementById('guest-auth');
    if (el) {
      el.scrollIntoView({
        behavior: prefersReducedMotion ? 'auto' : 'smooth',
      });
    } else if (typeof window !== 'undefined') {
      window.location.hash = 'guest-auth';
    }
  }, [prefersReducedMotion]);

  const handleLogout = useCallback(async () => {
    await logout();
    // Trigger a Next.js client navigation refresh so any session-bound
    // server components re-render. Same pattern as /w/[slug]/page.tsx.
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  }, [logout]);

  // ─── Loading branch ────────────────────────────────────────────────────
  if (authLoading) {
    return (
      <section
        id="guest-experience"
        className="py-20 md:py-32"
        aria-label="Espace invité — chargement"
      >
        <div className="max-w-2xl mx-auto px-4">
          <div className="glass-card gold-border rounded-2xl p-10 md:p-14 text-center">
            <Loader2 className="size-8 text-gold/60 animate-spin mx-auto mb-4" />
            <p className="font-display text-sm text-muted-foreground">
              Vérification de votre session…
            </p>
          </div>
        </div>
      </section>
    );
  }

  // ─── Unauthenticated branch ────────────────────────────────────────────
  if (!authenticated || !guest) {
    return (
      <section
        id="guest-experience"
        className="py-20 md:py-32 relative overflow-hidden"
        aria-labelledby="guest-experience-title"
      >
        <div className="absolute inset-0 bg-gradient-to-br from-background via-champagne/5 to-background" />

        <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <motion.div
            initial={prefersReducedMotion ? { opacity: 1 } : { opacity: 0, y: 30 }}
            whileInView={prefersReducedMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8 }}
          >
            <div className="glass-card gold-border rounded-2xl p-10 md:p-14 text-center">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-gold/15 to-rose-gold/10 mb-6">
                <MailOpen className="size-8 text-gold" />
              </div>
              <h2
                id="guest-experience-title"
                className="font-serif text-3xl md:text-4xl font-bold mb-4"
              >
                <span className="gold-gradient">Votre espace personnel</span>
              </h2>
              <p className="font-display text-base md:text-lg text-muted-foreground max-w-lg mx-auto mb-8 leading-relaxed">
                Connectez-vous pour accéder à votre invitation personnelle,
                votre QR code d&apos;entrée et vos informations de table.
              </p>

              <Button
                size="lg"
                onClick={scrollToGuestAuth}
                className="bg-gradient-gold text-white hover:opacity-90 shadow-xl shadow-gold/25 font-display tracking-wide h-12 px-8"
              >
                <LogIn className="size-4" />
                Me connecter à mon espace
              </Button>

              <div className="flex items-center justify-center gap-2 mt-8 pt-6 border-t border-gold/10 text-[10px] font-display tracking-wide text-muted-foreground/60 uppercase">
                <ShieldCheck className="size-3 text-gold/40" />
                <span>Espace sécurisé — réservé aux invités</span>
                <Heart className="size-3 text-rose-gold/40" />
              </div>
            </div>
          </motion.div>
        </div>
      </section>
    );
  }

  // ─── Authenticated branch — render the personal space ─────────────────
  // If settings are still loading, show a brief placeholder so the space
  // doesn't briefly mount with empty settings (which would render the
  // default-wedding couple names before the real settings arrive).
  if (settingsLoading && !settings) {
    return (
      <section id="guest-experience" className="py-20 md:py-32">
        <div className="max-w-2xl mx-auto px-4">
          <div className="glass-card gold-border rounded-2xl p-10 md:p-14 text-center">
            <Loader2 className="size-8 text-gold/60 animate-spin mx-auto mb-4" />
            <p className="font-display text-sm text-muted-foreground">
              Préparation de votre invitation…
            </p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <GuestPersonalSpace
      guest={guest}
      settings={settings || {}}
      onLogout={handleLogout}
    />
  );
}
