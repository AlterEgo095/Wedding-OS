import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { NextRequest } from 'next/server';
import { db } from './db';

const JWT_SECRET = process.env.JWT_SECRET || 'wedding-platform-secret-key-2025-premium';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: string;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hashedPassword: string): Promise<boolean> {
  return bcrypt.compare(password, hashedPassword);
}

export function generateToken(user: AuthUser): string {
  return jwt.sign(
    { id: user.id, email: user.email, name: user.name, role: user.role },
    JWT_SECRET,
    { expiresIn: '24h' }
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
