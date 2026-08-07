# Frontend Deployment Pipeline — CONS-6-PIPELINE

> Canonical 9-stage pipeline that compiles a Wedding's Template + Theme +
> Collection + Assets into a single published JSON snapshot, then flips the
> Wedding to `PUBLISHED`. Only **Super Admin** (or Platform Admin) can trigger
> a deployment.

## 1. Architecture

```
                         ┌─────────────────────────────────────┐
                         │   Super Admin (browser)             │
                         │   /platform/admin → Déploiements    │
                         └─────────────────┬───────────────────┘
                                           │ POST /api/platform/deployments/trigger
                                           │   { weddingId, templateId, themeId, collectionId? }
                                           ▼
            ┌──────────────────────────────────────────────────────────────┐
            │   POST /api/platform/deployments/trigger/route.ts            │
            │   • requirePlatformAdmin(user)   ← only SUPER_ADMIN /        │
            │   • withRateLimit(10, 60_000)      PLATFORM_ADMIN may pass   │
            │   • Zod body validation                                      │
            │   • runDeploymentPipeline(input)                             │
            └──────────────────────────────┬───────────────────────────────┘
                                           │
                                           ▼
            ┌──────────────────────────────────────────────────────────────┐
            │   src/lib/pipeline/deployment-pipeline.ts                    │
            │                                                              │
            │   1. validateInputs      ──┐                                 │
            │   2. resolveTemplate      ──┤                                 │
            │   3. resolveTheme         ──┤                                 │
            │   4. resolveAssets        ──┤  each stage:                   │
            │   5. resolveComponents    ──┤   • PENDING → RUNNING →        │
            │   6. resolveBindings      ──┤     SUCCESS | FAILED           │
            │   7. resolveCollection    ──┤   • persisted to               │
            │   8. compileFrontend      ──┤     Deployment.logsJson        │
            │   9. publishFrontend      ──┘   • logged via `logger`        │
            └──────────────────────────────┬───────────────────────────────┘
                                           │
              ┌────────────────────────────┴────────────────────────────┐
              │  on SUCCESS                                              │
              │  ──────────────────────────────────────────────────────  │
              │  • Deployment.status = DEPLOYED                          │
              │  • Deployment.url    = /w/{slug}                         │
              │  • Wedding.status       = PUBLISHED                      │
              │  • Wedding.publishedAt  = now()                          │
              │  • Wedding.publishedConfigJson = JSON(PublishedConfig)   │
              │  • Wedding.publishedVersion    = version                 │
              │                                                         │
              │  on FAILURE                                             │
              │  ──────────────────────────────────────────────────────  │
              │  • Deployment.status = FAILED                            │
              │  • Deployment.logsJson = { stages, logs, error }         │
              │  • Wedding row unchanged (still DRAFT / previous pub)    │
              └─────────────────────────────────────────────────────────┘
                                           │
                                           ▼
            ┌──────────────────────────────────────────────────────────────┐
            │   Public read path (guest visits /w/{slug})                  │
            │                                                              │
            │   layout.tsx (server component)                              │
            │   • db.wedding.findUnique({ publishedConfigJson })           │
            │   • safeJsonParse → PublishedConfigSnapshot                  │
            │   • if set: manifest = publishedConfig.manifest              │
            │   • else:    manifest = resolveWeddingManifest(weddingId)    │
            │   • passes manifest + publishedConfig via WeddingContext     │
            │                                                              │
            │   page.tsx (client component)                                │
            │   • <ThemeInjector theme={publishedConfig?.theme} />         │
            │   • <SectionRenderer manifest={activeManifest} ... />        │
            └──────────────────────────────────────────────────────────────┘
```

## 2. Pipeline stages (in order)

The pipeline runs 9 stages sequentially. Each stage is wrapped by
`runStage()` which:

1. Flips the stage status `PENDING → RUNNING` and persists the Deployment
   row (status=`BUILDING`) so the admin UI can show live progress.
2. Awaits the stage's async body.
3. On success: `RUNNING → SUCCESS`, appends an `OK` log line.
4. On failure: `RUNNING → FAILED`, records the error message, rethrows —
   the outer `try/catch` in `runDeploymentPipeline` marks the whole
   Deployment as `FAILED` and persists the final `logsJson`.

