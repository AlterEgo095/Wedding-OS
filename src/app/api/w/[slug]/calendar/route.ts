// ══════════════════════════════════════════════════════════════════════════════
// /api/w/[slug]/calendar — P2-UX (Sprint Premium) : fichier ICS invité
// ══════════════════════════════════════════════════════════════════════════════
//
// GET /api/w/{slug}/calendar → text/calendar (RFC 5545), PUBLISHED weddings only.
//
// Premium guest journey: the invitation page offers "Ajouter au calendrier"
// (standard competitor feature — Joy/Zola/Withjoy all ship it). The ICS is
// generated server-side from the Wedding row (authoritative DateTime) enriched
// with settings (venue address, time, description).
//
// SECURITY / TENANCY:
//   - resolvePublicTenant resolves {slug} → wedding (fail-closed).
//   - Status gate (same posture as P1-3a on published-config): only PUBLISHED
//     weddings expose an ICS. DRAFT/UNPUBLISHED/ARCHIVED → 404 (no existence
//     leak, no draft data leak).
//   - Response is read-only public event metadata (title, date, venue) — the
//     same data the public homepage already renders.

export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { resolvePublicTenant } from '@/lib/tenant-context';
import { internalError } from '@/lib/api-errors';
import { logger } from '@/lib/logger';

/** RFC 5545 §3.3.11 — escape TEXT values (commas, semicolons, backslashes, newlines). */
function icsEscape(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

/** Fold long lines at 75 octets (RFC 5545 §3.1). */
function icsFold(line: string): string {
  if (line.length <= 73) return line;
  const parts: string[] = [line.slice(0, 73)];
  let rest = line.slice(73);
  while (rest.length > 72) {
    parts.push(' ' + rest.slice(0, 72));
    rest = rest.slice(72);
  }
  if (rest) parts.push(' ' + rest);
  return parts.join('\r\n');
}

function toIcsUtc(date: Date): string {
  return (
    date.getUTCFullYear().toString().padStart(4, '0') +
    (date.getUTCMonth() + 1).toString().padStart(2, '0') +
    date.getUTCDate().toString().padStart(2, '0') +
    'T' +
    date.getUTCHours().toString().padStart(2, '0') +
    date.getUTCMinutes().toString().padStart(2, '0') +
    date.getUTCSeconds().toString().padStart(2, '0') +
    'Z'
  );
}

/** Parse 'HH:MM' / 'HHhMM' settings; null when absent or malformed. */
function parseTimeOfDay(raw: string | undefined): { h: number; m: number } | null {
  if (!raw) return null;
  const m = raw.trim().match(/^(\d{1,2})\s*[:hH.]\s*(\d{2})?$/);
  if (!m) return null;
  const h = parseInt(m[1], 10);
  const min = m[2] ? parseInt(m[2], 10) : 0;
  if (h > 23 || min > 59) return null;
  return { h, m: min };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    if (!slug) return NextResponse.json({ error: 'Slug requis' }, { status: 400 });

    const { context, error: tenantError } = await resolvePublicTenant(request, slug);
    if (tenantError || !context) {
      return NextResponse.json(
        { error: tenantError?.message ?? 'Tenant resolution failed' },
        { status: tenantError?.status ?? 404 }
      );
    }

    const wedding = await db.wedding.findUnique({
      where: { id: context.weddingId },
      select: {
        slug: true,
        status: true,
        weddingDate: true,
        coupleLabel: true,
        brideName: true,
        groomName: true,
        venueName: true,
        venueCity: true,
      },
    });
    if (!wedding) return NextResponse.json({ error: 'Introuvable' }, { status: 404 });

    // P1-3a posture: only PUBLISHED weddings serve public event artefacts.
    if (wedding.status !== 'PUBLISHED') {
      return NextResponse.json({ error: 'Introuvable' }, { status: 404 });
    }
    if (!wedding.weddingDate) {
      return NextResponse.json({ error: 'Date non définie' }, { status: 404 });
    }

    // Settings enrichment (venue address/time/description) — best-effort.
    let venueAddress = '';
    let weddingTime: string | undefined;
    let siteDescription = '';
    try {
      const rows = await db.settings.findMany({
        where: {
          weddingId: context.weddingId,
          key: { in: ['venue_address', 'wedding_time', 'site_description'] },
        },
      });
      for (const row of rows) {
        if (row.key === 'venue_address') venueAddress = row.value;
        if (row.key === 'wedding_time') weddingTime = row.value;
        if (row.key === 'site_description') siteDescription = row.value;
      }
    } catch {
      // ICS still renders from the Wedding row alone.
    }

    // Start = wedding date (12:00 UTC baseline at creation) overridden by the
    // configured time-of-day; end = start + 3h (celebration default).
    const start = new Date(wedding.weddingDate);
    const tod = parseTimeOfDay(weddingTime);
    if (tod) start.setUTCHours(tod.h, tod.m, 0, 0);
    const end = new Date(start.getTime() + 3 * 60 * 60 * 1000);

    const title =
      wedding.coupleLabel ||
      [wedding.brideName, wedding.groomName].filter(Boolean).join(' & ') ||
      'Mariage';
    const locationParts = [wedding.venueName, venueAddress, wedding.venueCity]
      .map((s) => (s || '').trim())
      .filter(Boolean);
    const description =
      siteDescription ||
      `Vous êtes invité(e) au mariage de ${title}.` +
        (locationParts.length ? ` Rendez-vous : ${locationParts.join(', ')}.` : '');

    const ics = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Heureux Mariage//Wedding OS//FR',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'BEGIN:VEVENT',
      icsFold(`UID:${wedding.slug}@wedding.hpph.net`),
      icsFold(`DTSTAMP:${toIcsUtc(new Date())}`),
      icsFold(`DTSTART:${toIcsUtc(start)}`),
      icsFold(`DTEND:${toIcsUtc(end)}`),
      icsFold(`SUMMARY:${icsEscape(`Mariage de ${title}`)}`),
      ...(locationParts.length
        ? [icsFold(`LOCATION:${icsEscape(locationParts.join(', '))}`)]
        : []),
      icsFold(`DESCRIPTION:${icsEscape(description)}`),
      icsFold(`URL:https://wedding.hpph.net/w/${wedding.slug}`),
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');

    return new NextResponse(ics, {
      status: 200,
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': `inline; filename="mariage-${wedding.slug}.ics"`,
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
      },
    });
  } catch (error) {
    logger.error('ICS calendar error', {
      errMessage: error instanceof Error ? error.message : String(error),
      errName: error instanceof Error ? error.name : 'Unknown',
    });
    return internalError();
  }
}
