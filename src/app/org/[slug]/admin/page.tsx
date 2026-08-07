// ══════════════════════════════════════════════════════════════════════════════
// /org/[slug]/admin/page.tsx — Mission 6.0 P1.8 Org Admin Dashboard
// ══════════════════════════════════════════════════════════════════════════════
//
// Server Component. Fetches org + weddings + stats + recent activity directly
// via the raw `db` (NOT tenantDb — Organization is not a tenant-scoped model
// and the org dashboard spans all weddings under the org). Then renders the
// <OrgDashboard> client island for the interactive wedding table + quick
// actions.
//
// Auth is enforced by layout.tsx (Server Component gate). We re-verify here
// as defense-in-depth (in case someone deep-links directly to the page
// component), but we DO trust the layout's org resolution: the page-level
// DB queries are scoped by the org.id resolved from the slug.

import { notFound, redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { getServerAuthUser } from '@/lib/auth';
import { isOrgRole, isPlatformAdmin } from '@/lib/types';
import { OrgDashboard } from './_components/OrgDashboard';

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function OrgAdminDashboardPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  // ─── Defense-in-depth auth (the layout already gates) ──────────────────
  const user = await getServerAuthUser();
  if (!user) redirect(`/org/${slug}/admin/login`);
  if (!isOrgRole(user.role) && !isPlatformAdmin(user.role)) {
    redirect('/platform/login?error=org_role_required');
  }

  // ─── Resolve org ───────────────────────────────────────────────────────
  const org = await db.organization.findUnique({
    where: { slug },
    select: {
      id: true,
      slug: true,
      name: true,
      email: true,
      phone: true,
      logoUrl: true,
      brandColor: true,
      customDomain: true,
      status: true,
      plan: true,
      maxWeddings: true,
      maxMembers: true,
      description: true,
      websiteUrl: true,
      address: true,
    },
  });
  if (!org || org.status === 'ARCHIVED') notFound();

  // ─── Org membership check ──────────────────────────────────────────────
  if (isOrgRole(user.role) && user.organizationId !== org.id) {
    redirect('/platform/login?error=org_mismatch');
  }

  // ─── Fetch dashboard data in parallel ──────────────────────────────────
  const [
    weddings,
    totalGuests,
    totalMembers,
    activeInvitations,
    recentActivity,
  ] = await Promise.all([
    db.wedding.findMany({
      where: { organizationId: org.id },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        slug: true,
        coupleLabel: true,
        brideName: true,
        groomName: true,
        status: true,
        plan: true,
        weddingDate: true,
        venueCity: true,
        createdAt: true,
        _count: { select: { guests: true, admins: true } },
      },
    }),
    db.guest.count({
      where: { wedding: { organizationId: org.id } },
    }),
    db.organizationMember.count({
      where: { organizationId: org.id, status: 'ACTIVE' },
    }),
    db.invitation.count({
      where: {
        wedding: { organizationId: org.id },
        status: { not: 'FAILED' },
      },
    }),
    db.auditLog.findMany({
      where: {
        OR: [
          { wedding: { organizationId: org.id } },
          {
            action: {
              in: [
                'CREATE_ORGANIZATION',
                'UPDATE_ORGANIZATION',
                'ARCHIVE_ORGANIZATION',
                'UPDATE_ORG_MEMBER',
                'REVOKE_ORG_MEMBER',
                'INVITE_ORG_MEMBER',
                'ORG_LOGIN',
              ],
            },
          },
        ],
      },
      include: {
        user: { select: { name: true, email: true, role: true } },
        wedding: { select: { slug: true, coupleLabel: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 5,
    }),
  ]);

  // Serialize dates for the client component (Date → ISO string).
  const serializableWeddings = weddings.map((w) => ({
    ...w,
    weddingDate: w.weddingDate ? w.weddingDate.toISOString() : null,
    createdAt: w.createdAt.toISOString(),
  }));
  const serializableActivity = recentActivity.map((a) => ({
    ...a,
    createdAt: a.createdAt.toISOString(),
  }));

  return (
    <OrgDashboard
      org={{
        id: org.id,
        slug: org.slug,
        name: org.name,
        email: org.email,
        phone: org.phone,
        logoUrl: org.logoUrl,
        brandColor: org.brandColor,
        customDomain: org.customDomain,
        status: org.status,
        plan: org.plan,
        maxWeddings: org.maxWeddings,
        maxMembers: org.maxMembers,
        description: org.description,
        websiteUrl: org.websiteUrl,
        address: org.address,
      }}
      user={{
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      }}
      weddings={serializableWeddings}
      stats={{
        totalWeddings: weddings.length,
        totalGuests,
        totalMembers,
        activeInvitations,
      }}
      recentActivity={serializableActivity}
    />
  );
}
