/**
 * Wedding Realtime Service — socket.io mini-service on port 3006.
 *
 * Independent Bun/Node process that:
 *  1. Accepts socket.io connections from the frontend (via Caddy gateway,
 *     using the `?XTransformPort=3006` query parameter convention).
 *  2. Exposes an internal webhook `POST /internal/push` that the Next.js
 *     app calls to broadcast events to all subscribers of a wedding room.
 *  3. Polls the SQLite DB every 10s for each wedding that has active
 *     subscribers and pushes `stats-update` events.
 *
 * Path is fixed to `/` (Caddy uses path + query param to route — see
 * examples/websocket/server.ts for the canonical pattern).
 *
 * The DB is opened in READ-ONLY mode — this service never writes.
 */

import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import { Server, Socket } from 'socket.io';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const PORT = Number(process.env.PORT ?? 3006);
const INTERNAL_PUSH_TOKEN = process.env.INTERNAL_PUSH_TOKEN ?? '';
const DATABASE_PATH = process.env.DATABASE_PATH ?? '';
const REDIS_URL = process.env.REDIS_URL ?? '';
const STATS_POLL_INTERVAL_MS = Number(process.env.STATS_POLL_INTERVAL_MS ?? 10_000);
const CORS_ORIGIN = process.env.CORS_ORIGIN ?? '*';

if (!INTERNAL_PUSH_TOKEN) {
  console.warn('[realtime] WARNING: INTERNAL_PUSH_TOKEN is not set — /internal/push will reject all requests.');
}
if (!DATABASE_PATH) {
  console.warn('[realtime] WARNING: DATABASE_PATH is not set — stats-update polling will be disabled.');
}

// ---------------------------------------------------------------------------
// Type definitions
// ---------------------------------------------------------------------------

interface SubscribePayload {
  weddingId?: string;
  token?: string;
}

interface PushRequestBody {
  event: string;
  weddingId?: string;
  payload?: unknown;
}

interface StatsUpdatePayload {
  weddingId: string;
  totalGuests: number;
  checkedIn: number;
  pendingRsvp: number;
  confirmedRsvp: number;
}

interface ConnectionCountPayload {
  weddingId: string;
  count: number;
}

// ---------------------------------------------------------------------------
// Room helpers
// ---------------------------------------------------------------------------

function weddingRoom(weddingId: string): string {
  return `wedding:${weddingId}`;
}

/** weddingId -> Set<socket.id> */
const weddingSubscribers = new Map<string, Set<string>>();

function addSubscriber(weddingId: string, socketId: string): number {
  let set = weddingSubscribers.get(weddingId);
  if (!set) {
    set = new Set();
    weddingSubscribers.set(weddingId, set);
  }
  set.add(socketId);
  return set.size;
}

function removeSubscriber(weddingId: string, socketId: string): number {
  const set = weddingSubscribers.get(weddingId);
  if (!set) return 0;
  set.delete(socketId);
  if (set.size === 0) {
    weddingSubscribers.delete(weddingId);
    return 0;
  }
  return set.size;
}

/** Track every socket -> weddingId so disconnect can clean up. */
const socketWeddingIndex = new Map<string, string>();

// ---------------------------------------------------------------------------
// SQLite (read-only) — opened lazily so the service can boot even when the
// DB path is not configured (e.g. local dev without the docker volume).
//
// Runtime compatibility: Bun doesn't support the native `better-sqlite3`
// module (see https://github.com/oven-sh/bun/issues/4290), but Bun ships a
// builtin `bun:sqlite` with a compatible API. We try `better-sqlite3` first
// (Node), then fall back to `bun:sqlite` (Bun). Both expose the same
// `.prepare(sql).get(...)` shape used by `queryStats()`.
// ---------------------------------------------------------------------------

type SqliteHandle = {
  prepare: (sql: string) => { get: (...params: unknown[]) => unknown };
  pragma: (stmt: string) => void;
  close: () => void;
};

