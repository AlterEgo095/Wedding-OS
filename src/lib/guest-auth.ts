import jwt from 'jsonwebtoken';
import { db } from './db';

// ─── Configuration ───
const GUEST_JWT_SECRET = process.env.JWT_SECRET + '-guest-session';
const GUEST_TOKEN_EXPIRY = '30d'; // Long-lived for convenience
const GUEST_COOKIE_NAME = 'guest_session';
const SESSION_EXPIRY_DAYS = 30;

export interface GuestTokenPayload {
  guestId: string;
  sessionId: string;
  code: string;
}

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

  const token = generateGuestToken({
    guestId,
    sessionId: '', // Will be set after creation
    code: invitationCode,
  });

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + SESSION_EXPIRY_DAYS);

  const session = await db.guestSession.create({
    data: {
      guestId,
      token,
      userAgent: userAgent || null,
      ipAddress: ipAddress || null,
      expiresAt,
      isActive: true,
    },
  });

  // Update token with actual session ID
  const finalToken = generateGuestToken({
    guestId,
    sessionId: session.id,
    code: invitationCode,
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

  return { token: finalToken, sessionId: session.id, expiresAt };
}

// ─── Session Validation ───
export async function validateGuestSession(token: string): Promise<{
  valid: boolean;
  guestId?: string;
  sessionId?: string;
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

  // Update last accessed
  await db.guestSession.update({
    where: { id: session.id },
    data: { lastAccessedAt: new Date() },
  });

  return { valid: true, guestId: payload.guestId, sessionId: payload.sessionId };
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
  await db.guestAccessLog.create({
    data: {
      guestId: params.guestId || null,
      action: params.action,
      details: params.details || null,
      userAgent: params.userAgent || null,
      ipAddress: params.ipAddress || null,
      referrer: params.referrer || null,
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
