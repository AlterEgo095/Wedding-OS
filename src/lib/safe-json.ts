// ══════════════════════════════════════════════════════════════════════════════
// safeJsonParse — P2-SEC-7
// ══════════════════════════════════════════════════════════════════════════════
//
// Replaces the unsafe `JSON.parse(theme.customizations)` pattern flagged in
// P2-SEC-7. The previous sites called `JSON.parse` directly inside try/catch
// blocks that swallowed the error, which:
//   - returned `null` on invalid JSON, then crashed on `.map()` downstream
//   - returned `null` on `null`/`undefined` inputs (the column is nullable)
//   - silently swallowed syntax errors, making malformed DB rows invisible
//
// This helper:
//   - Returns the `fallback` for null/undefined/empty string/invalid JSON
//   - Returns the parsed value (typed T) for valid JSON
//   - NEVER throws — caller can use it inline without try/catch
//   - Logs the parse failure (via logger) so malformed rows aren't invisible
//
// Usage:
//   import { safeJsonParse } from '@/lib/safe-json'
//   const layers = safeJsonParse<ThemeLayer[]>(theme.customizations, [])
//   const meta = safeJsonParse<{ color?: string }>(invoice.metadata, {})

import { logger } from './logger';

export function safeJsonParse<T>(s: string | null | undefined, fallback: T): T {
  if (s === null || s === undefined) return fallback;
  if (typeof s !== 'string') {
    // Defensive: a non-string slipped through (e.g. already-parsed object).
    // We still return the fallback because callers expect T — returning
    // the value as-is would break the contract.
    logger.warn('safeJsonParse: non-string input', { valueType: typeof s });
    return fallback;
  }
  const trimmed = s.trim();
  if (trimmed.length === 0) return fallback;
  try {
    return JSON.parse(trimmed) as T;
  } catch (err) {
    // Log the failure with a snippet so ops can identify the row. We truncate
    // the snippet to 200 chars to avoid dumping a multi-MB blob into logs.
    const snippet = trimmed.length > 200 ? `${trimmed.slice(0, 200)}…(${trimmed.length}b)` : trimmed;
    logger.warn('safeJsonParse: invalid JSON, returning fallback', {
      snippet,
      err: err instanceof Error ? err : new Error(String(err)),
    });
    return fallback;
  }
}