let db: SqliteHandle | null = null;

async function openDatabase(): Promise<SqliteHandle | null> {
  if (!DATABASE_PATH) return null;
  try {
    // Detect Bun runtime — prefer the builtin `bun:sqlite` to avoid the
    // unsupported native module error.
    const isBun = typeof (globalThis as { Bun?: unknown }).Bun !== 'undefined';
    if (isBun) {
      const bunSqlite = await import('bun:sqlite');
      // `bun:sqlite` exports a default `Database` class compatible with
      // better-sqlite3 for our usage (readonly + prepare/get).
      const BunDatabase = (bunSqlite as { default: new (path: string, opts: { readonly: boolean; fileMustExist?: boolean }) => SqliteHandle }).default
        ?? (bunSqlite as unknown as { Database: new (path: string, opts: { readonly: boolean; fileMustExist?: boolean }) => SqliteHandle }).Database;
      const handle = new BunDatabase(DATABASE_PATH, { readonly: true, fileMustExist: true });
      try { handle.pragma('journal_mode = WAL'); } catch { /* bun:sqlite pragma quirk */ }
      console.log(`[realtime] SQLite opened (read-only, bun:sqlite): ${DATABASE_PATH}`);
      return handle;
    }
    // Node path — use better-sqlite3 (native module).
    const BetterSqlite3 = (await import('better-sqlite3')).default as unknown as
      new (path: string, opts: { readonly: boolean; fileMustExist: boolean }) => SqliteHandle;
    const handle = new BetterSqlite3(DATABASE_PATH, { readonly: true, fileMustExist: true });
    handle.pragma('journal_mode = WAL');
    console.log(`[realtime] SQLite opened (read-only, better-sqlite3): ${DATABASE_PATH}`);
    return handle;
  } catch (err) {
    console.error(
      `[realtime] Failed to open SQLite at ${DATABASE_PATH}:`,
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}

const statsQuery = `
  SELECT
    COUNT(*) AS total_guests,
    SUM(CASE WHEN checkedIn = 1 THEN 1 ELSE 0 END) AS checked_in,
    SUM(CASE WHEN status = 'PENDING' THEN 1 ELSE 0 END) AS pending_rsvp,
    SUM(CASE WHEN status = 'CONFIRMED' THEN 1 ELSE 0 END) AS confirmed_rsvp
  FROM Guest
  WHERE weddingId = ?
`;

function queryStats(weddingId: string): StatsUpdatePayload | null {
  if (!db) return null;
  try {
    const row = db.prepare(statsQuery).get(weddingId) as
      | { total_guests: number; checked_in: number; pending_rsvp: number; confirmed_rsvp: number }
      | undefined;
    if (!row) return null;
    return {
      weddingId,
      totalGuests: Number(row.total_guests ?? 0),
      checkedIn: Number(row.checked_in ?? 0),
      pendingRsvp: Number(row.pending_rsvp ?? 0),
      confirmedRsvp: Number(row.confirmed_rsvp ?? 0),
    };
  } catch (err) {
    console.error(
      `[realtime] stats query failed for wedding ${weddingId}:`,
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}

// ---------------------------------------------------------------------------
// HTTP server + socket.io
// ---------------------------------------------------------------------------

const httpServer = createServer(async (req: IncomingMessage, res: ServerResponse) => {
  // --- Internal webhook: POST /internal/push ---
  if (req.method === 'POST' && req.url?.startsWith('/internal/push')) {
    await handleInternalPush(req, res);
    return;
  }

  // --- Health check: GET /health ---
  if (req.method === 'GET' && (req.url === '/health' || req.url === '/healthz')) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, ts: new Date().toISOString(), weddings: weddingSubscribers.size }));
    return;
  }

  // 404 for any other non-socket.io path.
  if (!req.url?.startsWith('/socket.io/')) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
    return;
  }
  // Socket.io request — let engine.io handle it (don't end the response here).
});

