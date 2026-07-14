'use client'

import { useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import type { ThemePackage, ThemeSection } from '@/lib/aenws/theme-system'
import { getThemeCssVars } from '@/lib/aenws/theme-packages'
import { HeroCinematic, HeroSplit, HeroMinimal, HeroDestination, HeroAfrican } from './themes/hero-variants'
import { GalleryMasonry, GalleryGrid, GalleryCarousel, GalleryPolaroid } from './themes/gallery-variants'
import { TimelineAlternating, TimelineVertical, TimelineCardStack } from './themes/timeline-variants'
import { StoryChapters, StoryScroll } from './themes/story-variants'
import { GuestGlass, GuestMinimal, GuestEnvelope } from './themes/guest-variants'
import { MapCinematic, MapSplit, MapFullBleed } from './themes/map-variants'

interface ThemeRendererProps {
  theme: ThemePackage
  variant?: 'compact' | 'full'
}

/**
 * ThemeRenderer — Le moteur de rendu modulaire.
 *
 * Parcourt les sections du thème et rend la VARIANTE correspondante.
 * Chaque thème a son propre arrangement — plus de SectionRenderer partagé.
 */
export default function ThemeRenderer({ theme, variant = 'full' }: ThemeRendererProps) {
  const enabledSections = theme.sections.filter((s) => s.enabled).sort((a, b) => a.order - b.order)

  return (
    <ThemeWrapper theme={theme}>
      {enabledSections.map((section) => (
        <SectionSwitch key={section.id} section={section} theme={theme} variant={variant} />
      ))}
    </ThemeWrapper>
  )
}

// ─── ThemeWrapper: injecte les CSS vars + fonts + ambiance ─────────────────
function ThemeWrapper({ theme, children }: { theme: ThemePackage; children: React.ReactNode }) {
  useEffect(() => {
    const linkId = `theme-font-${theme.slug}`
    if (!document.getElementById(linkId)) {
      const link = document.createElement('link')
      link.id = linkId
      link.rel = 'stylesheet'
      link.href = theme.identity.googleFontUrl
      document.head.appendChild(link)
    }
  }, [theme.slug, theme.identity.googleFontUrl])

  const cssVars = getThemeCssVars(theme)
  return (
    <div
      style={{
        ...cssVars,
        background: theme.identity.ambiance,
        color: theme.identity.text,
        fontFamily: `'${theme.identity.fontBody}', sans-serif`,
        minHeight: '100%',
      } as React.CSSProperties}
    >
      <div style={{ backgroundImage: theme.identity.pattern, backgroundSize: 'auto' }} className="pointer-events-none absolute inset-0 opacity-60" />
      <div className="relative">{children}</div>
    </div>
  )
}

// ─── SectionSwitch: route vers la bonne variante de composant ───────────────
function SectionSwitch({ section, theme, variant }: { section: ThemeSection; theme: ThemePackage; variant: 'compact' | 'full' }) {
  const props = { theme, variant }

  switch (section.type) {
    case 'hero':
      switch (section.variant) {
        case 'cinematic-parallax': return <HeroCinematic {...props} />
        case 'split-overlay': return <HeroSplit {...props} />
        case 'minimal-center': return <HeroMinimal {...props} />
        case 'destination-full': return <HeroDestination {...props} />
        case 'african-regal': return <HeroAfrican {...props} />
        default: return <HeroCinematic {...props} />
      }
    case 'gallery':
      switch (section.variant) {
        case 'masonry': return <GalleryMasonry {...props} />
        case 'grid-uniform': return <GalleryGrid {...props} />
        case 'carousel': return <GalleryCarousel {...props} />
        case 'polaroid': return <GalleryPolaroid {...props} />
        default: return <GalleryMasonry {...props} />
      }
    case 'timeline':
      switch (section.variant) {
        case 'alternating': return <TimelineAlternating {...props} />
        case 'vertical-list': return <TimelineVertical {...props} />
        case 'card-stack': return <TimelineCardStack {...props} />
        default: return <TimelineAlternating {...props} />
      }
    case 'story':
      switch (section.variant) {
        case 'chapters': return <StoryChapters {...props} />
        case 'scroll-narrative': return <StoryScroll {...props} />
        default: return <StoryChapters {...props} />
      }
    case 'guest-auth':
      switch (section.variant) {
        case 'glass-portal': return <GuestGlass {...props} />
        case 'minimal-form': return <GuestMinimal {...props} />
        case 'envelope': return <GuestEnvelope {...props} />
        default: return <GuestGlass {...props} />
      }
    case 'map':
      switch (section.variant) {
        case 'cinematic-zoom': return <MapCinematic {...props} />
        case 'split-card': return <MapSplit {...props} />
        case 'full-bleed': return <MapFullBleed {...props} />
        default: return <MapCinematic {...props} />
      }
    default:
      return null
  }
}
