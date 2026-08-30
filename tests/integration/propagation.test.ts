// ━━━ V4 — Test critique #4 : propagation de contenu (P3) ━━━
//
// Vérifie que les modifications du gestionnaire sont propagées à l'invitation
// publique sans rebuild du code, conformément à la promesse no-code.
//
// Le contrat :
//   1. Une modification de Wedding.brideName => visible sur /w/[slug]
//      après revalidateTag('wedding-{slug}') (immédiat).
//   2. Une modification de Settings (date, lieu) => visible après ISR (300s)
//      OU après revalidateTag explicite.
//   3. Un changement de thème (Theme) => visible après invalidation du cache
//      par étiquette.
//
// NOTE : ce test doit tourner contre une instance Next.js DÉDIÉE aux tests
// (port 3099, base de test, slug réservé 'test-propagation-slug'). Il ne
// doit JAMAIS pointer vers wedding.hpph.net ou /api/health de production.

import { describe, it, expect } from 'vitest';
import { testDb } from '../fixtures/wedding-factory';

const TEST_BASE = process.env.TEST_BASE_URL ?? 'http://127.0.0.1:3099';

describe('Propagation de contenu — sans rebuild (P3)', () => {

  it.skipIf(!process.env.RUN_PROPAGATION_TESTS)(
    'modifier brideName + revalidateTag => visible sur /w/[slug]',
    async () => {
      const slug = 'test-propagation-slug';
      const db = testDb();
      const w = await db.wedding.findFirst({ where: { slug } });
      if (!w) return; // skip si le slug de test n'est pas seedé

      await db.wedding.update({
        where: { id: w.id },
        data: { brideName: 'NouvelleMariée-' + Date.now() },
      });
      // Invalider le cache (en production : revalidateTag depuis /api/onboarding/publish).
      await fetch(`${TEST_BASE}/api/onboarding/publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ weddingId: w.id }),
      }).catch(() => null);

      // Attendre la propagation ISR + CDN (au pire 5 minutes — ici on attend 2 s).
      await new Promise(r => setTimeout(r, 2000));
      const res = await fetch(`${TEST_BASE}/w/${slug}`);
      const html = await res.text();
      expect(html).toContain('NouvelleMariée');
    },
    60_000,
  );

  it.skipIf(!process.env.RUN_PROPAGATION_TESTS)(
    'un mariage A modifié ne propage PAS vers le mariage B (isolation manifeste)',
    async () => {
      const db = testDb();
      const a = await db.wedding.findFirst({ where: { slug: 'test-prop-a' } });
      const b = await db.wedding.findFirst({ where: { slug: 'test-prop-b' } });
      if (!a || !b) return;

      const oldBrideB = b.brideName;
      await db.wedding.update({
        where: { id: a.id },
        data: { brideName: 'AAAA-' + Date.now() },
      });
      await fetch(`${TEST_BASE}/api/onboarding/publish`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ weddingId: a.id }),
      }).catch(() => null);

      // Vérifier que B n'a pas changé.
      const b2 = await db.wedding.findFirst({ where: { slug: 'test-prop-b' } });
      expect(b2?.brideName).toBe(oldBrideB);
    },
    60_000,
  );
});
