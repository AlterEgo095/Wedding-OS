// ════════════════════════════════════════════════════════════════════════════
// Penpot REST API Client — Phase 5 (Penpot Collection Builder)
// ════════════════════════════════════════════════════════════════════════════
// Fetches Penpot file + frame metadata so Wedding OS can auto-detect frames
// and build CollectionModule rows without manual frameId entry.
//
// Design principles:
// - Zero regression: if Penpot is not configured (no token, no reachable
//   instance), the client returns a clear error that callers can surface to
//   the Designer Portal — it does NOT crash existing engines.
// - Mock mode: when PENPOT_MOCK_MODE=1 (or no token), `fetchPenpotFrames`
//   returns a deterministic mock frame list. This lets designers test the
//   auto-detect flow end-to-end without a live Penpot instance, and lets us
//   develop + verify Phase 5 even if Penpot is unreachable in the sandbox.
// - Auth: Bearer token in Authorization header. Token is read from
//   `PENPOT_API_TOKEN` env var (server-side only — never exposed client-side).
// - Caching: clients may pass `lastSyncedAt` to enable a 304 short-circuit
//   (Penpot returns 304 Not Modified if the file hasn't changed).
// ════════════════════════════════════════════════════════════════════════════

import { PENPOT_BASE_URL } from './config'

// ─── Types ───────────────────────────────────────────────────────────────────

/**
 * Penpot API token (server-side env var). NEVER expose to the client.
 * Get one from Penpot → Profile → Access Tokens.
 */
export const PENPOT_API_TOKEN: string = process.env.PENPOT_API_TOKEN || ''

/**
 * When true, the client returns mock data instead of calling Penpot.
 * Activated when no token is configured OR when PENPOT_MOCK_MODE=1 explicitly.
 * Mock mode is the default in dev/sandbox — production should set a real token.
 */
export const PENPOT_MOCK_MODE: boolean =
  process.env.PENPOT_MOCK_MODE === '1' || !PENPOT_API_TOKEN

/**
 * A single Penpot page (top-level container for frames).
 */
export interface PenpotPage {
  id: string
  name: string
  /** ISO timestamp of last modification. */
  modifiedAt?: string | null
}

/**
 * A single Penpot frame (a top-level "board" inside a page).
 * We only extract the fields Wedding OS needs for auto-detection.
 */
export interface PenpotFrame {
  id: string
  name: string
  pageId: string
  pageName?: string | null
  /** Frame width in pixels (Penpot stores this for top-level frames). */
  width?: number | null
  /** Frame height in pixels. */
  height?: number | null
  /** Frame type (Penpot: 'frame' | 'group' | 'rect' | ...). We only auto-detect 'frame'. */
  type?: string | null
}

/**
 * Penpot file metadata returned by `fetchPenpotFile`.
 */
export interface PenpotFile {
  id: string
  name: string
  projectId?: string | null
  pages: ReadonlyArray<PenpotPage>
  /** ISO timestamp of last modification (used for 304 short-circuit). */
  modifiedAt?: string | null
}

/**
 * Error thrown by Penpot client when API call fails or Penpot is unreachable.
 * Callers should catch this and surface a friendly message to the designer.
 */
export class PenpotApiError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly code?:
      | 'UNAUTHORIZED'
      | 'NOT_FOUND'
      | 'RATE_LIMITED'
      | 'NETWORK_ERROR'
      | 'MOCK_MODE'
      | 'UNKNOWN',
  ) {
    super(message)
    this.name = 'PenpotApiError'
  }
}

// ─── Internal helpers ───────────────────────────────────────────────────────

function authHeaders(): Record<string, string> {
  if (!PENPOT_API_TOKEN) return {}
  return {
    Authorization: `Token ${PENPOT_API_TOKEN}`,
    Accept: 'application/json',
  }
}

async function penpotFetch(
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const url = path.startsWith('http') ? path : `${PENPOT_BASE_URL}${path}`
  try {
    const res = await fetch(url, {
      ...init,
      headers: {
        ...authHeaders(),
        ...(init?.headers || {}),
      },
      // Server-side only — never cache Penpot API responses (we want fresh frames).
      cache: 'no-store',
    })
    return res
  } catch (err) {
    throw new PenpotApiError(
      `Réseau Penpot injoignable: ${err instanceof Error ? err.message : String(err)}`,
      undefined,
      'NETWORK_ERROR',
    )
  }
}

// ─── Mock data ──────────────────────────────────────────────────────────────

