export const dynamic = 'force-dynamic';

// ══════════════════════════════════════════════════════════════════════════════
// src/app/api/org/signup/route.ts — Mission 6.0 P1.9 — Organization Onboarding
// ══════════════════════════════════════════════════════════════════════════════
//
// Public endpoint (NO auth required, CSRF-exempt — see src/lib/csrf.ts).
// Creates a brand-new organization + its first ORG_ADMIN user + optional first
// wedding in a single Prisma transaction. Returns 201 + sets auth_token +
// csrf_token cookies so the user lands authenticated on /org/[slug]/admin.
//
// Anti-abuse:
//   - Rate limited to 5 req/min per IP (signup endpoint, public).
//   - Email + slug uniqueness checked pre-flight AND via P2002 catch (TOCTOU).
//   - Password hashed with bcrypt (12 rounds) via `hashPassword`.
//   - Password policy enforced (min 8 chars + letter + digit).
//   - NEVER logs password, plain email is logged only on success (audit log).
//
// Status codes:
//   201 → { user, organization, wedding? }   — signup succeeded
//   400 → validation error (zod schema mismatch)
//   409 → email or slug already taken
//   422 → semantic validation error (e.g. password mismatch — caught by zod)
//   429 → rate limit exceeded
//   500 → unexpected error (logged, no stack leak)
//
// The route also exposes a small GET helper used by the wizard to pre-check
// slug/email availability before the user clicks "Terminer":
//   GET /api/org/signup?check=slug&value=agence-mariage
//   GET /api/org/signup?check=email&value=foo@bar.com
// Returns { available: boolean } — 200 always (no 404 leak). Rate-limited 20/min.

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import {
  hashPassword,
  generateToken,
  setAuthCookie,
  type AuthUser,
} from '@/lib/auth';
import { logger } from '@/lib/logger';
import { internalError, badRequest, conflict, rateLimited } from '@/lib/api-errors';
import { checkRateLimitAsync, getRateLimitKey, withSecurityHeaders } from '@/lib/rate-limit';
import { generateCsrfToken, setCsrfCookie } from '@/lib/csrf';
import { getClientInfo } from '@/lib/guest-auth';
import {
  EMAIL_REGEX,
  isValidPassword,
  PASSWORD_POLICY_MSG,
} from '@/lib/constants';
import { buildCoupleLabel, generateSlug } from '@/lib/types';

// ─── Zod schemas ──────────────────────────────────────────────────────────────

const slugRegex = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

const accountSchema = z.object({
  name: z.string().trim().min(1, 'Le nom est requis').max(100, 'Le nom est trop long'),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(200, 'Email trop long')
    .refine((v) => EMAIL_REGEX.test(v), 'Email invalide'),
  password: z
    .string()
    .min(8, 'Le mot de passe doit contenir au moins 8 caractères')
    .refine((v) => isValidPassword(v), PASSWORD_POLICY_MSG),
  confirmPassword: z.string(),
}).refine((d) => d.password === d.confirmPassword, {
  message: 'Les mots de passe ne correspondent pas',
  path: ['confirmPassword'],
});

const organizationSchema = z.object({
  name: z.string().trim().min(1, 'Le nom de l\'organisation est requis').max(120, 'Nom trop long'),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(2, 'Slug trop court (min 2 caractères)')
    .max(80, 'Slug trop long (max 80 caractères)')
    .regex(slugRegex, 'Le slug doit être en minuscules (ex: agence-mariage-cd)'),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(200, 'Email trop long')
    .refine((v) => EMAIL_REGEX.test(v), 'Email d\'organisation invalide'),
  phone: z.string().trim().max(40).optional().or(z.literal('')).transform((v) => v || null),
  plan: z.enum(['TRIAL', 'ESSENTIEL', 'PREMIUM', 'ELITE']).default('TRIAL'),
});

const weddingSchema = z.object({
  brideName: z.string().trim().max(100).optional().or(z.literal('')).default(''),
  groomName: z.string().trim().max(100).optional().or(z.literal('')).default(''),
  coupleLabel: z.string().trim().max(200).optional().or(z.literal('')).default(''),
  weddingDate: z.string().trim().optional().or(z.literal('')).default(''),
  venueName: z.string().trim().max(200).optional().or(z.literal('')).default(''),
  venueCity: z.string().trim().max(200).optional().or(z.literal('')).default(''),
}).refine(
  // If any wedding field is provided, at least coupleLabel or (bride+groom) must be set.
  (d) => {
    const hasAny = !!(d.brideName || d.groomName || d.coupleLabel || d.weddingDate || d.venueName || d.venueCity);
    if (!hasAny) return true; // empty wedding payload is allowed (skip)
    const hasIdentity = !!(d.coupleLabel || d.brideName || d.groomName);
    return hasIdentity;
  },
  { message: 'Renseignez au moins le nom d\'un des mariés ou le label du couple', path: ['coupleLabel'] }
);

const inviteSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .refine((v) => !v || EMAIL_REGEX.test(v), 'Email d\'invitation invalide'),
  role: z.enum(['ORG_MEMBER', 'ORG_VIEWER']).default('ORG_MEMBER'),
});

const signupSchema = z.object({
  account: accountSchema,
  organization: organizationSchema,
  wedding: weddingSchema.optional().nullable().default(null),
  // P1.9 — invites are stored for future use (email sending is out of scope).
  // The API currently ignores them but accepts the payload so the wizard
  // doesn't need a separate "skip" branch.
  invites: z.array(inviteSchema).max(3).optional().default([]),
});

type SignupPayload = z.infer<typeof signupSchema>;

// ─── Plan → maxWeddings / maxMembers defaults ─────────────────────────────────
// Mirrors the PLAN_LIMITS in src/lib/types.ts but expressed as org-level caps
// (not per-wedding). The platform admin can later adjust these via the
// /api/platform/organizations/[id]/limits route (P1.6).
const PLAN_ORG_DEFAULTS: Record<
  'TRIAL' | 'ESSENTIEL' | 'PREMIUM' | 'ELITE',
  { maxWeddings: number; maxMembers: number }
> = {
  TRIAL: { maxWeddings: 1, maxMembers: 3 },
  ESSENTIEL: { maxWeddings: 3, maxMembers: 5 },
  PREMIUM: { maxWeddings: 10, maxMembers: 10 },
  ELITE: { maxWeddings: 100, maxMembers: 50 },
};

// ─── Public user shape returned in the response ───────────────────────────────
// NEVER includes the password hash. Matches the shape returned by
// /api/platform/login so the wizard client can store it in the same React state.
function publicUser(u: {
  id: string;
  email: string;
  name: string;
  role: string;
  weddingId: string | null;
  organizationId: string | null;
}) {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    weddingId: u.weddingId,
    organizationId: u.organizationId,
  };
}

// ─── GET — availability pre-check (slug + email) ──────────────────────────────
// Used by the wizard to validate as the user types. Returns 200 always (no 404
// leak — attackers don't learn which slugs/emails exist via status code).
// Body: { available: boolean }
export async function GET(request: NextRequest) {
  try {
    // Lighter rate limit — 20/min per IP for pre-checks.
    const rlKey = getRateLimitKey(request);
    const { allowed, retryAfterSeconds } = await checkRateLimitAsync(rlKey, 20, 60_000);
    if (!allowed) {
      return NextResponse.json(
        { error: 'Trop de requêtes. Veuillez réessayer dans un instant.' },
        { status: 429, headers: { 'Retry-After': String(retryAfterSeconds ?? 60) } }
      );
    }

    const { searchParams } = new URL(request.url);
    const check = searchParams.get('check'); // 'slug' | 'email'
    const value = (searchParams.get('value') || '').trim().toLowerCase();

    if (!check || !value) {
      return badRequest('Paramètres manquants (check + value requis)');
    }
    if (check !== 'slug' && check !== 'email') {
      return badRequest('Type de vérification invalide');
    }
    if (check === 'slug' && !slugRegex.test(value)) {
      return NextResponse.json({ available: false, reason: 'format' });
    }
    if (check === 'email' && !EMAIL_REGEX.test(value)) {
      return NextResponse.json({ available: false, reason: 'format' });
    }

    if (check === 'slug') {
      // Slugs must be unique on Organization.slug AND on Wedding.slug (because
      // /w/[slug] and /org/[slug] are different route trees, the wedding slug
      // space and org slug space COULD overlap — but to avoid a confusing UX
      // where an org and a wedding share the same slug, we reject the overlap).
      const [org, wedding] = await Promise.all([
        db.organization.findUnique({ where: { slug: value }, select: { id: true } }),
        db.wedding.findUnique({ where: { slug: value }, select: { id: true } }),
      ]);
      return NextResponse.json({ available: !org && !wedding });
    }

    // check === 'email'
    // Email uniqueness is on AdminUser.email. We also reject if the org
    // contact email is already taken (Organization.email) — different field,
    // but a confusing UX if a user signs up with their personal email as the
    // org contact email of another org.
    const [user, org] = await Promise.all([
      db.adminUser.findUnique({ where: { email: value }, select: { id: true } }),
      db.organization.findUnique({ where: { email: value }, select: { id: true } }),
    ]);
    return NextResponse.json({ available: !user && !org });
  } catch (error) {
    logger.error('Org signup check error', {
      errMessage: error instanceof Error ? error.message : String(error),
      errName: error instanceof Error ? error.name : 'Unknown',
    });
    return internalError();
  }
}

