// ══════════════════════════════════════════════════════════════════════════════
// GOLDEN FIXTURE — Mission 5.7.1 Phase 3
// ══════════════════════════════════════════════════════════════════════════════
//
// ⚠️  TEST FIXTURE ONLY — NOT FOR PRODUCTION CLIENT USE  ⚠️
//
// This fixture is a deterministic, version-controlled CanonicalDesignPackage
// that respects the EXACT same contract as a future PenpotAdapter output.
// It exists ONLY to test the downstream pipeline (ingestion -> mapping ->
// collection engine -> compiler -> export) BEFORE the Penpot private VPS
// is available.
//
// When the Penpot VPS arrives, this fixture will be replaced by
// PenpotAdapter without ANY changes to the downstream pipeline.
//
// This fixture:
//   - is explicitly TEST_ONLY (sourceType = 'TEST_FIXTURE')
//   - is NEVER activated in a real client workflow
//   - is versioned (GOLDEN_FIXTURE_VERSION)
//   - is deterministic (same content hash every time)
//   - is replaceable by PenpotAdapter
//
// The fixture represents a premium invitation master with:
//   - A single page (variant A) with one frame "invitation-standard"
//   - Design tokens (gold + midnight luxury palette)
//   - 6 semantic bindings (coupleNames, date, venue, guest.name, guest.table, qrCode)
//   - 2 export targets (PNG 1080x1920, PDF A5)
// ══════════════════════════════════════════════════════════════════════════════

import { createHash } from 'crypto';
import type {
  CanonicalDesignPackage,
  DesignSource,
  DesignDocument,
  DesignFrame,
  DesignNode,
  DesignTokenSet,
  ProductBinding,
  ExportTarget,
} from './types';

export const GOLDEN_FIXTURE_VERSION = '1.0.0' as const;
export const GOLDEN_FIXTURE_INSTANCE_ID = 'test-fixture-v1' as const;
export const GOLDEN_FIXTURE_FILE_ID = 'golden-invitation-master' as const;

// ─── Design Tokens (Royal Gold luxury palette) ────────────────────────────────

const TOKENS: DesignTokenSet = {
  colors: {
    primary: '#D4AF37',      // royal gold
    accent: '#0a0a0a',       // midnight black
    secondary: '#1a1a2e',    // deep navy
    background: '#FAF8F5',   // ivory
    text: '#1a1a2e',         // deep navy
  },
  typography: {
    display: 'Cormorant Garamond',
    body: 'Inter',
    headingSize: '48px',
    bodySize: '16px',
  },
  spacing: {
    unit: '8px',
  },
  radii: {
    sm: '4px',
    md: '8px',
    lg: '16px',
  },
  shadows: {
    sm: '0 1px 2px rgba(0,0,0,0.05)',
    md: '0 4px 6px rgba(0,0,0,0.1)',
    lg: '0 10px 25px rgba(212,175,55,0.15)',
  },
};

// ─── Design Nodes (the visual structure of the invitation) ────────────────────

