/**
 * Realtime client — socket.io helper + React hooks for the Wedding OS frontend.
 *
 * P4.8 — connects to the standalone realtime mini-service on port 3003 via
 * the Caddy gateway, using the canonical `/?XTransformPort=3006` pattern
 * (NEVER a direct `http://localhost:3003` URL — see examples/websocket/).
 *
 * The mini-service emits these events to the `wedding:${weddingId}` room:
 *  - `qr-scanned`        — live check-in feed
 *  - `stats-update`      — periodic aggregate stats (every 10s)
 *  - `guest-rsvp`        — RSVP feed
 *  - `guestbook-entry`   — guestbook live notifications (P4.1)
 *  - `connection-count`  — viewer count
 */

'use client';

import { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';

export interface WeddingStats {
  weddingId: string;
  totalGuests: number;
  checkedIn: number;
  pendingRsvp: number;
  confirmedRsvp: number;
}

export interface QrScanEvent {
  guestId: string;
  guestName: string;
  weddingId: string;
  timestamp: string;
  tableNumber?: number | null;
}

export interface GuestRsvpEvent {
  guestId: string;
  weddingId: string;
  status: string;
  rsvpAt: string;
}

export interface GuestbookEntryEvent {
  weddingId: string;
  entryId: string;
  authorName: string;
  message: string;
}

export interface ConnectionCountEvent {
  weddingId: string;
  count: number;
}

/**
 * Create a socket.io client connected to the realtime mini-service via the
 * Caddy gateway. The client is automatically joined to `wedding:${weddingId}`
 * via the `subscribe` event.
 *
 * Use this for non-React contexts (vanilla hooks, outside components). Inside
 * React, prefer the `useRealtime*` hooks so the socket is auto-disconnected
 * on unmount.
 */
export function createRealtimeClient(weddingId: string): Socket {
  // Never use a direct localhost URL — the Caddy gateway must see the
  // XTransformPort=3006 query param to route to the realtime mini-service.
  const socket = io('/?XTransformPort=3006', {
    transports: ['websocket', 'polling'],
    forceNew: true,
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 1_000,
    reconnectionDelayMax: 10_000,
    timeout: 10_000,
  });

  socket.on('connect', () => {
    socket.emit('subscribe', { weddingId });
  });

  // If already connected (cached socket), emit subscribe immediately.
  if (socket.connected) {
    socket.emit('subscribe', { weddingId });
  }

  return socket;
}

/**
 * Internal React hook that holds a single socket per weddingId and tracks
 * connection state. Other hooks build on top of this.
 */
function useRealtimeClient(weddingId: string): {
  socket: Socket | null;
  isConnected: boolean;
} {
  const [isConnected, setIsConnected] = useState(false);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    const socket = createRealtimeClient(weddingId);
    socketRef.current = socket;

    const onConnect = () => setIsConnected(true);
    const onDisconnect = () => setIsConnected(false);
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.disconnect();
      socketRef.current = null;
    };
  }, [weddingId]);

  return { socket: socketRef.current, isConnected };
}

/**
 * React hook — subscribes to `stats-update` events for the given wedding.
 * Returns `{ stats, isConnected }`. The stats object is null until the first
 * update arrives (the server pushes one immediately on subscribe).
 */
export function useRealtimeStats(weddingId: string): {
  stats: WeddingStats | null;
  isConnected: boolean;
} {
  const [stats, setStats] = useState<WeddingStats | null>(null);
  const { socket, isConnected } = useRealtimeClient(weddingId);

  useEffect(() => {
    if (!socket) return;
    const handler = (payload: WeddingStats) => {
      // Defensive: only accept payloads for the current wedding.
      if (payload && payload.weddingId === weddingId) {
        setStats(payload);
      }
    };
    socket.on('stats-update', handler);
    return () => {
      socket.off('stats-update', handler);
    };
  }, [socket, weddingId]);

  return { stats, isConnected };
}

/**
 * React hook — live QR scan feed. Invokes `onScan` for each `qr-scanned`
 * event received for the given wedding. Returns the current connection state
 * so callers can show a "live" indicator.
 */
export function useRealtimeQrScans(
  weddingId: string,
  onScan: (event: QrScanEvent) => void,
): { isConnected: boolean } {
  const { socket, isConnected } = useRealtimeClient(weddingId);
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;

  useEffect(() => {
    if (!socket) return;
    const handler = (payload: QrScanEvent) => {
      if (payload && payload.weddingId === weddingId) {
        onScanRef.current(payload);
      }
    };
    socket.on('qr-scanned', handler);
    return () => {
      socket.off('qr-scanned', handler);
    };
  }, [socket, weddingId]);

  return { isConnected };
}

/**
 * React hook — live RSVP feed. Invokes `onRsvp` for each `guest-rsvp` event.
 */
export function useRealtimeRsvp(
  weddingId: string,
  onRsvp: (event: GuestRsvpEvent) => void,
): { isConnected: boolean } {
  const { socket, isConnected } = useRealtimeClient(weddingId);
  const onRsvpRef = useRef(onRsvp);
  onRsvpRef.current = onRsvp;

  useEffect(() => {
    if (!socket) return;
    const handler = (payload: GuestRsvpEvent) => {
      if (payload && payload.weddingId === weddingId) {
        onRsvpRef.current(payload);
      }
    };
    socket.on('guest-rsvp', handler);
    return () => {
      socket.off('guest-rsvp', handler);
    };
  }, [socket, weddingId]);

  return { isConnected };
}

/**
 * React hook — live guestbook entries (P4.1). Invokes `onEntry` for each
 * `guestbook-entry` event.
 */
export function useRealtimeGuestbook(
  weddingId: string,
  onEntry: (event: GuestbookEntryEvent) => void,
): { isConnected: boolean } {
  const { socket, isConnected } = useRealtimeClient(weddingId);
  const onEntryRef = useRef(onEntry);
  onEntryRef.current = onEntry;

  useEffect(() => {
    if (!socket) return;
    const handler = (payload: GuestbookEntryEvent) => {
      if (payload && payload.weddingId === weddingId) {
        onEntryRef.current(payload);
      }
    };
    socket.on('guestbook-entry', handler);
    return () => {
      socket.off('guestbook-entry', handler);
    };
  }, [socket, weddingId]);

  return { isConnected };
}

/**
 * React hook — live connection count for the wedding room.
 */
export function useRealtimeConnectionCount(
  weddingId: string,
): { count: number; isConnected: boolean } {
  const [count, setCount] = useState(0);
  const { socket, isConnected } = useRealtimeClient(weddingId);

  useEffect(() => {
    if (!socket) return;
    const handler = (payload: ConnectionCountEvent) => {
      if (payload && payload.weddingId === weddingId) {
        setCount(payload.count);
      }
    };
    socket.on('connection-count', handler);
    return () => {
      socket.off('connection-count', handler);
    };
  }, [socket, weddingId]);

  return { count, isConnected };
}