// ─── POST — full signup (account + org + optional wedding) ────────────────────
export async function POST(request: NextRequest) {
  try {
    // ─── Anti-abuse rate limit: 5/min per IP ────────────────────────────────
    const rlKey = getRateLimitKey(request);
    const { allowed, retryAfterSeconds } = await checkRateLimitAsync(rlKey, 5, 60_000);
    if (!allowed) {
      return rateLimited();
    }

    const body = await request.json().catch(() => null);
    if (!body) return badRequest('Corps de requête invalide');

    const parsed = signupSchema.safeParse(body);
    if (!parsed.success) {
      const firstError = parsed.error.issues[0];
      return NextResponse.json(
        {
          error: firstError?.message || 'Données invalides',
          field: firstError?.path.join('.'),
        },
        { status: 422 }
      );
    }
    const data: SignupPayload = parsed.data;

    // ─── Pre-flight uniqueness checks (advisory; DB constraints are authoritative) ─
    const [existingUser, existingOrgSlug, existingOrgEmail] = await Promise.all([
      db.adminUser.findUnique({
        where: { email: data.account.email },
        select: { id: true },
      }),
      db.organization.findUnique({
        where: { slug: data.organization.slug },
        select: { id: true },
      }),
      db.organization.findUnique({
        where: { email: data.organization.email },
        select: { id: true },
      }),
    ]);

    if (existingUser) {
      return conflict('Un compte existe déjà avec cet email');
    }
    if (existingOrgSlug) {
      return conflict('Ce slug est déjà utilisé par une autre organisation');
    }
    if (existingOrgEmail) {
      return conflict('Cet email est déjà utilisé par une autre organisation');
    }

    // ─── Hash password (bcrypt 12 rounds) ───────────────────────────────────
    const hashedPassword = await hashPassword(data.account.password);

    // ─── Resolve wedding payload (if any) ──────────────────────────────────
    const weddingInput = data.wedding;
    const hasWeddingPayload = !!(
      weddingInput &&
      (weddingInput.brideName ||
        weddingInput.groomName ||
        weddingInput.coupleLabel ||
        weddingInput.weddingDate ||
        weddingInput.venueName ||
        weddingInput.venueCity)
    );

    // Compute a wedding slug if a wedding is to be created. We namespace it
    // under the org slug to avoid collisions with future wedding slugs.
    let weddingSlug: string | null = null;
    if (hasWeddingPayload) {
      const baseSlug = generateSlug(
        weddingInput!.coupleLabel ||
          buildCoupleLabel(weddingInput!.brideName, weddingInput!.groomName) ||
          data.organization.slug,
      );
      // Prefix with org slug to guarantee uniqueness across the platform's
      // global Wedding.slug unique index. Format: "<org-slug>-<couple-slug>".
      weddingSlug = `${data.organization.slug}-${baseSlug}`.slice(0, 60);
      // Defensive: if a wedding with that exact slug exists (race), append a
      // short random suffix.
      const existingWedding = await db.wedding.findUnique({
        where: { slug: weddingSlug },
        select: { id: true },
      });
      if (existingWedding) {
        const suffix = Math.random().toString(36).slice(2, 6);
        weddingSlug = `${weddingSlug}-${suffix}`.slice(0, 80);
      }
    }

    // ─── Resolve client IP/UA for audit log ────────────────────────────────
    const client = getClientInfo(request);

    // ─── Plan defaults ──────────────────────────────────────────────────────
    const planDefaults = PLAN_ORG_DEFAULTS[data.organization.plan];

    // ─── Single transaction: org + admin user + member + (optional) wedding ─
    const result = await db.$transaction(async (tx) => {
      // 1) Create Organization
      const org = await tx.organization.create({
        data: {
          slug: data.organization.slug,
          name: data.organization.name,
          email: data.organization.email,
          phone: data.organization.phone,
          plan: data.organization.plan,
          maxWeddings: planDefaults.maxWeddings,
          maxMembers: planDefaults.maxMembers,
          status: 'ACTIVE',
        },
      });

      // 2) Create AdminUser (ORG_ADMIN, linked to org)
      const adminUser = await tx.adminUser.create({
        data: {
          name: data.account.name,
          email: data.account.email,
          password: hashedPassword,
          role: 'ORG_ADMIN',
          organizationId: org.id,
          weddingId: null, // org-scoped — no per-wedding FK
        },
      });

      // 3) Create OrganizationMember (ACTIVE, ORG_ADMIN, joinedAt = now)
      // The membership row is the authoritative org↔user link. The AdminUser
      // row carries a denormalized `organizationId` for quick lookups, but the
      // join table allows future multi-org memberships (P2).
      await tx.organizationMember.create({
        data: {
          organizationId: org.id,
          userId: adminUser.id,
          role: 'ORG_ADMIN',
          status: 'ACTIVE',
          joinedAt: new Date(),
          invitedBy: adminUser.id, // self-invite (the org creator)
        },
      });

      // 4) Optional first wedding
      let wedding: { id: string; slug: string; coupleLabel: string; status: string } | null = null;
      if (hasWeddingPayload && weddingSlug) {
        const coupleLabel =
          weddingInput!.coupleLabel ||
          buildCoupleLabel(weddingInput!.brideName, weddingInput!.groomName);
        const weddingDate = weddingInput!.weddingDate
          ? new Date(weddingInput!.weddingDate + 'T12:00:00Z')
          : null;
        const created = await tx.wedding.create({
          data: {
            slug: weddingSlug,
            brideName: weddingInput!.brideName || '',
            groomName: weddingInput!.groomName || '',
            coupleLabel,
            weddingDate,
            venueName: weddingInput!.venueName || null,
            venueCity: weddingInput!.venueCity || null,
            status: 'DRAFT',
            plan: data.organization.plan, // wedding inherits the org plan
            isDefault: false,
            organizationId: org.id,
          },
          select: { id: true, slug: true, coupleLabel: true, status: true },
        });
        wedding = created;
      }

      // 5) Audit log (platform-level event)
      await tx.auditLog.create({
        data: {
          weddingId: null,
          userId: adminUser.id,
          action: 'ORG_SIGNUP',
          details: `Org signup: ${org.slug} (${org.name}) by ${adminUser.email}` +
            (wedding ? ` + first wedding ${wedding.slug}` : ''),
          ipAddress: client.ipAddress ?? null,
          userAgent: client.userAgent ?? null,
        },
      });

      return { org, adminUser, wedding };
    });

    // ─── Issue JWT + cookies ────────────────────────────────────────────────
    const authUser: AuthUser = {
      id: result.adminUser.id,
      email: result.adminUser.email,
      name: result.adminUser.name,
      role: result.adminUser.role,
      weddingId: result.adminUser.weddingId,
      organizationId: result.org.id,
    };
    const token = generateToken(authUser);
    const csrfToken = generateCsrfToken();

    const response = NextResponse.json(
      {
        user: publicUser({
          id: result.adminUser.id,
          email: result.adminUser.email,
          name: result.adminUser.name,
          role: result.adminUser.role,
          weddingId: result.adminUser.weddingId,
          organizationId: result.org.id,
        }),
        organization: {
          id: result.org.id,
          slug: result.org.slug,
          name: result.org.name,
          plan: result.org.plan,
          status: result.org.status,
        },
        wedding: result.wedding,
      },
      { status: 201 }
    );
    setAuthCookie(response, token);
    setCsrfCookie(response, csrfToken);
    return withSecurityHeaders(response);
  } catch (error: unknown) {
    // ─── Prisma P2002 (unique constraint violation — TOCTOU race) ──────────
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code: string }).code === 'P2002'
    ) {
      const metaTarget = (error as { meta?: { target?: string[] } }).meta?.target;
      const target = Array.isArray(metaTarget) ? metaTarget.join(', ') : 'champ';
      return conflict(`Cette valeur est déjà utilisée (${target})`);
    }
    // ─── Never log password or sensitive data ───────────────────────────────
    logger.error('Org signup error', {
      errMessage: error instanceof Error ? error.message : String(error),
      errName: error instanceof Error ? error.name : 'Unknown',
    });
    return internalError();
  }
}
