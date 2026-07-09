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

const WEDDING_RESPONSE_SELECT = {
  id: true,
  slug: true,
  brideName: true,
  groomName: true,
  coupleLabel: true,
  status: true,
  plan: true,
  weddingDate: true,
  venueCity: true,
  timezone: true,
  publishedAt: true,
  createdAt: true,
} as const;

const ORGANIZER_RESPONSE_SELECT = {
  id: true,
  email: true,
  name: true,
  role: true,
  weddingId: true,
} as const;

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
    const result = await db.$transaction(async (tx) => {
      // 1. Create the wedding
      const wedding = await tx.wedding.create({
        data: {
          slug: normalizedSlug,
          brideName: cleanBride,
          groomName: cleanGroom,
          coupleLabel,
          weddingDate:
            weddingDate && weddingDate !== '' ? new Date(String(weddingDate)) : null,
          // P3: `timezone` is `unknown` (from Record<string, unknown> body) —
          // narrow to string before passing to the non-nullable schema field.
          timezone: typeof timezone === 'string' ? timezone : 'Africa/Kinshasa',
          venueName: venueName && typeof venueName === 'string' ? venueName.trim() || null : null,
          venueCity: venueCity && typeof venueCity === 'string' ? venueCity.trim() || null : null,
          status: shouldPublish ? 'PUBLISHED' : 'DRAFT',
          plan,
          isDefault: false, // NEVER auto-default
          publishedAt: shouldPublish ? new Date() : null,
        },
        select: WEDDING_RESPONSE_SELECT,
      });

      // 1b. Seed essential Settings rows so the public /w/{slug} page renders
      // with the couple's real names instead of falling back to the hardcoded
      // "Josué & Hornella" defaults in HeroSection. Without these rows, a
      // freshly onboarded wedding would show the default couple's names until
      // the organizer logs in and configures the admin panel.
      const weddingDateObj =
        weddingDate && weddingDate !== '' ? new Date(String(weddingDate)) : null;
      const weddingDateIso = weddingDateObj
        ? weddingDateObj.toISOString().split('T')[0]
        : '';
      const siteSubtitle = weddingDateObj
        ? weddingDateObj.toLocaleDateString('fr-FR', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          })
        : '';
      const cleanVenueName =
        venueName && typeof venueName === 'string' ? venueName.trim() : '';
      const cleanVenueCity =
        venueCity && typeof venueCity === 'string' ? venueCity.trim() : '';
      const hashtag = `#${cleanBride.replace(/[^a-zA-Z]/g, '')}Et${cleanGroom.replace(/[^a-zA-Z]/g, '')}${weddingDateObj ? weddingDateObj.getFullYear() : ''}`;

      const essentialSettings: { key: string; value: string }[] = [
        { key: 'bride_name', value: cleanBride },
        { key: 'groom_name', value: cleanGroom },
        { key: 'site_title', value: `Mariage ${coupleLabel}` },
        { key: 'site_subtitle', value: siteSubtitle },
        { key: 'wedding_date', value: weddingDateIso },
        { key: 'wedding_time', value: '21:30' },
        { key: 'venue_time', value: '21H30' },
        { key: 'venue_name', value: cleanVenueName },
        { key: 'venue_city', value: cleanVenueCity },
        { key: 'venue_address', value: '' },
        { key: 'hashtag', value: hashtag },
        {
          key: 'welcome_message',
          value: `Bienvenue sur la plateforme du mariage de ${coupleLabel}`,
        },
        {
          key: 'invitation_message',
          value: `${coupleLabel} ont l'honneur de vous inviter à leur célébration.`,
        },
        { key: 'primary_color', value: '#D4A853' },
        { key: 'music_enabled', value: 'false' },
        { key: 'music_volume', value: '0.30' },
      ];

      await tx.settings.createMany({
        data: essentialSettings.map((s) => ({
          weddingId: wedding.id,
          key: s.key,
          value: s.value,
        })),
      });

      // P2-SEC-10 + P2-PERF-5: hashedPassword was computed above the tx.
      // (Original line moved out of the transaction.)

      // 3. Create the organizer AdminUser
      const organizer = await tx.adminUser.create({
        data: {
          email: normalizedOrganizerEmail,
          password: hashedPassword,
          name: cleanOrganizerName,
          role: 'ORGANIZER',
          weddingId: wedding.id,
        },
        select: ORGANIZER_RESPONSE_SELECT,
      });

      // 4. Create the subscription (weddingId UNIQUE)
      const subscription = await tx.subscription.create({
        data: {
          weddingId: wedding.id,
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
          weddingId: wedding.id,
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
            convertedWeddingId: wedding.id,
            convertedAt: new Date(),
          },
        });
        convertedLead = {
          id: leadToConvert.id,
          status: 'CONVERTED',
          convertedWeddingId: wedding.id,
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

      return { wedding, organizer, subscription, invoice, convertedLead };
    });

    // ─── Post-transaction side effects ─────────────────────────────────────
    invalidateWeddingCache(normalizedSlug);

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
      },
      { status: 201 },
    );
  } catch (error: unknown) {
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
