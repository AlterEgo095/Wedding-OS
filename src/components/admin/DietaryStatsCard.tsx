'use client';

// ══════════════════════════════════════════════════════════════════════════════
// DietaryStatsCard — Admin dashboard card for dietary preferences (P4.2)
// ══════════════════════════════════════════════════════════════════════════════
//
// Renders a compact card showing dietary-preference stats for ONE wedding:
//   - Total guests
//   - Guests with dietary prefs (count + percentage)
//   - Top 5 dietary texts (each with count) — for kitchen/catering prep
//
// Props: { weddingId, fetchWithAuth }
//   - weddingId: the wedding to fetch stats for.
//   - fetchWithAuth: the standard auth-attaching fetcher from
//     usePlatformFetch() (passes credentials + CSRF).
//
// Fetches GET /api/weddings/{weddingId}/guests/dietary-stats on mount + on
// weddingId change. Shows skeletons while loading, empty state if no data.
//
// shadcn/ui: Card, CardContent, Skeleton.
// Lucide icons: Utensils, AlertCircle, Loader2.
// ══════════════════════════════════════════════════════════════════════════════

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { Utensils, AlertCircle, Loader2 } from 'lucide-react';

import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';

interface DietaryStats {
  total: number;
  withDietary: number;
  breakdown: Array<{ dietary: string; count: number }>;
}

interface DietaryStatsCardProps {
  weddingId: string;
  fetchWithAuth: (
    url: string,
    init?: RequestInit
  ) => Promise<Response | null>;
}

const TOP_N = 5;

export function DietaryStatsCard({ weddingId, fetchWithAuth }: DietaryStatsCardProps) {
  const [stats, setStats] = useState<DietaryStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      else setRefreshing(true);
      try {
        const res = await fetchWithAuth(
          `/api/weddings/${weddingId}/guests/dietary-stats`
        );
        if (!res) return; // fetchWithAuth handled 401/403
        const json = (await res.json()) as DietaryStats;
        setStats(json);
      } catch {
        if (!silent) toast.error('Impossible de charger les statistiques alimentaires');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [fetchWithAuth, weddingId]
  );

  useEffect(() => {
    load();
  }, [load]);

  const pct =
    stats && stats.total > 0
      ? Math.round((stats.withDietary / stats.total) * 100)
      : 0;

  const top = (stats?.breakdown ?? []).slice(0, TOP_N);

  return (
    <Card className="glass-card gold-border border-0">
      <CardContent className="p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Utensils className="w-4 h-4 text-amber-400" />
            <h3 className="text-sm font-semibold text-white">
              Préférences alimentaires
            </h3>
          </div>
          <button
            type="button"
            onClick={() => load(true)}
            disabled={refreshing}
            className="text-[10px] text-zinc-400 hover:text-amber-400 disabled:opacity-50"
            title="Rafraîchir"
          >
            {refreshing ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              'Rafraîchir'
            )}
          </button>
        </div>

        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-2 w-full rounded-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : !stats || stats.total === 0 ? (
          <div className="text-center py-6 text-xs text-zinc-500">
            <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-50" />
            Aucun invité dans ce mariage.
          </div>
        ) : (
          <>
            {/* Headline counts */}
            <div className="grid grid-cols-3 gap-2 text-center">
              <div>
                <div className="text-[10px] uppercase text-zinc-500">
                  Total invités
                </div>
                <div className="text-2xl font-bold text-zinc-100">
                  {stats.total}
                </div>
              </div>
              <div>
                <div className="text-[10px] uppercase text-zinc-500">
                  Avec préférences
                </div>
                <div className="text-2xl font-bold text-amber-400">
                  {stats.withDietary}
                </div>
              </div>
              <div>
                <div className="text-[10px] uppercase text-zinc-500">
                  Part
                </div>
                <div className="text-2xl font-bold text-amber-400">{pct}%</div>
              </div>
            </div>

            {/* Progress bar */}
            <div>
              <Progress
                value={pct}
                className="h-2 bg-white/10"
              />
              <p className="text-[10px] text-zinc-500 mt-1">
                {stats.withDietary} invité{stats.withDietary > 1 ? 's' : ''} sur{' '}
                {stats.total} ont renseigné des préférences alimentaires.
              </p>
            </div>

            {/* Top dietary texts */}
            <div>
              <div className="text-[10px] uppercase text-zinc-500 mb-2">
                Top {TOP_N} préférences
              </div>
              {top.length === 0 ? (
                <p className="text-xs text-zinc-500 italic">
                  Aucune préférence renseignée pour le moment.
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {top.map((b, i) => {
                    const share =
                      stats.withDietary > 0
                        ? Math.round((b.count / stats.withDietary) * 100)
                        : 0;
                    return (
                      <li
                        key={`${i}-${b.dietary.slice(0, 20)}`}
                        className="flex items-center gap-2 text-xs"
                      >
                        <Badge
                          variant="outline"
                          className="text-[10px] bg-amber-500/10 text-amber-300 border-amber-500/30"
                        >
                          {b.count}
                        </Badge>
                        <span
                          className="flex-1 truncate text-zinc-300"
                          title={b.dietary}
                        >
                          {b.dietary}
                        </span>
                        <span className="text-[10px] text-zinc-500 font-mono">
                          {share}%
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {stats.breakdown.length > TOP_N && (
              <p className="text-[10px] text-zinc-500 text-center">
                + {stats.breakdown.length - TOP_N} autre(s) préférence(s) non affichée(s).
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
