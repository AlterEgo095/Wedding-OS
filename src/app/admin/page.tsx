// ══════════════════════════════════════════════════════════════════════════════
// /admin — Sprint P1 (P1-1) : CONSOLE LEGACY RETIRÉE → redirect conscient du rôle
// ══════════════════════════════════════════════════════════════════════════════
//
// Cette page était la console « legacy » à 10 onglets (LoginForm + Dashboard +
// UserManager + GuestManager…) doublant /platform/admin et /w/[slug]/admin.
// L'audit (RE-CENTERING-ROADMAP P1-1, DECISION MATRIX "Admin: Remove /admin")
// a tranché : UNE console par niveau.
//
// Comportement nouveau :
//   - Utilisateur authentifié PLATFORM_ADMIN/SUPER_ADMIN → /platform/admin
//   - Utilisateur authentifié avec weddingId (ORGANIZER/STAFF/…) →
//     /w/<slug>/admin (sa console mariage réelle ; le layout exige le login
//     si la session ne couvre pas ce mariage)
//   - Anonyme / erreur DB → petite page statique expliquant où aller
//     (aucun dead-end).
//
// Les composants partagés (Dashboard, GuestManager, UserManager…) restent sous
// src/components/admin/* et sont toujours utilisés par /w/[slug]/admin.
// Les routes /api/admin/login|logout|users|dashboard restent en service (elles
// alimentent la console mariage) ; les routes uniques (credits, pricing, usage,
// seed-plans, preview-invitation) ont migré sous /api/platform/* avec shims.

import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { db } from '@/lib/db';
import { verifyToken } from '@/lib/auth';
import { isPlatformAdmin } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function AdminLegacyRedirect() {
  const store = await cookies();
  const token = store.get('auth_token')?.value ?? null;
  const user = token ? verifyToken(token) : null;

  // Décision SANS redirect dans le try — redirect() fonctionne en levant
  // NEXT_REDIRECT ; un catch ici l'avalerait et rendrait la page statique.
  let redirectTarget: string | null = null;

  if (user) {
    try {
      const dbUser = await db.adminUser.findUnique({
        where: { id: user.id },
        select: { id: true, role: true, suspended: true, weddingId: true },
      });
      if (dbUser && !dbUser.suspended) {
        if (isPlatformAdmin(dbUser.role)) {
          redirectTarget = '/platform/admin';
        } else if (dbUser.weddingId) {
          const wedding = await db.wedding.findUnique({
            where: { id: dbUser.weddingId },
            select: { slug: true },
          });
          if (wedding?.slug) {
            redirectTarget = `/w/${wedding.slug}/admin`;
          }
        }
      }
    } catch {
      // erreur DB → on tombe sur la page statique ci-dessous
    }
  }

  if (redirectTarget) {
    redirect(redirectTarget);
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="max-w-md text-center space-y-4">
        <h1 className="text-2xl font-bold tracking-tight">Console administrateur</h1>
        <p className="text-muted-foreground text-sm leading-relaxed">
          L&apos;ancienne console unifiée a été retirée. Chaque niveau a
          désormais sa propre interface :
        </p>
        <ul className="text-sm text-left space-y-2 border rounded-lg p-4 bg-card">
          <li>
            <strong>Admin plateforme</strong> →{' '}
            <a className="underline underline-offset-4" href="/platform/admin">
              /platform/admin
            </a>
          </li>
          <li>
            <strong>Organisateur d&apos;un mariage</strong> →{' '}
            <code className="text-xs">/w/&lt;slug-mariage&gt;/admin</code>
          </li>
          <li>
            <strong>Agence (organisation)</strong> →{' '}
            <code className="text-xs">/org/&lt;slug-org&gt;/admin</code>
          </li>
        </ul>
        <p className="text-xs text-muted-foreground">
          Si vous étiez connecté, ouvrez directement l&apos;URL de votre
          console : elle reste authentifiée par votre session existante.
        </p>
      </div>
    </main>
  );
}
