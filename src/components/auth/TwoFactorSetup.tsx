'use client';

// ══════════════════════════════════════════════════════════════════════════════
// TwoFactorSetup — P4.7 2FA setup wizard (any admin/staff role)
// ══════════════════════════════════════════════════════════════════════════════
//
// 3-step modal wizard that walks the user through enabling TOTP-based 2FA:
//   Step 1 — Scan QR (or copy manual secret) into authenticator app.
//   Step 2 — Enter a 6-digit TOTP code to confirm the secret was scanned.
//   Step 3 — Save the 8 one-time backup codes (download + checkbox).
//
// Endpoints called (all generic P4.7 — work for ANY admin/staff role):
//   POST /api/auth/2fa/setup    → returns { secret, otpauthUrl, qrCodeDataUrl }
//   POST /api/auth/2fa/verify   → body { token }, returns { backupCodes }
//
// Props:
//   - open / onOpenChange: standard shadcn Dialog control.
//   - onSuccess: optional callback fired after step 3 closes (parent can
//     refetch the user's 2FA status to refresh the security panel UI).
//
// French UI copy throughout (matches the rest of the admin/security panel).

import { useState, useEffect, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  ShieldCheck,
  QrCode,
  Loader2,
  Copy,
  Download,
  Check,
  AlertTriangle,
  KeyRound,
} from 'lucide-react';
import { toast } from 'sonner';

type Step = 'qr' | 'verify' | 'backup';

interface SetupResponse {
  secret: string;
  otpauthUrl: string;
  qrCodeDataUrl: string;
}

interface VerifyResponse {
  enabled: boolean;
  backupCodes: string[];
  message: string;
}

interface TwoFactorSetupProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export default function TwoFactorSetup({ open, onOpenChange, onSuccess }: TwoFactorSetupProps) {
  const [step, setStep] = useState<Step>('qr');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Step 1 state
  const [setupData, setSetupData] = useState<SetupResponse | null>(null);
  const [copied, setCopied] = useState(false);

  // Step 2 state
  const [token, setToken] = useState('');

  // Step 3 state
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [savedAck, setSavedAck] = useState(false);

