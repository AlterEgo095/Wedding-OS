'use client';

/**
 * LiveCheckInFeed — scrolling list of recent QR check-ins for a wedding.
 *
 * P4.8 — subscribes to `qr-scanned` events via useRealtimeQrScans() and shows
 * the most recent 50 entries (older ones drop off). Auto-scrolls to top when
 * a new entry arrives. French UI text per platform convention.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { useRealtimeQrScans, type QrScanEvent } from '@/lib/realtime/client';
import { QrCode, Radio } from 'lucide-react';

const MAX_ENTRIES = 50;

interface LiveCheckInFeedProps {
  weddingId: string;
  /** Optional className override for layout integration. */
  className?: string;
  /** Optional maximum height (CSS value) for the scroll area. */
  maxHeight?: string;
}

interface FeedEntry extends QrScanEvent {
  receivedAt: number;
}

export function LiveCheckInFeed({
  weddingId,
  className,
  maxHeight = '320px',
}: LiveCheckInFeedProps) {
  const [entries, setEntries] = useState<FeedEntry[]>([]);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const handleScan = useCallback((event: QrScanEvent) => {
    setEntries((prev) => {
      const next = [{ ...event, receivedAt: Date.now() }, ...prev];
      return next.slice(0, MAX_ENTRIES);
    });
  }, []);

  const { isConnected } = useRealtimeQrScans(weddingId, handleScan);

  // Auto-scroll to top when a new entry arrives (newest entries are at top).
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [entries]);

  return (
    <Card className={cn('flex flex-col', className)}>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between text-sm font-medium">
          <span className="flex items-center gap-2">
            <QrCode className="size-4 text-muted-foreground" />
            Arrivées en direct
          </span>
          <Badge
            variant="outline"
            className={cn(
              'gap-1.5 text-xs font-normal',
              isConnected
                ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300'
                : 'border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300',
            )}
          >
            <Radio className={cn('size-3', isConnected && 'animate-pulse')} />
            {isConnected ? 'En direct' : 'Hors ligne'}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 p-0">
        <div
          ref={scrollRef}
          className="overflow-y-auto custom-scrollbar px-6 pb-6"
          style={{ maxHeight }}
        >
          {entries.length === 0 ? (
            <EmptyState isLoading={isConnected} />
          ) : (
            <ul className="space-y-1.5">
              {entries.map((entry) => (
                <FeedItem key={`${entry.guestId}-${entry.timestamp}`} entry={entry} />
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function EmptyState({ isLoading }: { isLoading: boolean }) {
  return (
    <div className="py-8 text-center text-sm text-muted-foreground">
      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="mx-auto h-4 w-40" />
          <Skeleton className="mx-auto h-4 w-32" />
          <p className="mt-3 text-xs">En attente du premier scan…</p>
        </div>
      ) : (
        <p>Aucune arrivée pour le moment. Le flux démarrera dès la première validation.</p>
      )}
    </div>
  );
}

function FeedItem({ entry }: { entry: FeedEntry }) {
  const time = new Date(entry.timestamp).toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  return (
    <li className="flex items-center justify-between gap-3 rounded-md border bg-card/50 px-3 py-2 text-sm animate-in fade-in slide-in-from-top-1 duration-300">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
          <QrCode className="size-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium">{entry.guestName}</div>
          <div className="text-xs text-muted-foreground">
            {time}
            {typeof entry.tableNumber === 'number' && (
              <span className="ml-2">· Table {entry.tableNumber}</span>
            )}
          </div>
        </div>
      </div>
      <Badge variant="secondary" className="shrink-0 text-xs">
        Arrivé
      </Badge>
    </li>
  );
}

export default LiveCheckInFeed;
