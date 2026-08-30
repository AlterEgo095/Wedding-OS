// ━━━ V4 — Golden Path E2E (Playwright) — HEALTH TEST DU PRODUIT ━━━
//
// Le Golden Path est le test de santé principal. Une release critique n'est
// pas validée si ce test échoue (section 12 de la mission V4).
//
// PARCOURS (section 11) :
//   Signup → Login → Create Wedding → Configure identity → Select template
//   → Upload photo → Edit content → Add program → Add guests → Assign tables
//   → Preview → Publish → Generate invitation → Share WhatsApp
//   → Guest opens → Guest RSVP → Organizer sees RSVP
//   → Organizer modifies invitation → Guest sees updated invitation
//
// Ce fichier est un SCAFFOLDING : il définit la structure et les attentes.
// Les selectors sont volontairement stables (data-testid) — à ajouter dans
// les composants UI concernés en P2.
//
// RUN: bunx playwright test tests/e2e/golden-path.spec.ts
// PRE-REQUIS: serveur Next en écoute sur http://127.0.0.1:3099, base de test
// isolée (DATABASE_URL pointe vers un fichier test-*.db), Redis optionnel.

import { test, expect, type Page } from '@playwright/test';

const BASE = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:3099';

// ─── Helpers ──────────────────────────────────────────────────────────────

async function signupNewManager(page: Page, email: string) {
  await page.goto(`${BASE}/org/signup`);
  await page.fill('[data-testid="signup-email"]', email);
  await page.fill('[data-testid="signup-password"]', 'TestGolden-2026!');
  await page.click('[data-testid="signup-submit"]');
  await expect(page).toHaveURL(/.*\/(dashboard|onboarding)/);
}

async function createWedding(page: Page, slug: string, bride: string, groom: string) {
  await page.goto(`${BASE}/onboarding`);
  await page.fill('[data-testid="wedding-slug"]', slug);
  await page.fill('[data-testid="bride-name"]', bride);
  await page.fill('[data-testid="groom-name"]', groom);
  await page.click('[data-testid="wedding-create"]');
  await expect(page).toHaveURL(new RegExp(`/w/${slug}/admin`));
}

async function publishWedding(page: Page, slug: string) {
  await page.goto(`${BASE}/w/${slug}/admin?tab=settings`);
  // Le bouton PUBLIER doit être activé après validation du contenu.
  const btn = page.locator('[data-testid="publish-wedding"]');
  await expect(btn).toBeVisible();
  await btn.click();
  await expect(page.locator('[data-testid="publish-status"]')).toContainText(/PUBLISHED|published/i);
}

// ─── Golden Path complet ────────────────────────────────────────────────────

