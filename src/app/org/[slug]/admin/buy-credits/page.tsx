// ══════════════════════════════════════════════════════════════════════════════
// /org/[slug]/admin/buy-credits/page.tsx — Mission 6.0 P2.7
// ══════════════════════════════════════════════════════════════════════════════
//
// Buy-credits UI for org admins. Displays:
//   1. Current credit balances per type (INVITATION / SMS / WHATSAPP / QR /
//      EXPORT) — balance, reserved, available, lifetime consumed.
//   2. A grid of 6 credit packs (from STRIPE_CONFIG.creditPacks) with
//      computed prices. Each card has an "Acheter" button → POST
//      /api/stripe/checkout → redirect to Stripe Checkout.
//   3. A "Gérer mes paiements" button → POST /api/stripe/portal → redirect
//      to Stripe Billing Portal (admin-only).
//   4. A "Stripe non configuré" banner if isStripeConfigured() returns false.
//
// On success URL (?status=success) the page shows a green banner + reloads
// balances after 2s (the webhook provisions credits asynchronously).

'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import {
  ArrowLeft,
  CreditCard,
  Loader2,
  CheckCircle2,
  XCircle,
  Sparkles,
  Mail,
  MessageSquare,
  Smartphone,
  QrCode,
  FileDown,
  AlertCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

// ─── Types ────────────────────────────────────────────────────────────────────

interface CreditBalance {
  type: string;
  balance: number;
  reserved: number;
  available: number;
  lifetimePurchased: number;
  lifetimeConsumed: number;
}

interface CreditPack {
  id: string;
  type: string;
  quantity: number;
  label: string;
  priceUsdCents: number;
  organizationId: string;
}

interface CreditsResponse {
  orgName: string;
  stripeConfigured: boolean;
  balances: CreditBalance[];
  packs: CreditPack[];
  primaryWeddingId: string | null;
  stripeCustomerId: string | null;
}

// ─── Credit type metadata (icon + label) ──────────────────────────────────────

const CREDIT_META: Record<
  string,
  { label: string; icon: React.ReactNode; color: string }