| # | Stage              | Purpose                                                                                                          |
|---|--------------------|------------------------------------------------------------------------------------------------------------------|
| 1 | `validateInputs`   | Verify `weddingId` / `templateId` / `themeId` are present + the Wedding is not `ARCHIVED`/`SUSPENDED`.           |
| 2 | `resolveTemplate`  | Fetch the `Template` row (must not be `ARCHIVED`). Captures `schemaJson` + `version`.                             |
| 3 | `resolveTheme`     | Fetch the `PlatformTheme` row (must be `PUBLISHED`). Captures palette JSON + fonts.                               |
| 4 | `resolveAssets`    | Walk the Template's `schemaJson` for cuid-like strings; fetch matching `PlatformAsset` rows.                     |
| 5 | `resolveComponents`| Fetch all `PUBLISHED` `ComponentRegistry` entries (the runtime component pool for the build).                    |
| 6 | `resolveBindings`  | Fetch the `WeddingCollectionBinding` (manifest + collectionId) if one exists for this wedding.                   |
| 7 | `resolveCollection`| Fetch the `Collection` (optional — from input or binding). Non-fatal if missing.                                  |
| 8 | `compileFrontend`  | Resolve the canonical `WeddingManifest` via `resolveWeddingManifest`, override its theme with the PlatformTheme,  |
|   |                    | assemble the full `PublishedConfig` blob (schemaVersion, wedding, template, theme, manifest, components, assets).|
| 9 | `publishFrontend`  | Write `publishedConfigJson` + `publishedVersion` to the Wedding row, flip `status=PUBLISHED` + `publishedAt=now`,|
|   |                    | set `Deployment.status=DEPLOYED` + `url=/w/{slug}`.                                                              |

### Stage status lifecycle

```
PENDING ──▶ RUNNING ──▶ SUCCESS
                │
                └──▶ FAILED   (stage.error set, pipeline aborts)
```

The Deployment row's `status` field mirrors the pipeline-level state:

```
PENDING ──▶ BUILDING ──▶ DEPLOYED
                │
                └──▶ FAILED
```

## 3. Data model

### Deployment (Prisma)

| Field         | Type     | Notes                                                        |
|---------------|----------|--------------------------------------------------------------|
| `id`          | String   | cuid, primary key                                            |
| `weddingId`   | String?  | FK → Wedding (nullable, onDelete: SetNull)                   |
| `templateId`  | String?  | FK → Template                                                |
| `version`     | String   | `yyyy.MMdd.HHmmss-xxxx` (semver-ish, sortable)              |
| `status`      | String   | `PENDING` \| `BUILDING` \| `DEPLOYED` \| `FAILED`            |
| `url`         | String?  | `/w/{slug}` on success                                       |
| `logsJson`    | String   | JSON `{ stages, logs, error? }` — the full stage trace       |
| `createdAt`   | DateTime | auto                                                         |
| `updatedAt`   | DateTime | auto (`@updatedAt`)                                          |

### Wedding (additive fields — CONS-6-PIPELINE)

| Field                   | Type    | Notes                                                              |
|-------------------------|---------|--------------------------------------------------------------------|
| `publishedConfigJson`  | String? | JSON-serialised `PublishedConfig` from the last successful deploy. |
| `publishedVersion`     | String? | Mirrors `Deployment.version` for fast equality checks.             |

These two fields are the **only** contract between the pipeline and the
public render path. `layout.tsx` reads `publishedConfigJson` directly via
`db` (no HTTP round-trip); if absent, it falls back to
`resolveWeddingManifest()` (binding-based — pre-pipeline behaviour).

### PublishedConfig (JSON shape, schemaVersion: 1)

