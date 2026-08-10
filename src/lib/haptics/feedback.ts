// ══════════════════════════════════════════════════════════════════════════════
// src/lib/haptics/feedback.ts
// Phase 3D (MISSION 5.9.0) — Micro-interaction #6: Haptic + sound feedback.
// ══════════════════════════════════════════════════════════════════════════════
//
// Two small utilities for tactile + auditory feedback on mobile:
//   - triggerHaptic(pattern) — calls `navigator.vibrate()` if the device
//     supports it. Mobile-only (Chrome Android supports it; iOS Safari
//     silently ignores). Pattern can be a single duration (ms) or an
//     array of on/off intervals.
//   - playSuccessSound() — synthesises a 2-tone ascending chime using the
//     Web Audio API (no audio file dependency). Only fires after a user
//     gesture (the browser's autoplay policy requires this) and only when
//     the user has NOT set `prefers-reduced-motion: reduce` (the sound
//     is a celebratory cue — under reduced motion, we stay silent).
//
// Why no audio file?
//   - Wedding sites are bandwidth-sensitive (couples on mobile-data plans).
//     A 2-tone chime synthesised on-the-fly is ~0 KB of payload vs. ~5-20 KB
//     for an MP3. The chime is also instant (no decoding latency).
//
// Why Web Audio and not HTMLAudioElement?
//   - HTMLAudioElement requires a URL and has iOS quirks around `play()`.
//     Web Audio's `AudioContext` is resumable after a user gesture and
//     works uniformly across modern browsers.
//
// Reduced motion:
//   - `playSuccessSound()` checks `window.matchMedia('(prefers-reduced-motion)')`
//     and stays silent when the user has reduced motion enabled. The haptic
//     vibration is NOT gated on reduced motion (it's a tactile cue, not a
//     visual animation — and on iOS Safari, `navigator.vibrate` is a no-op
//     anyway, so there's nothing to gate).
//
// SSR safety:
//   - All `navigator`/`window`/`AudioContext` accesses are guarded by
//     `typeof` checks. The functions are safe to call from server components
//     (they no-op).
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Trigger a haptic vibration on supported mobile devices.
 *
 * @param pattern - Single duration in ms, or an array of [on, off, on, off…]
 *                  intervals. Defaults to 50ms (a short tap).
 * @returns `true` if the vibration was triggered, `false` if unsupported
 *          (e.g. iOS Safari, desktop browsers, or SSR).
 *
 * @example
 *   triggerHaptic(100);              // single 100ms buzz
 *   triggerHaptic([30, 40, 30]);     // buzz-pause-buzz
 */
export function triggerHaptic(pattern: number | number[] = 50): boolean {
  if (typeof navigator === 'undefined') return false;
  if (!('vibrate' in navigator)) return false;
  try {
    // navigator.vibrate is widely supported on Chrome Android; iOS Safari
    // silently ignores the call (returns false). The TS lib.dom.d.ts type
    // signature is `vibrate(pattern: number | number[]): boolean`.
    return navigator.vibrate(pattern) ?? false;
  } catch {
    // Some browsers throw on cross-origin iframes — silently ignore.
    return false;
  }
}

/**
 * Lazy singleton AudioContext. Created on first use (after a user gesture,
 * per the autoplay policy). Reused across subsequent calls to avoid the
 * ~5ms context-creation cost on every chime.
 */
let _audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (_audioCtx) return _audioCtx;
  const Ctor =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  try {
    _audioCtx = new Ctor();
    return _audioCtx;
  } catch {
    return null;
  }
}

/**
 * Play a short 2-tone ascending success chime (E5 → A5, ~150ms total).
 *
 * Conditions (all must be true):
 *   - Browser supports Web Audio API.
 *   - User has NOT set `prefers-reduced-motion: reduce` (the chime is a
 *     celebratory cue; under reduced motion we stay silent).
 *   - The AudioContext can be resumed (i.e. a prior user gesture has
 *     occurred — the browser's autoplay policy blocks otherwise).
 *
 * @returns `true` if the chime played, `false` if any condition failed.
 *
 * @example
 *   // On a successful QR scan (after a user tap on the "Valider" button):
 *   triggerHaptic(100);
 *   playSuccessSound();
 */
export function playSuccessSound(): boolean {
  if (typeof window === 'undefined') return false;

  // Gate 1: reduced motion → silent.
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return false;

  const ctx = getAudioContext();
  if (!ctx) return false;

  // Gate 2: autoplay policy — if the context is suspended and we can't
  // resume it (no prior user gesture), bail silently.
  if (ctx.state === 'suspended') {
    // Attempt to resume — this is a no-op if no user gesture has occurred.
    // The promise resolves async; we don't await it because we want the
    // chime to fire ASAP when the gesture HAS occurred.
    ctx.resume().catch(() => {
      // Silent — autoplay policy blocked us, that's fine.
    });
    // If still suspended right now, the chime won't be audible. We still
    // try to schedule it — if the resume completes before the chime's
    // startTime, it'll play; otherwise it'll be dropped silently.
  }

  try {
    const now = ctx.currentTime;

    // Two oscillators in sequence: E5 (659.25 Hz) → A5 (880 Hz).
    // Each note: 80ms with a soft attack/release envelope.
    const notes = [
      { freq: 659.25, start: 0,    dur: 0.08 },
      { freq: 880.00, start: 0.07, dur: 0.10 },
    ];

    for (const note of notes) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(note.freq, now + note.start);

      // Envelope: 5ms attack → sustain at 0.15 → 50ms release.
      gain.gain.setValueAtTime(0, now + note.start);
      gain.gain.linearRampToValueAtTime(0.15, now + note.start + 0.005);
      gain.gain.setValueAtTime(0.15, now + note.start + note.dur - 0.05);
      gain.gain.linearRampToValueAtTime(0, now + note.start + note.dur);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now + note.start);
      osc.stop(now + note.start + note.dur + 0.01);
    }

    return true;
  } catch {
    // AudioContext construction succeeded but scheduling failed (rare).
    return false;
  }
}

const hapticFeedback = { triggerHaptic, playSuccessSound };
export default hapticFeedback;
