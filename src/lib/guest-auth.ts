import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { NextResponse } from 'next/server';
import { db, tenantDb } from './db';
import { devFallbackSecret } from './auth';
import { getTenantContext } from './tenant-context';

// ─── Configuration ───
// SECURITY (P0-SEC-2): Previously fell back to 'dev-only-secret' which is
// public knowledge and would allow guest-session JWT forgery in production.
// Now resolved lazily via getGuestJwtSecret() which fails-fast in production.
const GUEST_TOKEN_EXPIRY = '30d'; // Long-lived for convenience
const GUEST_COOKIE_NAME = 'guest_session';
const SESSION_EXPIRY_DAYS = parseInt(process.env.GUEST_SESSION_DAYS || '30', 10);
// SECURITY (P0-SEC-3): Previously fell back to 'dev-encryption-key' which is
// public knowledge and would allow invitation-link token forgery in production.
// Now resolved lazily via getEncryptionKeySource() which fails-fast in production.
const ENCRYPTION_ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const TAG_LENGTH = 16;
const BRUTE_FORCE_BAN_MINUTES = parseInt(process.env.BRUTE_FORCE_BAN_MINUTES || '60', 10);
const MAX_LOGIN_ATTEMPTS_PER_HOUR = parseInt(process.env.MAX_LOGIN_ATTEMPTS_PER_HOUR || '10', 10);

let _guestJwtSecret: string | null = null;
function getGuestJwtSecret(): string {
  if (_guestJwtSecret !== null) return _guestJwtSecret;
  const env = process.env.JWT_SECRET;
  if (env && env.length >= 32) {
    _guestJwtSecret = env + '-guest-session';
    return _guestJwtSecret;
  }
  const isProd =
    process.env.NODE_ENV === 'production' &&
    process.env.NEXT_PHASE !== 'phase-production-build';
  if (isProd) {
    throw new Error(
      'FATAL: JWT_SECRET is missing or too short (<32 chars) in production. ' +
      'Guest session authentication is disabled until JWT_SECRET is set.'
    );
  }
  console.warn(
    'WARNING: JWT_SECRET not set — using insecure dev-only guest JWT fallback. ' +
    'Set JWT_SECRET in your .env file with: openssl rand -base64 48'
  );
  _guestJwtSecret = devFallbackSecret('guest-jwt');
  return _guestJwtSecret;
}

// ─── Encryption key (C3 remediation — CONS-2-SECURITY) ─────────────────────
// Previously: this function fell back to `process.env.JWT_SECRET` when
// `ENCRYPTION_KEY` was absent. That collapsed two orthogonal secrets into
// one — a leak of JWT_SECRET would also leak the AES-256-GCM key used to
// encrypt guest invitation linkTokens and 2FA secrets. The two secrets
// MUST be distinct: JWT_SECRET signs stateless auth tokens (rotated often,
// leaked = forged sessions); ENCRYPTION_KEY protects data-at-rest (rotated
// rarely, leaked = decryptable historical ciphertext).
//
// Fix: ENCRYPTION_KEY is now REQUIRED in production and must NOT equal
// JWT_SECRET. Dev-only fallback remains (machine-derived, never committed).
let _encryptionKeySource: string | null = null;
function getEncryptionKeySource(): string {
  if (_encryptionKeySource !== null) return _encryptionKeySource;
  const env = process.env.ENCRYPTION_KEY;
  const isProd =
    process.env.NODE_ENV === 'production' &&
    process.env.NEXT_PHASE !== 'phase-production-build';

  if (env && env.length >= 32) {
    // Defense-in-depth: refuse to operate if ENCRYPTION_KEY === JWT_SECRET.
    // Even if both are set explicitly, sharing them collapses the two
    // secrets into one — fail-fast so the operator notices.
    if (process.env.JWT_SECRET && env === process.env.JWT_SECRET) {
      throw new Error(
        'FATAL: ENCRYPTION_KEY must differ from JWT_SECRET. ' +
        'Generate a separate key with: openssl rand -base64 48'
      );
    }
    _encryptionKeySource = env;
    return _encryptionKeySource;
  }

  if (isProd) {
    throw new Error(
      'FATAL: ENCRYPTION_KEY is missing or too short (<32 chars) in production. ' +
      'Invitation link encryption is disabled until ENCRYPTION_KEY is set. ' +
      'Generate one with: openssl rand -base64 48'
    );
  }
  console.warn(
    'WARNING: ENCRYPTION_KEY not set — using insecure dev-only fallback. ' +
    'Set ENCRYPTION_KEY in your .env file with: openssl rand -base64 48'
  );
  // P2-SEC-9 + CONS-2-SECURITY: dev-only fallback derived from machine
  // signals (not hardcoded, NOT JWT_SECRET). The downstream getEncryptionKey()
  // derives a 32-byte AES-256 key via SHA-256, so any stable source string
  // ≥ 32 chars works correctly here.
  _encryptionKeySource = devFallbackSecret('encryption-key');
  return _encryptionKeySource;
}

