# Penpot Integration Contract

**Mission 4.7 Phase 9 — Architectural Closure**
**Date**: 2026-07-07
**Status**: CONTRACT DEFINED — PIPELINE NOT IMPLEMENTED

---

## 1. Role of Penpot

Penpot is a **design authoring tool** (open-source Figma alternative). In the
AENEWS Event Experience Platform architecture, Penpot serves as:

- **Design Studio** — where designers create wedding/event visual concepts
- **Token Source** — colors, typography, spacing, effects
- **Frame Reference** — layout/section structure reference
- **Component Preview** — visual mockup before Collection creation

Penpot is NOT:
- a runtime dependency
- a rendering engine
- a database
- a CMS

## 2. What Penpot Must NEVER Do

```
PUBLIC RUNTIME MUST NEVER DEPEND ON PENPOT AVAILABILITY
```

- The public experience (`/w/[slug]`) must NEVER call Penpot
- The SectionRenderer must NEVER fetch from Penpot
- The manifest must NEVER reference Penpot frames at render time
- A Penpot outage must NOT affect any published event
- A Penpot file deletion must NOT break any existing Collection

## 3. Current Level (Honest Classification)

**D — IFRAME DECORATIVE**

| Component | Status | Evidence |
|---|---|---|
| PenpotStudio (admin iframe) | DECORATIVE | embeds Penpot viewer, no extraction |
| lib/penpot/client.ts | INFRASTRUCTURE | API client exists, no active calls |
| lib/penpot/autoDetect.ts | INFRASTRUCTURE | frame detection logic, not wired |
| lib/penpot/frameRegistry.ts | INFRASTRUCTURE | registry exists, no population |
| engines/penpot/types.ts | TYPES ONLY | interfaces defined, no implementation |
| API routes (Penpot sync) | ARCHIVED | removed in commit a215bef |
| Runtime renderer dependency | NONE (correct) | SectionRenderer does not import penpot |

The infrastructure exists but NO pipeline connects Penpot to the Collection
system. PenpotStudio is an iframe viewer for design reference only.

## 4. Architecture Target

```
PENPOT PROJECT
   ↓
DESIGN EXTRACTION (API + token parsing)
   ↓
NORMALIZED DESIGN TOKENS (JSON)
   ↓
SECTION / FRAME MAPPING (Penpot frame → SectionType)
   ↓
COLLECTION DRAFT (status: BROUILLON)
   ↓
ADMIN REVIEW (Designer Portal)
   ↓
COLLECTION PUBLISHED (status: PUBLIE/COMMERCIALISE)
   ↓
MANIFEST (generateManifest)
   ↓
RENDERER (SectionRenderer — NO Penpot dependency)
```

## 5. Token Extraction (Future)

A future `POST /api/collections/from-penpot` endpoint would:

1. Accept a Penpot file URL + API token
2. Call the Penpot REST API to fetch:
   - Color tokens (fills, strokes)
   - Typography tokens (font-family, font-size, font-weight)
   - Spacing tokens (padding, margin, gap)
   - Asset references (images, icons)
3. Normalize to the platform's `themeSeed` JSON format:
   ```json
   {
     "primaryColor": "#D4AF37",
     "accentColor": "#1a1a2e",
     "fontDisplay": "Cormorant Garamond",
     "fontBody": "Inter",
     "layout": "royal"
   }
   ```
4. Create a Collection draft (status=BROUILLON) with the extracted themeSeed

## 6. Frame Mapping (Future)

A future `POST /api/collections/[id]/map-frames` endpoint would:

1. Accept a Penpot file ID + page ID
2. Fetch all top-level frames via Penpot API
3. Match frame names to SectionType using a convention:
   - Frame named "hero" or "Hero" → section type 'hero'
   - Frame named "gallery" or "Galerie" → section type 'gallery'
   - etc.
4. Populate `CollectionModule` rows with the frame references

## 7. Collection Draft Generation (Future)

After token extraction + frame mapping, the system creates:
- A `Collection` row (status=BROUILLON)
- Associated `CollectionVariant` rows (one per Penpot page variant)
- Associated `CollectionModule` rows (frame mappings)

The draft is reviewable in the Designer Portal (future UI).

## 8. Admin Review (Future)

The admin reviews the draft Collection:
- Preview the themeSeed (applied to a test wedding)
- Validate frame mappings
- Adjust tokens if needed
- Transition status: BROUILLON → EN_COURS → VALIDATION → PUBLIE

## 9. Publication (Existing)

Once published, the Collection is available via the existing pipeline:
- `POST /api/collections/apply` → generates manifest → creates binding
- The binding's manifest is consumed by SectionRenderer
- **No Penpot dependency at this stage or beyond**

## 10. Runtime Independence (Guaranteed)

```
COLLECTION PUBLISHED
   ↓
generateManifest()  ← reads Collection.themeSeed (JSON in DB)
   ↓
WeddingCollectionBinding.manifest  ← persisted JSON
   ↓
resolveWeddingManifest()  ← reads from DB
   ↓
SectionRenderer  ← reads manifest from context
   ↓
Public experience  ← NO PENPOT CALL
```

The Collection's `themeSeed` is a self-contained JSON blob. Once extracted
from Penpot (future), it lives in the DB and the runtime never needs to
call Penpot again. This guarantees:
- Penpot outage → zero impact on published events
- Penpot file deletion → zero impact (themeSeed is in DB)
- Penpot account changes → zero impact

## 11. Implementation Status

| Step | Status | Owner |
|---|---|---|
| 1. Penpot iframe viewer | EXISTS (admin only) | — |
| 2. Token extraction API | NOT IMPLEMENTED | Future mission |
| 3. Frame mapping API | NOT IMPLEMENTED | Future mission |
| 4. Collection draft from Penpot | NOT IMPLEMENTED | Future mission |
| 5. Admin review UI | NOT IMPLEMENTED | Future mission |
| 6. Publication (existing pipeline) | EXISTS | — |
| 7. Runtime rendering (no Penpot) | EXISTS (guaranteed) | — |

## 12. Migration Path

When the Penpot pipeline is implemented:
1. No schema migration needed (Collection.themeSeed already stores JSON)
2. No runtime change (renderer already reads from DB)
3. New API routes added (extraction, mapping, draft creation)
4. New admin UI added (Designer Portal review)
5. Existing Collections unaffected (they keep their manual themeSeed)

---

**Bottom line**: Penpot is a DESIGN INPUT tool, not a RUNTIME dependency.
The contract is defined; the pipeline is future work.
