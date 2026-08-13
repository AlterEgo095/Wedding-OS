/**
 * Mission 5.9.5 — Phase A
 * Barrel export for the design-system primitives.
 * Import from `@/components/design-system` for a clean, consistent API.
 */
export { TouchButton, touchButtonVariants, type TouchButtonProps } from './touch-button'
export {
  PremiumCard,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from './premium-card'
export { FluidHeading, FluidText } from './fluid-heading'
export { SafeArea, AppShell, AppMain, AppFooter } from './safe-area'
export {
  BottomNav,
  type BottomNavItem,
  type BottomNavProps,
  type BottomNavVariant,
} from './bottom-nav'
export {
  PUBLIC_NAV,
  WEDDING_PUBLIC_NAV,
  WEDDING_ADMIN_NAV,
  PLATFORM_ADMIN_NAV,
  ORG_ADMIN_NAV,
  ALL_PRESETS,
} from './bottom-nav-presets'
export { SmartBottomNav } from './smart-bottom-nav'

/* ============================================================
   MISSION 5.9.5 — PHASE C: Skeleton primitives + presets
   ============================================================ */
export {
  Skeleton,
  SkeletonText,
  SkeletonCircle,
  SkeletonButton,
  type SkeletonProps,
  type SkeletonVariant,
  type SkeletonAccent,
  type SkeletonRounded,
  type SkeletonTextProps,
  type SkeletonCircleProps,
  type SkeletonButtonProps,
} from './skeleton'
export {
  SkeletonDashboardCard,
  SkeletonDashboardGrid,
  SkeletonListRow,
  SkeletonList,
  SkeletonForm,
  SkeletonMediaCard,
  SkeletonMediaGrid,
  SkeletonWeddingHero,
  SkeletonAdminShell,
  SkeletonTable,
  SkeletonTabs,
  SkeletonMetric,
} from './skeleton-presets'

/* ============================================================
   MISSION 5.9.5 — PHASE E: FAB (Floating Action Button)
   Premium expandable FAB for quick actions on mobile.
   Addresses audit finding P2-1 (no quick-actions FAB on mobile).
   ============================================================ */
export { FAB, type FabAction, type FabProps, type FabAccent, type FabSize } from './fab'
export {
  PUBLIC_FAB_ACTIONS,
  WEDDING_PUBLIC_FAB_ACTIONS,
  WEDDING_ADMIN_FAB_ACTIONS,
  PLATFORM_ADMIN_FAB_ACTIONS,
  ORG_ADMIN_FAB_ACTIONS,
  getFabActionsForContext,
} from './fab-presets'
export { SmartFAB } from './smart-fab'

/* ============================================================
   MISSION 5.9.5 — PHASE F: Bottom sheets
   Premium mobile-first modal that slides up from the bottom.
   Addresses audit finding P2-2 (no bottom sheets for short
   forms on mobile). Compound API + 6 composable presets.
   ============================================================ */
export {
  BottomSheet,
  BottomSheetHeader,
  BottomSheetTitle,
  BottomSheetDescription,
  BottomSheetContent,
  BottomSheetFooter,
  type BottomSheetProps,
  type BottomSheetSize,
  type BottomSheetVariant,
} from './bottom-sheet'
export {
  QuickRSVPSheet,
  QuickAddGuestSheet,
  QuickFilterSheet,
  QuickConfirmSheet,
  QuickShareSheet,
  QuickLoginSheet,
  type QuickRSVPSheetProps,
  type QuickAddGuestSheetProps,
  type QuickFilterSheetProps,
  type QuickConfirmSheetProps,
  type QuickShareSheetProps,
  type QuickLoginSheetProps,
} from './bottom-sheet-presets'

/* ============================================================
   MISSION 5.9.5 — PHASE G: BRAND SYSTEM
   The official Wedding OS brand identity. One <WeddingOSLogo>
   abstraction with 8 variants (primary, lockup, mark, monogram,
   compact, wordmark, monochrome, watermark) + PWA icon set
   (favicon, app icon, apple-touch-icon, maskable icon).
   Pure SVG — no image dependencies, crisp at any size.
   ============================================================ */
export {
  WeddingOSLogo,
  type WeddingOSLogoProps,
  type WeddingOSLogoVariant,
  type WeddingOSLogoTheme,
  type WeddingOSLogoSize,
  WeddingOSMark,
  MARK_SIZE_PX,
  type WeddingOSMarkProps,
  type WeddingOSMarkSize,
  WeddingOSWordmark,
  type WeddingOSWordmarkProps,
  type WeddingOSWordmarkSize,
  WeddingOSSplash,
  type WeddingOSSplashProps,
  type WeddingOSSplashSize,
  FaviconSVG,
  AppIconSVG,
  AppleTouchIconSVG,
  MaskableIconSVG,
  WEDDING_OS_ICONS,
  type WeddingOSIconProps,
  type WeddingOSIconSize,
} from './brand'