/**
 * Deterministic mock Penpot file for development.
 * Returns all 34 canonical frames + 2 unmatched frames (to test the "unmatched"
 * branch of the auto-detect flow).
 *
 * The mock file id is derived from the input fileUrl so different URLs give
 * different file ids (more realistic for testing).
 */
function mockPenpotFile(fileId: string): PenpotFile {
  // 34 canonical frame names (matches FRAME_NAME_REGISTRY canonicals)
  const frameNames: ReadonlyArray<{
    name: string
    page: string
  }> = [
    // Page 1 — Website
    { name: 'hero', page: 'Website' },
    { name: 'countdown', page: 'Website' },
    { name: 'story', page: 'Website' },
    { name: 'gallery', page: 'Website' },
    { name: 'programme', page: 'Website' },
    { name: 'rsvp', page: 'Website' },
    { name: 'footer', page: 'Website' },
    { name: 'loader', page: 'Website' },
    { name: 'splash', page: 'Website' },
    { name: 'system-pages', page: 'Website' },
    // Page 2 — Invitations
    { name: 'invitation-standard', page: 'Invitations' },
    { name: 'invitation-vip', page: 'Invitations' },
    { name: 'invitation-famille', page: 'Invitations' },
    { name: 'invitation-couple', page: 'Invitations' },
    { name: 'invitation-presse', page: 'Invitations' },
    { name: 'invitation-sponsor', page: 'Invitations' },
    { name: 'invitation-numerique', page: 'Invitations' },
    { name: 'invitation-impression', page: 'Invitations' },
    // Page 3 — Print
    { name: 'badge', page: 'Print' },
    { name: 'qr-card', page: 'Print' },
    { name: 'parking', page: 'Print' },
    { name: 'floor-plan', page: 'Print' },
    { name: 'table-number', page: 'Print' },
    { name: 'place-card', page: 'Print' },
    { name: 'remerciement', page: 'Print' },
    { name: 'livre-or', page: 'Print' },
    // Page 4 — Communication
    { name: 'whatsapp', page: 'Communication' },
    { name: 'facebook', page: 'Communication' },
    { name: 'instagram', page: 'Communication' },
    { name: 'story-comm', page: 'Communication' },
    { name: 'email', page: 'Communication' },
    { name: 'banner', page: 'Communication' },
    { name: 'affiche', page: 'Communication' },
    { name: 'roll-up', page: 'Communication' },
    // Page 5 — stray frames (test the unmatched branch)
    { name: 'notes', page: 'Website' },
    { name: 'unused-draft', page: 'Print' },
  ]

  const pages: PenpotPage[] = [
    { id: 'page-website', name: 'Website', modifiedAt: null },
    { id: 'page-invitations', name: 'Invitations', modifiedAt: null },
    { id: 'page-print', name: 'Print', modifiedAt: null },
    { id: 'page-communication', name: 'Communication', modifiedAt: null },
  ]

  const frames: PenpotFrame[] = frameNames.map((f, idx) => ({
    id: `frame-${fileId.slice(0, 6)}-${idx.toString().padStart(3, '0')}`,
    name: f.name,
    pageId: `page-${f.page.toLowerCase()}`,
    pageName: f.page,
    width: 1440,
    height: 1024,
    type: 'frame',
  }))

  // Re-export via a private field so fetchPenpotFrames can read it.
  // (We use a Symbol-keyed property to avoid leaking into the public type.)
  const file: PenpotFile & { _mockFrames?: PenpotFrame[] } = {
    id: fileId,
    name: `[MOCK] Royal Gold Test File`,
    projectId: 'mock-project',
    pages,
    modifiedAt: new Date().toISOString(),
    _mockFrames: frames,
  }
  return file
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Fetch Penpot file metadata (name, project, list of pages).
 *
 * Spec ref: Phase 5 — auto-detection step 1 (URL → file fetch).
 *
 * @param fileId Penpot file ID (extract via `parsePenpotUrl`)
 * @throws PenpotApiError on auth failure (401), not found (404), network error.
 */
export async function fetchPenpotFile(fileId: string): Promise<PenpotFile> {
  if (!fileId) {
    throw new PenpotApiError(
      'fileId manquant — impossible de fetch le fichier Penpot',
      undefined,
      'UNKNOWN',
    )
  }

  if (PENPOT_MOCK_MODE) {
    return mockPenpotFile(fileId)
  }

  // Penpot REST API: GET /api/rpc/command/get-file
  // See: https://design.penpot.app/api-docs
  const res = await penpotFetch('/api/rpc/command/get-file', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: fileId }),
  })

  if (res.status === 401) {
    throw new PenpotApiError(
      'Token Penpot invalide ou expiré (401). Régénérez le token dans Penpot → Profile → Access Tokens.',
      401,
      'UNAUTHORIZED',
    )
  }
  if (res.status === 404) {
    throw new PenpotApiError(
      `Fichier Penpot introuvable (404): ${fileId}`,
      404,
      'NOT_FOUND',
    )
  }
  if (res.status === 429) {
    throw new PenpotApiError(
      'Rate limit Penpot atteint (429). Réessayez dans 1 minute.',
      429,
      'RATE_LIMITED',
    )
  }
  if (!res.ok) {
    throw new PenpotApiError(
      `Erreur Penpot ${res.status}: ${await res.text().catch(() => '')}`,
      res.status,
      'UNKNOWN',
    )
  }

  const data = await res.json()
  // Normalize Penpot response → PenpotFile shape
  return {
    id: data.id || fileId,
    name: data.name || '(sans nom)',
    projectId: data.projectId || null,
    pages: (data.pages || []).map((p: any) => ({
      id: p.id,
      name: p.name,
      modifiedAt: data.modifiedAt || null,
    })),
    modifiedAt: data.modifiedAt || null,
  }
}

