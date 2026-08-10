// ══════════════════════════════════════════════════════════════════════════════
// src/lib/toast/publish-toast.ts
// Phase 3D (MISSION 5.9.0) — Micro-interaction #3: Publish progress toast.
// ══════════════════════════════════════════════════════════════════════════════
//
// A thin wrapper around `sonner`'s `toast.promise()` that surfaces the wedding
// publish lifecycle as a single, branded toast that morphs between 3 states:
//   - loading → "Préparation de la publication…"
//   - success → "Site publié avec succès ! 🎉"
//   - error   → "Échec de la publication"
//
// Why a helper?
//   - The DesignerTab's publish button is the canonical consumer, but other
//     admin surfaces (the platform's experience manager, the onboarding
//     wizard) also publish designs. Centralising the copy + the sonner API
//     here keeps the wording consistent and lets us tweak the styling
//     (e.g. swap the success emoji for an icon) in one place.
//
// Reduced motion:
//   - Sonner renders its loading spinner as a CSS animation. The global
//     `@media (prefers-reduced-motion: reduce)` selector in globals.css
//     already clamps every CSS transition/animation to 0.01ms — so the
//     spinner still spins (sonner forces it via inline transform frames),
//     but the toast slide-in/fade is collapsed. No JS-level gate needed.
//
// Return value:
//   - We pass `promise` to `toast.promise()` for the visual 3-state toast
//     AND return the same promise to the caller so their `await`/`catch`
//     control flow keeps working. (sonner's `toast.promise` itself returns
//     a toast-id wrapper, not a Promise — so we don't propagate that; we
//     return the original promise.)
//
//   Note: the promise rejection propagates BOTH to sonner (which shows the
//   "Échec de la publication" toast) AND to the caller's `await`. The
//   caller's `catch` block should NOT show a duplicate error toast —
//   publishToast already handled the visualisation.
// ══════════════════════════════════════════════════════════════════════════════

import { toast } from 'sonner';

/**
 * Surface a wedding publish lifecycle as a 3-state sonner toast.
 *
 * @example
 *   await publishToast(
 *     fetch('/api/weddings/123/design', { method: 'POST' })
 *       .then(async (r) => { if (!r.ok) throw new Error('publish failed'); })
 *   );
 *
 * @returns The original `promise` (so the caller's `await`/`catch` works).
 *          The toast visualisation is a fire-and-forget side-effect of
 *          `toast.promise()`; the rejection still propagates to the caller.
 */
export function publishToast<T>(promise: Promise<T>): Promise<T> {
  // Visual toast — sonner morphs this through loading → success/error.
  toast.promise(promise, {
    loading: 'Préparation de la publication…',
    success: 'Site publié avec succès ! 🎉',
    error: 'Échec de la publication',
  });
  // Return the original promise so the caller can `await` it for control
  // flow. The rejection propagates here too — the caller's catch block
  // should NOT show a duplicate error toast (sonner already did).
  return promise;
}

export default publishToast;
