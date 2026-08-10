'use client';

// ══════════════════════════════════════════════════════════════════════════════
// ImpersonationBanner — Phase 4C (audit §20.6)
// ══════════════════════════════════════════════════════════════════════════════
//
// A fixed-top, full-width amber banner shown when a PLATFORM_ADMIN is
// viewing the wedding admin as an impersonated wedding-admin user. The
// banner CANNOT be dismissed — the admin MUST click "Arrêter
// l'impersonation" to stop (or wait for the 30-min auto-expiry).
//
// Props:
//   - targetName:  the impersonated user's display name (shown in the text)
//   - targetRole:  the impersonated user's role (ORGANIZER/RECEPTION/CONTROLLER)
//   - expiresAt:   epoch-ms when the 30-min window ends (drives the countdown)
//   - onStop:      callback fired when the user clicks "Arrêter"
//
// UX requirements (from spec):
//   - Fixed top, full width, amber/warning background (gradient amber)
//   - Text: "⚠️ Vous consultez en tant que {targetName} ({targetRole}).
//     Fin dans {mm:ss}."
//   - Live countdown (updates every second via setInterval)
//   - "Arrêter l'impersonation" button (red/dark accent for emphasis)
//   - Cannot be dismissed — no X close button
//
// The countdown is computed from `expiresAt` (epoch-ms). When it reaches
// zero, the component fires onStop() automatically (defense-in-depth: the
// middleware's auto-expiry also handles this server-side, but firing here
// gives the user immediate feedback instead of waiting for the next
// navigation).

import { useEffect, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { ShieldAlert, Square } from 'lucide-react';
import { getRoleLabel } from '@/lib/ui-labels';

interface Props {
  targetName: string;
  targetRole: string;
  expiresAt: number; // epoch-ms
  onStop: () => void;
}

function formatMmSs(msRemaining: number): string {
  const totalSeconds = Math.max(0, Math.floor(msRemaining / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function ImpersonationBanner({ targetName, targetRole, expiresAt, onStop }: Props) {
  const [now, setNow] = useState(() => Date.now());
  // Track whether onStop has been fired to avoid double-fire between the
  // countdown expiry effect + the user's button click. Using state (not a
  // ref) so the button's `disabled` prop re-renders properly when stop
  // fires (React warns when refs are read during render).
  const [stopFired, setStopFired] = useState(false);

  // Tick every second to update the countdown. We use `expiresAt - now`
  // to compute the remaining time (server-clock-aligned — expiresAt comes
  // from the server). Skew between client/server clock is acceptable
  // because the middleware's auto-expiry is the authoritative check.
  useEffect(() => {
    const interval = setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const remainingMs = expiresAt - now;
  const isExpired = remainingMs <= 0;

  // Auto-fire onStop when the countdown hits zero. Runs after each tick.
  // The `stopFired` state guards against double-fire (the setInterval
  // keeps ticking but handleStop short-circuits after the first call).
  const handleStop = useCallback(() => {
    setStopFired((prev) => {
      if (prev) return prev; // already fired — no-op
      onStop();
      return true;
    });
  }, [onStop]);

  useEffect(() => {
    if (isExpired) {
      handleStop();
    }
  }, [isExpired, handleStop]);

  // Visual urgency ramps up as the countdown drops: <5min amber→rose,
  // <1min pulsing rose. <30min the default amber gradient.
  const minutesLeft = Math.floor(remainingMs / 60000);
  const urgentClass =
    minutesLeft < 1
      ? 'bg-gradient-to-r from-rose-600 via-rose-500 to-rose-600 animate-pulse'
      : minutesLeft < 5
        ? 'bg-gradient-to-r from-rose-600 via-amber-500 to-rose-600'
        : 'bg-gradient-to-r from-amber-500 via-amber-400 to-amber-500';

  const countdownLabel = isExpired ? '00:00' : formatMmSs(remainingMs);
  const roleLabel = getRoleLabel(targetRole);

  return (
    <div
      role="alert"
      aria-live="polite"
      className={`fixed top-0 left-0 right-0 z-[100] ${urgentClass} text-white shadow-lg border-b border-amber-900/30`}
    >
      <div className="mx-auto max-w-[1600px] px-3 sm:px-4 py-2 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div className="flex items-center gap-2 text-xs sm:text-sm font-medium min-w-0">
          <ShieldAlert className="w-4 h-4 shrink-0" aria-hidden="true" />
          <span className="min-w-0 truncate">
            <span aria-hidden="true">⚠️ </span>
            Vous consultez en tant que{' '}
            <strong className="font-semibold">{targetName}</strong>{' '}
            (<span>{roleLabel}</span>). Fin dans{' '}
            <strong
              className="font-mono tabular-nums"
              aria-label={`Temps restant: ${countdownLabel}`}
            >
              {countdownLabel}
            </strong>
            .
          </span>
        </div>
        <Button
          type="button"
          size="sm"
          onClick={handleStop}
          disabled={stopFired}
          className="bg-rose-900/80 hover:bg-rose-900 text-white border border-rose-300/30 shrink-0 h-8"
        >
          <Square className="w-3.5 h-3.5 mr-1.5" aria-hidden="true" />
          Arrêter l&apos;impersonation
        </Button>
      </div>
    </div>
  );
}
