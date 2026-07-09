// ══════════════════════════════════════════════════════════════════════════════
// CANONICAL DESIGN CONTRACT — Mission 5.7.1 Phase 2
// ══════════════════════════════════════════════════════════════════════════════
//
// This is the STABLE ARCHITECTURAL BOUNDARY between the visual authoring source
// (Penpot private instance, future) and the Wedding OS productization pipeline.
//
// The contract is:
//   - VERSIONED (schemaVersion field)
//   - VALIDABLE (zod-free; pure TypeScript types + runtime guards)
//   - PROVIDER-AGNOSTIC (no Penpot-specific structures in the core types)
//   - COMPATIBLE with a future PenpotAdapter
//   - INDEPENDENT of the frontend runtime
//
// The pipeline:
//   SourceAdapter (PenpotAdapter / TestFixtureAdapter)
//     → CanonicalDesignPackage
//       → IngestionEngine (validate + normalize + persist)
//         → SemanticMappingEngine (map design slots to Wedding OS data)
//           → CollectionEngine (existing: applyCollection + generateManifest)
//             → ProductCompiler (master + event data → output)
//               → DataBinding + Preview + Quality + Export
//
// The CanonicalDesignPackage is the ONLY thing the downstream pipeline knows
// about the design source. When Penpot arrives, only the PenpotAdapter changes.
// ══════════════════════════════════════════════════════════════════════════════

// ─── Schema Version ───────────────────────────────────────────────────────────

export const CANONICAL_DESIGN_SCHEMA_VERSION = 1 as const;

// ─── Source Provenance ────────────────────────────────────────────────────────

/**
 * Identifies WHERE a design came from. Provider-agnostic: the future
 * PenpotAdapter will set sourceType='PENPOT_PRIVATE'; the TestFixtureAdapter
 * sets sourceType='TEST_FIXTURE'.
 */
export interface DesignSource {
  /** Discriminator for the adapter that produced this package. */
  sourceType: 'PENPOT_PRIVATE' | 'TEST_FIXTURE';
  /** Adapter instance identifier (e.g. Penpot base URL, or 'test-fixture-v1'). */
  instanceId: string;
  /** Provider-specific file identifier (Penpot fileId, or fixture name). */
  fileId: string;
  /** Provider-specific page identifier (Penpot pageId, or fixture page name). */
  pageId?: string | null;
  /** Provider-specific frame identifier (Penpot frameId, or fixture frame name). */
  frameId?: string | null;
  /** Provider-specific component identifier (Penpot componentId, or null). */
  componentId?: string | null;
  /** Provider-specific variant identifier (Penpot variantId, or 'A' for fixtures). */
  variantId?: string | null;
  /** Version label from the source (Penpot file version, or fixture version). */
  sourceVersion: string;
  /** Content hash for change detection (SHA-256 of the normalized design tree). */
  sourceHash: string;
  /** ISO timestamp when the source was fetched/produced. */
  importedAt: string;
}

// ─── Design Tokens ────────────────────────────────────────────────────────────

export interface DesignTokenSet {
  colors: {
    primary?: string;
    accent?: string;
    secondary?: string;
    background?: string;
    text?: string;
  };
  typography: {
    display?: string;
    body?: string;
    headingSize?: string;
    bodySize?: string;
  };
  spacing?: {
    unit?: string;
  };
  radii?: {
    sm?: string;
    md?: string;
    lg?: string;
  };
  shadows?: {
    sm?: string;
    md?: string;
    lg?: string;
  };
}

// ─── Design Document (pages / frames / nodes) ────────────────────────────────

export type DesignNodeType =
  | 'FRAME'
  | 'TEXT'
  | 'SHAPE'
  | 'IMAGE'
  | 'GROUP'
  | 'QR_CODE'
  | 'CONTAINER';

export interface DesignNode {
  /** Unique node ID within the document (cuid or provider ID). */
  id: string;
  type: DesignNodeType;
  name: string;
  /** Geometry relative to parent frame (x, y, width, height in px). */
  geometry?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  /** Text content (for TEXT nodes). */
  text?: string;
  /** Style properties (colors, fonts, borders, etc.). */
  style?: Record<string, string>;
  /** Asset reference (for IMAGE nodes — links to DesignAsset). */
  assetId?: string;
  /** Children nodes (for GROUP/FRAME/CONTAINER nodes). */
  children?: DesignNode[];
  /** Semantic role hint (e.g. 'guest.name', 'event.date') — set by the
   *  designer in the source tool via naming convention or annotation. */
  semanticRole?: string;
}

