'use client';

/**
 * LiveStatsWidget — admin dashboard widget showing real-time wedding stats.
 *
 * P4.8 — subscribes to the realtime mini-service via useRealtimeStats() and
 * displays total guests / checked-in / pending RSVP / confirmed RSVP with a
 * connection indicator and a pulse animation when the checked-in count
 * increases.
 *
 * French UI text per platform convention.
 */

import { useEffect, useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { useRealtimeStats } from '@/lib/realtime/client';
import { Users, CheckCircle2, Clock, CalendarCheck } from 'lucide-react';

interface LiveStatsWidgetProps {
  weddingId: string;
  /** Optional className override for layout integration. */
  className?: string;
}

export function LiveStatsWidget({ weddingId, className }: LiveStatsWidgetProps) {
  const { stats, isConnected } = useRealtimeStats(weddingId);
  const [pulse, setPulse] = useState(false);
  const prevCheckedIn = useRef<number | null>(null);

  // Pulse animation when checked-in count goes up.
  useEffect(() => {
    if (!stats) return;
    if (prevCheckedIn.current !== null && stats.checkedIn > prevCheckedIn.current) {
      setPulse(true);
      const t = setTimeout(() => setPulse(false), 1_200);
      return () => clearTimeout(t);
    }
    prevCheckedIn.current = stats.checkedIn;
  }, [stats]);

  // Keep prev ref in sync (after pulse decision).
  useEffect(() => {
    if (stats) prevCheckedIn.current = stats.checkedIn;
  }, [stats]);

  return (
    <Card className={cn('relative overflow-hidden', className)}>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between text-sm font-medium">
          <span className="flex items-center gap-2">
            <Users className="size-4 text-muted-foreground" />
            Statistiques en direct
          </span>
          <ConnectionIndicator isConnected={isConnected} />
        </CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile
          label="Invités"
          value={stats?.totalGuests}
          icon={<Users className="size-4" />}
        />
        <StatTile
          label="Enregistrés"
          value={stats?.checkedIn}
          icon={<CheckCircle2 className="size-4" />}
          pulse={pulse}
          accent="emerald"
        />
        <StatTile
          label="RSVP en attente"
          value={stats?.pendingRsvp}
          icon={<Clock className="size-4" />}
          accent="amber"
        />
        <StatTile
          label="RSVP confirmés"
          value={stats?.confirmedRsvp}
          icon={<CalendarCheck className="size-4" />}
          accent="sky"
        />
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ConnectionIndicator({ isConnected }: { isConnected: boolean }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        'gap-1.5 text-xs font-normal',
        isConnected
          ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300'
          : 'border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300',
      )}
    >
      <span
        className={cn(
          'inline-block size-2 rounded-full',
          isConnected
            ? 'bg-emerald-500 animate-pulse'
            : 'bg-red-500',
        )}
      />
      {isConnected ? 'Connecté' : 'Hors ligne'}
    </Badge>
  );
}

interface StatTileProps {
  label: string;
  value: number | undefined;
  icon: React.ReactNode;
  pulse?: boolean;
  accent?: 'default' | 'emerald' | 'amber' | 'sky';
}

function StatTile({ label, value, icon, pulse, accent = 'default' }: StatTileProps) {
  const accentClasses: Record<NonNullable<StatTileProps['accent']>, string> = {
    default: 'text-foreground',
    emerald: 'text-emerald-600 dark:text-emerald-400',
    amber: 'text-amber-600 dark:text-amber-400',
    sky: 'text-sky-600 dark:text-sky-400',
  };

  return (
    <div className="rounded-lg border bg-card/50 p-3">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {icon}
        <span className="truncate">{label}</span>
      </div>
      {value === undefined ? (
        <Skeleton className="mt-2 h-7 w-12" />
      ) : (
        <div
          className={cn(
            'mt-1 text-2xl font-semibold tabular-nums transition-transform',
            accentClasses[accent],
            pulse && 'animate-pulse scale-110',
          )}
        >
          {value}
        </div>
      )}
    </div>
  );
}

export default LiveStatsWidget;
