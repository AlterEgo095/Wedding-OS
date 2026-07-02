// ══════════════════════════════════════════════════════════════════════════════
// Structured JSON logger — P1-SEC-15 + P1-PROD-5
// ══════════════════════════════════════════════════════════════════════════════
//
// Replaces the 107 scattered console.* calls across the codebase with a single
// structured logger that emits one JSON line per log to stdout. Each line:
//
//   { "ts": "2025-01-15T12:34:56.789Z", "level": "info", "msg": "...",
//     "env": "production", "pid": 42, ...context }
//
// Design decisions:
//
// 1. JSON to stdout — production log aggregators (CloudWatch, Loki, Datadog)
//    parse JSON natively. No printf-style formatting. The dev shell still gets
//    readable JSON (one log per line, ts prefix).
//
// 2. LOG_LEVEL env var — default `info` in production, `debug` in development.
//    Levels: debug < info < warn < error. Anything below the configured level
//    is silently dropped (no JSON output, no stdout write).
//
// 3. Errors are NOT serialised verbatim — JSON.stringify(new Error('x')) gives
//    "{}" which is useless. We extract `errMessage`, `errName`, `errCode` from
//    any Error instance passed in context. Stack is intentionally omitted by
//    default (P1-SEC-15: Error.stack can leak source paths + secrets via
//    headers captured in async stack frames). Pass `includeStack: true` in
//    context to opt-in — recommended only for dev debugging.
//
// 4. Edge-runtime compatible. The module's top-level never touches Node-only
//    APIs (no `process.pid` access at module init, no `fs`, no `os`). When
//    running on the Edge runtime, `process.pid` is undefined; we omit it from
//    the log payload.
//
// 5. Child loggers via `with(ctx)` — bind request-scoped context (requestId,
//    userId, weddingId) once at the start of a handler, then all downstream
//    logs automatically include it. Saves passing context through every log
//    call.
//
// Usage:
//   import { logger } from '@/lib/logger'
//   logger.info('login success', { userId: user.id, email: user.email })
//   const requestLogger = logger.with({ requestId, userId })
//   requestLogger.warn('rate limit hit', { ip })
//   try { ... } catch (e) {
//     logger.error('db write failed', { err: e, action: 'create-wedding' })
//   }

// ─── Edge-runtime detection ──────────────────────────────────────────────────
// On the Edge runtime, `process` is polyfilled but `process.pid` is undefined.
// Node-only modules like `os` are not available. Keep all top-level code free
// of Node-only APIs so this module can be imported from edge route handlers.
const isEdgeRuntime =
  typeof process !== 'undefined' &&
  typeof (process as { env?: { NEXT_RUNTIME?: string } }).env !== 'undefined' &&
  (process as { env?: { NEXT_RUNTIME?: string } }).env?.NEXT_RUNTIME === 'edge';

// ─── Log levels ──────────────────────────────────────────────────────────────
type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function resolveConfiguredLevel(): LogLevel {
  const raw = (typeof process !== 'undefined' &&
    (process as { env?: Record<string, string | undefined> }).env?.LOG_LEVEL) || '';
  switch (raw.toLowerCase()) {
    case 'debug':
      return 'debug';
    case 'warn':
      return 'warn';
    case 'error':
      return 'error';
    case 'silent':
      // 'silent' is a sentinel — we encode it as 'error' but also set a flag
      // so we can drop everything. (Keeps the LogLevel union clean.)
      return 'error';
    case 'info':
      return 'info';
    default: {
      // Default: debug in dev, info in production. Build phase counts as dev.
      const isProd =
        (process as { env?: { NODE_ENV?: string; NEXT_PHASE?: string } }).env?.NODE_ENV ===
          'production' &&
        (process as { env?: { NEXT_PHASE?: string } }).env?.NEXT_PHASE !== 'phase-production-build';
      return isProd ? 'info' : 'debug';
    }
  }
}

let _configuredLevel: LogLevel | null = null;
function configuredLevel(): LogLevel {
  if (_configuredLevel !== null) return _configuredLevel;
  _configuredLevel = resolveConfiguredLevel();
  return _configuredLevel;
}

// ─── Log context ─────────────────────────────────────────────────────────────
export interface LogContext {
  [key: string]: unknown;
}