export interface DesignFrame {
  id: string;
  name: string;
  /** Maps to a Wedding OS MODULE_SLOT (e.g. 'invitation-standard', 'hero'). */
  semanticSlot?: string;
  /** Dimensions in px. */
  width: number;
  height: number;
  /** Root node tree of the frame. */
  nodes: DesignNode[];
}

export interface DesignPage {
  id: string;
  name: string;
  /** Maps to a CollectionVariant code (A/B/C/D). */
  variantCode?: string;
  frames: DesignFrame[];
}

export interface DesignDocument {
  pages: DesignPage[];
  /** Global token set applied across all pages. */
  tokens: DesignTokenSet;
  /** Asset references used in the document. */
  assetIds: string[];
}

// ─── Product Binding (semantic slot → Wedding OS data path) ───────────────────

export interface ProductBinding {
  /** The design node or frame this binding applies to. */
  sourceNodeId: string;
  /** The semantic role (e.g. 'guest.name', 'event.date', 'invitation.qrCode'). */
  semanticRole: string;
  /** The Wedding OS data path (e.g. 'Guest.name', 'Wedding.weddingDate'). */
  dataPath: string;
  /** Fallback value if the data path resolves to null/undefined. */
  fallback?: string;
  /** Transform function name (e.g. 'formatDate', 'toUpperCase'). */
  transform?: string;
  /** Whether this binding is required for the product to be valid. */
  required: boolean;
}

// ─── Export Target ────────────────────────────────────────────────────────────

export type ExportFormat = 'PNG' | 'JPG' | 'PDF' | 'SVG';
export type ProductType =
  | 'WEBSITE_COLLECTION'
  | 'DIGITAL_INVITATION'
  | 'SAVE_THE_DATE'
  | 'EVENT_PROGRAM'
  | 'MENU'
  | 'TABLE_CARD'
  | 'THANK_YOU_CARD'
  | 'SOCIAL_MEDIA_ASSET'
  | 'PRINT_EXPORT'
  | 'QR_SUPPORT';

export interface ExportTarget {
  productType: ProductType;
  format: ExportFormat;
  /** Dimensions in px (for PNG/JPG) or mm (for PDF). */
  width: number;
  height: number;
  /** DPI for print exports (default 300). */
  dpi?: number;
  /** Whether this target supports batch personalization (per-guest). */
  personalized: boolean;
}

// ─── Canonical Design Package (the contract boundary) ─────────────────────────

export interface CanonicalDesignPackage {
  /** Schema version of this package (CANONICAL_DESIGN_SCHEMA_VERSION). */
  schemaVersion: number;
  /** Provenance — where this package came from. */
  source: DesignSource;
  /** Human-readable name (e.g. "Royal Gold Invitation Master"). */
  name: string;
  /** The design document (pages/frames/nodes/tokens). */
  document: DesignDocument;
  /** Semantic data bindings (design slots → Wedding OS data paths). */
  bindings: ProductBinding[];
  /** Export targets this master can produce. */
  exportTargets: ExportTarget[];
  /** Version label (semver, e.g. "1.0.0"). */
  version: string;
  /** ISO timestamp when the package was created. */
  createdAt: string;
}

// ─── Validation Guards ─────────────────────────────────────────────────────────

export function isDesignSource(v: unknown): v is DesignSource {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.sourceType === 'string' &&
    typeof o.instanceId === 'string' &&
    typeof o.fileId === 'string' &&
    typeof o.sourceVersion === 'string' &&
    typeof o.sourceHash === 'string' &&
    typeof o.importedAt === 'string'
  );
}

export function isCanonicalDesignPackage(v: unknown): v is CanonicalDesignPackage {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.schemaVersion === 'number' &&
    isDesignSource(o.source) &&
    typeof o.name === 'string' &&
    !!o.document &&
    Array.isArray(o.bindings) &&
    Array.isArray(o.exportTargets) &&
    typeof o.version === 'string' &&
    typeof o.createdAt === 'string'
  );
}

// ─── Semantic Roles (canonical vocabulary) ─────────────────────────────────────

export const SEMANTIC_ROLES = [
  // Event-level
  'event.coupleNames',
  'event.coupleLabel',
  'event.date',
  'event.time',
  'event.venue',
  'event.venueAddress',
  'event.venueCity',
  'event.story',
  // Guest-level
  'guest.title',
  'guest.name',
  'guest.companion',
  'guest.table',
  'guest.category',
  // Invitation-level
  'invitation.qrCode',
  'invitation.accessCode',
  'invitation.personalMessage',
  // Visual
  'visual.heroImage',
  'visual.couplePhoto',
  'visual.logo',
  'visual.ornament',
] as const;

export type SemanticRole = (typeof SEMANTIC_ROLES)[number];