const io = new Server(httpServer, {
  // Path: use the socket.io default (`/socket.io/`) so that HTTP routes
  // like `POST /internal/push` and `GET /health` can coexist on the same
  // HTTP server. With `path: '/'`, engine.io would intercept every URL
  // (including /internal/push) and return "Transport unknown".
  //
  // The existing example (examples/websocket/server.ts) uses `path: '/'`
  // because it is a PURE socket.io server with no HTTP routes — that
  // pattern does not fit this service.
  //
  // Caddy routes by the `XTransformPort` QUERY PARAMETER (see Caddyfile:
  // `query XTransformPort=*`), NOT by URL path, so changing the socket.io
  // path does not break the gateway. The frontend's `io('/?XTransformPort=3006')`
  // call uses the default client path `/socket.io/` automatically.
  path: '/socket.io/',
  cors: {
    origin: CORS_ORIGIN,
    methods: ['GET', 'POST'],
  },
  pingTimeout: 60_000,
  pingInterval: 25_000,
});

// Optional Redis adapter for multi-instance fan-out.
async function maybeEnableRedisAdapter(): Promise<void> {
  if (!REDIS_URL) return;
  try {
    const { createAdapter } = await import('@socket.io/redis-adapter');
    const { default: Redis } = await import('ioredis');
    const pubClient = new Redis(REDIS_URL, { maxRetriesPerRequest: null });
    const subClient = pubClient.duplicate();
    io.adapter(createAdapter(pubClient, subClient));
    console.log(`[realtime] Redis adapter enabled: ${REDIS_URL}`);
  } catch (err) {
    console.warn(
      '[realtime] Redis adapter init failed (continuing without):',
      err instanceof Error ? err.message : err,
    );
  }
}

// ---------------------------------------------------------------------------
// Internal push handler
// ---------------------------------------------------------------------------

async function handleInternalPush(req: IncomingMessage, res: ServerResponse): Promise<void> {
  // Auth: Bearer token.
  const authHeader = req.headers['authorization'] ?? '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!INTERNAL_PUSH_TOKEN || token !== INTERNAL_PUSH_TOKEN) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Unauthorized' }));
    return;
  }

  // Read body.
  const chunks: Buffer[] = [];
  for await (const c of req) {
    chunks.push(typeof c === 'string' ? Buffer.from(c) : c);
    if (chunks.reduce((n, b) => n + b.length, 0) > 1_000_000) {
      res.writeHead(413, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Payload too large' }));
      return;
    }
  }
  const raw = Buffer.concat(chunks).toString('utf-8');
  let body: PushRequestBody;
  try {
    body = JSON.parse(raw) as PushRequestBody;
  } catch {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Invalid JSON' }));
    return;
  }

  const { event, weddingId, payload } = body;
  if (!event || !weddingId || typeof event !== 'string' || typeof weddingId !== 'string') {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Missing event or weddingId' }));
    return;
  }

  // Broadcast to the wedding room.
  io.to(weddingRoom(weddingId)).emit(event, payload);
  console.log(
    `[realtime] push event="${event}" wedding="${weddingId}" subs=${weddingSubscribers.get(weddingId)?.size ?? 0}`,
  );

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ok: true }));
}

// ---------------------------------------------------------------------------
// Connection lifecycle
// ---------------------------------------------------------------------------

function broadcastConnectionCount(weddingId: string): void {
  const count = weddingSubscribers.get(weddingId)?.size ?? 0;
  const payload: ConnectionCountPayload = { weddingId, count };
  io.to(weddingRoom(weddingId)).emit('connection-count', payload);
}

