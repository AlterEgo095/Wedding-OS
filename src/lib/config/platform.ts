// ══════════════════════════════════════════════════════════════════════════════
// ENTERPRISE CONFIGURATION — Platform Constants
// ══════════════════════════════════════════════════════════════════════════════
// Phase 0 ÉTAPE 5 — Central configuration layer.
// All modules MUST read platform-wide constants from here. No business
// constant should be hardcoded in components or routes.
// ══════════════════════════════════════════════════════════════════════════════

export const PLATFORM = {
  name: 'Heureux Mariage',
  codename: 'AENEWS Wedding OS',
  studio: 'AENEWS',
  productionDomain: 'heureuxmariage.aenews.net',
  locale: 'fr',
  defaultTimezone: 'Africa/Kinshasa',
  currencies: ['usd', 'eur', 'fcfa'] as const,
} as const;

export const DEFAULT_WEDDING_SLUG = 'josue-hornella';

export const WEDDING_STATUS = {
  DRAFT: 'DRAFT',
  PUBLISHED: 'PUBLISHED',
  ARCHIVED: 'ARCHIVED',
  SUSPENDED: 'SUSPENDED',
} as const;

export const GUEST_STATUS = {
  PENDING: 'PENDING',
  CONFIRMED: 'CONFIRMED',
  DECLINED: 'DECLINED',
} as const;

export const ADMIN_ROLES = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  PLATFORM_ADMIN: 'PLATFORM_ADMIN',
  ORGANIZER: 'ORGANIZER',
  CONTROLLER: 'CONTROLLER',
  RECEPTION: 'RECEPTION',
} as const;

export const STORAGE_PROVIDERS = {
  LOCAL: 'LOCAL',
  R2: 'R2',
} as const;

export const INVITATION_CHANNELS = {
  SMS: 'SMS',
  EMAIL: 'EMAIL',
  WHATSAPP: 'WHATSAPP',
  QR: 'QR',
} as const;

export const FEATURES = {
  themeEngine: process.env.NEXT_PUBLIC_FEATURE_THEME_ENGINE === 'true',
  invitationEngine: process.env.NEXT_PUBLIC_FEATURE_INVITATION_ENGINE === 'true',
  aiAssistant: process.env.NEXT_PUBLIC_FEATURE_AI_ASSISTANT === 'true',
  automationEngine: process.env.NEXT_PUBLIC_FEATURE_AUTOMATION === 'true',
  mediaEngine: process.env.NEXT_PUBLIC_FEATURE_MEDIA_ENGINE === 'true',
  analyticsEngine: process.env.NEXT_PUBLIC_FEATURE_ANALYTICS === 'true',
  marketplace: process.env.NEXT_PUBLIC_FEATURE_MARKETPLACE === 'true',
  commandCenter: process.env.NEXT_PUBLIC_FEATURE_COMMAND_CENTER === 'true',
} as const;

export const PAGINATION = {
  defaultPageSize: 20,
  maxPageSize: 100,
} as const;

export const CACHE_TTL = {
  weddingSlug: 60_000,
  settings: 30_000,
  theme: 60_000,
  guestLookup: 0,
} as const;
