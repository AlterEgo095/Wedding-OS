# Wedding OS — Tenant Security Contract (V4)

> Document technique de référence. Toute route tenant-sensitive doit respecter
> ce contrat à 100 %. L'absence d'un seul maillon = refus de l'accès + audit
> log + fail-closed.
>
> **Pilier n°1 à ne jamais casser** (audit V2, section 74).

## 1. Les six maillons du contrat

```
AUTHENTICATION → TENANT RESOLUTION → AUTHORIZATION → OWNERSHIP → VALIDATION → AUDIT
```

Chaque route de `/api/*` qui touche une ressource tenant-scopée DOIT franchir
ces six étapes, dans cet ordre. Le moindre saut = refus.

### 1.1 Authentication

- **Admin / Org** : `getAuthUser(request)` renvoie `{ id, email, role, weddingId, organizationId }`.
  Le JWT est signé avec `JWT_SECRET` (>= 32 chars, fail-fast en prod — P0-SEC-1).
  Optionnel : 2FA TOTP pour PLATFORM_ADMIN et ORG_ADMIN.
- **Guest** : `validateGuestSession(cookie, userAgent, ip)` décode le cookie
  `guest_session` (JWT dérivé de JWT_SECRET + suffixe `-guest-session`), vérifie
  l'existence de la GuestSession en base, applique le ban brute-force
  (`MAX_LOGIN_ATTEMPTS_PER_HOUR`, `BRUTE_FORCE_BAN_MINUTES`).
- **Webhook** (Charow) : HMAC SHA-256 vérifié via `x-charow-signature`, puis
  re-interrogation serveur de l'état de paiement (jamais confiance au corps).

### 1.2 Tenant resolution

- `resolveAdminTenant(request, user)` : extrait le `X-Wedding-Slug` header ou
  le slug de la session admin, vérifie que le slug existe, appartient à
  l'organisation de l'utilisateur (scope `org`) ou est le mariage personnel
  (scope `wedding`), puis peuple le contexte `{ scope, weddingId, organizationId }`
  via `runWithTenant(...)`.
- `resolvePublicTenant(request, slugOverride?)` : pour les invités et les
  routes publiques ; résout le slug depuis l'URL, l'en-tête `Host` (custom
  domain) ou un override de body (peek défense-en-profondeur).

Le contexte de tenant est porté par `AsyncLocalStorage` — aucune variable
globale, pas de fuite inter-requêtes. L'extension Prisma `tenant-scoped.ts`
lit ce contexte pour injecter `weddingId` dans 21 modèles.

### 1.3 Authorization

- `hasPermission(user.role, [...allowedRoles])` : vérifie le rôle de l'utilisateur
  contre la liste autorisée pour l'opération.
- Rôles : `SUPER_ADMIN > PLATFORM_ADMIN > ORG_ADMIN > ORG_MEMBER > ORG_VIEWER >
  ORGANIZER > CONTROLLER` (+ invité sans rôle).
- `assertWeddingAccess(user, weddingId, weddingOrganizationId)` : plat-forme
  bypass, org vérifie `organizationId` fail-closed (les deux côtés doivent
  exister), per-wedding vérifie `user.weddingId === weddingId`.
- `requirePlatformAdmin(user)` : garantit une route platform-only.

### 1.4 Ownership (le maillon le plus critique)

- **Routes par-id** (`/api/guests/[id]`, `/api/media/[id]`, etc.) : la requête
  Prisma DOIT inclure `weddingId` dans le `where` (soit directement, soit via
  `assertTenantOwned(...)` qui vérifie `{ id, weddingId === ctx.weddingId }`).
  - `findUnique` / `update` / `delete` / `upsert` NE SONT PAS auto-injectés
    par l'extension (clés composites). Le garde-fou est humain — P1 y ajoute
    un lint custom qui impose `where: { id, weddingId }` sur ces opérations.