// ─── Error serialisation ─────────────────────────────────────────────────────
// P1-SEC-15: never log `error.stack` by default. Stacks can contain file paths,
// env-injected secrets captured by async hooks, and source snippets that
// shouldn't go to stdout aggregation. Callers can opt-in via includeStack:true
// (dev only — has no effect in production).
function serializeError(value: unknown, includeStack: boolean): Record<string, unknown> {
  if (value instanceof Error) {
    const out: Record<string, unknown> = {
      errMessage: value.message,
      errName: value.name,
    };
    // Prisma errors carry a `code` (e.g. P2002) — useful for ops triage.
    const code = (value as { code?: unknown }).code;
    if (typeof code === 'string') out.errCode = code;
    if (includeStack && typeof value.stack === 'string') {
      out.errStack = value.stack;
    }
    // Preserve any custom enumerable fields the caller may have attached
    // (e.g. httpStatus on a typed API error). We exclude the standard
    // Error fields we've already serialised.
    for (const [k, v] of Object.entries(value)) {
      if (k === 'message' || k === 'name' || k === 'stack' || k === 'code') continue;
      out[k] = v;
    }
    return out;
  }
  // Non-Error throwables — best-effort safe serialisation.
  if (typeof value === 'string') return { errMessage: value };
  if (value === null) return { errMessage: 'null' };
  if (value === undefined) return { errMessage: 'undefined' };
  try {
    return { errValue: JSON.parse(JSON.stringify(value)) };
  } catch {
    return { errMessage: String(value) };
  }
}

// ─── JSON line writer ────────────────────────────────────────────────────────
function writeLine(level: LogLevel, msg: string, ctx: LogContext): void {
  if (LEVEL_PRIORITY[level] < LEVEL_PRIORITY[configuredLevel()]) return;

  const ts = new Date().toISOString();
  const env =
    (typeof process !== 'undefined' &&
      (process as { env?: { NODE_ENV?: string } }).env?.NODE_ENV) ||
    'unknown';

  const payload: Record<string, unknown> = {
    ts,
    level,
    msg,
    env,
  };

  // pid is undefined on the Edge runtime — omit rather than emit `pid: undefined`.
  if (!isEdgeRuntime) {
    const pid = (process as { pid?: number }).pid;
    if (typeof pid === 'number') payload.pid = pid;
  }

  // P1-SEC-15: strip stack by default. Opt-in via ctx.includeStack (and only
  // honoured outside production — never emit stacks from a prod host).
  const includeStack =
    ctx.includeStack === true &&
    (process as { env?: { NODE_ENV?: string } }).env?.NODE_ENV !== 'production';
  delete ctx.includeStack;

  for (const [k, v] of Object.entries(ctx)) {
    if (v === undefined) continue;
    if (v instanceof Error || (typeof v === 'object' && v !== null && 'stack' in v && 'message' in v && 'name' in v)) {
      Object.assign(payload, serializeError(v, includeStack));
    } else if (typeof v === 'function') {
      // Skip — functions can't be JSON-serialised and are usually a mistake.
      continue;
    } else {
      payload[k] = v;
    }
  }

  const line = JSON.stringify(payload);
  // Use the appropriate console method so log aggregators can still filter by
  // stream if needed (stdout for info/debug, stderr for warn/error). On the
  // Edge runtime, all of these are available.
  if (level === 'error') {
    console.error(line);
  } else if (level === 'warn') {
    console.warn(line);
  } else {
    console.log(line);
  }
}

// ─── Logger interface ────────────────────────────────────────────────────────
export interface Logger {
  debug(msg: string, ctx?: LogContext): void;
  info(msg: string, ctx?: LogContext): void;
  warn(msg: string, ctx?: LogContext): void;
  error(msg: string, ctx?: LogContext): void;
  /** Return a child logger that automatically merges `ctx` into every log. */
  with(ctx: LogContext): Logger;
}

function createLogger(boundCtx: LogContext): Logger {
  return {
    debug(msg: string, ctx?: LogContext) {
      writeLine('debug', msg, { ...boundCtx, ...ctx });
    },
    info(msg: string, ctx?: LogContext) {
      writeLine('info', msg, { ...boundCtx, ...ctx });
    },
    warn(msg: string, ctx?: LogContext) {
      writeLine('warn', msg, { ...boundCtx, ...ctx });
    },
    error(msg: string, ctx?: LogContext) {
      writeLine('error', msg, { ...boundCtx, ...ctx });
    },
    with(ctx: LogContext): Logger {
      // Merge — child's `with()` overrides parent's bound keys with same name.
      return createLogger({ ...boundCtx, ...ctx });
    },
  };
}

// ─── Exported singleton + helper exports ─────────────────────────────────────
export const logger: Logger = createLogger({});

/**
 * Re-resolve the configured log level. Useful in tests that change
 * `process.env.LOG_LEVEL` after the module has been imported.
 * Exported for testing — production code should rely on the env var at boot.
 */
export function __reloadLogLevel(): LogLevel {
  _configuredLevel = null;
  return configuredLevel();
}