const NODES: DesignNode[] = [
  {
    id: 'node-background',
    type: 'SHAPE',
    name: 'Background',
    geometry: { x: 0, y: 0, width: 1080, height: 1920 },
    style: {
      fill: TOKENS.colors.background || '#FAF8F5',
      borderRadius: TOKENS.radii.lg || '16px',
    },
  },
  {
    id: 'node-ornament-top',
    type: 'SHAPE',
    name: 'Ornament Top',
    geometry: { x: 440, y: 120, width: 200, height: 60 },
    style: {
      fill: TOKENS.colors.primary || '#D4AF37',
      borderRadius: TOKENS.radii.sm || '4px',
    },
    semanticRole: 'visual.ornament',
  },
  {
    id: 'node-couple-names',
    type: 'TEXT',
    name: 'Couple Names',
    geometry: { x: 100, y: 250, width: 880, height: 120 },
    text: '{{event.coupleNames}}',
    style: {
      fontFamily: TOKENS.typography.display || 'Cormorant Garamond',
      fontSize: TOKENS.typography.headingSize || '48px',
      color: TOKENS.colors.primary || '#D4AF37',
      textAlign: 'center',
      fontWeight: '600',
    },
    semanticRole: 'event.coupleNames',
  },
  {
    id: 'node-date',
    type: 'TEXT',
    name: 'Event Date',
    geometry: { x: 100, y: 400, width: 880, height: 60 },
    text: '{{event.date}}',
    style: {
      fontFamily: TOKENS.typography.body || 'Inter',
      fontSize: TOKENS.typography.bodySize || '16px',
      color: TOKENS.colors.text || '#1a1a2e',
      textAlign: 'center',
      letterSpacing: '2px',
      textTransform: 'uppercase',
    },
    semanticRole: 'event.date',
  },
  {
    id: 'node-venue',
    type: 'TEXT',
    name: 'Venue',
    geometry: { x: 100, y: 490, width: 880, height: 60 },
    text: '{{event.venue}}',
    style: {
      fontFamily: TOKENS.typography.body || 'Inter',
      fontSize: '14px',
      color: TOKENS.colors.text || '#1a1a2e',
      textAlign: 'center',
      letterSpacing: '1px',
    },
    semanticRole: 'event.venue',
  },
  {
    id: 'node-divider',
    type: 'SHAPE',
    name: 'Divider',
    geometry: { x: 440, y: 600, width: 200, height: 2 },
    style: {
      fill: TOKENS.colors.primary || '#D4AF37',
    },
  },
  {
    id: 'node-guest-name',
    type: 'TEXT',
    name: 'Guest Name',
    geometry: { x: 100, y: 680, width: 880, height: 80 },
    text: '{{guest.name}}',
    style: {
      fontFamily: TOKENS.typography.display || 'Cormorant Garamond',
      fontSize: '36px',
      color: TOKENS.colors.accent || '#0a0a0a',
      textAlign: 'center',
      fontWeight: '500',
    },
    semanticRole: 'guest.name',
  },
  {
    id: 'node-guest-table',
    type: 'TEXT',
    name: 'Guest Table',
    geometry: { x: 100, y: 790, width: 880, height: 40 },
    text: 'Table {{guest.table}}',
    style: {
      fontFamily: TOKENS.typography.body || 'Inter',
      fontSize: '14px',
      color: TOKENS.colors.text || '#1a1a2e',
      textAlign: 'center',
      letterSpacing: '1px',
    },
    semanticRole: 'guest.table',
  },
  {
    id: 'node-qr-code',
    type: 'QR_CODE',
    name: 'QR Code',
    geometry: { x: 440, y: 1400, width: 200, height: 200 },
    style: {
      fill: TOKENS.colors.accent || '#0a0a0a',
      background: TOKENS.colors.background || '#FAF8F5',
    },
    semanticRole: 'invitation.qrCode',
  },
  {
    id: 'node-access-code',
    type: 'TEXT',
    name: 'Access Code',
    geometry: { x: 100, y: 1650, width: 880, height: 40 },
    text: 'Code: {{invitation.accessCode}}',
    style: {
      fontFamily: TOKENS.typography.body || 'Inter',
      fontSize: '12px',
      color: TOKENS.colors.text || '#1a1a2e',
      textAlign: 'center',
      letterSpacing: '3px',
      textTransform: 'uppercase',
    },
    semanticRole: 'invitation.accessCode',
  },
];

// ─── Design Frame ─────────────────────────────────────────────────────────────

const FRAME: DesignFrame = {
  id: 'frame-invitation-standard',
  name: 'Invitation Standard',
  semanticSlot: 'invitation-standard',
  width: 1080,
  height: 1920,
  nodes: NODES,
};

// ─── Design Document ──────────────────────────────────────────────────────────

const DOCUMENT: DesignDocument = {
  pages: [
    {
      id: 'page-variant-a',
      name: 'Variant A — Royal Gold',
      variantCode: 'A',
      frames: [FRAME],
    },
  ],
  tokens: TOKENS,
  assetIds: [],
};

