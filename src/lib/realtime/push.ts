/**
 * Server-side realtime push helper.
 *
 * P4.8 — called from Next.js API routes (after a successful mutation) to
 * broadcast an event through the standalone realtime mini-service on port
 * 3003. The helper is FAULT-TOLERANT by design: if the mini-service is down,
 * unreachable, or returns an error, this function logs a warning and returns
 * `false` — it never throws, so the main app flow is never broken.
 *
 * Usage (inside an API route, AFTER the successful response is built):
 *
 *   await pushRealtimeEvent(weddingId, 'qr-scanned', {
 *     guestId: guest.id,
 *     guestName: `${guest.firstName} ${guest.lastName}`,
 *     timestamp: new Date().toISOString(),
 *     tableNumber: guest.table?.number ?? null,
 *   });
 *
 * Set `REALTIME_PUSH_TOKEN` and (optionally) `REALTIME_PUSH_URL` in env.
 */

import { logger } from '@/lib/logger';

const DEFAULT_PUSH_URL = 'http://localhost:3003/internal/push';

/**
 * Push a realtime event to all subscribers of the given wedding room.
 *
 * @returns `true` on success (HTTP 2xx), `false` on any failure.
 *          Never throws.
 */
export async function pushRealtimeEvent(
  weddingId: string,
  event: string,
  payload: unknown,
): Promise<boolean> {
  const token = process.env.REALTIME_PUSH_TOKEN;
  const url = process.env.REALTIME_PUSH_URL ?? DEFAULT_PUSH_URL;

  if (!token) {
    // Token not configured — silently skip. This keeps the helper usable in
    // dev environments where the mini-service isn't running.
    return false;
  }

  // Validate inputs minimally.
  if (!weddingId || !event) {
    return false;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2_000);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ event, weddingId, payload }),
      signal: controller.signal,
      // Never follow redirects — internal endpoint only.
      redirect: 'error',
      // Don't cache.
      cache: 'no-store',
    });

    if (!res.ok) {
      logger.warn('Realtime push failed', {
        event,
        weddingId,
        status: res.status,
        statusText: res.statusText,
      });
      return false;
    }
    return true;
  } catch (err) {
    // Most common: ECONNREFUSED when the mini-service isn't running. Log a
    // single warning and move on — the main app flow must not break.
    logger.warn('Realtime push error (mini-service unavailable?)', {
      event,
      weddingId,
      errMessage: err instanceof Error ? err.message : String(err),
    });
    return false;
  } finally {
    clearTimeout(timeout);
  }
}
