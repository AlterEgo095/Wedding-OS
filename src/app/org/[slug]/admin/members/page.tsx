// ══════════════════════════════════════════════════════════════════════════════
// /org/[slug]/admin/members/page.tsx — Mission 6.0 P1.8 Org Members
// ══════════════════════════════════════════════════════════════════════════════
//
// Server Component. Auth gate (must be ORG_ADMIN to mutate, but ORG_MEMBER/
// ORG_VIEWER may READ the list — they need to know who their colleagues are).
// The interactive parts (invite dialog, role change, revoke) live in the
// <OrgMembersManager> client island and the client island itself enforces
// ORG_ADMIN-only UI for write actions (the API also enforces this server-side).

import { notFound, redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { getServerAuthUser } from '@/lib/auth';
import { isOrgRole, isPlatformAdmin } from '@/lib/types';
import { OrgMembersManager } from '../_components/OrgMembersManager';

export default async function OrgMembersPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  // ─── Auth + org resolution (defense-in-depth; layout already gates) ────
  const user = await getServerAuthUser();
  if (!user) redirect(`/org/${slug}/admin/login`);
  if (!isOrgRole(user.role) && !isPlatformAdmin(user.role)) {
    redirect('/platform/login?error=org_role_required');
  }

  const org = await db.organization.findUnique({
    where: { slug },
    select: {
      id: true,
      slug: true,
      name: true,
      maxMembers: true,
      status: true,
    },
  });
  if (!org || org.status === 'ARCHIVED') notFound();

  if (isOrgRole(user.role) && user.organizationId !== org.id) {
    redirect('/platform/login?error=org_mismatch');
  }

  // ─── Fetch current members + active count ──────────────────────────────
  const [members, activeCount] = await Promise.all([
    db.organizationMember.findMany({
      where: { organizationId: org.id },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            role: true,
            lastLoginAt: true,
            createdAt: true,
          },
        },
      },
      orderBy: [{ status: 'asc' }, { joinedAt: 'desc' }],
    }),
    db.organizationMember.count({
      where: { organizationId: org.id, status: 'ACTIVE' },
    }),
  ]);

  const canManage = user.role === 'ORG_ADMIN' || isPlatformAdmin(user.role);

  // Serialize for the client component.
  const serializableMembers = members.map((m) => ({
    id: m.id,
    role: m.role,
    status: m.status,
    invitedAt: m.invitedAt.toISOString(),
    joinedAt: m.joinedAt ? m.joinedAt.toISOString() : null,
    user: {
      id: m.user.id,
      email: m.user.email,
      name: m.user.name,
      role: m.user.role,
      lastLoginAt: m.user.lastLoginAt ? m.user.lastLoginAt.toISOString() : null,
      createdAt: m.user.createdAt.toISOString(),
    },
  }));

  return (
    <OrgMembersManager
      org={{
        id: org.id,
        slug: org.slug,
        name: org.name,
        maxMembers: org.maxMembers,
      }}
      currentUser={{ id: user.id, role: user.role }}
      members={serializableMembers}
      activeCount={activeCount}
      canManage={canManage}
    />
  );
}
