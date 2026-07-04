// ══════════════════════════════════════════════════════════════════════════════
// ENGINES — Barrel Export
// ══════════════════════════════════════════════════════════════════════════════
// Phase 0 ÉTAPE 6 — Architecture par Engines.
//
// All engine interfaces are exported from here. Future phases will add
// concrete implementations (e.g. engines/theme/ThemeEngine.ts implementing
// IThemeEngine). For now, only TYPES are defined — no logic.
//
// Engines are the modular foundation for AENEWS Wedding OS Enterprise:
//   - Core:       wedding lifecycle, guests, tables, timeline
//   - Theme:      colors, fonts, layouts, effects, animations
//   - Invitation: templates, PDF, QR, variants
//   - AI:         admin assistant, tool calling, analysis
//   - Automation: workflows, batch operations, triggers
//   - Media:      storage abstraction, library, transforms
//   - Analytics:  metrics, time series, platform stats
//   - Marketplace: themes, invitations, components store
//   - Penpot:     design tool integration bridge
// ══════════════════════════════════════════════════════════════════════════════

// Core Engine
export type {
  WeddingEntity,
  EngineResult,
  ICoreEngine,
  CreateWeddingInput,
  GuestInput,
  WeddingStats,
  EngineEvent,
  EventSubscriber,
} from './core/types';

// Theme Engine
export type {
  ThemeEntity,
  ThemeLayout,
  ThemeCustomizations,
  SectionTheme,
  ThemeTemplate,
  ThemeCssVariables,
  IThemeEngine,
  IPenpotThemeBridge,
} from './theme/types';

// Invitation Engine
export type {
  InvitationTemplateEntity,
  InvitationCategory,
  InvitationLayout,
  InvitationField,
  InvitationData,
  InvitationRenderFormat,
  IInvitationEngine,
  IPenpotInvitationBridge,
} from './invitation/types';

// AI Engine
export type {
  AIMessage,
  AIConversation,
  AIContext,
  AITool,
  AIToolCall,
  IAIEngine,
  AIInconsistency,
} from './ai/types';

// Automation Engine
export type {
  AutomationRule,
  AutomationTrigger,
  AutomationAction,
  AutomationActionType,
  AutomationRun,
  AutomationActionResult,
  IAutomationEngine,
} from './automation/types';

// Media Engine
export type {
  MediaType,
  MediaCategory,
  MediaEntity,
  MediaUploadInput,
  IStorageAdapter,
  IMediaEngine,
  ImageTransformOptions,
} from './media/types';

// Analytics Engine
export type {
  MetricType,
  TimeSeriesGranularity,
  MetricPoint,
  MetricSeries,
  WeddingAnalytics,
  PlatformAnalytics,
  IAnalyticsEngine,
  AnalyticsEvent,
} from './analytics/types';

// Marketplace Engine
export type {
  MarketplaceItemType,
  MarketplaceItemEntity,
  MarketplaceInstall,
  IMarketplaceEngine,
  BrandKit,
} from './marketplace/types';

// Penpot Engine
export type {
  PenpotFile,
  PenpotDesignTokens,
  PenpotSvgExport,
  PenpotConfig,
  IPenpotEngine,
} from './penpot/types';
export { isPenpotConfigured } from './penpot/types';