export interface GuestTokenPayload {
  guestId: string;
  sessionId: string;
  code: string;
  fingerprint: string; // Device fingerprint hash
}

// ─── Encryption Utilities ───
// Used to encrypt guest IDs in URLs so they can't be enumerated
export function getEncryptionKey(): Buffer {
  // Derive a 32-byte key from the encryption key string
  return crypto.createHash('sha256').update(getEncryptionKeySource()).digest();
}

export function encryptId(id: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, key, iv);

  let encrypted = cipher.update(id, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const tag = cipher.getAuthTag();

  // Format: iv:tag:encrypted (all hex)
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted}`;
}

export function decryptId(encryptedStr: string): string | null {
  try {
    const parts = encryptedStr.split(':');
    if (parts.length !== 3) return null;

    const key = getEncryptionKey();
    const iv = Buffer.from(parts[0], 'hex');
    const tag = Buffer.from(parts[1], 'hex');
    const encrypted = parts[2];

    const decipher = crypto.createDecipheriv(ENCRYPTION_ALGORITHM, key, iv);
    decipher.setAuthTag(tag);

    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  } catch {
    return null;
  }
}

// Generate a secure invitation link token (encrypted invitation code)
export function generateInvitationLinkToken(invitationCode: string): string {
  return encryptId(invitationCode);
}

// Decrypt invitation link token back to invitation code
export function decryptInvitationLinkToken(token: string): string | null {
  return decryptId(token);
}

// ─── Device Fingerprint ───
export function generateFingerprint(userAgent: string, ip: string): string {
  // Create a hash of UA + IP subnet for device identification
  const data = `${userAgent}|${ip.split('.').slice(0, 3).join('.')}`;
  return crypto.createHash('sha256').update(data).digest('hex').substring(0, 16);
}

// ─── Brute Force Protection ───
interface BruteForceEntry {
  attempts: number;
  firstAttempt: Date;
  banned: boolean;
  bannedUntil?: Date;
}

const bruteForceStore = new Map<string, BruteForceEntry>();

export function checkBruteForce(key: string): { allowed: boolean; banned: boolean; remainingAttempts: number } {
  const entry = bruteForceStore.get(key);

  if (!entry) {
    return { allowed: true, banned: false, remainingAttempts: MAX_LOGIN_ATTEMPTS_PER_HOUR };
  }

  // Check if ban has expired
  if (entry.banned && entry.bannedUntil && new Date() > entry.bannedUntil) {
    bruteForceStore.delete(key);
    return { allowed: true, banned: false, remainingAttempts: MAX_LOGIN_ATTEMPTS_PER_HOUR };
  }

  // Check if the window has expired (1 hour)
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  if (entry.firstAttempt < oneHourAgo) {
    bruteForceStore.delete(key);
    return { allowed: true, banned: false, remainingAttempts: MAX_LOGIN_ATTEMPTS_PER_HOUR };
  }

  if (entry.banned) {
    return { allowed: false, banned: true, remainingAttempts: 0 };
  }

  return {
    allowed: entry.attempts < MAX_LOGIN_ATTEMPTS_PER_HOUR,
    banned: false,
    remainingAttempts: Math.max(0, MAX_LOGIN_ATTEMPTS_PER_HOUR - entry.attempts),
  };
}

export function recordFailedAttempt(key: string): void {
  const entry = bruteForceStore.get(key) || {
    attempts: 0,
    firstAttempt: new Date(),
    banned: false,
  };

  entry.attempts += 1;

  if (entry.attempts >= MAX_LOGIN_ATTEMPTS_PER_HOUR) {
    entry.banned = true;
    entry.bannedUntil = new Date(Date.now() + BRUTE_FORCE_BAN_MINUTES * 60 * 1000);
  }

  bruteForceStore.set(key, entry);
}

export function clearBruteForce(key: string): void {
  bruteForceStore.delete(key);
}

// ─── Cleanup interval ownership (P2-PERF-15) ─────────────────────────────
// Previously: a module-scope setInterval() that was never cleared, causing
// (a) HMR multiplication in dev and (b) the event loop to stay alive past
// SIGTERM in production.
// Now: the interval is registered via registerTokenReplayCacheCleanup(),
// which is called from src/lib/instrumentation-node.ts (which also clears
// the handle on shutdown).
let _bruteForceCleanupHandle: ReturnType<typeof setInterval> | null = null;
const BRUTE_FORCE_CLEANUP_INTERVAL_MS = 10 * 60 * 1000;

function runBruteForceCleanup() {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  for (const [key, entry] of bruteForceStore.entries()) {
    if (entry.firstAttempt < oneHourAgo || (entry.bannedUntil && new Date() > entry.bannedUntil)) {
      bruteForceStore.delete(key);
    }
  }
  // Also prune expired entries from the one-time-use lookup-token cache.
  // (P2-SEC-12: previously a Set<string> was cleared every 10 minutes by an
  // unowned setInterval in auto-auth/route.ts — creating a 5-minute replay
  // window. The cache is now a TTL-bound Map pruned here, and one-time-use
  // tokens are also rejected by their own 15-min timestamp check.)
  pruneExpiredLookupTokens();
}

export function registerTokenReplayCacheCleanup(): ReturnType<typeof setInterval> {
  if (_bruteForceCleanupHandle) return _bruteForceCleanupHandle;
  _bruteForceCleanupHandle = setInterval(runBruteForceCleanup, BRUTE_FORCE_CLEANUP_INTERVAL_MS);
  return _bruteForceCleanupHandle;
}

export function unregisterTokenReplayCacheCleanup() {
  if (_bruteForceCleanupHandle) {
    clearInterval(_bruteForceCleanupHandle);
    _bruteForceCleanupHandle = null;
  }
}

// ─── One-time-use lookup-token cache (P2-SEC-12) ─────────────────────────
// Replaces the module-scope Set<string> in api/guest/auto-auth/route.ts.
// The Set was cleared wholesale every 10 min, so for the window between
// minute 10 and minute 15 (when the token's own timestamp expired) the
// token was BOTH reusable AND still valid — a 5-minute replay window.
// The Map stores the token's issue timestamp; isLookupTokenUsed() rejects
// any token whose timestamp is older than 15 minutes regardless of whether
// it's still in the Map, eliminating the replay window entirely.
const LOOKUP_TOKEN_TTL_MS = 15 * 60 * 1000;
const usedLookupTokens = new Map<string, number>(); // token → issuedAt ms

function pruneExpiredLookupTokens() {
  const cutoff = Date.now() - LOOKUP_TOKEN_TTL_MS;
  for (const [token, issuedAt] of usedLookupTokens) {
    if (issuedAt < cutoff) usedLookupTokens.delete(token);
  }
}

/**
 * Mark a one-time-use lookup token as consumed.
 * Returns true if the token was not previously used (caller should proceed),
 * false if the token has already been used (caller should reject).
 *
 * The token is also rejected if its own issuedAt timestamp is older than
 * the lookup-token TTL — even if it's not yet in the Map — because the
 * caller passes the original issue timestamp so we can double-check.
 */
export function consumeLookupToken(token: string, issuedAt: number): boolean {
  // Hard expiry check independent of Map state — closes the 5-min replay
  // window that existed when the Set was cleared wholesale.
  if (Date.now() - issuedAt > LOOKUP_TOKEN_TTL_MS) return false;
  if (usedLookupTokens.has(token)) return false;
  usedLookupTokens.set(token, issuedAt);
  return true;
}

// ─── Token Generation ───
export function generateGuestToken(payload: GuestTokenPayload): string {
  return jwt.sign(payload, getGuestJwtSecret(), { expiresIn: GUEST_TOKEN_EXPIRY });
}

export function verifyGuestToken(token: string): GuestTokenPayload | null {
  try {
    return jwt.verify(token, getGuestJwtSecret()) as GuestTokenPayload;
  } catch {
    return null;
  }
}

// ─── GuestSession.token hashing (C-SEC-4 remediation — CONS-2-SECURITY) ─────
// The `GuestSession.token` column has a @unique constraint and was previously
// stored as the raw JWT plaintext. A DB read alone would let an attacker
// impersonate any guest for the duration of the 30-day session window. We now
// store SHA-256(rawToken) in the DB instead — the cookie/JWT still carries the
// raw token (so the client is unaffected), but the persisted value is a
// 64-char hex hash that cannot be replayed as a bearer.
//
// Migration: existing plaintext sessions become unvalidatable (their hash no
// longer matches the stored row) — guests simply re-authenticate. No data
// migration script is needed; old rows age out via the 30-day expiresAt.
export function hashGuestToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

// ─── Session Management ───
// All session operations use tenantDb which auto-injects weddingId when a
// tenant context is active (set by the calling route via runWithTenant).
// The calling route is responsible for setting the context — typically by
// wrapping the handler in withPublicTenant() or withAdminTenantHandler().
export async function createGuestSession(
  guestId: string,
  invitationCode: string,
  userAgent?: string,
  ipAddress?: string
) {
  // Deactivate all existing sessions for this guest (scoped to current tenant)
  await tenantDb.guestSession.updateMany({
    where: { guestId, isActive: true },
    data: { isActive: false },
  });

  const fingerprint = generateFingerprint(userAgent || 'unknown', ipAddress || 'unknown');

  // Parse device info for detailed recording
  const parsedDevice = parseUserAgent(userAgent || 'unknown');
  const deviceInfoJson = JSON.stringify(parsedDevice);

  const token = generateGuestToken({
    guestId,
    sessionId: '', // Will be set after creation
    code: invitationCode,
    fingerprint,
  });

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + SESSION_EXPIRY_DAYS);

  // weddingId is auto-injected by tenant extension when context is active.
  // P3: also pass it explicitly so Prisma's static types are satisfied (the
  // extension relaxes the runtime contract but not the create-input type).
  //
  // CONS-2-SECURITY (Fix 4): persist hashGuestToken(token) instead of the raw
  // token. The cookie sent to the client carries the raw token; the DB only
  // ever stores the SHA-256 hash.
  const tenantCtx = getTenantContext();
  const session = await tenantDb.guestSession.create({
    data: {
      weddingId: tenantCtx!.weddingId,
      guestId,
      token: hashGuestToken(token),
      userAgent: userAgent || null,
      ipAddress: ipAddress || null,
      fingerprint,
      deviceInfo: deviceInfoJson,
      expiresAt,
      isActive: true,
    },
  });

  // Update token with actual session ID
  const finalToken = generateGuestToken({
    guestId,
    sessionId: session.id,
    code: invitationCode,
    fingerprint,
  });

  await tenantDb.guestSession.update({
    where: { id: session.id },
    data: { token: hashGuestToken(finalToken) },
  });

  // Update guest access info (scoped to current tenant)
  await tenantDb.guest.update({
    where: { id: guestId },
    data: {
      invitationViewed: true,
      invitationViewedAt: new Date(),
      invitationViewCount: { increment: 1 },
      lastAccessAt: new Date(),
    },
  });

  return { token: finalToken, sessionId: session.id, expiresAt, fingerprint };
}

// ─── Session Validation (with fingerprint verification) ───
// Uses tenantDb so sessions are validated against the current tenant context.
// A session token issued in Wedding A will NOT validate when the request is
// scoped to Wedding B — preventing cross-tenant session hijacking.
export async function validateGuestSession(
  token: string,
  userAgent?: string,
  ipAddress?: string
): Promise<{
  valid: boolean;
  guestId?: string;
  sessionId?: string;
  fingerprintMismatch?: boolean;
}> {
  const payload = verifyGuestToken(token);
  if (!payload) return { valid: false };

  // CONS-2-SECURITY (Fix 4): hash the incoming raw token before querying the
  // DB — the persisted column stores SHA-256(token), not the plaintext.
  const tokenHash = hashGuestToken(token);

  // findFirst (not findUnique) so the tenant extension can auto-inject weddingId.
  // Without the extension, this would be a global token lookup (cross-tenant risk).
  const session = await tenantDb.guestSession.findFirst({
    where: { id: payload.sessionId, token: tokenHash, isActive: true },
  });

  if (!session) return { valid: false };

  if (new Date() > session.expiresAt) {
    await tenantDb.guestSession.update({
      where: { id: session.id },
      data: { isActive: false },
    });
    return { valid: false };
  }

  // Verify device fingerprint (warn but don't block if mismatch)
  let fingerprintMismatch = false;
  if (userAgent && ipAddress) {
    const currentFingerprint = generateFingerprint(userAgent, ipAddress);
    if (currentFingerprint !== payload.fingerprint) {
      fingerprintMismatch = true;
      // Log the mismatch for security monitoring
      await logGuestAccess({
        guestId: payload.guestId,
        action: 'FINGERPRINT_MISMATCH',
        details: `Original: ${payload.fingerprint}, Current: ${currentFingerprint}`,
        userAgent,
        ipAddress,
      });
    }
  }

  // Update last accessed
  await tenantDb.guestSession.update({
    where: { id: session.id },
    data: { lastAccessedAt: new Date() },
  });

  // Update guest lastAccessAt (scoped to current tenant)
  await tenantDb.guest.update({
    where: { id: payload.guestId },
    data: { lastAccessAt: new Date() },
  });

  return { valid: true, guestId: payload.guestId, sessionId: payload.sessionId, fingerprintMismatch };
}

// ─── Access Logging ───
// Uses tenantDb so access logs are scoped to the current wedding.
// The weddingId is auto-injected by the extension when context is active.
export async function logGuestAccess(params: {
  guestId?: string;
  action: string;
  details?: string;
  userAgent?: string;
  ipAddress?: string;
  referrer?: string;
}) {
  // Parse device info from user agent for detailed recording
  const parsedDevice = parseUserAgent(params.userAgent || 'unknown');
  const deviceInfoJson = JSON.stringify(parsedDevice);
  const fingerprint = generateFingerprint(params.userAgent || 'unknown', params.ipAddress || 'unknown');

  // P3: pass weddingId explicitly (extension auto-injects at runtime, but the
  // static create-input type requires it). logGuestAccess is only called within
  // a tenant context (the guest-facing routes are wrapped in withPublicTenant).
  const tenantCtx = getTenantContext();
  await tenantDb.guestAccessLog.create({
    data: {
      weddingId: tenantCtx!.weddingId,
      guestId: params.guestId || null,
      action: params.action,
      details: params.details || null,
      userAgent: params.userAgent || null,
      ipAddress: params.ipAddress || null,
      referrer: params.referrer || null,
      fingerprint,
      deviceInfo: deviceInfoJson,
    },
  });
}

// ─── Get Guest Data (Secure - only own data) ───
// Uses tenantDb.findFirst so the lookup is scoped to the current wedding.
// Even if a malicious caller knows a guest ID from another wedding, the
// extension will add weddingId to the where clause and return null.
export async function getAuthenticatedGuest(guestId: string) {
  const guest = await tenantDb.guest.findFirst({
    where: { id: guestId },
    include: {
      table: {
        select: {
          id: true,
          name: true,
          number: true,
        },
      },
    },
  });

  if (!guest) return null;

  // Return only safe fields — never expose internal IDs to other guests
  return {
    id: guest.id,
    firstName: guest.firstName,
    lastName: guest.lastName,
    displayName: guest.displayName,
    invitationType: guest.invitationType,
    invitationCode: guest.invitationCode,
    seats: guest.seats,
    category: guest.category,
    status: guest.status,
    personalMessage: guest.personalMessage,
    checkedIn: guest.checkedIn,
    table: guest.table,
    invitationViewed: guest.invitationViewed,
    invitationViewCount: guest.invitationViewCount,
    lastAccessAt: guest.lastAccessAt,
    encryptedLink: generateInvitationLinkToken(guest.invitationCode),
  };
}

// ─── Cookie Helpers (for server-side) ───
export function getGuestCookieName(): string {
  return GUEST_COOKIE_NAME;
}

export function getSessionExpiryDays(): number {
  return SESSION_EXPIRY_DAYS;
}

/**
 * Set the guest_session cookie on a NextResponse. Used by:
 *   - /api/guest/auth/route.ts        (guest login with invitation code)
 *   - /api/guest/auto-auth/route.ts   (one-time-use lookup-token auto-login)
 *   - /api/guest/invite/route.ts      (invitation link auto-login)
 *
 * Cookie attributes (P2-SEC-4 + P2-CQ-21):
 *   - httpOnly: true (JS cannot read the token → XSS-resistant)
 *   - secure: true in production (HTTPS-only)
 *   - sameSite: 'strict' (CSRF-resistant — was 'lax' before P2-SEC-4. Guest
 *     sessions are accessed only via same-site navigations from invitation
 *     links on the same domain, so 'strict' is safe and closes the cross-site
 *     top-level-navigation leak that 'lax' allowed.)
 *   - path: '/'
 *   - maxAge: defaults to 30 days (overridable via `maxAgeDays`). Matches the
 *     `GUEST_TOKEN_EXPIRY = '30d'` JWT expiry — the cookie and the token
 *     inside it expire together so the user is never left with a cookie
 *     containing an expired token.
 *
 * The 3 guest cookie-setting sites will be refactored by the API-routes
 * agent to call this helper instead of inlining `response.cookies.set(...)`.
 *
 * @param response NextResponse to attach the cookie to.
 * @param token Guest session JWT from generateGuestToken().
 * @param maxAgeDays Optional override (days). Default: 30.
 */
export function setGuestSessionCookie(
  response: NextResponse,
  token: string,
  maxAgeDays?: number
): NextResponse {
  const days = maxAgeDays ?? SESSION_EXPIRY_DAYS;
  response.cookies.set(GUEST_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: days * 24 * 60 * 60,
  });
  return response;
}

// ─── Extract client info from request ───
export function getClientInfo(request: Request) {
  const forwarded = request.headers.get('x-forwarded-for');
  const ip = forwarded ? forwarded.split(',')[0].trim() : request.headers.get('x-real-ip') || 'unknown';
  const userAgent = request.headers.get('user-agent') || 'unknown';
  const referrer = request.headers.get('referer') || 'unknown';
  return { ipAddress: ip, userAgent, referrer };
}

// ─── Parse User Agent for device info ───
export function parseUserAgent(ua: string): {
  browser: string;
  os: string;
  device: string;
  isMobile: boolean;
} {
  let browser = 'Unknown';
  let os = 'Unknown';
  let device = 'Desktop';
  let isMobile = false;

  // Detect browser
  if (ua.includes('Firefox/')) browser = 'Firefox';
  else if (ua.includes('Edg/')) browser = 'Edge';
  else if (ua.includes('Chrome/')) browser = 'Chrome';
  else if (ua.includes('Safari/') && !ua.includes('Chrome')) browser = 'Safari';
  else if (ua.includes('Opera') || ua.includes('OPR/')) browser = 'Opera';

  // Detect OS
  if (ua.includes('Windows')) os = 'Windows';
  else if (ua.includes('Mac OS X')) os = 'macOS';
  else if (ua.includes('Linux')) os = 'Linux';
  else if (ua.includes('Android')) { os = 'Android'; isMobile = true; }
  else if (ua.includes('iPhone') || ua.includes('iPad')) { os = 'iOS'; isMobile = true; }

  // Detect device type
  if (isMobile) device = 'Mobile';
  else if (ua.includes('iPad') || ua.includes('Tablet')) device = 'Tablet';

  return { browser, os, device, isMobile };
}
