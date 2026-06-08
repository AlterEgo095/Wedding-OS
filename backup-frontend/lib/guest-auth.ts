import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { db } from './db';

// ─── Configuration ───
const GUEST_JWT_SECRET = (process.env.JWT_SECRET || 'dev-only-secret') + '-guest-session';
const GUEST_TOKEN_EXPIRY = '30d'; // Long-lived for convenience
const GUEST_COOKIE_NAME = 'guest_session';
const SESSION_EXPIRY_DAYS = parseInt(process.env.GUEST_SESSION_DAYS || '30', 10);
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || process.env.JWT_SECRET || 'dev-encryption-key';
const ENCRYPTION_ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const TAG_LENGTH = 16;
const BRUTE_FORCE_BAN_MINUTES = parseInt(process.env.BRUTE_FORCE_BAN_MINUTES || '60', 10);
const MAX_LOGIN_ATTEMPTS_PER_HOUR = parseInt(process.env.MAX_LOGIN_ATTEMPTS_PER_HOUR || '10', 10);

export interface GuestTokenPayload {
  guestId: string;
  sessionId: string;
  code: string;
  fingerprint: string; // Device fingerprint hash
}

// ─── Encryption Utilities ───
// Used to encrypt guest IDs in URLs so they can't be enumerated
function getEncryptionKey(): Buffer {
  // Derive a 32-byte key from the encryption key string
  return crypto.createHash('sha256').update(ENCRYPTION_KEY).digest();
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

// Clean up expired entries every 10 minutes
setInterval(() => {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  for (const [key, entry] of bruteForceStore.entries()) {
    if (entry.firstAttempt < oneHourAgo || (entry.bannedUntil && new Date() > entry.bannedUntil)) {
      bruteForceStore.delete(key);
    }
  }
}, 10 * 60 * 1000);

// ─── Token Generation ───
export function generateGuestToken(payload: GuestTokenPayload): string {
  return jwt.sign(payload, GUEST_JWT_SECRET, { expiresIn: GUEST_TOKEN_EXPIRY });
}

export function verifyGuestToken(token: string): GuestTokenPayload | null {
  try {
    return jwt.verify(token, GUEST_JWT_SECRET) as GuestTokenPayload;
  } catch {
    return null;
  }
}

// ─── Session Management ───
export async function createGuestSession(
  guestId: string,
  invitationCode: string,
  userAgent?: string,
  ipAddress?: string
) {
  // Deactivate all existing sessions for this guest
  await db.guestSession.updateMany({
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

  const session = await db.guestSession.create({
    data: {
      guestId,
      token,
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

  await db.guestSession.update({
    where: { id: session.id },
    data: { token: finalToken },
  });

  // Update guest access info
  await db.guest.update({
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

  const session = await db.guestSession.findUnique({
    where: { id: payload.sessionId, token, isActive: true },
  });

  if (!session) return { valid: false };

  if (new Date() > session.expiresAt) {
    await db.guestSession.update({
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
  await db.guestSession.update({
    where: { id: session.id },
    data: { lastAccessedAt: new Date() },
  });

  // Update guest lastAccessAt
  await db.guest.update({
    where: { id: payload.guestId },
    data: { lastAccessAt: new Date() },
  });

  return { valid: true, guestId: payload.guestId, sessionId: payload.sessionId, fingerprintMismatch };
}

// ─── Access Logging ───
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

  await db.guestAccessLog.create({
    data: {
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
export async function getAuthenticatedGuest(guestId: string) {
  const guest = await db.guest.findUnique({
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
