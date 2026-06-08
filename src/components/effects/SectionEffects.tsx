'use client'

/**
 * SectionEffects — Per-section effects wrapper
 * 
 * Applies section-specific effects like:
 * - Dynamic light sweep
 * - Section-specific sparkles/particles
 * - Parallax depth
 * - Glassmorphism enhancement
 * 
 * Usage: Wrap any section with <SectionEffects variant="hero">
 */

import { ReactNode } from 'react'
import { useVisualEffects } from '@/lib/visual-effects-store'
import DynamicLightSweep from './DynamicLightSweep'
import SparkleEffect from './SparkleEffect'
import FloatingParticles from './FloatingParticles'

type SectionVariant = 'hero' | 'story' | 'gallery' | 'timeline' | 'invitation' | 'map' | 'auth'

interface SectionEffectsProps {
  variant: SectionVariant
  children: ReactNode
  className?: string
}

const SECTION_CONFIG: Record<SectionVariant, {
  sparkles?: { count: number; color: 'gold' | 'rose-gold' | 'mixed' }
  particles?: { count: number; color: 'gold' | 'rose-gold' | 'mixed' }
  lightSweep?: { duration: number; direction: 'left-to-right' | 'diagonal'; opacity: number }
}> = {
  hero: {
    sparkles: { count: 15, color: 'mixed' },
    particles: { count: 8, color: 'gold' },
    lightSweep: { duration: 15, direction: 'diagonal', opacity: 0.05 },
  },
  story: {
    sparkles: { count: 8, color: 'rose-gold' },
    particles: { count: 12, color: 'gold' },
  },
  gallery: {
    sparkles: { count: 6, color: 'gold' },
    lightSweep: { duration: 18, direction: 'left-to-right', opacity: 0.04 },
  },
  timeline: {
    particles: { count: 10, color: 'gold' },
  },
  invitation: {
    sparkles: { count: 10, color: 'mixed' },
    lightSweep: { duration: 14, direction: 'diagonal', opacity: 0.06 },
  },
  map: {
    particles: { count: 6, color: 'gold' },
  },
  auth: {
    sparkles: { count: 8, color: 'rose-gold' },
    lightSweep: { duration: 16, direction: 'diagonal', opacity: 0.04 },
  },
}

export default function SectionEffects({ variant, children, className = '' }: SectionEffectsProps) {
  const { sparkles, particles, dynamicLight } = useVisualEffects()
  const config = SECTION_CONFIG[variant]
  
  return (
    <div className={`relative ${className}`}>
      {/* Section-level sparkles */}
      {sparkles && config.sparkles && (
        <SparkleEffect count={config.sparkles.count} color={config.sparkles.color} />
      )}
      
      {/* Section-level floating particles */}
      {particles && config.particles && (
        <FloatingParticles count={config.particles.count} color={config.particles.color} />
      )}
      
      {/* Dynamic light sweep */}
      {dynamicLight && config.lightSweep && (
        <DynamicLightSweep
          duration={config.lightSweep.duration}
          direction={config.lightSweep.direction}
          opacity={config.lightSweep.opacity}
        />
      )}
      
      {children}
    </div>
  )
}
