// ══════════════════════════════════════════════════════════════════════════════
// Standardised API error responses — P2-CQ-5
// ══════════════════════════════════════════════════════════════════════════════
//
// Replaces the ad-hoc `NextResponse.json({ error: '...' }, { status: N })`
// calls scattered across all 50 API route handlers. Before this module:
//   - Error copy mixed English + French ("Unauthorized — authentication required"
//     in auth.ts vs "Trop de requêtes" in rate-limit.ts).
//   - Some messages ended with a period, some didn't.
//   - The same HTTP status had different copy in different routes
//     (403 was "Forbidden", "Accès refusé", "Forbidden — insufficient permissions").
//
// This module fixes all three:
//   1. Every message is French (the platform's UI language).
//   2. No trailing periods — consistent with French UI copy.
//   3. Each status code has ONE canonical message (override-able via the
//      `msg` param for cases where more specificity is needed, e.g.
//      `badRequest('Email requis')`).
//
// Usage:
//   import { badRequest, unauthorized, forbidden, internalError } from '@/lib/api-errors'
//   if (!email) return badRequest('Email requis')
//   if (!user) return unauthorized()
//   if (!assertWeddingAccess(user, weddingId)) return forbidden()
//   try { ... } catch (e) {
//     logger.error('create-wedding failed', { err: e })
//     return internalError()
//   }

import { NextResponse } from 'next/server';

// ─── Helpers ─────────────────────────────────────────────────────────────────
// All helpers return NextResponse.json with `{ error: <string> }` body shape.
// Body is kept minimal — clients read `error` for display. (Status code is in
// the HTTP response line, not the body, so we don't duplicate it.)

/**
 * 500 Internal Server Error. Default copy: "Erreur interne du serveur".
 * Use for unexpected exceptions (DB errors, third-party API failures, etc.).
 * Pass `msg` only when the caller can give actionable detail (e.g.
 * "Échec de l'envoi du courriel de bienvenue").
 */
export function internalError(msg?: string): NextResponse {
  return NextResponse.json(
    { error: msg ?? 'Erreur interne du serveur' },
    { status: 500 }
  );
}

/**
 * 400 Bad Request. Caller must supply a human-readable reason.
 * Use for validation failures, malformed body, missing required fields.
 */
export function badRequest(msg: string): NextResponse {
  return NextResponse.json({ error: msg }, { status: 400 });
}

/**
 * 401 Unauthorized. Default copy: "Non authentifié".
 * Use when the request lacks valid authentication (no token, expired token).
 * NOT for "you're authenticated but not allowed" — that's `forbidden()`.
 */
export function unauthorized(msg?: string): NextResponse {
  return NextResponse.json(
    { error: msg ?? 'Non authentifié' },
    { status: 401 }
  );
}

/**
 * 403 Forbidden. Default copy: "Accès refusé".
 * Use when the user IS authenticated but lacks permission (e.g. ORGANIZER
 * trying to access /api/platform/* — see requireRole in lib/auth.ts).
 */
export function forbidden(msg?: string): NextResponse {
  return NextResponse.json(
    { error: msg ?? 'Accès refusé' },
    { status: 403 }
  );
}

/**
 * 404 Not Found. Default copy: "Ressource introuvable".
 * Use for missing resources (weddingId not in DB, guest ID doesn't exist).
 */
export function notFound(msg?: string): NextResponse {
  return NextResponse.json(
    { error: msg ?? 'Ressource introuvable' },
    { status: 404 }
  );
}

/**
 * 429 Too Many Requests. Default copy: "Trop de requêtes. Veuillez réessayer dans un instant".
 * Use when a rate limit has been exceeded.
 */
export function rateLimited(msg?: string): NextResponse {
  return NextResponse.json(
    { error: msg ?? 'Trop de requêtes. Veuillez réessayer dans un instant' },
    { status: 429 }
  );
}

/**
 * 409 Conflict. Caller must supply a reason (e.g. "Email déjà utilisé").
 * Use when the request conflicts with current state — duplicate email,
 * slug already taken, wedding already published, etc.
 */
export function conflict(msg: string): NextResponse {
  return NextResponse.json({ error: msg }, { status: 409 });
}


// ─── 5.8.18 P2-1 — Structured API Error helper ───────────────────────────────
//
// Uniform error envelope for client-facing validation failures.
// Shape: { success: false, error: { code, message, field?, details? } }
//
// - `code` is a machine-readable SCREAMING_SNAKE_CASE string the frontend
//   can switch on (e.g. VALIDATION_ERROR, SLUG_REQUIRED, DUPLICATE_SLUG,
//   AUTHENTICATION_REQUIRED, INSUFFICIENT_ROLE, WEDDING_ACCESS_DENIED,
//   RESOURCE_NOT_FOUND, PUBLISHED_REQUIRES_PAID).
// - `message` is a French human-readable string safe to show end users.
// - `field` (optional) names the offending request field (e.g. "slug",
//   "weddingDate") so the frontend can highlight the correct input.
// - `details` (optional) is an array of { path, message } for multi-field
//   validation (e.g. Zod errors).
//
// All existing helpers (badRequest, forbidden, ...) continue to work;
// this is the canonical helper for NEW validation code and for hardening
// existing endpoints one at a time.

export interface StructuredApiError {
  success: false;
  error: {
    code: string;
    message: string;
    field?: string;
    details?: Array<{ path: string; message: string }>;
  };
}

export function structuredError(
  code: string,
  message: string,
  opts?: {
    status?: number;
    field?: string;
    details?: Array<{ path: string; message: string }>;
  }
): NextResponse {
  const body: StructuredApiError = {
    success: false,
    error: {
      code,
      message,
      ...(opts?.field ? { field: opts.field } : {}),
      ...(opts?.details ? { details: opts.details } : {}),
    },
  };
  return NextResponse.json(body, { status: opts?.status ?? 400 });
}

// Convenience factory for the most common validation error pattern.
export function validationError(
  field: string,
  message: string,
  code = 'VALIDATION_ERROR'
): NextResponse {
  return structuredError(code, message, { status: 400, field });
}

// ─── CONS-6-PIPELINE — apiSuccess / apiError helpers ──────────────────────────
//
// Thin wrappers around NextResponse.json for SUCCESS and structured ERROR
// responses. Used by the new /api/platform/deployments/* + published-config
// routes. The existing helpers above (badRequest, internalError, ...) cover
// specific status codes; these two provide a generic shape for routes that
// need to return arbitrary success payloads or non-standard error codes.

/**
 * 2xx success. Default status 200. Body shape: `{ data, ...extra }`.
 *
 * @example
 *   return apiSuccess({ deployment })
 *   return apiSuccess({ deployments, total }, 200, { 'Cache-Control': 'no-store' })
 */
export function apiSuccess(
  data: Record<string, unknown>,
  status: 200 | 201 = 200,
  headers?: Record<string, string>
): NextResponse {
  return NextResponse.json(data, { status, headers });
}

/**
 * Structured error response. Default status 400. Body shape: `{ error }`.
 *
 * @example
 *   return apiError('Deployment not found', 404)
 *   return apiError('Rate limit exceeded', 429, { 'Retry-After': '60' })
 */
export function apiError(
  message: string,
  status: number = 400,
  headers?: Record<string, string>
): NextResponse {
  return NextResponse.json({ error: message }, { status, headers });
}
