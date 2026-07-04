# LIVE CONNECTION MATRIX — Wedding OS Rebuild

**Purpose:** Prevent duplicate implementation. One canonical path per capability.
**Generated:** MISSION 3.0 Phase 0.

## State Legend
- **KEEP_AND_CONNECT** — exists, works, stays canonical
- **MERGE** — two implementations exist; merge into one
- **REPLACE** — exists but wrong; replace with canonical
- **REMOVE** — dead/orphan; delete after migration
- **DEFER_EXTERNAL_INTEGRATION** — external dep not ready; document honestly

## Matrix

| Domain | Mounted UI | Orphaned UI | Endpoint | Prisma Model | Reader (render) | Writer | Canonical Decision |
|---|---|---|---|---|---|---|---|
| Weddings | platform/admin WeddingsTab | — | /api/platform/weddings | Wedding | layout.tsx (slug) | platform POST | KEEP_AND_CONNECT |
| Collections | CollectionsFactoryTab (read-only) | CollectionLibrary, CollectionModulesManager | /api/collections (GET only) | Collection | NONE | seed only | REPLACE → DB source of truth, Factory CRUD (Slice 3) |
| Collection Variants | — | CollectionLibrary | — | CollectionVariant | NONE | seed only | KEEP_AND_CONNECT (consume in Slice 1) |
| Collection Modules | — | CollectionModulesManager | /api/collections/[id]/modules | CollectionModule | NONE | seed only | DEFER (ceremonial; not needed for rendering) |
| WeddingCollectionBinding | — | — | /api/collections/deploy | WeddingCollectionBinding | NONE | deploy (static catalog) | REPLACE → manifest-driven (Slice 1) |
| Manifest | — | — | (inside deploy) | binding.manifest (JSON) | NONE | deploy | REPLACE → section-based manifest (Slice 1) |
| Theme | ThemeCustomizer tab | — | /api/theme (GET/PUT) | Theme | ThemeInjector (4 CSS vars) | deploy, customizer | KEEP_AND_CONNECT (extend to consume manifest) |
| Luxury config | AppearanceManager (localStorage) | — | — | Collection.luxuryPreset | NONE (localStorage) | deploy | MERGE → hydrate from Theme.customizations (Slice 1) |
| Designer | ThemeCustomizer only | CommandCenterShell, WeddingWorkspaceSection | — | — | — | — | REPLACE → real Designer (Slice 2) |
| DesignRenderer | CollectionsShowcase (marketing) | — | — | — | marketing only | — | KEEP_AND_CONNECT for marketing; build SectionRenderer for /w/[slug] (Slice 1) |
| Public wedding renderer | /w/[slug]/page.tsx (hardcoded JSX) | — | — | — | hardcoded | — | REPLACE → SectionRenderer (Slice 1) |
| Invitations | — | InvitationPreviewManager | /api/admin/preview-invitation | Invitation | NONE | NONE | REPLACE → real invitation system (Slice 4) |
| Guests | GuestManager tab | GuestSearch | /api/guests/* | Guest | /api/guest/me | admin CRUD | KEEP_AND_CONNECT |
| QR | GuestManager | — | /api/guests/qrcode/* | Guest.invitationCode | invite landing | admin | KEEP_AND_CONNECT |
| Auto-auth | — | — | /api/guest/auto-auth | GuestSession | invite page | lookup | KEEP_AND_CONNECT (bind weddingId in token — Slice 4) |
| RSVP | GuestPersonalSpace | — | /api/guest/rsvp | Guest.rsvp* | admin stats | guest POST | KEEP_AND_CONNECT (add plus-one UI — Slice 4) |
| Plus-one | — | — | /api/guest/rsvp (accepts field) | Guest.rsvpPlusOne | NONE | NONE | CONNECT UI (Slice 4) |
| Tables | TableManager | — | /api/tables | Table | /api/guest/me | admin CRUD | KEEP_AND_CONNECT (add capacity enforcement — Slice 4) |
| Media | MediaTab | — | /api/media | Media | PremiumGallery | admin upload | KEEP_AND_CONNECT |
| Timeline | TimelineTab | — | /api/timeline | EventTimeline | EventTimeline component | admin CRUD | KEEP_AND_CONNECT |
| Couple Story | — | — | /api/couple-story | CoupleStory | OurStory component | admin API only | CONNECT UI tab (Slice 4) |
| Penpot | PenpotStudio (iframe) | PenpotStudioSection | — | Collection.penpot* | NONE | NONE | DEFER_EXTERNAL_INTEGRATION (Slice 5) |
| Billing | BillingTab | — | /api/platform/billing, /invoices | Subscription, Invoice | admin | admin | KEEP_AND_CONNECT (manual mode honest; Stripe deferred — Slice 5) |
| Onboarding | OnboardingTab (leads) | — | /api/onboarding/* | Lead, Wedding | admin | admin | KEEP_AND_CONNECT (self-service deferred — Slice 5) |
| Custom domains | — | — | /api/custom-domain | Wedding.customDomain | NONE | NONE | REPLACE → middleware routing (Slice 5) |

## Canonical Architecture Decisions

1. **Collection source = DATABASE.** Static `catalog.ts` becomes seed only. Deploy reads `db.collection`.
2. **Manifest = section-based JSON** in `WeddingCollectionBinding.manifest`. Typed + validated.
3. **Public renderer = SectionRenderer** (new). `/w/[slug]/page.tsx` renders sections from manifest, not hardcoded JSX.
4. **Section registry** maps section type → component. One registry, one renderer.
5. **Theme** stays in Theme table (4 CSS vars). Manifest theme overrides Theme on deploy.
6. **Designer** (Slice 2) edits the manifest draft. Publish copies draft → published.
7. **Factory** (Slice 3) does CRUD on Collection table. No static catalog at runtime.
8. **Invitations** (Slice 4) activate the Invitation model with real states.
9. **Penpot** (Slice 5) deferred until a real API connection exists. Mock removed.

## Implementation Order
- Slice 1: Collection → Manifest → Binding → Renderer (EXISTENTIAL GATE)
- Slice 2: Designer → Save → Preview → Publish
- Slice 3: Factory CRUD
- Slice 4: Guest experience completion
- Slice 5: Commercial platform
