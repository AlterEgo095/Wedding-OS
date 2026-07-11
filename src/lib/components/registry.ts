// ══════════════════════════════════════════════════════════════════════════════
// VISUAL COMPONENT LIBRARY — Mission 5.8.4
// ══════════════════════════════════════════════════════════════════════════════
// The canonical model for all visual components in Wedding OS.
// Every product (website, invitation, save-the-date, etc.) must use components
// from this library. No hardcoded sections allowed.
//
// The library is:
//   - VERSIONED (each component has a semver)
//   - TOKEN-DRIVEN (all styles come from Design Tokens, no hardcoded colors)
//   - SEMANTIC (each component has a semanticRole for data binding)
//   - SLOT-BASED (components declare slots for composition)
//   - PREVIEWABLE (each component can be rendered in isolation)
//   - ADMINISTRABLE (create/edit/clone/archive from the Production Studio)
// ══════════════════════════════════════════════════════════════════════════════

// ─── Component Category ───────────────────────────────────────────────────────

export type ComponentCategory =
  | 'LAYOUT'
  | 'HERO'
  | 'INVITATION'
  | 'COUNTDOWN'
  | 'TIMELINE'
  | 'GALLERY'
  | 'STORY'
  | 'PARENTS'
  | 'CEREMONY'
  | 'RECEPTION'
  | 'PROGRAMME'
  | 'RSVP'
  | 'QR_CODE'
  | 'MAP'
  | 'FOOTER'
  | 'MEDIA'
  | 'BUTTONS'
  | 'CARDS'
  | 'LISTS'
  | 'FORMS'
  | 'DECORATIONS'
  | 'BACKGROUNDS';

// ─── Component Status ─────────────────────────────────────────────────────────

export type ComponentStatus =
  | 'DRAFT'        // Created but not yet reviewed
  | 'ACTIVE'       // Production-ready, available for use
  | 'DEPRECATED'   // Still functional but scheduled for retirement
  | 'ARCHIVED';    // Retired, no longer available for new products

// ─── Configurable Property ────────────────────────────────────────────────────

export interface ConfigurableProp {
  key: string;
  label: string;
  type: 'TEXT' | 'COLOR' | 'TYPOGRAPHY' | 'SPACING' | 'RADIUS' | 'IMAGE' | 'BOOLEAN' | 'SELECT';
  defaultValue: string;
  tokenBinding?: string;        // Which design token this prop maps to
  options?: string[];           // For SELECT type
  description?: string;
}

// ─── Slot (composition point) ─────────────────────────────────────────────────

export interface ComponentSlot {
  id: string;
  name: string;
  description: string;
  allowedComponentCategories: ComponentCategory[];
  required: boolean;
  maxItems: number;             // -1 = unlimited
  dataBinding?: string;         // Semantic role expected in this slot
}

// ─── Token Consumption Declaration ────────────────────────────────────────────

export interface TokenConsumption {
  token: string;                // e.g. 'primaryColor', 'accentColor', 'fontDisplay'
  cssVariable: string;          // e.g. '--theme-primary'
  required: boolean;            // Must this token be set for the component to render?
  fallback?: string;            // Default value if token is missing
}

// ─── Visual Component (the canonical model) ───────────────────────────────────

export interface VisualComponent {
  // Identity
  id: string;
  slug: string;                 // URL-safe unique identifier (e.g. 'hero-royal-gold')
  name: string;                 // Display name (e.g. 'Hero — Royal Gold')
  category: ComponentCategory;
  semanticRole: string;         // e.g. 'hero', 'story', 'invitation.qrCode'

  // Versioning
  version: string;              // Semver (e.g. '1.0.0')
  status: ComponentStatus;

  // Design System
  tokens: TokenConsumption[];   // Which design tokens this component consumes
  configurableProps: ConfigurableProp[];  // What the admin can edit

  // Composition
  slots: ComponentSlot[];       // Where child components can be placed

  // Rendering
  rendererKey: string;          // Maps to a React component in the RENDERER_REGISTRY
  compatibleLayouts: string[];  // Which layouts support this component (royal/classic/minimal/destination/modern)
  compatibleProducts: string[]; // Which products can use this (WEBSITE, INVITATION, etc.)

