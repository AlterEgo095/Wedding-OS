'use client';

// ══════════════════════════════════════════════════════════════════════════════
// OrgDashboard — client island for the org admin home page
// ══════════════════════════════════════════════════════════════════════════════
//
// Receives all data as props (the server component fetched it). Renders:
//   1. Org header (logo, name, plan badge, status badge)
//   2. Stat cards (Total weddings / Total guests / Total members / Active invitations)
//   3. Quick action: "Créer un mariage" button → /org/[slug]/admin/weddings/new
//      (P1.9 will implement the actual onboarding flow; for now this is a
//      placeholder link.)
//   4. Wedding table (couple name, slug, status, plan, date, guests, actions)
//   5. Recent activity (last 5 audit log entries)

import { useMemo, useState, useEffect } from 'react';
import Link from 'next/link';
import { Building2, Heart, Users, Mail, Calendar, Plus, ExternalLink, Pencil, Search, Gauge, ShieldCheck } from 'lucide-react';
import TwoFactorSetup from '@/components/auth/TwoFactorSetup';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  STATUS_LABELS,
  STATUS_BADGE_CLASS,
  PLAN_LABELS,
  PLAN_BADGE_CLASS,
} from '@/lib/ui-labels';
import type { Plan, WeddingStatus } from '@/lib/types';

// ─── Org-status labels + badge classes (Organization.status is
// ACTIVE/SUSPENDED/ARCHIVED, distinct from WeddingStatus). Inline map to
// avoid coupling to the wedding-only STATUS_LABELS. ───────────────────────────
const ORG_STATUS_LABELS: Record<string, string> = {
  ACTIVE: 'Actif',
  SUSPENDED: 'Suspendu',
  ARCHIVED: 'Archivé',
};
const ORG_STATUS_BADGE_CLASS: Record<string, string> = {
  ACTIVE: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  SUSPENDED: 'bg-red-500/15 text-red-400 border-red-500/30',
  ARCHIVED: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30',
};

// ─── Types (serializable — passed from the Server Component) ──────────────────

export interface DashboardOrg {
  id: string;
  slug: string;
  name: string;
  email: string;
  phone: string | null;
  logoUrl: string | null;
  brandColor: string | null;
  customDomain: string | null;
  status: string;
  plan: string;
  maxWeddings: number;
  maxMembers: number;
  description: string | null;
  websiteUrl: string | null;
  address: string | null;
}

export interface DashboardUser {
  id: string;
  email: string;
  name: string;
  role: string;
}

export interface DashboardWedding {
  id: string;
  slug: string;
  coupleLabel: string;
  brideName: string;
  groomName: string;
  status: string;
  plan: string;
  weddingDate: string | null;
  venueCity: string | null;
  createdAt: string;
  _count: { guests: number; admins: number };
}

export interface DashboardActivity {
  id: string;
  action: string;
  details: string | null;
  createdAt: string;
  user: { name: string; email: string; role: string | null } | null;
  wedding: { slug: string; coupleLabel: string } | null;
}

export interface OrgDashboardProps {
  org: DashboardOrg;
  user: DashboardUser;
  weddings: DashboardWedding[];
  stats: {
    totalWeddings: number;
    totalGuests: number;
    totalMembers: number;
    activeInvitations: number;
  };
  recentActivity: DashboardActivity[];
}

// ─── Component ────────────────────────────────────────────────────────────────

