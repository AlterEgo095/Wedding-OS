export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser, requirePlatformAdmin, hashPassword } from '@/lib/auth';
import { buildCoupleLabel, isValidSlug } from '@/lib/types';
import { invalidateWeddingCache } from '@/lib/tenant-context';
import {
  isValidPlan,
  isValidBillingCycle,
  isValidPaymentMethod,
  resolveAmountUsdCents,
  buildWhatsAppMessage,
  buildWhatsAppDeeplink,
} from '@/lib/billing';
// P2-CQ-1/2 + P2-SEC-2: shared constants from @/lib/constants.
import { EMAIL_REGEX, MAX_PAYMENT_USD_CENTS } from '@/lib/constants';
// P2-SEC-6: rate-limit HOF.
import { withRateLimit } from '@/lib/rate-limit';
// P2-SEC-1: structured logger (no stack leak).
import { logger } from '@/lib/logger';
// P2-CQ-5: standardised API errors.
import { internalError } from '@/lib/api-errors';
// P2-SEC-14: writeAuditLog populates ipAddress + userAgent.
import { writeAuditLog } from '@/lib/audit';
// Mission 6.0 P0.5 — route all publications through the deployment pipeline.
import { publishWeddingViaPipeline, type PublishResult } from '@/lib/pipeline/publish-helper';
// P5.2-1 — unified provisioning service. Replaces the inline wedding.create +
// essential-settings + organizer.create that used to live in this handler.
// Both creation endpoints (platform POST + onboarding POST) now share the same
// `provisionWeddingFully` so couples always get Theme + CoupleStory + Settings
// + AdminUser regardless of which path they hit.
import {
  provisionWeddingFully,
  WeddingProvisioningError,
} from '@/lib/services/wedding-provisioning';

/**
 * POST /api/onboarding/create-wedding    (PLATFORM_ADMIN)
 *
 * Transactional onboarding wizard — creates everything needed to bill a new
 * couple in one atomic call:
 *
 *   1. Wedding (DRAFT or PUBLISHED based on `publish`)
 *   2. AdminUser (role=ORGANIZER, linked to the new wedding)
 *   3. Subscription (status=PENDING_PAYMENT, ready for WhatsApp follow-up)
 *   4. First Invoice (status=OPEN, amountDue=resolved USD cents)
 *   5. (Optional) Lead auto-conversion (status=CONVERTED + convertedWeddingId)
 *   6. Three platform-level AuditLog entries
 *
 * After the transaction commits:
 *   - invalidateWeddingCache(slug) so /w/{slug} resolves fresh
 *   - buildWhatsAppMessage + buildWhatsAppDeeplink for immediate billing
 *
 * Request body shape (Task 7-c frontend wizard consumes this verbatim):
 *
 *   {
 *     // Step 1 — Couple info
 *     brideName: string,
 *     groomName: string,
 *     weddingDate?: string (ISO),
 *     timezone?: string,            // default 'Africa/Kinshasa'
 *     venueName?: string,
 *     venueCity?: string,
 *     slug: string,                 // validated via isValidSlug
 *     // Step 2 — Plan
 *     plan: 'TRIAL' | 'ESSENTIEL' | 'PREMIUM' | 'ELITE',
 *     // Step 3 — Pricing & billing
 *     amountAgreed?: number,        // USD cents; if omitted, uses plan default
 *     billingCycle: 'MONTHLY' | 'ANNUAL' | 'ONE_TIME',
 *     paymentMethod?: 'MOBILE_MONEY' | 'BANK_TRANSFER' | 'CASH' | 'OTHER',
 *     whatsappPhone?: string,
 *     notes?: string,
 *     // Step 4 — Organizer account
 *     organizerName: string,
 *     organizerEmail: string,
 *     organizerPassword: string,    // min 8 chars
 *     // Step 5 — Options
 *     leadId?: string,              // optional — links the lead
 *     publish: boolean,             // true → status=PUBLISHED + publishedAt=now
 *   }
 *
 * Response 201 returns everything the admin UI needs to open WhatsApp:
 *   { wedding, organizer, subscription, invoice, whatsapp, lead }
 *
 * Password is NEVER included in the response — explicit `select` clauses are
 * used on every AdminUser query.
 */

// P2-CQ-1 + P2-SEC-2: EMAIL_REGEX now imported from @/lib/constants (was
// duplicated locally with a slightly different pattern — /^[^\s@]+@[^\s@]+\.[^\s@]+$/
// — which is permissive on the TLD. The shared one requires 2+ chars).

