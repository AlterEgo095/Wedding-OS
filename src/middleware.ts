import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// Middleware is no longer used for admin auth verification.
// Admin API routes handle their own authentication via getAuthUser() from @/lib/auth.
// The previous implementation used jsonwebtoken in Edge Runtime which is not supported,
// causing all admin API calls to fail with 401 "Invalid or expired token".
// Authentication is now handled directly in each API route for reliability.

export function middleware(request: NextRequest) {
  // Security headers are handled in next.config.ts
  return NextResponse.next()
}

export const config = {
  matcher: [],
}