export function OrgDashboard({
  org,
  user,
  weddings,
  stats,
  recentActivity,
}: OrgDashboardProps) {
  const [twoFactorOpen, setTwoFactorOpen] = useState(false)
  const [search, setSearch] = useState('');
  // P2.8 — quota status fetched on mount from /api/org/{slug}/quotas.
  // Falls back gracefully (null = loading/failed) — the StatCards above
  // still show the static `max` from server-rendered org data.
  const [quotaStatus, setQuotaStatus] = useState<{
    weddings: { current: number; limit: number };
    members: { current: number; limit: number };
    invitations: { current: number; limit: number; period: string };
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/org/${org.slug}/quotas`, {
          credentials: 'include',
        });
        if (!res.ok) return;
        const json = await res.json();
        if (!cancelled && json?.quotas) {
          setQuotaStatus({
            weddings: {
              current: json.quotas.weddings.current,
              limit: json.quotas.weddings.limit,
            },
            members: {
              current: json.quotas.members.current,
              limit: json.quotas.members.limit,
            },
            invitations: {
              current: json.quotas.invitations.current,
              limit: json.quotas.invitations.limit,
              period: json.quotas.invitations.period,
            },
          });
        }
      } catch {
        // Silent fail — quota card is a progressive enhancement.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [org.slug]);

  const filteredWeddings = useMemo(() => {
    if (!search.trim()) return weddings;
    const q = search.trim().toLowerCase();
    return weddings.filter(
      (w) =>
        w.coupleLabel.toLowerCase().includes(q) ||
        w.slug.toLowerCase().includes(q) ||
        w.brideName.toLowerCase().includes(q) ||
        w.groomName.toLowerCase().includes(q)
    );
  }, [weddings, search]);

  const planLabel = PLAN_LABELS[org.plan as Plan] || org.plan;
  const statusLabel = ORG_STATUS_LABELS[org.status] || org.status;
  const statusBadgeClass = ORG_STATUS_BADGE_CLASS[org.status] || '';

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-8">
      {/* ─── Org header ─────────────────────────────────────────────────── */}
      <header className="flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="w-16 h-16 rounded-2xl gold-border p-[2px] overflow-hidden bg-white/5 flex items-center justify-center shrink-0">
          {org.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={org.logoUrl} alt={org.name} className="w-full h-full rounded-2xl object-cover" />
          ) : (
            <Building2 className="w-8 h-8 text-gold" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold gold-gradient font-display tracking-wide">{org.name}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Espace organisation · <span className="text-foreground/80">{user.name}</span>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setTwoFactorOpen(true)}
            className="gap-1.5"
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            Sécurité 2FA
          </Button>
          <Badge variant="outline" className={`text-[10px] uppercase tracking-wide ${PLAN_BADGE_CLASS[org.plan as Plan] || ''}`}>
            {planLabel}
          </Badge>
          <Badge variant="outline" className={`text-[10px] uppercase tracking-wide ${statusBadgeClass}`}>
            {statusLabel}
          </Badge>
        </div>
      </header>

      {/* ─── Stat cards ─────────────────────────────────────────────────── */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard
          label="Mariages"
          value={stats.totalWeddings}
          sub={`${org.maxWeddings} max`}
          icon={<Heart className="w-5 h-5" />}
          accent="gold"
        />
        <StatCard
          label="Invités"
          value={stats.totalGuests}
          sub="tous mariages"
          icon={<Users className="w-5 h-5" />}
          accent="emerald"
        />
        <StatCard
          label="Membres"
          value={stats.totalMembers}
          sub={`${org.maxMembers} max`}
          icon={<Building2 className="w-5 h-5" />}
          accent="sky"
        />
        <StatCard
          label="Invitations actives"
          value={stats.activeInvitations}
          sub="envoyées / en cours"
          icon={<Mail className="w-5 h-5" />}
          accent="violet"
        />
      </section>

      {/* ─── P2.8: Quota progress card (progressive enhancement) ─────── */}
      {quotaStatus && (
        <QuotaCard quotas={quotaStatus} />
      )}

      {/* ─── Quick action ───────────────────────────────────────────────── */}
      <section className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Mariages de l&apos;organisation</h2>
          <p className="text-sm text-muted-foreground">
            {weddings.length} mariage{weddings.length > 1 ? 's' : ''} sous {org.name}
          </p>
        </div>
        <Button asChild className="bg-gradient-gold hover:opacity-90 text-white">
          <Link href={`/org/${org.slug}/admin/weddings/new`}>
            <Plus className="w-4 h-4 mr-2" />
            Créer un mariage
          </Link>
        </Button>
      </section>

      {/* ─── Wedding table ──────────────────────────────────────────────── */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Rechercher un mariage…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 bg-white/5 border-white/10"
            />
          </div>
        </div>

        {filteredWeddings.length === 0 ? (
          <EmptyWeddings org={org} hasAny={weddings.length > 0} />
        ) : (
          <WeddingTable weddings={filteredWeddings} />
        )}
      </section>

      {/* ─── Recent activity ────────────────────────────────────────────── */}
      <section>
        <h2 className="text-lg font-semibold mb-3">Activité récente</h2>
        {recentActivity.length === 0 ? (
          <div className="rounded-lg border border-white/10 bg-white/[0.02] p-6 text-center text-sm text-muted-foreground">
            Aucune activité récente à afficher.
          </div>
        ) : (
          <ul className="space-y-2">
            {recentActivity.map((entry) => (
              <ActivityRow key={entry.id} entry={entry} />
            ))}
          </ul>
        )}
      </section>

      {/* P4.7 — 2FA setup modal (accessible from the header) */}
      <TwoFactorSetup
        open={twoFactorOpen}
        onOpenChange={setTwoFactorOpen}
        onSuccess={() => {
          setTwoFactorOpen(false)
          toast.success('2FA activée avec succès')
        }}
      />
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  sub,
  icon,
  accent,
}: {
  label: string;
  value: number;
  sub: string;
  icon: React.ReactNode;
  accent: 'gold' | 'emerald' | 'sky' | 'violet';
}) {
  const accentMap = {
    gold: 'text-gold bg-gold/10 border-gold/30',
    emerald: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30',
    sky: 'text-sky-400 bg-sky-500/10 border-sky-500/30',
    violet: 'text-violet-400 bg-violet-500/10 border-violet-500/30',
  } as const;
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-xs uppercase tracking-wide text-muted-foreground">{label}</span>
        <span className={`w-8 h-8 rounded-lg flex items-center justify-center border ${accentMap[accent]}`}>
          {icon}
        </span>
      </div>
      <div className="text-3xl font-bold gold-gradient font-display">{value}</div>
      <div className="text-[11px] text-muted-foreground">{sub}</div>
    </div>
  );
}

// ─── P2.8: Quota progress card ────────────────────────────────────────────────
//
// Displays 3 horizontal progress bars (weddings / members / invitations-month)
// fetched from /api/org/{slug}/quotas. Rendered only when quotaStatus is loaded
// (progressive enhancement — failure leaves the dashboard fully functional).

interface QuotaBar {
  current: number;
  limit: number;
}

function QuotaCard({
  quotas,
}: {
  quotas: {
    weddings: QuotaBar;
    members: QuotaBar;
    invitations: QuotaBar & { period: string };
  };
}) {
  const rows: Array<{
    label: string;
    current: number;
    limit: number;
    suffix?: string;
  }> = [
    {
      label: 'Mariages',
      current: quotas.weddings.current,
      limit: quotas.weddings.limit,
    },
    {
      label: 'Membres',
      current: quotas.members.current,
      limit: quotas.members.limit,
    },
    {
      label: `Invitations (${quotas.invitations.period})`,
      current: quotas.invitations.current,
      limit: quotas.invitations.limit,
      suffix: ' ce mois',
    },
  ];

  return (
    <section className="rounded-xl border border-white/10 bg-white/[0.02] p-4 sm:p-5">
      <div className="flex items-center gap-2 mb-4">
        <Gauge className="w-4 h-4 text-gold" />
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Quotas organisation
        </h2>
      </div>
      <div className="space-y-3">
        {rows.map((r) => {
          const isUnlimited = r.limit < 0;
          const pct = isUnlimited
            ? 0
            : r.limit === 0
              ? 100
              : Math.min(100, Math.round((r.current / r.limit) * 100));
          const isWarn = !isUnlimited && r.limit > 0 && pct >= 80 && pct < 100;
          const isFull = !isUnlimited && r.limit >= 0 && r.current >= r.limit;
          const barColor = isFull
            ? 'bg-red-500'
            : isWarn
              ? 'bg-amber-500'
              : 'bg-gold';
          return (
            <div key={r.label}>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-muted-foreground">{r.label}</span>
                <span className={isFull ? 'text-red-400 font-medium' : 'text-foreground/80'}>
                  {r.current}
                  {isUnlimited ? ' / ∞' : ` / ${r.limit}`}
                  {r.suffix ? <span className="text-muted-foreground">{r.suffix}</span> : null}
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
                {isUnlimited ? (
                  <div className="h-full w-full bg-emerald-500/40" />
                ) : (
                  <div
                    className={`h-full ${barColor} transition-all`}
                    style={{ width: `${pct}%` }}
                  />
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function WeddingTable({ weddings }: { weddings: DashboardWedding[] }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] overflow-hidden">
      {/* Desktop table */}
      <table className="hidden md:table w-full text-sm">
        <thead>
          <tr className="border-b border-white/10 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <th className="px-4 py-3 font-medium">Couple</th>
            <th className="px-4 py-3 font-medium">Statut</th>
            <th className="px-4 py-3 font-medium">Plan</th>
            <th className="px-4 py-3 font-medium">Date</th>
            <th className="px-4 py-3 font-medium text-right">Invités</th>
            <th className="px-4 py-3 font-medium text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {weddings.map((w) => (
            <tr key={w.id} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
              <td className="px-4 py-3">
                <div className="font-medium text-foreground truncate max-w-xs">{w.coupleLabel}</div>
                <div className="text-[11px] text-muted-foreground">/w/{w.slug}</div>
              </td>
              <td className="px-4 py-3">
                <Badge variant="outline" className={`text-[10px] uppercase tracking-wide ${STATUS_BADGE_CLASS[w.status as WeddingStatus] || ''}`}>
                  {STATUS_LABELS[w.status as WeddingStatus] || w.status}
                </Badge>
              </td>
              <td className="px-4 py-3">
                <Badge variant="outline" className={`text-[10px] uppercase tracking-wide ${PLAN_BADGE_CLASS[w.plan as Plan] || ''}`}>
                  {PLAN_LABELS[w.plan as Plan] || w.plan}
                </Badge>
              </td>
              <td className="px-4 py-3 text-muted-foreground">
                {w.weddingDate ? formatDate(w.weddingDate) : <span className="text-xs italic">Non définie</span>}
              </td>
              <td className="px-4 py-3 text-right tabular-nums">{w._count.guests}</td>
              <td className="px-4 py-3">
                <div className="flex items-center justify-end gap-1">
                  <Button asChild variant="ghost" size="sm" className="h-8 text-xs">
                    <Link href={`/w/${w.slug}/admin`} target="_blank" rel="noopener">
                      <ExternalLink className="w-3.5 h-3.5 mr-1" />
                      Ouvrir
                    </Link>
                  </Button>
                  <Button asChild variant="ghost" size="sm" className="h-8 text-xs">
                    <Link href={`/w/${w.slug}/admin`}>
                      <Pencil className="w-3.5 h-3.5 mr-1" />
                      Gérer
                    </Link>
                  </Button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Mobile cards */}
      <ul className="md:hidden divide-y divide-white/5">
        {weddings.map((w) => (
          <li key={w.id} className="p-4 flex flex-col gap-2">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="font-medium text-foreground truncate">{w.coupleLabel}</div>
                <div className="text-[11px] text-muted-foreground">/w/{w.slug}</div>
              </div>
              <Badge variant="outline" className={`text-[10px] uppercase tracking-wide ${STATUS_BADGE_CLASS[w.status as WeddingStatus] || ''}`}>
                {STATUS_LABELS[w.status as WeddingStatus] || w.status}
              </Badge>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <Badge variant="outline" className={`text-[10px] uppercase tracking-wide ${PLAN_BADGE_CLASS[w.plan as Plan] || ''}`}>
                {PLAN_LABELS[w.plan as Plan] || w.plan}
              </Badge>
              {w.weddingDate && (
                <span className="flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  {formatDate(w.weddingDate)}
                </span>
              )}
              <span className="flex items-center gap-1">
                <Users className="w-3 h-3" />
                {w._count.guests} invités
              </span>
            </div>
            <div className="flex items-center gap-1 mt-1">
              <Button asChild variant="ghost" size="sm" className="h-8 text-xs flex-1">
                <Link href={`/w/${w.slug}/admin`}>
                  <ExternalLink className="w-3.5 h-3.5 mr-1" />
                  Ouvrir
                </Link>
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function EmptyWeddings({
  org,
  hasAny,
}: {
  org: DashboardOrg;
  hasAny: boolean;
}) {
  return (
    <div className="rounded-xl border border-dashed border-white/15 bg-white/[0.02] p-8 text-center">
      <Heart className="w-10 h-10 mx-auto text-muted-foreground/50 mb-3" />
      <p className="font-medium text-foreground">
        {hasAny ? 'Aucun mariage ne correspond à votre recherche.' : 'Aucun mariage pour le moment.'}
      </p>
      {!hasAny && (
        <p className="text-sm text-muted-foreground mt-1 mb-4">
          Créez votre premier mariage sous {org.name} pour commencer.
        </p>
      )}
      {!hasAny && (
        <Button asChild className="bg-gradient-gold hover:opacity-90 text-white">
          <Link href={`/org/${org.slug}/admin/weddings/new`}>
            <Plus className="w-4 h-4 mr-2" />
            Créer un mariage
          </Link>
        </Button>
      )}
    </div>
  );
}

function ActivityRow({ entry }: { entry: DashboardActivity }) {
  const actor = entry.user?.name || 'Système';
  const when = formatRelative(entry.createdAt);
  const weddingLabel = entry.wedding?.coupleLabel;
  return (
    <li className="rounded-lg border border-white/10 bg-white/[0.02] p-3 flex items-start gap-3">
      <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center text-[11px] font-bold text-gold shrink-0">
        {actor.charAt(0).toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-foreground/90">
          <span className="font-medium">{actor}</span>
          <span className="text-muted-foreground"> · {formatAction(entry.action)}</span>
        </p>
        {entry.details && (
          <p className="text-xs text-muted-foreground mt-0.5 truncate">{entry.details}</p>
        )}
        {weddingLabel && (
          <p className="text-[11px] text-muted-foreground/70 mt-0.5">Mariage : {weddingLabel}</p>
        )}
      </div>
      <span className="text-[11px] text-muted-foreground/70 whitespace-nowrap">{when}</span>
    </li>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return iso;
  }
}

function formatRelative(iso: string): string {
  try {
    const d = new Date(iso).getTime();
    const now = Date.now();
    const diffMs = now - d;
    const min = Math.floor(diffMs / 60000);
    if (min < 1) return 'à l\'instant';
    if (min < 60) return `il y a ${min} min`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `il y a ${hr} h`;
    const day = Math.floor(hr / 24);
    if (day < 30) return `il y a ${day} j`;
    return formatDate(iso);
  } catch {
    return iso;
  }
}

function formatAction(action: string): string {
  const map: Record<string, string> = {
    PLATFORM_LOGIN: 'Connexion plateforme',
    ORG_LOGIN: 'Connexion organisation',
    LOGIN: 'Connexion',
    CREATE_ORGANIZATION: 'Création organisation',
    UPDATE_ORGANIZATION: 'Modification organisation',
    ARCHIVE_ORGANIZATION: 'Archivage organisation',
    INVITE_ORG_MEMBER: 'Invitation membre',
    UPDATE_ORG_MEMBER: 'Modification membre',
    REVOKE_ORG_MEMBER: 'Révocation membre',
    CREATE_WEDDING: 'Création mariage',
    UPDATE_WEDDING: 'Modification mariage',
    DELETE_WEDDING: 'Suppression mariage',
    PUBLISH_WEDDING: 'Publication mariage',
    // 5.8.17 Phase 3 Fix 3 — distinct audit actions for unpublish/republish.
    UNPUBLISH_WEDDING: 'Dépublication mariage',
    REPUBLISH_WEDDING: 'Republication mariage',
  };
  return map[action] || action;
}