// ─── Product Bindings (semantic slot -> Wedding OS data path) ─────────────────

const BINDINGS: ProductBinding[] = [
  {
    sourceNodeId: 'node-couple-names',
    semanticRole: 'event.coupleNames',
    dataPath: 'Wedding.coupleLabel',
    fallback: 'Notre Mariage',
    required: true,
  },
  {
    sourceNodeId: 'node-date',
    semanticRole: 'event.date',
    dataPath: 'Wedding.weddingDate',
    transform: 'formatDate',
    fallback: 'Date à confirmer',
    required: true,
  },
  {
    sourceNodeId: 'node-venue',
    semanticRole: 'event.venue',
    dataPath: 'Wedding.venueName',
    fallback: 'Lieu à confirmer',
    required: false,
  },
  {
    sourceNodeId: 'node-guest-name',
    semanticRole: 'guest.name',
    dataPath: 'Guest.displayName',
    fallback: 'Cher invité',
    required: true,
  },
  {
    sourceNodeId: 'node-guest-table',
    semanticRole: 'guest.table',
    dataPath: 'Table.name',
    fallback: '—',
    required: false,
  },
  {
    sourceNodeId: 'node-qr-code',
    semanticRole: 'invitation.qrCode',
    dataPath: 'Invitation.qrCodeUrl',
    required: true,
  },
  {
    sourceNodeId: 'node-access-code',
    semanticRole: 'invitation.accessCode',
    dataPath: 'Guest.invitationCode',
    required: true,
  },
];

// ─── Export Targets ───────────────────────────────────────────────────────────

const EXPORT_TARGETS: ExportTarget[] = [
  {
    productType: 'DIGITAL_INVITATION',
    format: 'PNG',
    width: 1080,
    height: 1920,
    personalized: true,
  },
  {
    productType: 'DIGITAL_INVITATION',
    format: 'PDF',
    width: 148,  // A5 width in mm
    height: 210, // A5 height in mm
    dpi: 300,
    personalized: true,
  },
];

// ─── Source (TEST_FIXTURE provenance) ─────────────────────────────────────────

function computeSourceHash(): string {
  const content = JSON.stringify({
    document: DOCUMENT,
    bindings: BINDINGS,
    exportTargets: EXPORT_TARGETS,
    version: GOLDEN_FIXTURE_VERSION,
  });
  return createHash('sha256').update(content).digest('hex');
}

const SOURCE_HASH = computeSourceHash();

const SOURCE: DesignSource = {
  sourceType: 'TEST_FIXTURE',
  instanceId: GOLDEN_FIXTURE_INSTANCE_ID,
  fileId: GOLDEN_FIXTURE_FILE_ID,
  pageId: 'page-variant-a',
  frameId: 'frame-invitation-standard',
  componentId: null,
  variantId: 'A',
  sourceVersion: GOLDEN_FIXTURE_VERSION,
  sourceHash: SOURCE_HASH,
  importedAt: new Date('2026-07-09T00:00:00.000Z').toISOString(), // deterministic
};

// ─── The Golden Fixture Package ───────────────────────────────────────────────

export const GOLDEN_INVITATION_FIXTURE: CanonicalDesignPackage = {
  schemaVersion: 1,
  source: SOURCE,
  name: 'Royal Gold Invitation Master (TEST FIXTURE)',
  document: DOCUMENT,
  bindings: BINDINGS,
  exportTargets: EXPORT_TARGETS,
  version: GOLDEN_FIXTURE_VERSION,
  createdAt: SOURCE.importedAt,
};

// ─── Validation ───────────────────────────────────────────────────────────────

export function isGoldenFixture(v: unknown): v is CanonicalDesignPackage {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  const source = o.source as Record<string, unknown> | undefined;
  return (
    source?.sourceType === 'TEST_FIXTURE' &&
    source?.instanceId === GOLDEN_FIXTURE_INSTANCE_ID &&
    source?.fileId === GOLDEN_FIXTURE_FILE_ID
  );
}
