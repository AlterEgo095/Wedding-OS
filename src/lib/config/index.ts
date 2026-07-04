// ══════════════════════════════════════════════════════════════════════════════
// ENTERPRISE CONFIGURATION — Barrel Export
// ══════════════════════════════════════════════════════════════════════════════
// Phase 0 ÉTAPE 5 — Single import surface for all platform configuration.
//
// Usage:
//   import { PLATFORM, DEFAULT_WEDDING_SLUG, PLANS, getPlan, SETTING_KEYS }
//     from '@/lib/config';
// ══════════════════════════════════════════════════════════════════════════════

export { PLATFORM, DEFAULT_WEDDING_SLUG, WEDDING_STATUS, GUEST_STATUS, ADMIN_ROLES, STORAGE_PROVIDERS, INVITATION_CHANNELS, FEATURES, PAGINATION, CACHE_TTL } from './platform';
export { PLANS, PLAN_ORDER, getPlan, planSupportsCustomDomain, planSupportsWhiteLabel, formatPrice } from './plans';
export type { PlanId, PlanDefinition } from './plans';
export { SETTING_KEYS, SETTING_DEFAULTS, ESSENTIAL_SETTINGS } from './settings-registry';
export type { SettingKey } from './settings-registry';
