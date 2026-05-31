import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { NextRequest } from 'next/server';
import { db } from './db';

// CRITICAL: JWT_SECRET must be set via environment variable in production
const JWT_SECRET = process.env.JWT_SECRET || (
  process.env.NODE_ENV === 'production'
    ? (() => { throw new Error('FATAL: JWT_SECRET environment variable is required in production') })()
    : 'wedding-platform-dev-secret-key-not-for-production'
);

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: string;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hashedPassword: string): Promise<boolean> {
  return bcrypt.compare(password, hashedPassword);
}

export function generateToken(user: AuthUser): string {
  return jwt.sign(
    { id: user.id, email: user.email, name: user.name, role: user.role },
    JWT_SECRET,
    { expiresIn: '8h' }
  );
}

export function verifyToken(token: string): AuthUser | null {
  try {
    return jwt.verify(token, JWT_SECRET) as AuthUser;
  } catch {
    return null;
  }
}

export function getTokenFromRequest(request: NextRequest): string | null {
  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }
  const token = request.cookies.get('auth_token')?.value;
  return token || null;
}

export async function getAuthUser(request: NextRequest): Promise<AuthUser | null> {
  const token = getTokenFromRequest(request);
  if (!token) return null;
  const user = verifyToken(token);
  if (!user) return null;
  // Verify user still exists
  const dbUser = await db.adminUser.findUnique({ where: { id: user.id } });
  if (!dbUser) return null;
  return user;
}

export function hasPermission(role: string, requiredRoles: string[]): boolean {
  const roleHierarchy: Record<string, number> = {
    SUPER_ADMIN: 4,
    ORGANIZER: 3,
    RECEPTION: 2,
    CONTROLLER: 1,
  };
  const userLevel = roleHierarchy[role] || 0;
  return requiredRoles.some(r => (roleHierarchy[r] || 0) <= userLevel);
}

// Simple in-memory rate limiter for login attempts
const loginAttempts = new Map<string, { count: number; lastAttempt: number }>();
const MAX_LOGIN_ATTEMPTS = 5;
const LOGIN_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

export function checkLoginRateLimit(email: string): boolean {
  const now = Date.now();
  const record = loginAttempts.get(email);

  if (!record || (now - record.lastAttempt) > LOGIN_WINDOW_MS) {
    loginAttempts.set(email, { count: 1, lastAttempt: now });
    return true;
  }

  if (record.count >= MAX_LOGIN_ATTEMPTS) {
    return false;
  }

  record.count++;
  record.lastAttempt = now;
  return true;
}

export function resetLoginRateLimit(email: string): void {
  loginAttempts.delete(email);
}
