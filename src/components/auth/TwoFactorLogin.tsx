'use client';

// ══════════════════════════════════════════════════════════════════════════════
// TwoFactorLogin — P4.7 2FA login challenge (any admin/staff role)
// ══════════════════════════════════════════════════════════════════════════════
//
// Second step of the 2FA login flow. Rendered by the login page after
// `/api/admin/login` (or `/api/platform/login`) returns
// `{ requiresTwoFactor: true, challengeToken, email, name }`.
//
// UI:
//   - 6 separate Input boxes for the 6-digit TOTP code, with auto-advance
//     on input + Backspace navigation back to the previous box.
//   - "Utiliser un code de secours" Switch — toggles to a single 9-char
//     input (xxxx-xxxx format) for backup-code login.
//   - Submit button + loading state.
//   - Cancel button to return to the email/password step.
//
// Endpoint called:
//   POST /api/auth/2fa/login → body { challengeToken, token } | { challengeToken, backupCode }
//   Returns { user, csrfToken } on success (sets auth_token + csrf_token cookies).
//
// Props:
//   - challengeToken: JWT issued by the login endpoint (5-min expiry).
//   - email / name: optional personalization ("Entrez le code pour {email}").
//   - onSuccess: called with the authenticated user object after a successful
//     2FA login (parent typically redirects to the admin dashboard).
//   - onCancel: called when the user clicks "Annuler" — parent returns to
//     the email/password login form.

import { useState, useRef, useCallback, type KeyboardEvent, type ChangeEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ShieldCheck, Loader2, AlertTriangle, KeyRound } from 'lucide-react';

interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: string;
  weddingId?: string | null;
  organizationId?: string | null;
}

interface TwoFactorLoginProps {
  challengeToken: string;
  email?: string;
  name?: string;
  onSuccess: (user: AuthUser) => void;
  onCancel?: () => void;
}

const CODE_LENGTH = 6;