```jsonc
{
  "schemaVersion": 1,
  "weddingId": "ck...",
  "weddingSlug": "josue-hornella",
  "coupleLabel": "Josué & Hornella",
  "templateId": "ck...",
  "templateName": "Royal Gold",
  "templateVersion": 3,
  "themeId": "ck...",
  "themeName": "Champagne Or",
  "collectionId": "ck...",          // null if no collection
  "version": "2026.0807.143022-ab12",
  "compiledAt": "2026-08-07T14:30:22.000Z",
  "manifest": {                      // WeddingManifest — section tree
    "schemaVersion": 1,
    "collectionId": "...",
    "sections": [...],
    "theme": { "primaryColor": "...", "accentColor": "...", "fontDisplay": "...", "fontBody": "..." },
    "luxury": { ... }
  },
  "theme": {                         // published theme (overrides manifest.theme)
    "primaryColor": "#D4A853",
    "accentColor": "#C8785A",
    "fontDisplay": "Cormorant Garamond",
    "fontBody": "Inter",
    "layout": "classic"
  },
  "components": [                    // ComponentRegistry entries in this build
    { "slug": "hero", "name": "Hero", "type": "hero", "version": 2 },
    ...
  ],
  "assets": [                        // PlatformAsset entries referenced
    { "id": "ck...", "name": "Hero BG", "type": "image", "url": "https://..." },
    ...
  ]
}
```

## 4. Security model — Super Admin only

```
┌─────────────────────────────────────────────────────────────────┐
│  WHO            │  CAN DEPLOY?  │  ENFORCEMENT                  │
├─────────────────────────────────────────────────────────────────┤
│  SUPER_ADMIN    │  ✅ yes       │  requirePlatformAdmin(user)   │
│  PLATFORM_ADMIN │  ✅ yes       │  requirePlatformAdmin(user)   │
│  ORGANIZER      │  ❌ no        │  → 403 Forbidden              │
│  CONTROLLER     │  ❌ no        │  → 403 Forbidden              │
│  RECEPTION      │  ❌ no        │  → 403 Forbidden              │
│  unauthenticated│  ❌ no        │  → 401 Unauthorized           │
└─────────────────────────────────────────────────────────────────┘
```

### Enforcement layers

1. **API route gate** (`/api/platform/deployments/trigger/route.ts`):
   - `getAuthUser(request)` → resolves the acting admin from the session.
   - `requirePlatformAdmin(user)` → returns a `403 NextResponse` if the
     user's role is not `SUPER_ADMIN` or `PLATFORM_ADMIN`. The pipeline
     never runs for organizers / staff.

2. **Rate limit** (`withRateLimit(10, 60_000)`):
   - Max 10 deploys per minute per IP. Deployments are expensive (they
     write `publishedConfigJson` + flip `Wedding.status`), so the limit
     protects against runaway scripts + accidental double-clicks.

3. **Retry gate** (`/api/platform/deployments/[id]/retry/route.ts`):
   - Same `requirePlatformAdmin` + `withRateLimit(10, 60_000)` gate.
   - Re-runs the pipeline using the previous deployment's
     `weddingId` + `templateId` (+ a fallback `themeId`).

4. **Audit log**: every trigger + retry writes an `AuditLog` row
   (`DEPLOYMENT_SUCCESS` / `DEPLOYMENT_FAILED` /
   `DEPLOYMENT_RETRY_SUCCESS` / `DEPLOYMENT_RETRY_FAILED`) with the
   acting `userId` + a details string.

5. **Public read** (`/api/weddings/[id]/published-config/route.ts`):
   - **No auth required** — this is the public endpoint guests hit.
   - Returns `{ published: true, config, version }` or
     `{ published: false }`.
   - `Cache-Control: public, s-maxage=60, stale-while-revalidate=300`
     (CDN-cached for 60s, stale-while-revalidate 5min) so high-traffic
     weddings don't hammer the DB.

### Why organizers cannot deploy

Organizers feed **content** (stories, timeline, gifts, program, ...) via
`/w/[slug]/admin/*`. The deployment pipeline is a **platform-level
operation** that:

- Reads platform-wide models (`Template`, `PlatformTheme`,
  `ComponentRegistry`, `PlatformAsset`) — these are curated by the Super
  Admin, not by individual organizers.
- Writes to `Wedding.publishedConfigJson` — a single bad deploy could
  break the public page for every guest until the next deploy.
- Flips `Wedding.status` to `PUBLISHED` — a billing/governance signal.

Restricting the trigger to Super Admin keeps the blast radius small and
ensures every published config has been reviewed by the platform team.

## 5. API surface

