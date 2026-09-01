// ══════════════════════════════════════════════════════════════════════════════
// /org/[slug]/admin/weddings/new/page.tsx — Sprint P0-1 (audit 2026-09-01)
// ══════════════════════════════════════════════════════════════════════════════
//
// P0-1 FIX: the "Créer un mariage" quick action in OrgDashboard links to
// /org/[slug]/admin/weddings/new, which did not exist (404 in production —
// documented in LIVE-WEDDING-CHECKLIST règle n°2). This page closes the gap:
// a minimal no-code creation form that POSTs to the existing
// POST /api/org/[slug]/weddings endpoint (role + quota checks already
// enforced server-side: ORG_ADMIN/ORG_MEMBER, 402 when quota exceeded).
//
// Server Component: auth gate (same pattern as ../../members/page.tsx),
// then renders the <NewWeddingForm> client island.

import { notFound, redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { getServerAuthUser } from '@/lib/auth';
import { isOrgRole, isPlatformAdmin } from '@/lib/types';
import { NewWeddingForm } from './NewWeddingForm';

export default async function NewWeddingPage({
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
      status: true,
    },
  });
  if (!org || org.status === 'ARCHIVED') notFound();

  if (isOrgRole(user.role) && user.organizationId !== org.id) {
    redirect('/platform/login?error=org_mismatch');
  }

  // ORG_VIEWER cannot create weddings — mirror the server-side API rule so
  // the UI explains itself instead of failing at submit time.
  const canCreate =
    user.role === 'ORG_ADMIN' ||
    user.role === 'ORG_MEMBER' ||
    isPlatformAdmin(user.role);

  return (
    <div className="p-6">
      <NewWeddingForm org={{ slug: org.slug, name: org.name }} canCreate={canCreate} />
    </div>
  );
}