export default function TwoFactorLogin({
  challengeToken,
  email,
  name,
  onSuccess,
  onCancel,
}: TwoFactorLoginProps) {
  // TOTP code state — array of 6 single-digit strings.
  const [digits, setDigits] = useState<string[]>(Array(CODE_LENGTH).fill(''));
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Backup code state — single string "xxxx-xxxx".
  const [backupCode, setBackupCode] = useState('');
  const [useBackup, setUseBackup] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ─── TOTP digit handlers ────────────────────────────────────────────────
  const focusDigit = (idx: number) => {
    const ref = inputRefs.current[idx];
    if (ref) {
      ref.focus();
      ref.select();
    }
  };

  const handleDigitChange = (idx: number, e: ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/\D/g, '');
    if (raw.length === 0) {
      // Cleared
      setDigits((prev) => {
        const next = [...prev];
        next[idx] = '';
        return next;
      });
      return;
    }
    // Handle paste / multi-char entry: take the LAST digit typed (or all
    // digits if a paste of 6 chars landed in one box).
    if (raw.length >= CODE_LENGTH) {
      // Likely a paste of the full code — distribute across boxes.
      const full = raw.slice(0, CODE_LENGTH).split('');
      setDigits(full);
      focusDigit(CODE_LENGTH - 1);
      return;
    }
    // Single digit (or two-digit fast type) — take the last one.
    const newDigit = raw[raw.length - 1];
    setDigits((prev) => {
      const next = [...prev];
      next[idx] = newDigit;
      return next;
    });
    // Auto-advance to next box.
    if (idx < CODE_LENGTH - 1) {
      focusDigit(idx + 1);
    }
  };

  const handleDigitKeyDown = (idx: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      if (digits[idx]) {
        // Current box has a digit — clear it (stay on this box).
        setDigits((prev) => {
          const next = [...prev];
          next[idx] = '';
          return next;
        });
      } else if (idx > 0) {
        // Current box is empty — move back + clear the previous one.
        focusDigit(idx - 1);
        setDigits((prev) => {
          const next = [...prev];
          next[idx - 1] = '';
          return next;
        });
      }
      e.preventDefault();
    } else if (e.key === 'ArrowLeft' && idx > 0) {
      focusDigit(idx - 1);
      e.preventDefault();
    } else if (e.key === 'ArrowRight' && idx < CODE_LENGTH - 1) {
      focusDigit(idx + 1);
      e.preventDefault();
    } else if (e.key === 'Enter') {
      const fullCode = digits.join('');
      if (/^\d{6}$/.test(fullCode)) {
        void handleSubmit();
      }
    }
  };

  const handleDigitPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, CODE_LENGTH);
    if (pasted.length > 0) {
      e.preventDefault();
      const next = pasted.split('');
      while (next.length < CODE_LENGTH) next.push('');
      setDigits(next.slice(0, CODE_LENGTH).map((d) => d || ''));
      focusDigit(Math.min(pasted.length, CODE_LENGTH) - 1);
    }
  };

  // ─── Backup code handler ────────────────────────────────────────────────
  const handleBackupCodeChange = (e: ChangeEvent<HTMLInputElement>) => {
    // Allow only hex chars + dash; auto-insert dash after 4 chars.
    let v = e.target.value.toLowerCase().replace(/[^a-f0-9-]/g, '');
    // Strip existing dashes, then re-add at position 4.
    v = v.replace(/-/g, '');
    if (v.length > 4) {
      v = v.slice(0, 4) + '-' + v.slice(4, 8);
    } else if (v.length === 4 && !e.target.value.endsWith('-')) {
      // Auto-add dash when user types the 4th char.
      v = v + '-';
    }
    setBackupCode(v.slice(0, 9));
    setError(null);
  };

  // ─── Submit ─────────────────────────────────────────────────────────────
  const handleSubmit = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const body: Record<string, string> = { challengeToken };
      if (useBackup) {
        if (!/^[a-f0-9]{4}-[a-f0-9]{4}$/.test(backupCode)) {
          setError('Code de secours invalide (format attendu : xxxx-xxxx)');
          setLoading(false);
          return;
        }
        body.backupCode = backupCode;
      } else {
        const code = digits.join('');
        if (!/^\d{6}$/.test(code)) {
          setError('Veuillez saisir les 6 chiffres');
          setLoading(false);
          return;
        }
        body.token = code;
      }

      const res = await fetch('/api/auth/2fa/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as { user?: AuthUser; error?: string };
      if (!res.ok || !data.user) {
        throw new Error(data.error || 'Code invalide');
      }
      onSuccess(data.user);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur inconnue');
      // Clear digits on failure to encourage re-entry.
      if (!useBackup) {
        setDigits(Array(CODE_LENGTH).fill(''));
        focusDigit(0);
      }
    } finally {
      setLoading(false);
    }
  }, [challengeToken, digits, backupCode, useBackup, onSuccess]);

  // ─── Render ─────────────────────────────────────────────────────────────
  const totpComplete = digits.every((d) => d !== '');
  const backupComplete = /^[a-f0-9]{4}-[a-f0-9]{4}$/.test(backupCode);
  const canSubmit = useBackup ? backupComplete : totpComplete;

  return (
    <div className="space-y-5">
      <div className="text-center space-y-1">
        <div className="inline-flex items-center justify-center size-12 rounded-full bg-primary/10 mb-2">
          <ShieldCheck className="size-6 text-primary" />
        </div>
        <h2 className="text-lg font-semibold">Authentification à deux facteurs</h2>
        <p className="text-sm text-muted-foreground">
          {name ? `Bonjour ${name}, ` : ''}
          saisissez le code généré par votre application d&apos;authentification
          {email ? ` pour ${email}` : ''}.
        </p>
      </div>

      {/* ─── TOTP code input (6 boxes) ─────────────────────────────────── */}
      {!useBackup && (
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground text-center block">
            Code à 6 chiffres
          </Label>
          <div className="flex items-center justify-center gap-2">
            {Array.from({ length: CODE_LENGTH }).map((_, idx) => (
              <Input
                key={idx}
                ref={(el) => {
                  inputRefs.current[idx] = el;
                }}
                type="text"
                inputMode="numeric"
                autoComplete={idx === 0 ? 'one-time-code' : 'off'}
                maxLength={1}
                value={digits[idx]}
                onChange={(e) => handleDigitChange(idx, e)}
                onKeyDown={(e) => handleDigitKeyDown(idx, e)}
                onPaste={handleDigitPaste}
                onFocus={(e) => e.target.select()}
                disabled={loading}
                className="size-12 text-center text-2xl font-mono p-0"
                aria-label={`Chiffre ${idx + 1}`}
              />
            ))}
          </div>
        </div>
      )}

      {/* ─── Backup code input ─────────────────────────────────────────── */}
      {useBackup && (
        <div className="space-y-2">
          <Label htmlFor="2fa-backup-code" className="text-xs text-muted-foreground">
            Code de secours (8 caractères)
          </Label>
          <Input
            id="2fa-backup-code"
            type="text"
            inputMode="text"
            autoComplete="off"
            placeholder="xxxx-xxxx"
            value={backupCode}
            onChange={handleBackupCodeChange}
            disabled={loading}
            className="text-center text-xl font-mono tracking-[0.3em]"
            maxLength={9}
          />
          <p className="text-xs text-muted-foreground">
            Un code de secours ne peut être utilisé qu&apos;une seule fois.
          </p>
        </div>
      )}

      {/* ─── Error ─────────────────────────────────────────────────────── */}
      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="size-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* ─── Backup toggle ─────────────────────────────────────────────── */}
      <div className="flex items-center justify-center gap-2 text-sm">
        <KeyRound className="size-4 text-muted-foreground" />
        <span className="text-muted-foreground">Utiliser un code de secours</span>
        <Switch
          checked={useBackup}
          onCheckedChange={(v) => {
            setUseBackup(v);
            setError(null);
          }}
          disabled={loading}
        />
      </div>

      {/* ─── Actions ───────────────────────────────────────────────────── */}
      <div className="flex gap-2">
        {onCancel && (
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={loading}
            className="flex-1"
          >
            Annuler
          </Button>
        )}
        <Button
          type="button"
          onClick={handleSubmit}
          disabled={loading || !canSubmit}
          className="flex-1"
        >
          {loading ? <Loader2 className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />}
          Vérifier
        </Button>
      </div>
    </div>
  );
}
