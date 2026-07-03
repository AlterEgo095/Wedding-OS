'use client'

/**
 * ScrollReveal — Progressive reveal on scroll
 * 
 * Wrapper component that adds scroll-triggered animations:
 * - Fade In
 * - Slide Up
 * - Scale
 * - Glow
 * 
 * Uses IntersectionObserver via Framer Motion's useInView
 * Respects the visual effects store settings
 */

import { useRef } from 'react'
import { motion, useInView } from 'framer-motion'
import { useVisualEffects } from '@/lib/visual-effects-store'

type RevealAnimation = 'fade-in' | 'slide-up' | 'slide-left' | 'slide-right' | 'scale' | 'scale-fade' | 'glow'

interface ScrollRevealProps {
  children: React.ReactNode
  /** Animation type */
  animation?: RevealAnimation
  /** Delay in seconds */
  delay?: number
  /** Duration in seconds */
  duration?: number
  /** Margin for intersection observer */
  margin?: string
  /** Only trigger once */
  once?: boolean
  /** Custom className */
  className?: string
}

const animationVariants: Record<RevealAnimation, {
  initial: Record<string, number>
  animate: Record<string, number>
}> = {
  'fade-in': {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
  },
  'slide-up': {
    initial: { opacity: 0, y: 40 },
    animate: { opacity: 1, y: 0 },
  },
  'slide-left': {
    initial: { opacity: 0, x: 40 },
    animate: { opacity: 1, x: 0 },
  },
  'slide-right': {
    initial: { opacity: 0, x: -40 },
    animate: { opacity: 1, x: 0 },
  },
  'scale': {
    initial: { opacity: 0, scale: 0.85 },
    animate: { opacity: 1, scale: 1 },
  },
  'scale-fade': {
    initial: { opacity: 0, scale: 0.9, y: 20 },
    animate: { opacity: 1, scale: 1, y: 0 },
  },
  'glow': {
    initial: { opacity: 0, scale: 0.95 },
    animate: { opacity: 1, scale: 1 },
  },
}

// Premium easing curves
const EASING = [0.25, 0.46, 0.45, 0.94] as const

export default function ScrollReveal({
  children,
  animation = 'slide-up',
  delay = 0,
  duration = 0.7,
  margin = '-60px',
  once = true,
  className = '',
}: ScrollRevealProps) {
  const { scrollReveal, glowEffects } = useVisualEffects()
  const ref = useRef<HTMLDivElement>(null)
  const isInView = useInView(ref, { once, margin: margin as any })
  
  const variant = animationVariants[animation]
  
  // If scroll reveal is disabled, render children without animation
  if (!scrollReveal) {
    return <div className={className}>{children}</div>
  }
  
  // Add glow filter if enabled and animation is 'glow'
  const glowStyle = glowEffects && animation === 'glow' && isInView
    ? { filter: 'drop-shadow(0 0 12px oklch(0.68 0.12 85 / 15%))' }
    : {}
  
  return (
    <motion.div
      ref={ref}
      className={className}
      initial={variant.initial}
      animate={isInView ? variant.animate : variant.initial}
      transition={{
        duration,
        delay,
        ease: EASING,
      }}
      style={glowStyle}
    >
      {children}
    </motion.div>
  )
}