  // Reset state when dialog opens.
  useEffect(() => {
    if (open) {
      setStep('qr');
      setError(null);
      setSetupData(null);
      setToken('');
      setBackupCodes([]);
      setSavedAck(false);
      setCopied(false);
      // Kick off setup immediately on open.
      void startSetup();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const startSetup = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/2fa/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({}),
      });
      const data = (await res.json().catch(() => ({}))) as SetupResponse & { error?: string };
      if (!res.ok) {
        throw new Error(data.error || 'Échec de l\'initialisation de la 2FA');
      }
      setSetupData(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur inconnue');
    } finally {
      setLoading(false);
    }
  }, []);

  const handleCopySecret = async () => {
    if (!setupData) return;
    try {
      await navigator.clipboard.writeText(setupData.secret);
      setCopied(true);
      toast.success('Secret copié dans le presse-papiers');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Impossible de copier le secret');
    }
  };

  const handleVerify = async () => {
    if (!/^\d{6}$/.test(token)) {
      setError('Le code doit comporter 6 chiffres');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/2fa/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ token }),
      });
      const data = (await res.json().catch(() => ({}))) as VerifyResponse & { error?: string };
      if (!res.ok) {
        throw new Error(data.error || 'Code TOTP invalide');
      }
      setBackupCodes(data.backupCodes || []);
      setStep('backup');
      toast.success('2FA activée avec succès');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur inconnue');
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadBackupCodes = () => {
    if (backupCodes.length === 0) return;
    const lines = [
      '# Codes de secours 2FA — Heureux Mariage',
      '# Conservez ce fichier dans un endroit sûr.',
      '# Chaque code ne peut être utilisé qu\'une seule fois.',
      '# Date de génération : ' + new Date().toISOString(),
      '',
      ...backupCodes,
    ].join('\n');
    const blob = new Blob([lines], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'codes-secours-2fa.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success('Codes de secours téléchargés');
  };

  const handleClose = () => {
    if (step === 'backup') {
      // 2FA was just enabled — notify parent.
      onSuccess?.();
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="size-5" />
            Authentification à deux facteurs
          </DialogTitle>
          <DialogDescription>
            {step === 'qr' && 'Étape 1 sur 3 — Scannez le QR code avec votre application d\'authentification.'}
            {step === 'verify' && 'Étape 2 sur 3 — Saisissez le code à 6 chiffres affiché par votre application.'}
            {step === 'backup' && 'Étape 3 sur 3 — Enregistrez vos codes de secours.'}
          </DialogDescription>
        </DialogHeader>

        {/* ─── Step 1: QR code + manual secret ─────────────────────────── */}
        {step === 'qr' && (
          <div className="space-y-4">
            {loading && !setupData && (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="size-6 animate-spin text-muted-foreground" />
              </div>
            )}
            {setupData && (
              <>
                <div className="flex flex-col items-center gap-3">
                  <div className="rounded-lg border bg-white p-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={setupData.qrCodeDataUrl}
                      alt="QR code 2FA"
                      width={200}
                      height={200}
                      className="size-[200px]"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground text-center">
                    Scannez avec Google Authenticator, Authy, 1Password ou tout autre
                    application compatible TOTP.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">
                    Ou saisissez ce secret manuellement :
                  </Label>
                  <div className="flex items-center gap-2">
                    <Input
                      readOnly
                      value={setupData.secret}
                      className="font-mono text-xs"
                      onClick={(e) => (e.target as HTMLInputElement).select()}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={handleCopySecret}
                      title="Copier le secret"
                    >
                      {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
                    </Button>
                  </div>
                </div>
              </>
            )}

            {error && (
              <Alert variant="destructive">
                <AlertTriangle className="size-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
                Annuler
              </Button>
              <Button
                onClick={() => {
                  setError(null);
                  setStep('verify');
                }}
                disabled={!setupData || loading}
              >
                <QrCode className="size-4" />
                J&apos;ai scanné le code
              </Button>
            </DialogFooter>
          </div>
        )}

        {/* ─── Step 2: Verify 6-digit TOTP code ───────────────────────── */}
        {step === 'verify' && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="2fa-token">Code à 6 chiffres</Label>
              <Input
                id="2fa-token"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                placeholder="123456"
                value={token}
                onChange={(e) => {
                  const v = e.target.value.replace(/\D/g, '').slice(0, 6);
                  setToken(v);
                  setError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && token.length === 6) {
                    void handleVerify();
                  }
                }}
                className="text-center text-2xl font-mono tracking-[0.5em]"
              />
              <p className="text-xs text-muted-foreground">
                Ouvrez votre application d&apos;authentification et saisissez le code actuel.
              </p>
            </div>

            {error && (
              <Alert variant="destructive">
                <AlertTriangle className="size-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => setStep('qr')} disabled={loading}>
                Retour
              </Button>
              <Button onClick={handleVerify} disabled={loading || token.length !== 6}>
                {loading ? <Loader2 className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />}
                Vérifier et activer
              </Button>
            </DialogFooter>
          </div>
        )}

        {/* ─── Step 3: Backup codes ───────────────────────────────────── */}
        {step === 'backup' && (
          <div className="space-y-4">
            <Alert>
              <KeyRound className="size-4" />
              <AlertTitle>Conservez ces codes en lieu sûr</AlertTitle>
              <AlertDescription>
                Ces codes à usage unique vous permettent d&apos;accéder à votre compte si vous
                perdez votre téléphone. Chaque code ne peut être utilisé qu&apos;une seule fois.
                Ils ne seront plus jamais affichés.
              </AlertDescription>
            </Alert>

            <div className="rounded-lg border bg-muted/40 p-4">
              <div className="grid grid-cols-2 gap-2 font-mono text-sm">
                {backupCodes.map((code, i) => (
                  <div key={i} className="text-center font-semibold tracking-wider">
                    {code}
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Button variant="outline" size="sm" onClick={handleDownloadBackupCodes}>
                <Download className="size-4" />
                Télécharger
              </Button>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <Checkbox
                  checked={savedAck}
                  onCheckedChange={(v) => setSavedAck(v === true)}
                />
                J&apos;ai enregistré ces codes en lieu sûr
              </label>
            </div>

            <DialogFooter>
              <Button onClick={handleClose} disabled={!savedAck}>
                <Check className="size-4" />
                Terminer
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
