// ══════════════════════════════════════════════════════════════════════════════
// /w/[slug]/invite/[code]/page.tsx — Phase 2 Invitation Auto-Auth Page
// ══════════════════════════════════════════════════════════════════════════════
// Receives an encrypted invitation link token (from QR code or SMS link),
// validates it via /api/guest/invite (with X-Wedding-Slug header so the
// guest is looked up ONLY in this wedding), and redirects to the wedding
// landing page on success.

'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertCircle, Loader2, CheckCircle2 } from 'lucide-react';
import { useWedding, useTenantFetch } from '../../wedding-context';

export default function InviteLandingPage({ params }: { params: Promise<{ code: string }> }) {
  const wedding = useWedding();
  const tenantFetch = useTenantFetch();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [guestName, setGuestName] = useState<string | null>(null);
  const [code, setCode] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { code: token } = await params;
      if (cancelled) return;
      setCode(token);

      try {
        const res = await tenantFetch(`/api/guest/invite?token=${encodeURIComponent(token)}`);
        const data = await res.json();
        if (cancelled) return;

        if (data.success && data.authenticated && data.guest) {
          setStatus('success');
          setGuestName(data.guest.displayName || `${data.guest.firstName} ${data.guest.lastName}`);
          // Redirect to the wedding page after a short delay
          setTimeout(() => {
            window.location.href = `/w/${wedding.slug}`;
          }, 1500);
        } else {
          setStatus('error');
          setError(data.error || 'Cette invitation est privée et exclusivement réservée à son titulaire.');
        }
      } catch (err) {
        if (cancelled) return;
        setStatus('error');
        setError('Erreur réseau. Veuillez réessayer.');
        console.error('Invite landing error:', err);
      }
    })();
    return () => { cancelled = true; };
  }, [wedding.slug, tenantFetch, params]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-stone-50 to-amber-50/40 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white/80 backdrop-blur-sm rounded-2xl shadow-xl border border-amber-100 p-8 text-center space-y-4">
        {status === 'loading' && (
          <>
            <Loader2 className="w-12 h-12 mx-auto text-amber-700 animate-spin" />
            <h1 className="font-serif text-2xl text-stone-800">Validation de votre invitation...</h1>
            <p className="text-stone-500 text-sm">
              Mariage de <strong>{wedding.coupleLabel}</strong>
            </p>
          </>
        )}

        {status === 'success' && (
          <>
            <CheckCircle2 className="w-12 h-12 mx-auto text-emerald-600" />
            <h1 className="font-serif text-2xl text-stone-800">Bienvenue {guestName} !</h1>
            <p className="text-stone-600">
              Votre invitation a été validée. Vous allez être redirigé vers votre espace personnel...
            </p>
            <div className="pt-2">
              <Link
                href={`/w/${wedding.slug}`}
                className="inline-flex items-center gap-2 bg-gradient-gold text-white px-6 py-2.5 rounded-full shadow-md hover:shadow-lg transition-shadow font-medium"
              >
                Continuer
              </Link>
            </div>
          </>
        )}

        {status === 'error' && (
          <>
            <AlertCircle className="w-12 h-12 mx-auto text-rose-600" />
            <h1 className="font-serif text-2xl text-stone-800">Invitation invalide</h1>
            <p className="text-stone-600 text-sm">{error}</p>
            <div className="pt-2">
              <Link
                href={`/w/${wedding.slug}`}
                className="inline-flex items-center gap-2 bg-stone-800 text-white px-6 py-2.5 rounded-full hover:bg-stone-700 transition-colors text-sm"
              >
                Retour à l'accueil
              </Link>
            </div>
          </>
        )}

        {code && (
          <p className="text-xs text-stone-400 pt-4 border-t border-stone-200 mt-4">
            Token: <code className="bg-stone-100 px-1.5 py-0.5 rounded">{code.substring(0, 16)}...</code>
          </p>
        )}
      </div>
    </div>
  );
}