  // Metadata
  description: string;
  documentation?: string;       // Markdown documentation
  previewImageUrl?: string;     // Thumbnail for the registry browser
  createdAt: string;
  updatedAt: string;
}

// ─── Component Version (immutable snapshot) ───────────────────────────────────

export interface ComponentVersion {
  id: string;
  componentId: string;
  version: string;
  snapshot: string;             // JSON of the full VisualComponent at this version
  changelog: string;
  createdBy: string;
  createdAt: string;
}

// ─── Component Registry (the official catalog) ────────────────────────────────

export interface ComponentRegistryEntry {
  component: VisualComponent;
  isCanonical: boolean;         // Is this the default component for its category?
  usageCount: number;           // How many collections/products use this component
  lastUsedAt?: string;
}

// ─── RENDERER_REGISTRY (maps rendererKey → React component) ───────────────────
// This is populated at runtime by the component files themselves.
// Each visual component file registers its renderer.

export type ComponentRenderer = (props: {
  tokens: Record<string, string>;
  config: Record<string, string>;
  data: Record<string, unknown>;
  slots?: Record<string, React.ReactNode>;
}) => React.ReactNode;

export const RENDERER_REGISTRY: Record<string, ComponentRenderer> = {};

export function registerRenderer(key: string, renderer: ComponentRenderer): void {
  RENDERER_REGISTRY[key] = renderer;
}

// ─── Component Compiler Pipeline ──────────────────────────────────────────────

export interface CompilationContext {
  tokens: Record<string, string>;     // Resolved design tokens
  config: Record<string, string>;     // Component-specific configuration
  data: Record<string, unknown>;      // Semantic data (wedding, guest, etc.)
  layout: string;                     // Active layout
  productType: string;                // WEBSITE, INVITATION, etc.
  format?: 'DESKTOP' | 'TABLET' | 'MOBILE' | 'PRINT';
}

export interface CompilationResult {
  html: string;                       // Self-contained HTML output
  tokensUsed: string[];               // Which tokens were consumed
  bindingsResolved: string[];         // Which semantic roles were resolved
  warnings: string[];
  errors: string[];
}

// ─── Component Compiler ───────────────────────────────────────────────────────
// Pipeline: VisualComponent → Slot Resolution → Semantic Bindings → Token Injection
//           → Layout Resolution → Responsive Resolution → Rendering → Output

export function compileComponent(
  component: VisualComponent,
  context: CompilationContext,
  slotContents?: Record<string, React.ReactNode>,
): CompilationResult {
  const warnings: string[] = [];
  const errors: string[] = [];
  const tokensUsed: string[] = [];
  const bindingsResolved: string[] = [];

  // 1. Token Injection — verify all required tokens are present
  for (const token of component.tokens) {
    if (token.required && !context.tokens[token.token]) {
      if (token.fallback) {
        warnings.push(`Token "${token.token}" not set, using fallback: ${token.fallback}`);
      } else {
        errors.push(`Required token "${token.token}" is missing`);
      }
    } else if (context.tokens[token.token]) {
      tokensUsed.push(token.token);
    }
  }

  // 2. Config Resolution — apply defaults for missing config values
  const resolvedConfig: Record<string, string> = {};
  for (const prop of component.configurableProps) {
    resolvedConfig[prop.key] = context.config[prop.key] || prop.defaultValue;
  }

  // 3. Semantic Bindings — check if data paths are available
  for (const slot of component.slots) {
    if (slot.required && slot.dataBinding) {
      if (context.data[slot.dataBinding] !== undefined) {
        bindingsResolved.push(slot.dataBinding);
      } else {
        warnings.push(`Required binding "${slot.dataBinding}" for slot "${slot.name}" has no data`);
      }
    }
  }

  // 4. Layout Compatibility
  if (component.compatibleLayouts.length > 0 && !component.compatibleLayouts.includes(context.layout)) {
    warnings.push(`Component "${component.slug}" may not be optimized for layout "${context.layout}"`);
  }

  // 5. Product Compatibility
  if (component.compatibleProducts.length > 0 && !component.compatibleProducts.includes(context.productType)) {
    warnings.push(`Component "${component.slug}" is not designed for product type "${context.productType}"`);
  }

  // 6. Rendering — produce HTML representation
  const renderer = RENDERER_REGISTRY[component.rendererKey];
  if (!renderer) {
    errors.push(`No renderer registered for key "${component.rendererKey}"`);
    return { html: '', tokensUsed, bindingsResolved, warnings, errors };
  }

  // The renderer produces React nodes; for HTML output, we serialize
  // (In production, this would use renderToString or similar)
  const html = `<!-- Component: ${component.slug} v${component.version} -->\n` +
    `<div data-component="${component.slug}" data-version="${component.version}" data-category="${component.category}">\n` +
    `  <!-- Renderer: ${component.rendererKey} -->\n` +
    `  <!-- Tokens: ${tokensUsed.join(', ')} -->\n` +
    `  <!-- Layout: ${context.layout} | Product: ${context.productType} | Format: ${context.format || 'DESKTOP'} -->\n` +
    `</div>`;

  return { html, tokensUsed, bindingsResolved, warnings, errors };
}

