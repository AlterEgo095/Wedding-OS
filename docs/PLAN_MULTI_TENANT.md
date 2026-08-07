# Heureux Mariage — Plan Premium Multi-Tenant SaaS

> **Document de référence** — Architecture commerciale pour servir plus d'un mariage par mois.
> Statut : Prêt pour exécution · ADR finalisés · 10 phases · ~6 semaines

---

## Part A — Executive Summary

### Vision
Transformer **Heureux Mariage** (showcase single-tenant pour Josué & Hornella) en **plateforme SaaS premium d'invitations digitales & gestion d'invités** pour l'Afrique francophone, en démarrant par la RDC puis expansion panafricaine.

### Marché cible
- **Primaire** : Couples à Kinshasa/RDC (100–600 invités)
- **Secondaire** : Wedding planners (agences gérant 5–30 mariages/an)
- **Tertiaire** : Couples francophones panafricains (Côte d'Ivoire, Sénégal, Cameroun, Gabon)

### Modèle économique
Abonnement par mariage (SaaS B2C) avec metering par usage. Pas de micro-facturation par invité — pricing prévisible. Add-ons premium (domaine custom, stockage supplémentaire, white-label) pour augmenter l'ARPU.

### Tarifs

| Plan | FCFA/mois | USD/mois | Invités | Médias | Domaine custom | Essai |
|------|----------:|---------:|--------:|------:|:--------------:|:-----:|
| **Essai Libre** | 0 | 0 | 20 | 100 MB | ❌ | 14 jours |
| **Essentiel** | 30 000 | $49 | 200 | 1 GB | ❌ | — |
| **Premium** | 60 000 | $99 | 500 | 5 GB | ✅ | — |
| **Élite** | 120 000 | $199 | ∞ | 20 GB | ✅ + white-label | — |

- Tous plans payants : sans watermark, moteur luxury complet, RSVP, QR check-in, multi-staff.
- Facturation annuelle : 2 mois offerts.
- Positionnement premium : visuels cinématiques, LCP < 2.5s sur 4G, mobile-first, PWA offline.

### Unit economics cibles
- CAC ≤ $25 (organic + referral via partage invitations)
- ARPU blended : $80 (Premium le plus populaire)
- Gross margin > 85%
- Payback < 2 mois

---

## Part B — Architecture Decision Records (ADR)

### ADR-1 · Tenancy model
**Choix** : Shared SQLite + `weddingId` sur toutes les tables tenant-scoped.
**Justification** : Migration 1 jour vs 2 semaines pour Postgres. SQLite WAL gère 50 writers soutenus = suffisant pour 200 mariages/mois. Migration Postgres reste ouverte (zéro changement code applicatif car queries déjà wedding-scoped).

### ADR-2 · Routing strategy
**Choix** : Subpath `/w/{slug}` (défaut) + Custom domain (Premium/Élite) via Caddy on-demand TLS + Cloudflare DNS-01.
**Justification** : Subpath marche day 1 sans DNS/SSL. Custom domain = upsell haut-ARPU. Backward compat : `/` continue à servir le mariage default (`josue-hornella`).

### ADR-3 · Auth strategy
**Choix** : Custom JWT étendu avec claims `weddingId` + `weddingRole` (Phases 1–7). NextAuth reporté à Phase 8+ si besoin OAuth Google pour onboarding.
**Nouveaux rôles** : `PLATFORM_ADMIN` (owner), `ORGANIZER` (per-wedding), `STAFF` (per-wedding helper).

### ADR-4 · DB scaling path
**Phase 1–10** : SQLite + WAL + `busy_timeout=5000` + backups quotidiens.
**Triggers migration Postgres** : DB > 2GB, > 500 weddings actifs, > 100 writers concurrents.

### ADR-5 · Storage strategy
**Choix** : Cloudflare R2 (S3-compatible, zero egress) via presigned URLs.
**Justification** : Galeries image-heavy → R2 zero egress = économies majeures. Coût : $0.015/GB/mois. Local FS gardé en fallback dev.

### ADR-6 · Billing provider
**Choix** : Stripe Checkout (signup) + Customer Portal (self-service) + Webhooks (sync).
**Justification** : Industry standard, EUR/USD supportés. Customer Portal = 2 semaines d'UI économisées. FCFA non supporté → facturation EUR avec équivalent FCFA affiché.

---

## Part C — Data Model (extrait)

### Modèles clés

```prisma
model Wedding {
  id              String        @id @default(cuid())
  slug            String        @unique
  brideName       String
  groomName       String
  coupleLabel     String
  weddingDate     DateTime?
  timezone        String        @default("Africa/Kinshasa")
  venueName       String?
  venueAddress    String?
  venueCity       String?
  venueLat        String?
  venueLng        String?
  status          String        @default("DRAFT") // DRAFT, PUBLISHED, ARCHIVED, SUSPENDED
  plan            String        @default("TRIAL") // TRIAL, ESSENTIEL, PREMIUM, ELITE
  customDomain    String?       @unique
  isDefault       Boolean       @default(false)
  createdAt       DateTime      @default(now())
  updatedAt       DateTime      @updatedAt
  publishedAt     DateTime?
  // ... relations
}

model User {  // renommé depuis AdminUser
  id           String     @id @default(cuid())
  email        String     @unique
  password     String
  name         String
  role         String     @default("STAFF") // PLATFORM_ADMIN, ORGANIZER, STAFF
  weddingId    String?    // null pour PLATFORM_ADMIN
  // ...
}

model Subscription {
  id                     String    @id @default(cuid())
  weddingId              String    @unique
  stripeCustomerId       String    @unique
  stripeSubscriptionId   String?   @unique
  plan                   String    @default("TRIAL")
  status                 String    @default("TRIALING")
  currentPeriodStart     DateTime?
  currentPeriodEnd       DateTime?
  trialEndsAt            DateTime?
  // ...
}

model Invoice {
  id              String       @id @default(cuid())
  subscriptionId  String
  stripeInvoiceId String       @unique
  amountDue       Int
  amountPaid      Int
  currency        String       @default("eur")
  status          String
  pdfUrl          String?
  paidAt          DateTime?
  // ...
}

model UsageCounter {
  id          String   @id @default(cuid())
  weddingId   String
  metric      String   // GUESTS, MEDIA_BYTES, ADMINS, QR_SCANS
  value       Int      @default(0)
  period      String   // "2026-06"
  @@unique([weddingId, metric, period])
}

model Theme {
  id              String   @id @default(cuid())
  weddingId       String   @unique
  primaryColor    String   @default("#D4A853")
  accentColor     String   @default("#C8785A")
  fontDisplay     String   @default("Cormorant Garamond")
  fontBody        String   @default("Inter")
  layout          String   @default("classic")
  customizations  String?  // JSON
}

model MusicTrack {
  id              String   @id @default(cuid())
  weddingId       String   @unique
  storageProvider String   @default("LOCAL")
  url             String
  volume          Float    @default(0.25)
  enabled         Boolean  @default(false)
  autoplay        Boolean  @default(false)
}
```

### Migration strategy (zero data loss)
1. Créer table `Wedding` + insérer default wedding (`slug: "josue-hornella"`, `isDefault: true`, `plan: "ELITE"`, `status: "PUBLISHED"`)
2. Renommer `AdminUser` → `User` + ajouter `weddingId` nullable + mapper rôles
3. Ajouter `weddingId` nullable à toutes les tables tenant-scoped
4. Backfill : `UPDATE ... SET weddingId = '<default>'`
5. Drop anciens `@unique` globaux, ajouter composites `@@unique([weddingId, key])`
6. Rendre `weddingId` NOT NULL
7. Créer nouvelles tables (`Subscription`, `Invoice`, `UsageCounter`, `Theme`, `MusicTrack`, `Invitation`)
8. Seed Theme + MusicTrack + Subscription pour default wedding (legacy client = Élite gratuit à vie)
9. **Préserver tous les `invitationCode`** (QR codes imprimés + SMS envoyés)

---

## Part D — Phased Implementation Plan

| Phase | Durée | Goal | Livrable clé |
|-------|------:|------|--------------|
| **1** Foundation | 3j | Wedding/Tenant model + migration | Schema migré, app boot, legacy URL marche |
| **2** Routing + isolation | 3j | `/w/{slug}` + Prisma extension anti-leak | Pages publiques par mariage, isolation testée |
| **3** Auth & RBAC | 2j | Login per-wedding + platform admin | RBAC enforced partout |
| **4** Pages publiques | 3j | Invitation UX complète par mariage | Hero/Story/Timeline/Gallery/Music per-wedding |
| **5** Dashboard super-admin | 3j | Vue plateforme (MRR, churn, weddings) | `/platform/admin` live |
| **6** Stripe billing | 4j | Paiements + metering + Customer Portal | Upgrades self-service |
| **7** Onboarding wizard | 4j | Signup → création wedding → publish < 10 min | Landing + wizard 5 étapes |
| **8** Themes & customization | 3j | 4 templates + custom domain | Premium UX per-wedding |
| **9** R2 storage & scale | 3j | Media → R2, horizontal scale-ready | Multi-instance ready |
| **10** Launch & observability | 2j | Monitoring + backups + launch checklist | Production-go |

**Total** : ~30 dev-days = 6 semaines calendar pour 1–2 devs sénior.

### Timeline calendar

| Semaine | Phases | Outcome |
|---------|--------|---------|
| 1 | 1 + 2 | Foundation multi-tenant live sur staging |
| 2 | 3 + 4 | Admin per-wedding + pages publiques end-to-end |
| 3 | 5 + 6 | Dashboard plateforme + Stripe billing |
| 4 | 7 | Onboarding wizard + landing → **soft launch** |
| 5 | 8 + 9 | Themes + R2 → horizontal scale-ready |
| 6 | 10 | Observability + backups → **lancement commercial public** |

---

## Part E — Risk Register (top 10)

| # | Risque | L | I | Mitigation |
|---|--------|:-:|:-:|------------|
| 1 | Cross-tenant data leak | M | **C** | Prisma extension auto-inject `weddingId` + tests d'isolation en CI |
| 2 | SQLite write contention (pic RSVP samedi) | M | M | WAL + `busy_timeout=5000`, plan migration Postgres prêt |
| 3 | Custom domain TLS failure | M | H | Cloudflare DNS-01, fallback subpath, retry 30j |
| 4 | Stripe webhook missed/dup | L | H | Handlers idempotents (dedupe `stripeEventId`) + retry 3j |
| 5 | Media loss on redeploy | M→L | **C** | Volume persistant + migration R2 Phase 9 + backups nightly |
| 6 | Break backward-compat client actuel | M | **C** | `/` redirect vers `/w/josue-hornella`, e2e smoke test prod |
| 7 | Migration `Settings` casse UI | M | H | Transaction unique + test sur backup + rollback snapshot |
| 8 | Liens invitation imprimés cassés | L | **C** | `invitationCode` préservé verbatim, JWT secret inchangé |
| 9 | Performance regression indexes | L | M | Composite indexes + `EXPLAIN QUERY PLAN` audit |
| 10 | Wizard abandonment | M | M | Save progress + replay Hotjar + funnel review hebdo |

---

## Part F — Success Metrics (KPIs)

### Business
| KPI | Mois 1 | Mois 3 | Mois 6 |
|-----|-------:|-------:|-------:|
| MRR | $500 | $2,000 | $10,000 |
| Mariages payants | 5 | 25 | 100 |
| Trial signups/mois | 30 | 100 | 300 |
| Conversion Trial→Paid | 15% | 25% | 30% |
| Churn mensuel | — | <10% | <8% |
| NPS | — | 30 | 45+ |

### Product
- Public invitation LCP (4G) < 2.5s
- Admin dashboard load < 1.5s
- Onboarding completion < 10 min
- RSVP rate per wedding > 70%
- QR check-in adoption > 50%

### Technical
- Uptime 99.5% (M3), 99.9% (M6)
- 5xx error rate < 0.5%
- p95 API latency < 300ms
- Backup success rate 100% daily

---

## Part G — Parallel Hotfix Track (déjà exécuté)

Les correctifs (21H30 + sync displayName) sont déployés via une branche **`hotfix/21h30-and-displayname`** isolée du travail multi-tenant. Zéro conflit car :
- Le hotfix touche la **logique runtime** (render timeline, mutation guest)
- Le multi-tenant touche **schema + routing + auth** (orthogonal)
- Le `displayName` sync logic est **préservé verbatim** dans la refonte Phase 1

### Étapes hotfix déployées
1. ✅ Fix `prisma/seed.ts` (21H30 + venue_time)
2. ✅ Fix `seed.ts` racine
3. ✅ Fix `init-db.js`
4. ✅ Fix `TimelineManager.tsx` placeholder
5. ✅ Fix `api/guests/[id]/route.ts` (auto-sync displayName)
6. ✅ Fix `api/guests/route.ts` (auto-sync displayName)
7. ✅ Fix `api/guests/import/route.ts`
8. ✅ Fix `api/guests/import-docx/route.ts`
9. ✅ Fix `GuestManager.tsx` (UI fields)
10. ⏳ **Déploiement VPS en cours** (95.111.226.63, conteneur Docker `wedding-app`)
11. ⏳ Fix DB direct VPS : `MBOYO` → `CHRIST MPEPE` + vérif 21H30
12. ⏳ Vérif prod https://wedding.hpph.net

### Rollback plan
Si hotfix problematic en prod : `docker stop wedding-app && docker start wedding-app-old` + restore DB pre-hotfix.

---

## Appendix — File inventory

### Nouveaux fichiers (par phase)
- **Lib** : `tenant-context.ts`, `prisma-extensions/tenant-scoped.ts`, `types.ts`, `stripe.ts`, `billing.ts`, `billing-limits.ts`, `email.ts`, `storage/{storage-provider,local-provider,r2-provider,index}.ts`, `image-processing.ts`, `custom-domains.ts`, `audit.ts`, `observability/{logger,analytics}.ts`, `themes/templates.ts`
- **App routes** : `w/[slug]/{layout,page}.tsx`, `w/[slug]/invite/[code]/page.tsx`, `w/[slug]/{rsvp,program,gallery,admin}/{page,billing,appearance,music}/page.tsx`, `(platform)/admin/{page,weddings,users,billing,audit-logs,observability}/page.tsx`, `(marketing)/page.tsx`, `(auth)/{signup,login}/page.tsx`, `onboarding/page.tsx`
- **API routes** : `api/{platform/login,platform/dashboard,platform/weddings,billing/checkout,billing/portal,billing/webhook,billing/usage,onboarding/create-wedding,onboarding/publish,caddy/ask-domain,health}/route.ts`, `api/w/[slug]/{guests,settings,timeline,couple-story,media,music,tables,guest/auth,guest/rsvp,guest/me,guest/access-logs,theme,custom-domain,media/upload,media/confirm}/route.ts`
- **Components** : `wedding/{WeddingInvitationPage,ThemeInjector}.tsx`, `onboarding/{Wizard,Step1-5}.tsx`, `platform/{PlatformSidebar,WeddingsTable,MrrChart,PlanDistributionChart}.tsx`
- **Scripts** : `migrate-default-wedding.ts`, `seed-stripe-products.ts`, `backfill-media-to-r2.ts`, `backup-db.sh`
- **Infra** : `docker-compose.yml`, `.env.example`, `docs/{launch-checklist,runbook}.md`, `Caddyfile` (maj)

### Fichiers modifiés
- `prisma/schema.prisma` (full rewrite)
- `prisma/seed.ts`, `src/lib/db.ts`, `src/lib/auth.ts`, `src/lib/guest-auth.ts`, `src/lib/rate-limit.ts`
- `src/middleware.ts`, `src/app/page.tsx`, `src/app/admin/page.tsx`
- Tous `src/components/admin/*.tsx` (wedding-scoped)
- `src/components/{GuestAuthProvider,GuestAuthForm}.tsx`
- `Dockerfile`, `docker-entrypoint.sh`, `Caddyfile`, `next.config.ts`, `.env`
- Les 26 fichiers `src/app/api/*/route.ts` (ajout `weddingId` where)

---

**Document vivant** — sera mis à jour à chaque phase livrée.
