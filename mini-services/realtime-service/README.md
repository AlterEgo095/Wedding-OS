# Wedding Realtime Service (port 3004)

Independent socket.io mini-service for the Wedding OS platform. Pushes live
updates (QR scans, stats, RSVP, guestbook entries) to subscribed frontend
clients through a single persistent WebSocket connection.

This service is a **separate process** from the Next.js app — it runs its own
Node/Bun HTTP server on port **3004** and is reachable from the browser via
the Caddy gateway using the `?XTransformPort=3004` query parameter.

## Quick start

```bash
# Bun (preferred — auto-reload on file change)
bun install
bun run dev

# Node fallback (no auto-reload — use --watch for similar behavior)
npm install
npm run start            # or: node index.js
npm run start:watch      # node --watch index.js (Node 18+)
```

The service prints `WebSocket server running on port 3004` once ready.

## Environment variables

Copy `.env.example` to `.env` and adjust:

| Variable               | Default | Description                                                       |
|------------------------|---------|-------------------------------------------------------------------|
| `PORT`                 | `3004`  | HTTP port (must stay 3004 — Caddy hardcodes this).                |
| `INTERNAL_PUSH_TOKEN`  | —       | Bearer token required by `POST /internal/push`.                   |
| `DATABASE_PATH`        | —       | Absolute path to the SQLite file (read-only access).              |
| `REDIS_URL`            | —       | Optional. Used for the socket.io Redis adapter (multi-instance).  |
| `STATS_POLL_INTERVAL_MS` | `10000` | How often to push `stats-update` per wedding with subscribers.  |

## Rooms & subscriptions

Each wedding has a dedicated room: `wedding:${weddingId}`.

Frontend clients emit a `subscribe` event on connect:

```ts
socket.emit('subscribe', { weddingId: 'w_abc123' });
// Server responds: socket.emit('subscribed', { weddingId, connectionCount })
```

Token validation (guest/admin JWT) is **optional for MVP** — the server
trusts the `weddingId`. Add validation in `handleSubscribe` if stricter
access control is needed.

## Events emitted to clients

All events are broadcast to the `wedding:${weddingId}` room.

| Event                | Payload                                                                                  | Trigger                                              |
|----------------------|------------------------------------------------------------------------------------------|------------------------------------------------------|
| `qr-scanned`         | `{guestId, guestName, weddingId, timestamp, tableNumber?}`                               | Guest checks in via QR (`POST /internal/push`).      |
| `stats-update`       | `{weddingId, totalGuests, checkedIn, pendingRsvp, confirmedRsvp}`                        | Polled every 10s for each wedding with subscribers.  |
| `guest-rsvp`         | `{guestId, weddingId, status, rsvpAt}`                                                   | Guest RSVPs (`POST /internal/push`).                 |
| `guestbook-entry`    | `{weddingId, entryId, authorName, message}`                                              | New guestbook entry submitted (P4.1).                |
| `connection-count`   | `{weddingId, count}`                                                                     | A client joins or leaves the wedding room.           |

## Internal webhook: `POST /internal/push`

Called by the Next.js API routes (via `@/lib/realtime/push`) to broadcast an
event. **Fault-tolerant by design** — the caller swallows all errors so the
main app flow is never broken when the mini-service is down.

```http
POST /internal/push
Authorization: Bearer ${INTERNAL_PUSH_TOKEN}
Content-Type: application/json

{
  "event": "qr-scanned",
  "weddingId": "w_abc123",
  "payload": {
    "guestId": "g_001",
    "guestName": "Alice Martin",
    "tableNumber": 5
  }
}
```

Response: `200 OK { ok: true }` on success, `401` if token mismatch, `400`
if payload is malformed.

## Architecture notes

- **socket.io path**: `/socket.io/` (the default). The existing example
  `examples/websocket/server.ts` uses `path: '/'` because it is a pure
  socket.io server with no HTTP routes. This service hosts BOTH socket.io
  AND the `POST /internal/push` HTTP webhook on the same port, so it uses
  the default path to let HTTP routes coexist. Caddy routes by the
  `XTransformPort` **query parameter**, not by URL path, so this does not
  break the gateway. The frontend's `io('/?XTransformPort=3004')` call
  works unchanged (socket.io-client defaults to path `/socket.io/`).
- **Read-only DB access**: uses `better-sqlite3` opened with `readonly: true`
  — never writes, never locks the DB.
- **Stats polling**: every 10 seconds, for each wedding that has at least one
  connected subscriber, runs a single aggregate query (`COUNT(*) FILTER
  (WHERE ...)`) and emits `stats-update`.
- **Graceful shutdown**: SIGTERM / SIGINT closes the HTTP server, disconnects
  all socket.io clients, and closes the DB handle.
- **Redis adapter** (optional): if `REDIS_URL` is set, enables the socket.io
  Redis adapter so multiple instances can fan-out broadcasts.