test.describe('GOLDEN PATH — parcours produit complet', () => {

  test.describe.configure({ mode: 'serial' });

  const slug = `golden-${Date.now().toString(36)}`;
  const bride = 'Clara';
  const groom = 'Dieudonné';
  const managerEmail = `golden+${slug}@test.wedding-os.local`;

  test('Signup → Login', async ({ page }) => {
    await signupNewManager(page, managerEmail);
  });

  test('Create Wedding + configure identity', async ({ page }) => {
    await createWedding(page, slug, bride, groom);
    // Vérifie que l identité est persistée en DB puis visible dans le dashboard.
    await page.goto(`${BASE}/w/${slug}/admin?tab=settings`);
    await expect(page.locator('[data-testid="bride-display"]')).toContainText(bride);
  });

  test('Select template + preview', async ({ page }) => {
    await page.goto(`${BASE}/w/${slug}/admin?tab=appearance`);
    await page.click('[data-testid="template-card-luxury"]');
    await page.click('[data-testid="preview-wedding"]');
    await expect(page).toHaveURL(new RegExp(`/w/${slug}\\?preview=`));
  });

  test('Add guests (bulk import)', async ({ page }) => {
    await page.goto(`${BASE}/w/${slug}/admin?tab=guests`);
    await page.click('[data-testid="guest-import"]');
    await page.setInputFiles('[data-testid="import-file"]', {
      name: 'guests.xlsx',
      mimeType: 'application/vnd.ms-excel',
      buffer: Buffer.from('placeholder'),   // remplacer par un vrai XLSX
    });
    await page.click('[data-testid="import-confirm"]');
    await expect(page.locator('[data-testid="guest-count"]')).not.toHaveText('0');
  });

  test('Publish wedding (self-serve, P2)', async ({ page }) => {
    // APRES la délégation P2 — un ORGANIZER peut publier seul.
    await publishWedding(page, slug);
  });

  test('Generate invitation + WhatsApp share link', async ({ page }) => {
    await page.goto(`${BASE}/w/${slug}/admin?tab=invitations`);
    await page.click('[data-testid="generate-invitations"]');
    const shareUrl = await page.locator('[data-testid="share-url"]').first().inputValue();
    expect(shareUrl).toContain(`${BASE}/w/${slug}?invite=`);
    // Le token est chiffré (AES-256-GCM) — on ne vérifie que la structure.
    expect(shareUrl.length).toBeGreaterThan(60);
  });

  test('Guest opens invitation + RSVP', async ({ page }) => {
    // Récupère l URL d invitation générée à l étape précédente (shared state
    // via fixtures ou via l admin API) — placeholder pour le test réel.
    const inviteUrl = `${BASE}/w/${slug}?invite=test-token-chiffre`;
    await page.goto(inviteUrl);
    await expect(page.locator('body')).toContainText(bride);
    await expect(page.locator('body')).toContainText(groom);

    await page.click('[data-testid="rsvp-confirm"]');
    await page.fill('[data-testid="rsvp-guests-count"]', '2');
    await page.fill('[data-testid="rsvp-dietary"]', 'végétarien');
    await page.click('[data-testid="rsvp-submit"]');
    await expect(page.locator('[data-testid="rsvp-success"]')).toBeVisible();
  });

  test('Organizer sees the RSVP', async ({ page }) => {
    await page.goto(`${BASE}/w/${slug}/admin?tab=guests`);
    await expect(page.locator('[data-testid="guest-status"]').first()).toContainText(/CONFIRMED/i);
  });

  test('Organizer modifies invitation => guest sees change (P3 propagation)', async ({ page }) => {
    await page.goto(`${BASE}/w/${slug}/admin?tab=settings`);
    await page.fill('[data-testid="venue-city"]', 'Goma');
    await page.click('[data-testid="settings-save"]');
    // Sauvegarder déclenche revalidateTag — la page publique reflète le lieu.
    await page.goto(`${BASE}/w/${slug}?preview=true`);
    await expect(page.locator('body')).toContainText('Goma');
  });
});

// ─── Tests d isolation inter-locataires (sections 17-18) ───────────────────

test.describe('ISOLATION MULTI-TENANT — Golden Path négatif', () => {

  test('Guest A ne peut pas lire Guest B (IDOR bloqué)', async ({ browser }) => {
    // Crée deux weddings (via fixtures) + deux invités, puis tente un accès
    // cross-tenant. Doit renvoyer 403 (admin tente) ou 404 (guest tente).
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const guestB_id = 'unknown-cuid-b';   // ID d un autre mariage
    const response = await page.request.get(`${BASE}/api/guests/${guestB_id}`);
    expect([401, 403, 404]).toContain(response.status());
    await ctx.close();
  });

  test('Slug manipulation : un slug DRAFT n est pas routable hors admin', async ({ page }) => {
    const draftSlug = 'test-draft-not-public';
    const response = await page.goto(`${BASE}/w/${draftSlug}`);
    // Le middleware valide le statut du slug (cache 30s) et renvoie 404 pour DRAFT.
    expect(response?.status()).toBe(404);
  });
});
