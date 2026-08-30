# Golden Path — Test de santé principal du produit

> Toute release critique n'est pas validée si le Golden Path échoue
> (Mission V4, section 12).
>
> Source de vérité : `tests/e2e/golden-path.spec.ts` (Playwright).

## 1. Parcours de référence (18 étapes)

```
1.  Signup (manager)
2.  Login
3.  Create Wedding (slug, noms du couple)
4.  Configure identity (Settings : brideName, groomName, photos, hashtag)
5.  Select template (ThemeCustomizer + preset Luxury)
6.  Upload photo (MediaManager, validation magic-bytes, 10 Mo max)
7.  Edit content (welcome_message, invitation_message, programme)
8.  Add program (ProgramManager + ProgramItem)
9.  Add guests (GuestManager + import XLSX/DOCX avec génération de codes)
10. Assign tables (TableManager + Guest.tableId)
11. Preview (PreviewLab + signed JWT 24 h)
12. Publish (ORGANIZER self-serve — APRES P2 ; actuellement PLATFORM_ADMIN)
13. Generate invitation (InvitationManager + URL + QR par invité)
14. Share WhatsApp (WhatsAppShare + token chiffré, audit share-event)
15. Guest opens (wa.me → /w/[slug]?invite=TOKEN → auto-auth + GuestAccessLog)
16. Guest RSVP (presence + plusOne + dietary + message ; offline OK)
17. Organizer sees RSVP (Dashboard + StatisticsPanel + DietaryStatsCard)
18. Organizer modifies invitation → guest sees change (revalidateTag, ISR 300s)
```

## 2. Critères obligatoires (12 axes)

Le Golden Path DOIT vérifier :

| Axe | Vérification |
|---|---|
| AUTH | signup, login, 2FA (platform), logout, password reset (APRES P2) |
| DATABASE | toutes les écritures tombent en base (read-back) |
| MULTI-TENANT | wedding A n'influence jamais wedding B |
| ADMIN | toutes les modifications via studio (15 fonctions no-code) |
| API | 199 routes, aucune 500 inattendue sur le parcours |
| INVITATION | rendu manifeste, theme, sections, données couple |
| PWA | installabilité + offline RSVP + background sync |
| WHATSAPP | deep link wa.me + token chiffré + share-event audité |
| RSVP | idempotence, dietary, plusOne, agrégats sièges |
| CACHE | ISR 300 s + revalidateTag atomique sur publish |
| REVALIDATION | modification admin => visible en <= 5 min sans rebuild |
| ANALYTICS | ExperienceEvent alimenté (APRES P7) |

## 3. Variante négative (isolation)

Le Golden Path inclut un parcours négatif :

- Guest A tente GET /api/guests/B → 403 + log ACCESS_DENIED
- Slug DRAFT accédé hors admin → 404 stylé (middleware 30s cache)
- QR mariage A scanné au check-in B → 404 no-leak
- Webhook Charow rejoué → 200 idempotent (pas de double provisioning)
- Webhook signature invalide → 401

## 4. Exécution

```bash
# Pré-requis : instance Next de test sur http://127.0.0.1:3099
#              base isolée (DATABASE_URL override, voir tests/setup.ts)
#              Redis optionnel (in-memory fallback)

bunx playwright test tests/e2e/golden-path.spec.ts
```

Trois navigateurs (Playwright projects) :
- iPhone 14 (390×844) — iOS Safari
- Pixel 7 (412×915) — Android Chrome
- Desktop Chrome (1440×900)

## 5. Status actuel (V4 baseline)

- Fichier `tests/e2e/golden-path.spec.ts` créé (scaffolding complet).
- `playwright.config.ts` créé.
- Dépendances à ajouter à `package.json` (devDependencies) :
  `@playwright/test`, `vitest`, `@vitest/coverage-v8`.
- **BLOCKED** : exécution réelle requiert LEVEL 3 (instance de test dédiée,
  CI/CD). Voir BLOCKED report.