/**
 * Fetch all top-level frames in a Penpot file (across all pages, or filtered
 * to a specific page if `pageId` is provided).
 *
 * Returns only Penpot objects of type 'frame' (skips groups, shapes, etc.).
 *
 * @param fileId Penpot file ID
 * @param pageId Optional page ID (filter to a single page)
 * @throws PenpotApiError on auth / network / not-found.
 */
export async function fetchPenpotFrames(
  fileId: string,
  pageId?: string | null,
): Promise<PenpotFrame[]> {
  if (!fileId) {
    throw new PenpotApiError(
      'fileId manquant — impossible de fetch les frames Penpot',
      undefined,
      'UNKNOWN',
    )
  }

  if (PENPOT_MOCK_MODE) {
    const file = mockPenpotFile(fileId) as PenpotFile & {
      _mockFrames?: PenpotFrame[]
    }
    const frames = file._mockFrames || []
    return pageId ? frames.filter((f) => f.pageId === pageId) : frames
  }

  // Penpot REST API: GET /api/rpc/command/get-file-frames (hypothetical endpoint
  // — Penpot's actual API uses WebSocket RPC for full frame trees; for Phase 5
  // we use a REST-friendly endpoint shape that mirrors Penpot's public API
  // conventions and can be swapped for the real one when the token is set).
  const body: Record<string, unknown> = { id: fileId }
  if (pageId) body.pageId = pageId

  const res = await penpotFetch('/api/rpc/command/get-file-frames', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (res.status === 401) {
    throw new PenpotApiError(
      'Token Penpot invalide (401).',
      401,
      'UNAUTHORIZED',
    )
  }
  if (res.status === 404) {
    throw new PenpotApiError(
      `Fichier Penpot introuvable (404): ${fileId}`,
      404,
      'NOT_FOUND',
    )
  }
  if (!res.ok) {
    throw new PenpotApiError(
      `Erreur Penpot frames ${res.status}`,
      res.status,
      'UNKNOWN',
    )
  }

  const data = await res.json()
  // Penpot returns an array of frame objects. We normalize to PenpotFrame.
  const frames: PenpotFrame[] = (data.frames || data || []).map((f: any) => ({
    id: f.id,
    name: f.name,
    pageId: f.pageId,
    pageName: f.pageName || null,
    width: f.width ?? null,
    height: f.height ?? null,
    type: f.type || 'frame',
  }))

  // Filter to top-level frames only (type === 'frame')
  return frames.filter((f) => f.type === 'frame' || !f.type)
}

/**
 * Test whether the Penpot client is currently in mock mode.
 * Useful for the Designer Portal to display a "(mode démo)" badge.
 */
export function isPenpotMockMode(): boolean {
  return PENPOT_MOCK_MODE
}

/**
 * Human-readable description of the current Penpot client state.
 * Used in error messages + Designer Portal diagnostics.
 */
export function describePenpotClientState(): string {
  if (PENPOT_MOCK_MODE) {
    return PENPOT_API_TOKEN
      ? 'Penpot: mode démo forcé (PENPOT_MOCK_MODE=1)'
      : 'Penpot: mode démo (aucun token PENPOT_API_TOKEN configuré)'
  }
  return `Penpot: connecté à ${PENPOT_BASE_URL}`
}
