// ══════════════════════════════════════════════════════════════════════════════
// /org/[slug]/admin/settings/page.tsx — Mission 6.0 P1.8 Org Settings
// ══════════════════════════════════════════════════════════════════════════════
//
// Server Component. Auth gate (ORG_ADMIN only — ORG_MEMBER/ORG_VIEWER get 403).
// Fetches the org and renders the <OrgSettings> client island for the form.

import { notFound, redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { getServerAuthUser } from '@/lib/auth';
import { isOrgRole, isPlatformAdmin } from '@/lib/types';
import { OrgSettings } from '../_components/OrgSettings';

export default async function OrgSettingsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  // ─── Auth + role gate (ORG_ADMIN or platform admin) ────────────────────
  const user = await getServerAuthUser();
  if (!user) redirect(`/org/${slug}/admin/login`);

  // Per-wedding roles are NOT allowed here.
  if (!isOrgRole(user.role) && !isPlatformAdmin(user.role)) {
    redirect('/platform/login?error=org_role_required');
  }

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

  if (isOrgRole(user.role) && user.organizationId !== org.id) {
    redirect('/platform/login?error=org_mismatch');
  }

  // ORG_MEMBER / ORG_VIEWER cannot edit settings — redirect to dashboard.
  if (user.role !== 'ORG_ADMIN' && !isPlatformAdmin(user.role)) {
    redirect(`/org/${slug}/admin`);
  }

  return (
    <OrgSettings
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
    />
  );
}