// P5.2-1 — the WEDDING_RESPONSE_SELECT and ORGANIZER_RESPONSE_SELECT constants
// that used to live here have been removed. The slim wedding shape returned by
// provisionWeddingFully is now mapped to the response inline (see the tx body
// below), and the organizer shape is taken from provisioned.admin directly.

// P2-SEC-6: rate-limited POST handler (5 requests / 60s per IP).
// Resource-intensive: bcrypt hash + 5-row transaction + WhatsApp deeplink build.
// Defined as a local function then wrapped on export so Next.js picks up the
// rate-limited version while the handler body stays readable.
async function createWeddingHandler(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    const denied = requirePlatformAdmin(user);
    if (denied) return denied;

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body || typeof body !== 'object') {
      return NextResponse.json(
        { error: 'Corps de requête invalide.' },
        { status: 400 },
      );
    }

    // ─── Validation ────────────────────────────────────────────────────────
    const {
      brideName,
      groomName,
      weddingDate,
      timezone,
      venueName,
      venueCity,
      slug,
      plan,
      amountAgreed,
      billingCycle,
      paymentMethod,
      whatsappPhone,
      notes,
      organizerName,
      organizerEmail,
      organizerPassword,
      leadId,
      publish,
    } = body;

    if (
      typeof brideName !== 'string' ||
      brideName.trim().length < 1 ||
      brideName.trim().length > 100
    ) {
      return NextResponse.json(
        { error: 'Le prénom de la mariée est requis (1 à 100 caractères).' },
        { status: 400 },
      );
    }
    if (
      typeof groomName !== 'string' ||
      groomName.trim().length < 1 ||
      groomName.trim().length > 100
    ) {
      return NextResponse.json(
        { error: 'Le prénom du marié est requis (1 à 100 caractères).' },
        { status: 400 },
      );
    }
    if (
      typeof organizerName !== 'string' ||
      organizerName.trim().length < 1 ||
      organizerName.trim().length > 100
    ) {
      return NextResponse.json(
        { error: "Le nom de l'organisateur est requis (1 à 100 caractères)." },
        { status: 400 },
      );
    }
    if (typeof slug !== 'string' || !isValidSlug(slug.toLowerCase().trim())) {
      return NextResponse.json(
        {
          error:
            'Slug invalide (3 à 32 caractères alphanumériques minuscules ou tirets ; mots réservés interdits).',
        },
        { status: 400 },
      );
    }
    const normalizedSlug = slug.toLowerCase().trim();
    if (typeof plan !== 'string' || !isValidPlan(plan)) {
      return NextResponse.json(
        { error: 'Plan invalide (TRIAL, ESSENTIEL, PREMIUM, ELITE).' },
        { status: 400 },
      );
    }
    if (typeof billingCycle !== 'string' || !isValidBillingCycle(billingCycle)) {
      return NextResponse.json(
        { error: 'Cycle de facturation invalide (MONTHLY, ANNUAL, ONE_TIME).' },
        { status: 400 },
      );
    }
    if (paymentMethod !== undefined && paymentMethod !== null) {
      if (typeof paymentMethod !== 'string' || !isValidPaymentMethod(paymentMethod)) {
        return NextResponse.json(
          { error: 'Méthode de paiement invalide (MOBILE_MONEY, BANK_TRANSFER, CASH, OTHER).' },
          { status: 400 },
        );
      }
    }
    if (typeof organizerEmail !== 'string' || !EMAIL_REGEX.test(organizerEmail.trim())) {
      return NextResponse.json(
        { error: "Adresse e-mail de l'organisateur invalide." },
        { status: 400 },
      );
    }
    const normalizedOrganizerEmail = organizerEmail.trim().toLowerCase();
    if (typeof organizerPassword !== 'string' || organizerPassword.length < 8) {
      return NextResponse.json(
        { error: "Le mot de passe de l'organisateur doit contenir au moins 8 caractères." },
        { status: 400 },
      );
    }
    if (amountAgreed !== undefined && amountAgreed !== null) {
      const n = Number(amountAgreed);
      // P2-CQ-2 + P2-SEC-3: shared MAX_PAYMENT_USD_CENTS constant.
      if (!Number.isInteger(n) || n < 0 || n > MAX_PAYMENT_USD_CENTS) {
        return NextResponse.json(
          { error: 'amountAgreed doit être un entier positif (cents USD) ≤ 1 000 000.' },
          { status: 400 },
        );
      }
    }
    if (whatsappPhone !== undefined && whatsappPhone !== null) {
      if (typeof whatsappPhone !== 'string' || whatsappPhone.length > 30) {
        return NextResponse.json(
          { error: 'Numéro WhatsApp invalide (max 30 caractères).' },
          { status: 400 },
        );
      }
    }
    if (weddingDate !== undefined && weddingDate !== null && weddingDate !== '') {
      const parsed = new Date(String(weddingDate));
      if (Number.isNaN(parsed.getTime())) {
        return NextResponse.json(
          { error: 'Date de mariage invalide.' },
          { status: 400 },
        );
      }
    }
    if (notes !== undefined && notes !== null) {
      if (typeof notes !== 'string' || notes.length > 5000) {
        return NextResponse.json(
          { error: 'Notes trop longues (max 5000 caractères).' },
          { status: 400 },
        );
      }
    }
    if (publish !== undefined && typeof publish !== 'boolean') {
      return NextResponse.json(
        { error: '`publish` doit être un booléen.' },
        { status: 400 },
      );
    }
    const shouldPublish = publish === true;

    // Mission 5.6 FIX-A: refuse direct creation in PUBLISHED state (no verified payment).
    // Admin must use: create DRAFT -> converge -> verify payment -> publish.
    if (shouldPublish) {
      return NextResponse.json(
        {
          error: 'Creation directe en etat PUBLISHED refusee : paiement non verifie. Creez en DRAFT (publish=false), puis utilisez Commercial OS -> converge -> verify payment -> publish.',
          code: 'CREATE_PUBLISHED_REQUIRES_PAID',
        },
        { status: 403 },
      );
    }

    // ─── Pre-flight uniqueness checks (outside tx for early 409s) ──────────
    const existingWedding = await db.wedding.findUnique({
      where: { slug: normalizedSlug },
      select: { id: true },
    });
    if (existingWedding) {
      return NextResponse.json(
        { error: `Un mariage avec le slug "${normalizedSlug}" existe déjà.` },
        { status: 409 },
      );
    }
    const existingOrganizer = await db.adminUser.findUnique({
      where: { email: normalizedOrganizerEmail },
      select: { id: true },
    });
    if (existingOrganizer) {
      return NextResponse.json(
        { error: `Un compte avec l'e-mail "${normalizedOrganizerEmail}" existe déjà.` },
        { status: 409 },
      );
    }

    let leadToConvert: {
      id: string;
      status: string;
      coupleLabel: string;
      email: string;
      convertedWeddingId: string | null;
    } | null = null;
    if (leadId) {
      // P3: `leadId` is `unknown` — narrow to string for the Prisma where clause.
      const leadIdStr = typeof leadId === 'string' ? leadId : String(leadId);
      leadToConvert = await db.lead.findUnique({
        where: { id: leadIdStr },
        select: {
          id: true,
          status: true,
          coupleLabel: true,
          email: true,
          convertedWeddingId: true,
        },
      });
      if (!leadToConvert) {
        return NextResponse.json(
          { error: 'Lead introuvable.' },
          { status: 404 },
        );
      }
      if (
        leadToConvert.status === 'CONVERTED' ||
        leadToConvert.convertedWeddingId
      ) {
        return NextResponse.json(
          { error: 'Ce lead a déjà été converti.' },
          { status: 409 },
        );
      }
    }

    const cleanBride = brideName.trim();
    const cleanGroom = groomName.trim();
    const coupleLabel = buildCoupleLabel(cleanBride, cleanGroom);
    const cleanOrganizerName = organizerName.trim();
    const cleanWhatsappPhone =
      whatsappPhone && typeof whatsappPhone === 'string' ? whatsappPhone.trim() : null;
    const cleanNotes = notes && typeof notes === 'string' ? notes.trim() || null : null;
    const amountAgreedCents =
      amountAgreed !== undefined && amountAgreed !== null
        ? Math.round(Number(amountAgreed))
        : null;

    const resolvedAmountUsdCents = resolveAmountUsdCents(
      plan,
      amountAgreedCents,
      billingCycle,
    );

    // P2-SEC-10 + P2-PERF-5: hash the organizer password BEFORE opening the
    // transaction. bcrypt is CPU-bound (~250ms at rounds=12) and would hold
    // the SQLite single-writer lock for the duration of the hash, serializing
    // all other writes. Moving it out of the tx cuts the lock hold time from
    // ~300ms to ~50ms for a typical onboarding.
    const hashedPassword = await hashPassword(organizerPassword);

    // ─── Transactional create ────────────────────────────────────────────
    // P5.2-1: the wedding + Settings + Theme + CoupleStory + organizer
    // AdminUser are created atomically by `provisionWeddingFully`, which runs
    // inside THIS tx (passed via { tx }). Subscription + Invoice + Lead
    // conversion + audit logs stay in the same tx so the entire onboarding
    // (provisioning + commercial + audit) commits atomically — same atomicity
    // guarantee as before the refactor.
    const result = await db.$transaction(async (tx) => {
      // 1. Provision the wedding (Wedding + Settings + Theme + CoupleStory +
      //    organizer AdminUser, role=ORGANIZER). The service does its own
      //    slug/email pre-flight checks inside the tx for race-safety.
      const provisioned = await provisionWeddingFully(
        {
          slug: normalizedSlug,
          brideName: cleanBride,
          groomName: cleanGroom,
          coupleLabel,
          weddingDate:
            weddingDate && weddingDate !== '' ? new Date(String(weddingDate)) : null,
          timezone: typeof timezone === 'string' ? timezone : 'Africa/Kinshasa',
          venueName:
            venueName && typeof venueName === 'string' ? venueName.trim() || null : null,
          venueCity:
            venueCity && typeof venueCity === 'string' ? venueCity.trim() || null : null,
          // Mission 6.0 P0.5 — always create as DRAFT; publish via pipeline post-tx.
          status: 'DRAFT',
          plan,
          adminEmail: normalizedOrganizerEmail,
          adminName: cleanOrganizerName,
          hashedAdminPassword: hashedPassword,
        },
        { tx },
      );

      // 1b. Map provisioned.admin → organizer (backward-compat response shape).
      // provisionWeddingFully always creates the organizer when adminEmail is
      // provided (which the wizard requires), so admin is non-null here.
      const organizer = provisioned.admin
        ? {
            id: provisioned.admin.id,
            email: provisioned.admin.email,
            name: provisioned.admin.name,
            role: provisioned.admin.role,
            weddingId: provisioned.wedding.id,
          }
        : null;

      // 4. Create the subscription (weddingId UNIQUE)
      const subscription = await tx.subscription.create({
        data: {
          weddingId: provisioned.wedding.id,
          plan,
          status: 'PENDING_PAYMENT',
          amountAgreed: amountAgreedCents,
          currency: 'usd',
          billingCycle,
          paymentMethod: paymentMethod ?? null,
          whatsappPhone: cleanWhatsappPhone,
          notes: cleanNotes,
          trialEndsAt: null,
        },
        select: {
          id: true,
          plan: true,
          status: true,
          amountAgreed: true,
          billingCycle: true,
          paymentMethod: true,
          whatsappPhone: true,
        },
      });

      // 5 + 6. Create the first invoice
      const invoice = await tx.invoice.create({
        data: {
          subscriptionId: subscription.id,
          weddingId: provisioned.wedding.id,
          amountDue: resolvedAmountUsdCents,
          amountPaid: 0,
          currency: 'usd',
          billingCycle,
          status: 'OPEN',
          paymentMethod: paymentMethod ?? null,
          whatsappPhone: cleanWhatsappPhone,
          notes: cleanNotes,
        },
        select: {
          id: true,
          amountDue: true,
          amountPaid: true,
          currency: true,
          billingCycle: true,
          status: true,
          paymentMethod: true,
        },
      });

      // 7. Optionally convert the lead
      let convertedLead: { id: string; status: string; convertedWeddingId: string | null } | null = null;
      if (leadToConvert) {
        await tx.lead.update({
          where: { id: leadToConvert.id },
          data: {
            status: 'CONVERTED',
            convertedWeddingId: provisioned.wedding.id,
            convertedAt: new Date(),
          },
        });
        convertedLead = {
          id: leadToConvert.id,
          status: 'CONVERTED',
          convertedWeddingId: provisioned.wedding.id,
        };
      }

      // 8. Three platform-level audit logs — written inside the tx so they
      // commit atomically with the wedding/org/sub/invoice. writeAuditLog is
      // not used here because (a) we already hold the tx handle and (b) we
      // need them to commit-or-rollback with the rest of the operation.
      // P2-SEC-14 is partially addressed — the post-tx audit below uses
      // writeAuditLog which populates ipAddress/userAgent from the request.
      await tx.auditLog.createMany({
        data: [
          {
            weddingId: null,
            userId: user!.id,
            action: 'CREATE_WEDDING',
            details: `Created wedding ${normalizedSlug} via onboarding wizard`,
          },
          {
            weddingId: null,
            userId: user!.id,
            action: 'CREATE_USER',
            details: `Created organizer ${normalizedOrganizerEmail} for ${normalizedSlug}`,
          },
          {
            weddingId: null,
            userId: user!.id,
            action: 'BILLING_INVOICE_CREATED',
            details: `Created invoice $${(resolvedAmountUsdCents / 100).toFixed(2)} for ${normalizedSlug}`,
          },
        ],
      });

      // The slim wedding returned by provisionWeddingFully is a superset of
      // the old WEDDING_RESPONSE_SELECT — extra fields are additive (per
      // P5.2-1 backward-compat contract: additive only).
      const weddingResponse = {
        id: provisioned.wedding.id,
        slug: provisioned.wedding.slug,
        brideName: provisioned.wedding.brideName,
        groomName: provisioned.wedding.groomName,
        coupleLabel: provisioned.wedding.coupleLabel,
        status: provisioned.wedding.status,
        plan: provisioned.wedding.plan,
        weddingDate: provisioned.wedding.weddingDate,
        venueCity: provisioned.wedding.venueCity,
        timezone: provisioned.wedding.timezone,
        publishedAt: provisioned.wedding.publishedAt,
        createdAt: provisioned.wedding.createdAt,
      };

      return { wedding: weddingResponse, organizer, subscription, invoice, convertedLead };
    });

    // ─── Post-transaction side effects ─────────────────────────────────────
    invalidateWeddingCache(normalizedSlug);

    // Mission 6.0 P0.5 — if the wizard requested immediate publish, route it
    // through the deployment pipeline (creates Deployment row + config snapshot).
    let publishResult: PublishResult | null = null;
    if (shouldPublish) {
      publishResult = await publishWeddingViaPipeline(result.wedding.id, user!.id);
      invalidateWeddingCache(normalizedSlug);
    }

    // P2-SEC-14: writeAuditLog populates ipAddress + userAgent from request.
    // (Best-effort — the in-tx auditLogs above already committed; this is a
    // supplementary platform-level audit row for the WhatsApp deeplink build.)
    await writeAuditLog({
      userId: user!.id,
      action: 'ONBOARDING_WIZARD_COMPLETED',
      details: `Onboarding wizard completed for ${normalizedSlug} (${plan})`,
      request,
    });

    const whatsappMessage = buildWhatsAppMessage({
      coupleLabel,
      plan,
      amountUsdCents: resolvedAmountUsdCents,
      billingCycle,
      weddingSlug: normalizedSlug,
      notes: cleanNotes,
    });
    const whatsappDeeplink = buildWhatsAppDeeplink(cleanWhatsappPhone, whatsappMessage);

    return NextResponse.json(
      {
        wedding: result.wedding,
        organizer: result.organizer,
        subscription: {
          ...result.subscription,
          amountUsdCents: resolvedAmountUsdCents,
        },
        invoice: result.invoice,
        whatsapp: {
          url: whatsappDeeplink.url,
          recipient: whatsappDeeplink.recipient,
          message: whatsappMessage,
        },
        lead: result.convertedLead,
        ...(publishResult ? { deployment: { id: publishResult.deploymentId, version: publishResult.version, mode: publishResult.mode } } : {}),
      },
      { status: 201 },
    );
  } catch (error: unknown) {
    // P5.2-1 — translate provisioning service errors to HTTP responses.
    if (error instanceof WeddingProvisioningError) {
      const httpStatus = error.code === 'INVALID_INPUT' ? 400 : 409;
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: httpStatus },
      );
    }
    // P1-CQ-18: catch unique-constraint violations (email already exists).
    // The most likely cause is a duplicate organizer email — the wizard does
    // a pre-flight findUnique but two concurrent onboarding submissions with
    // the same email can both pass the check (TOCTOU window). The slug check
    // is inside the tx so it can't race here, but the email check is done
    // outside the tx — handle the race gracefully.
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code: string }).code === 'P2002'
    ) {
      return NextResponse.json(
        { error: 'Cet email est déjà utilisé' },
        { status: 409 },
      );
    }
    // P2-SEC-1: never log error.stack.
    logger.error('Create wedding (onboarding wizard) error', {
      errMessage: error instanceof Error ? error.message : String(error),
      errName: error instanceof Error ? error.name : 'Unknown',
    });
    return internalError();
  }
}

// P2-SEC-6: wrap the POST handler with rate limiting (5 requests / 60s per IP).
export const POST = withRateLimit(5, 60_000)(createWeddingHandler);
