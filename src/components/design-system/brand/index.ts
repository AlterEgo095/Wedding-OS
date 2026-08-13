/**
 * MISSION 5.9.5 — PHASE G: BRAND SYSTEM
 * Barrel export for the Wedding OS brand module.
 *
 * Public API:
 *  - <WeddingOSLogo>     : master logo abstraction (8 variants)
 *  - <WeddingOSMark>     : the W/O monogram SVG
 *  - <WeddingOSWordmark> : the "WEDDING OS" text logo
 *  - <WeddingOSSplash>   : loading / PWA splash screen
 *  - <FaviconSVG>        : 32×32 favicon
 *  - <AppIconSVG>        : 512×512 PWA app icon
 *  - <AppleTouchIconSVG> : 180×180 iOS apple-touch-icon
 *  - <MaskableIconSVG>   : 512×512 Android maskable icon
 */

export {
  WeddingOSLogo,
  type WeddingOSLogoProps,
  type WeddingOSLogoVariant,
  type WeddingOSLogoTheme,
  type WeddingOSLogoSize,
} from './wedding-os-logo'

export {
  WeddingOSMark,
  MARK_SIZE_PX,
  type WeddingOSMarkProps,
  type WeddingOSMarkSize,
} from './wedding-os-mark'

export {
  WeddingOSWordmark,
  type WeddingOSWordmarkProps,
  type WeddingOSWordmarkSize,
} from './wedding-os-wordmark'

export {
  WeddingOSSplash,
  type WeddingOSSplashProps,
  type WeddingOSSplashSize,
} from './wedding-os-splash'

export {
  FaviconSVG,
  AppIconSVG,
  AppleTouchIconSVG,
  MaskableIconSVG,
  WEDDING_OS_ICONS,
  type WeddingOSIconProps,
  type WeddingOSIconSize,
} from './wedding-os-icons'