io.on('connection', (socket: Socket) => {
  console.log(`[realtime] connected: ${socket.id}`);

  socket.on('subscribe', (data: SubscribePayload) => {
    const weddingId = data?.weddingId;
    if (!weddingId || typeof weddingId !== 'string') {
      socket.emit('error', { message: 'subscribe requires { weddingId }' });
      return;
    }

    // Detach from previous wedding if re-subscribing.
    const prevWeddingId = socketWeddingIndex.get(socket.id);
    if (prevWeddingId && prevWeddingId !== weddingId) {
      socket.leave(weddingRoom(prevWeddingId));
      removeSubscriber(prevWeddingId, socket.id);
      broadcastConnectionCount(prevWeddingId);
    }

    socket.join(weddingRoom(weddingId));
    const count = addSubscriber(weddingId, socket.id);
    socketWeddingIndex.set(socket.id, weddingId);

    socket.emit('subscribed', { weddingId, connectionCount: count });
    broadcastConnectionCount(weddingId);

    // Push an immediate stats update so the new client doesn't have to wait
    // up to 10 seconds for the first poll.
    const stats = queryStats(weddingId);
    if (stats) {
      socket.emit('stats-update', stats);
    }

    console.log(`[realtime] ${socket.id} subscribed to wedding ${weddingId} (count=${count})`);
  });

  socket.on('unsubscribe', () => {
    const weddingId = socketWeddingIndex.get(socket.id);
    if (!weddingId) return;
    socket.leave(weddingRoom(weddingId));
    removeSubscriber(weddingId, socket.id);
    socketWeddingIndex.delete(socket.id);
    broadcastConnectionCount(weddingId);
    socket.emit('unsubscribed', { weddingId });
  });

  socket.on('disconnect', () => {
    const weddingId = socketWeddingIndex.get(socket.id);
    if (weddingId) {
      removeSubscriber(weddingId, socket.id);
      broadcastConnectionCount(weddingId);
      socketWeddingIndex.delete(socket.id);
    }
    console.log(`[realtime] disconnected: ${socket.id}`);
  });

  socket.on('error', (err: unknown) => {
    console.error(`[realtime] socket error (${socket.id}):`, err);
  });
});

// ---------------------------------------------------------------------------
// Stats polling loop
// ---------------------------------------------------------------------------

let statsTimer: ReturnType<typeof setInterval> | null = null;

function startStatsPolling(): void {
  if (statsTimer) clearInterval(statsTimer);
  statsTimer = setInterval(() => {
    if (weddingSubscribers.size === 0) return;
    for (const weddingId of weddingSubscribers.keys()) {
      const stats = queryStats(weddingId);
      if (stats) {
        io.to(weddingRoom(weddingId)).emit('stats-update', stats);
      }
    }
  }, STATS_POLL_INTERVAL_MS);
  // Don't keep the process alive just for this timer.
  if (typeof statsTimer.unref === 'function') statsTimer.unref();
}

// ---------------------------------------------------------------------------
// Graceful shutdown
// ---------------------------------------------------------------------------

let shuttingDown = false;
function shutdown(signal: string): void {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[realtime] received ${signal}, shutting down...`);
  if (statsTimer) {
    clearInterval(statsTimer);
    statsTimer = null;
  }
  io.disconnectSockets(true);
  io.close(() => {
    if (db) {
      try { db.close(); } catch { /* ignore */ }
      db = null;
    }
    httpServer.close(() => {
      console.log('[realtime] server closed');
      process.exit(0);
    });
    // Force-exit after 3s if httpServer.close hangs (lingering sockets).
    setTimeout(() => process.exit(0), 3_000).unref();
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

await (async () => {
  db = await openDatabase();
  await maybeEnableRedisAdapter();

  httpServer.listen(PORT, () => {
    console.log(`WebSocket server running on port ${PORT}`);
    console.log(
      `[realtime] internal push: POST /internal/push  (token ${INTERNAL_PUSH_TOKEN ? 'set' : 'MISSING'})`,
    );
    console.log(
      `[realtime] stats polling: every ${STATS_POLL_INTERVAL_MS} ms  (db: ${db ? 'connected' : 'disabled'})`,
    );
    startStatsPolling();
  });
})();