- **Guest self-access** : `session.guestId === id` (comparaison stricte).
  Toute tentative cross-guest renvoie 403 + `GuestAccessLog ACCESS_DENIED`
  avec ID tronqué à 8 caractères (pas de fuite de l'identité ciblée).
- **Check-in** : `tenantDb.guest.findFirst({ where: { invitationCode, weddingId } })`
  — un code étranger au mariage = 404 no-leak (le code peut exister ailleurs,
  mais aucune information ne filtre).

### 1.5 Validation

- `Zod` schema sur le body de chaque route mutante (POST/PUT/PATCH/DELETE).
- Validation CSRF via middleware pour toute méthode state-changing
  (`CSRF_PROTECTED_METHODS = { POST, PUT, DELETE, PATCH }`).
- Routes exemptes (`CSRF_EXEMPT_PATHS`) : webhook (signature HMAC), health,
  csrf-token, etc. — liste courte et explicite.
- Validation des uploads : extension whitelist (SVG interdit — P1-SEC-13),
  MIME whitelist, magic-byte check (RIFF/WEBP), taille max 10 Mo, quota par plan.

### 1.6 Audit

- `writeAuditLog({ action, targetResourceId, targetUserId, request })` : peuple
  `ipAddress` + `userAgent` depuis la requête (P2-SEC-14), pas depuis le corps.
- `logGuestAccess({ guestId, action, details, clientInfo })` : GuestAccessLog
  avec fingerprint, deviceInfo, referrer — actions `LOGIN, VIEW_INVITATION,
  ACCESS_DENIED, LOGOUT, QR_SCAN, LINK_VISIT, SEARCH_BLOCKED`.
- Toutes les erreurs sont journalisées sans pile (`logger.error` avec
  `errMessage` + `errName`, jamais `error.stack` — P2-SEC-1).

## 2. Modèles tenant-scopés (21)

L'extension Prisma injecte automatiquement `weddingId` sur ces modèles pour
les opérations `findMany / findFirst / count / groupBy / aggregate / create /
createMany / updateMany / deleteMany` :

```
Guest, Table, Media, EventTimeline, CoupleStory, Settings, GuestSession,
GuestAccessLog, Theme, MusicTrack, Invitation, UsageCounter,
WeddingCollectionBinding, Family, GuestGroup, Gift, ProgramItem, GuestbookEntry
```

Les autres modèles (`Wedding`, `AdminUser`, `AuditLog`, etc.) ne sont PAS
auto-injectés — `AuditLog` permet délibérément `weddingId` null pour les
événements plateforme.

## 3. Vérifications automatiques à imposer en CI (P1)

| Vérification | Outil | Refus |
|---|---|---|
| Pas de `db.` brut dans `/api/w/` ou `/api/guest/` | ESLint custom | build fail |
| `where: { id }` sans `weddingId` sur 21 modèles | AST rule | build fail |
| Nouveau modèle tenant non ajouté à `TENANT_SCOPED_MODELS` | tests/security/tenant-isolation.test.ts | test fail |
| `process.env.JWT_SECRET` inféré en dur dans le code | ripgrep pre-commit | commit bloqué |
| `.env` ou `.env.*` (hors .env.example) en staging | git secrets / pre-commit | push bloqué |

## 4. Référence rapide — code source à respecter

| Fichier | Rôle |
|---|---|
| `src/lib/auth.ts` | Auth admin + rôles + 2FA + assertWeddingAccess |
| `src/lib/guest-auth.ts` | Auth invité + tokens AES-256-GCM + ban brute-force |
| `src/lib/tenant-context.ts` | AsyncLocalStorage + resolveAdminTenant / resolvePublicTenant |
| `src/lib/prisma-extensions/tenant-scoped.ts` | Extension Prisma fail-closed + assertTenantOwned |
| `src/lib/rate-limit.ts` | Rate limit synchrone + Redis asynchrone optionnel |
| `src/lib/csrf.ts` | verifyCsrf + CSRF_EXEMPT_PATHS |
| `src/lib/audit.ts` | writeAuditLog |
| `src/middleware.ts` | HTTPS, CSP, CSRF, custom domains, slug validation 30s |

## 5. Tests de régression à exécuter à chaque release

- `tests/security/tenant-isolation.test.ts` — extension + IDOR
- `tests/security/auth-jwt.test.ts` — fail-fast prod + secrets distincts
- `tests/security/payment-safety.test.ts` — webhook HMAC + idempotence
- `tests/integration/rsvp-idempotence.test.ts` — check-in + RSVP
- `tests/e2e/golden-path.spec.ts` — parcours produit end-to-end

Une release critique qui échoue sur l'un de ces tests n'est PAS validée.