> = {
  INVITATION: {
    label: 'Invitations',
    icon: <Mail className="w-4 h-4" />,
    color: 'text-blue-400',
  },
  SMS: {
    label: 'SMS',
    icon: <MessageSquare className="w-4 h-4" />,
    color: 'text-emerald-400',
  },
  WHATSAPP: {
    label: 'WhatsApp',
    icon: <Smartphone className="w-4 h-4" />,
    color: 'text-green-400',
  },
  QR: {
    label: 'QR codes',
    icon: <QrCode className="w-4 h-4" />,
    color: 'text-purple-400',
  },
  EXPORT: {
    label: 'Exports',
    icon: <FileDown className="w-4 h-4" />,
    color: 'text-amber-400',
  },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatUsd(cents: number): string {
  if (cents === 0) return 'Gratuit';
  return `$${(cents / 100).toFixed(2)}`;
}

function formatNumber(n: number): string {
  return new Intl.NumberFormat('fr-FR').format(n);
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function BuyCreditsPage() {
  const params = useParams<{ slug: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [data, setData] = useState<CreditsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState<string | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);
  const [status, setStatus] = useState<'success' | 'cancelled' | null>(null);

  const loadBalances = useCallback(async () => {
    try {
      const res = await fetch(`/api/org/${params.slug}/credits`, {
        credentials: 'include',
      });
      if (!res.ok) {
        if (res.status === 403) {
          toast.error(
            "Accès refusé — vous n'êtes pas membre de cette organisation",
          );
          router.replace(`/org/${params.slug}/admin`);
          return;
        }
        throw new Error('Failed to load balances');
      }
      const json = await res.json();
      setData(json);
    } catch (err) {
      toast.error('Erreur lors du chargement des crédits');
    } finally {
      setLoading(false);
    }
  }, [params.slug, router]);

  useEffect(() => {
    loadBalances();
  }, [loadBalances]);

  useEffect(() => {
    const s = searchParams.get('status');
    if (s === 'success') {
      setStatus('success');
      toast.success('Paiement réussi ! Vos crédits sont en cours d’ajout.');
      // Reload balances after 2s + 6s (webhook may take a moment to fire + provision)
      setTimeout(() => loadBalances(), 2000);
      setTimeout(() => loadBalances(), 6000);
    } else if (s === 'cancelled') {
      setStatus('cancelled');
      toast.info('Paiement annulé');
    }
  }, [searchParams, loadBalances]);

  const handleBuyPack = async (pack: CreditPack) => {
    setPurchasing(pack.id);
    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          organizationId: pack.organizationId,
          creditType: pack.type,
          packId: pack.id,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(
          (err as { error?: string }).error ||
            'Échec de la création de la session Stripe',
        );
      }
      const { url } = (await res.json()) as { url: string };
      // Full-page redirect to Stripe Checkout (Stripe requires top-level nav)
      window.location.href = url;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur inconnue');
      setPurchasing(null);
    }
  };

  const handleOpenPortal = async () => {
    if (!data?.packs[0]?.organizationId) return;
    setPortalLoading(true);
    try {
      const res = await fetch('/api/stripe/portal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          organizationId: data.packs[0].organizationId,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(
          (err as { error?: string }).error ||
            'Échec de la création de la session portail',
        );
      }
      const { url } = (await res.json()) as { url: string };
      window.location.href = url;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setPortalLoading(false);
    }
  };

  // ─── Loading skeleton ──────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-[calc(100vh-3.5rem)] md:min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <Loader2 className="w-8 h-8 animate-spin text-gold" />
          <p className="text-sm">Chargement des crédits…</p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-[calc(100vh-3.5rem)] md:min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-sm text-muted-foreground mb-4">
            Impossible de charger les crédits.
          </p>
          <Button variant="outline" onClick={() => loadBalances()}>
            Réessayer
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-3.5rem)] md:min-h-screen pb-16">
      <div className="max-w-7xl mx-auto px-4 md:px-8 py-8">
        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              className="shrink-0"
              onClick={() => router.push(`/org/${params.slug}/admin`)}
              aria-label="Retour"
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div>
              <h1 className="text-2xl md:text-3xl font-display font-bold gold-gradient">
                Acheter des crédits
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                {data.orgName} · Approvisionnez votre compte en invitations, SMS,
                WhatsApp et exports
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            onClick={handleOpenPortal}
            disabled={portalLoading || !data.stripeCustomerId}
            className="shrink-0"
          >
            {portalLoading ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <CreditCard className="w-4 h-4 mr-2" />
            )}
            Gérer mes paiements
          </Button>
        </div>

        {/* ── Status banner ──────────────────────────────────────────────── */}
        {status === 'success' && (
          <Card className="mb-6 p-4 border-emerald-500/30 bg-emerald-500/10">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-medium text-emerald-300">Paiement réussi !</p>
                <p className="text-sm text-emerald-400/80 mt-0.5">
                  Vos crédits sont en cours d&rsquo;ajout. Le solde ci-dessous se
                  mettra à jour automatiquement dans quelques secondes.
                </p>
              </div>
              <button
                onClick={() => setStatus(null)}
                className="text-emerald-400/60 hover:text-emerald-300 text-xs"
              >
                Fermer
              </button>
            </div>
          </Card>
        )}
        {status === 'cancelled' && (
          <Card className="mb-6 p-4 border-amber-500/30 bg-amber-500/10">
            <div className="flex items-start gap-3">
              <XCircle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-medium text-amber-300">Paiement annulé</p>
                <p className="text-sm text-amber-400/80 mt-0.5">
                  Vous pouvez réessayer à tout moment — aucun montant
                  n&rsquo;a été débité.
                </p>
              </div>
              <button
                onClick={() => setStatus(null)}
                className="text-amber-400/60 hover:text-amber-300 text-xs"
              >
                Fermer
              </button>
            </div>
          </Card>
        )}

        {/* ── Stripe not configured banner ───────────────────────────────── */}
        {!data.stripeConfigured && (
          <Card className="mb-6 p-4 border-amber-500/40 bg-amber-500/5">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-medium text-amber-300">
                  Stripe non configuré
                </p>
                <p className="text-sm text-amber-400/80 mt-0.5">
                  Les paiements en ligne ne sont pas encore activés sur cette
                  plateforme. Contactez l&rsquo;équipe support pour acheter des
                  crédits.
                </p>
              </div>
            </div>
          </Card>
        )}

        {/* ── Current balances ───────────────────────────────────────────── */}
        <section className="mb-10">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-gold" />
            Vos crédits actuels
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            {data.balances.map((b) => {
              const meta = CREDIT_META[b.type] ?? {
                label: b.type,
                icon: <CreditCard className="w-4 h-4" />,
                color: 'text-muted-foreground',
              };
              return (
                <Card
                  key={b.type}
                  className="p-4 bg-white/[0.02] border-white/10"
                >
                  <div className="flex items-center gap-2 mb-3">
                    <span className={meta.color}>{meta.icon}</span>
                    <span className="text-sm font-medium text-muted-foreground">
                      {meta.label}
                    </span>
                  </div>
                  <div className="space-y-1">
                    <p className="text-2xl font-bold gold-gradient font-display">
                      {formatNumber(b.available)}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      disponibles
                    </p>
                  </div>
                  <div className="mt-3 pt-3 border-t border-white/5 space-y-1 text-[11px] text-muted-foreground">
                    <div className="flex justify-between">
                      <span>Réservés</span>
                      <span className="text-foreground/80">
                        {formatNumber(b.reserved)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Consommés (cumul)</span>
                      <span className="text-foreground/80">
                        {formatNumber(b.lifetimeConsumed)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Achetés (cumul)</span>
                      <span className="text-foreground/80">
                        {formatNumber(b.lifetimePurchased)}
                      </span>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        </section>

        {/* ── Credit packs grid ──────────────────────────────────────────── */}
        <section className="mb-10">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <CreditCard className="w-5 h-5 text-gold" />
              Packs disponibles
            </h2>
            <Badge
              variant="outline"
              className="text-[10px] uppercase tracking-wide"
            >
              Paiement sécurisé · Stripe
            </Badge>
          </div>

          {data.packs.length === 0 ? (
            <Card className="p-8 text-center text-muted-foreground">
              Aucun pack disponible pour le moment.
            </Card>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {data.packs.map((pack) => {
                const meta = CREDIT_META[pack.type] ?? {
                  label: pack.type,
                  icon: <CreditCard className="w-4 h-4" />,
                  color: 'text-muted-foreground',
                };
                const unitPrice = pack.priceUsdCents / pack.quantity;
                const isPurchasing = purchasing === pack.id;
                return (
                  <Card
                    key={pack.id}
                    className="p-5 bg-white/[0.02] border-white/10 hover:border-gold/40 hover:bg-white/[0.04] transition-all flex flex-col"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <span className={meta.color}>{meta.icon}</span>
                        <Badge
                          variant="outline"
                          className="text-[10px] uppercase tracking-wide bg-white/5"
                        >
                          {meta.label}
                        </Badge>
                      </div>
                      <span className="text-2xl font-bold gold-gradient font-display">
                        {formatNumber(pack.quantity)}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground mb-1">
                      {pack.label}
                    </p>
                    <p className="text-[11px] text-muted-foreground/70 mb-4">
                      Soit {formatUsd(unitPrice)} / unité
                    </p>
                    <div className="mt-auto">
                      <div className="flex items-baseline gap-1 mb-3">
                        <span className="text-xl font-bold text-foreground">
                          {formatUsd(pack.priceUsdCents)}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          TTC
                        </span>
                      </div>
                      <Button
                        className="w-full"
                        onClick={() => handleBuyPack(pack)}
                        disabled={
                          isPurchasing ||
                          purchasing !== null ||
                          !data.stripeConfigured
                        }
                      >
                        {isPurchasing ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Redirection…
                          </>
                        ) : (
                          <>
                            <CreditCard className="w-4 h-4 mr-2" />
                            Acheter
                          </>
                        )}
                      </Button>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </section>

        {/* ── Footer info ────────────────────────────────────────────────── */}
        <Card className="p-5 bg-white/[0.02] border-white/10">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-muted-foreground shrink-0 mt-0.5" />
            <div className="text-sm text-muted-foreground space-y-1">
              <p>
                Les crédits achetés sont valables sans limite de durée et
                disponibles pour tous les mariages de votre organisation.
              </p>
              <p>
                Pour acheter une quantité personnalisée ou régler par virement,
                contactez l&rsquo;équipe support. Pour gérer vos moyens de
                paiement enregistrés, utilisez le bouton{' '}
                <span className="text-foreground font-medium">
                  Gérer mes paiements
                </span>{' '}
                en haut de page.
              </p>
            </div>
          </div>
        </Card>

        {/* ── Back to dashboard link ─────────────────────────────────────── */}
        <div className="mt-8 text-center">
          <Link
            href={`/org/${params.slug}/admin`}
            className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Retour au tableau de bord
          </Link>
        </div>
      </div>
    </div>
  );
}