// ─── SEED REGISTRY (canonical components derived from existing SECTION_REGISTRY) ─
// These map the existing hardcoded section components to the new VisualComponent model.

export const CANONICAL_COMPONENT_SEEDS: VisualComponent[] = [
  {
    id: 'comp-hero-royal',
    slug: 'hero-royal',
    name: 'Hero — Section principale',
    category: 'HERO',
    semanticRole: 'hero',
    version: '1.0.0',
    status: 'ACTIVE',
    tokens: [
      { token: 'primaryColor', cssVariable: '--theme-primary', required: true, fallback: '#D4AF37' },
      { token: 'accentColor', cssVariable: '--theme-accent', required: true, fallback: '#1a1a2e' },
      { token: 'fontDisplay', cssVariable: '--theme-font-display', required: true, fallback: 'Cormorant Garamond' },
    ],
    configurableProps: [
      { key: 'showCountdown', label: 'Afficher compte à rebours', type: 'BOOLEAN', defaultValue: 'false' },
      { key: 'showDate', label: 'Afficher date', type: 'BOOLEAN', defaultValue: 'true' },
      { key: 'backgroundStyle', label: 'Style de fond', type: 'SELECT', defaultValue: 'photo', options: ['photo', 'gradient', 'solid'] },
    ],
    slots: [
      { id: 'slot-hero-bg', name: 'Background', description: 'Arrière-plan du hero', allowedComponentCategories: ['BACKGROUNDS', 'MEDIA'], required: false, maxItems: 1 },
      { id: 'slot-hero-overlay', name: 'Overlay', description: 'Élément superposé', allowedComponentCategories: ['DECORATIONS'], required: false, maxItems: 1 },
    ],
    rendererKey: 'HeroSection',
    compatibleLayouts: ['royal', 'classic', 'destination', 'modern'],
    compatibleProducts: ['WEBSITE'],
    description: 'Section héros avec titre, photo couple et date. Composant canonique pour toutes les pages d\'accueil de mariage.',
    previewImageUrl: undefined,
    createdAt: '2026-07-10T00:00:00.000Z',
    updatedAt: '2026-07-10T00:00:00.000Z',
  },
  {
    id: 'comp-story-timeline',
    slug: 'story-timeline',
    name: 'Notre Histoire — Timeline couple',
    category: 'STORY',
    semanticRole: 'story',
    version: '1.0.0',
    status: 'ACTIVE',
    tokens: [
      { token: 'primaryColor', cssVariable: '--theme-primary', required: false, fallback: '#D4AF37' },
      { token: 'fontDisplay', cssVariable: '--theme-font-display', required: true, fallback: 'Cormorant Garamond' },
      { token: 'fontBody', cssVariable: '--theme-font-body', required: true, fallback: 'Inter' },
    ],
    configurableProps: [
      { key: 'chaptersPerPage', label: 'Chapitres par page', type: 'SELECT', defaultValue: '3', options: ['3', '5', '10'] },
      { key: 'showPhotos', label: 'Afficher photos', type: 'BOOLEAN', defaultValue: 'true' },
    ],
    slots: [],
    rendererKey: 'OurStory',
    compatibleLayouts: ['royal', 'classic', 'minimal', 'destination', 'modern'],
    compatibleProducts: ['WEBSITE'],
    description: 'Timeline interactive de l\'histoire du couple avec chapitres et photos.',
    createdAt: '2026-07-10T00:00:00.000Z',
    updatedAt: '2026-07-10T00:00:00.000Z',
  },
  {
    id: 'comp-gallery-premium',
    slug: 'gallery-premium',
    name: 'Galerie Photos Premium',
    category: 'GALLERY',
    semanticRole: 'gallery',
    version: '1.0.0',
    status: 'ACTIVE',
    tokens: [
      { token: 'primaryColor', cssVariable: '--theme-primary', required: false, fallback: '#D4AF37' },
      { token: 'radiusLarge', cssVariable: '--theme-radius-lg', required: false, fallback: '16px' },
    ],
    configurableProps: [
      { key: 'columns', label: 'Colonnes', type: 'SELECT', defaultValue: '3', options: ['2', '3', '4'] },
      { key: 'lightbox', label: 'Visionneuse', type: 'BOOLEAN', defaultValue: 'true' },
    ],
    slots: [],
    rendererKey: 'PremiumGallery',
    compatibleLayouts: ['royal', 'classic', 'destination', 'modern'],
    compatibleProducts: ['WEBSITE'],
    description: 'Galerie photos premium avec lightbox et mise en page adaptative.',
    createdAt: '2026-07-10T00:00:00.000Z',
    updatedAt: '2026-07-10T00:00:00.000Z',
  },
  {
    id: 'comp-timeline-events',
    slug: 'timeline-events',
    name: 'Programme — Timeline événement',
    category: 'TIMELINE',
    semanticRole: 'timeline',
    version: '1.0.0',
    status: 'ACTIVE',
    tokens: [
      { token: 'accentColor', cssVariable: '--theme-accent', required: false, fallback: '#1a1a2e' },
      { token: 'fontBody', cssVariable: '--theme-font-body', required: true, fallback: 'Inter' },
    ],
    configurableProps: [
      { key: 'showIcons', label: 'Afficher icônes', type: 'BOOLEAN', defaultValue: 'true' },
      { key: 'showLocation', label: 'Afficher lieu', type: 'BOOLEAN', defaultValue: 'true' },
    ],
    slots: [],
    rendererKey: 'EventTimeline',
    compatibleLayouts: ['royal', 'classic', 'minimal', 'destination', 'modern'],
    compatibleProducts: ['WEBSITE'],
    description: 'Timeline du programme de la journée avec horaires et lieux.',
    createdAt: '2026-07-10T00:00:00.000Z',
    updatedAt: '2026-07-10T00:00:00.000Z',
  },
  {
    id: 'comp-map-venue',
    slug: 'map-venue',
    name: 'Lieu — Carte du lieu',
    category: 'MAP',
    semanticRole: 'map',
    version: '1.0.0',
    status: 'ACTIVE',
    tokens: [
      { token: 'accentColor', cssVariable: '--theme-accent', required: false, fallback: '#1a1a2e' },
    ],
    configurableProps: [
      { key: 'zoom', label: 'Niveau de zoom', type: 'SELECT', defaultValue: '14', options: ['12', '14', '16'] },
      { key: 'showAddress', label: 'Afficher adresse', type: 'BOOLEAN', defaultValue: 'true' },
    ],
    slots: [],
    rendererKey: 'MapSection',
    compatibleLayouts: ['royal', 'classic', 'destination'],
    compatibleProducts: ['WEBSITE'],
    description: 'Carte interactive du lieu de mariage avec adresse et indications.',
    createdAt: '2026-07-10T00:00:00.000Z',
    updatedAt: '2026-07-10T00:00:00.000Z',
  },
  {
    id: 'comp-guest-auth',
    slug: 'guest-auth',
    name: 'Accès Invités — Authentification',
    category: 'FORMS',
    semanticRole: 'guest-auth',
    version: '1.0.0',
    status: 'ACTIVE',
    tokens: [
      { token: 'primaryColor', cssVariable: '--theme-primary', required: true, fallback: '#D4AF37' },
      { token: 'fontBody', cssVariable: '--theme-font-body', required: true, fallback: 'Inter' },
    ],
    configurableProps: [
      { key: 'showHint', label: 'Afficher indice', type: 'BOOLEAN', defaultValue: 'true' },
    ],
    slots: [],
    rendererKey: 'GuestAuthForm',
    compatibleLayouts: ['royal', 'classic', 'minimal', 'destination', 'modern'],
    compatibleProducts: ['WEBSITE'],
    description: 'Formulaire d\'authentification invité avec code d\'accès.',
    createdAt: '2026-07-10T00:00:00.000Z',
    updatedAt: '2026-07-10T00:00:00.000Z',
  },
  {
    id: 'comp-invitation-card',
    slug: 'invitation-card',
    name: 'Carte d\'invitation personnalisée',
    category: 'INVITATION',
    semanticRole: 'invitation',
    version: '1.0.0',
    status: 'ACTIVE',
    tokens: [
      { token: 'primaryColor', cssVariable: '--theme-primary', required: true, fallback: '#D4AF37' },
      { token: 'accentColor', cssVariable: '--theme-accent', required: true, fallback: '#1a1a2e' },
      { token: 'fontDisplay', cssVariable: '--theme-font-display', required: true, fallback: 'Cormorant Garamond' },
      { token: 'fontBody', cssVariable: '--theme-font-body', required: true, fallback: 'Inter' },
    ],
    configurableProps: [
      { key: 'showQR', label: 'Afficher QR', type: 'BOOLEAN', defaultValue: 'true' },
      { key: 'showTable', label: 'Afficher table', type: 'BOOLEAN', defaultValue: 'true' },
      { key: 'orientation', label: 'Orientation', type: 'SELECT', defaultValue: 'portrait', options: ['portrait', 'landscape'] },
    ],
    slots: [
      { id: 'slot-inv-qr', name: 'QR Code', description: 'Emplacement du QR code', allowedComponentCategories: ['QR_CODE'], required: true, maxItems: 1, dataBinding: 'invitation.qrCode' },
    ],
    rendererKey: 'InvitationCard',
    compatibleLayouts: ['royal', 'classic', 'minimal', 'destination', 'modern'],
    compatibleProducts: ['INVITATION'],
    description: 'Carte d\'invitation personnalisable avec données invité, table et QR code.',
    createdAt: '2026-07-10T00:00:00.000Z',
    updatedAt: '2026-07-10T00:00:00.000Z',
  },
  {
    id: 'comp-qr-code',
    slug: 'qr-code',
    name: 'QR Code d\'accès',
    category: 'QR_CODE',
    semanticRole: 'invitation.qrCode',
    version: '1.0.0',
    status: 'ACTIVE',
    tokens: [
      { token: 'accentColor', cssVariable: '--theme-accent', required: false, fallback: '#1a1a2e' },
    ],
    configurableProps: [
      { key: 'size', label: 'Taille', type: 'SELECT', defaultValue: '200', options: ['150', '200', '300'] },
      { key: 'margin', label: 'Marge', type: 'SELECT', defaultValue: '2', options: ['0', '2', '4'] },
    ],
    slots: [],
    rendererKey: 'QRCode',
    compatibleLayouts: [],
    compatibleProducts: ['INVITATION', 'WEBSITE'],
    description: 'QR code d\'authentification invité avec chiffrement AES-256-GCM.',
    createdAt: '2026-07-10T00:00:00.000Z',
    updatedAt: '2026-07-10T00:00:00.000Z',
  },
];

// ─── Helper: get components by category ───────────────────────────────────────

export function getComponentsByCategory(category: ComponentCategory): VisualComponent[] {
  return CANONICAL_COMPONENT_SEEDS.filter(c => c.category === category && c.status === 'ACTIVE');
}

// ─── Helper: get canonical component for a section type ────────────────────────

export function getCanonicalComponent(semanticRole: string): VisualComponent | undefined {
  return CANONICAL_COMPONENT_SEEDS.find(c => c.semanticRole === semanticRole && c.status === 'ACTIVE');
}

// ─── Helper: get all categories with component counts ─────────────────────────

export function getCategorySummary(): Array<{ category: ComponentCategory; count: number; active: number }> {
  const categories = new Set(CANONICAL_COMPONENT_SEEDS.map(c => c.category));
  return Array.from(categories).map(category => ({
    category,
    count: CANONICAL_COMPONENT_SEEDS.filter(c => c.category === category).length,
    active: CANONICAL_COMPONENT_SEEDS.filter(c => c.category === category && c.status === 'ACTIVE').length,
  }));
}