| Method | Route                                              | Auth           | Purpose                              |
|--------|----------------------------------------------------|----------------|--------------------------------------|
| GET    | `/api/platform/deployments`                        | Platform Admin | List deployments (paginated)         |
| POST   | `/api/platform/deployments/trigger`                | Platform Admin | Trigger a new pipeline run           |
| GET    | `/api/platform/deployments/{id}`                   | Platform Admin | Get one deployment + parsed stages   |
| POST   | `/api/platform/deployments/{id}/retry`             | Platform Admin | Retry a failed deployment            |
| GET    | `/api/weddings/{id}/published-config`              | **Public**     | Fetch the published config (CDN-cached) |

## 6. Admin UI

`src/app/platform/admin/tabs/production/DeploymentsPanel.tsx`:

- **"Nouveau déploiement"** button → opens a dialog with 4 selects
  (mariage, template, thème, collection optionnelle). Only `PUBLISHED`
  templates + themes are shown. On submit → `POST /trigger`.
- **Deployment table** with status badges
  (`PENDING` amber / `BUILDING` sky / `DEPLOYED` emerald / `FAILED` red),
  version, creation date, URL link.
- **Retry** button on each row (disabled for `DEPLOYED`).
- **Polling**: when any row is `PENDING` or `BUILDING`, the panel polls
  `GET /api/platform/deployments` every **3 seconds** and stops once all
  rows reach a terminal state (`DEPLOYED` / `FAILED`).

## 7. Render path (public)

```
guest → /w/{slug}
         │
         ▼
   layout.tsx (server component)
   • resolveWeddingBySlug(slug)
   • db.wedding.findUnique({ publishedConfigJson, publishedVersion })
   • safeJsonParse(publishedConfigJson) → PublishedConfigSnapshot | null
   • manifest = publishedConfig?.manifest ?? resolveWeddingManifest(id)
   • <WeddingContextProvider wedding={{ ..., manifest, publishedConfig }}>
         │
         ▼
   page.tsx (client component)
   • const wedding = useWedding()
   • const activeManifest =
       previewManifest || wedding.publishedConfig?.manifest || wedding.manifest
   • <ThemeInjector theme={wedding.publishedConfig?.theme ?? null} />
   • <SectionRenderer manifest={activeManifest} data={...} extras={...} />
```

**ThemeInjector** accepts an optional `theme` prop:
- When provided (published config exists): injects CSS variables + Google
  Fonts directly from the snapshot — no `/api/theme` fetch.
- When `null` (no deployment yet): falls back to fetching `/api/theme`
  (pre-pipeline behaviour).

This guarantees the rendered theme matches **exactly** what was deployed,
with zero client-side fetch latency on the critical path.

## 8. Failure modes + retry

| Failure                              | Behaviour                                                                 |
|--------------------------------------|---------------------------------------------------------------------------|
| Wedding not found                    | Pipeline throws before stage 1; API returns 500.                          |
| Template `ARCHIVED`                  | Stage 2 (`resolveTemplate`) fails → `FAILED` + log.                       |
| Theme not `PUBLISHED`                | Stage 3 (`resolveTheme`) fails → `FAILED` + log.                          |
| Collection not found (optional)      | Stage 7 logs a warning + continues (non-fatal).                           |
| `resolveWeddingManifest` returns null| Stage 8 (`compileFrontend`) fails → `FAILED` + log.                       |
| DB write fails on `publishFrontend`  | Stage 9 fails → `FAILED` + log; Wedding row untouched.                    |
| Any uncaught exception               | Outer `try/catch` marks `FAILED`, persists `logsJson` with the error.     |

**Retry** (`POST /api/platform/deployments/{id}/retry`):
- Reads the previous deployment's `weddingId` + `templateId`.
- Recovers `themeId` from the previous logs (best-effort); falls back to
  the first `PUBLISHED` `PlatformTheme` if unrecoverable.
- Creates a **new** Deployment row (new version) — the old `FAILED` row
  is preserved for audit.

## 9. Versioning

Each deployment gets a version string: `yyyy.MMdd.HHmmss-xxxx` (UTC +
4-char random). This is:

- Sortable (lexicographic = chronological within a day).
- Monotonically increasing within a minute (the 4-char random
  disambiguates two builds in the same second).
- Stored on both `Deployment.version` and `Wedding.publishedVersion` for
  fast equality checks without joining to the Deployment table.

The `PublishedConfig.schemaVersion` field (currently `1`) is reserved for
future breaking changes to the config shape. The render path should branch
on `schemaVersion` if it ever bumps.
