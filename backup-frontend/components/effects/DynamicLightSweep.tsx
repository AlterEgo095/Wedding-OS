'use client'

/**
 * DynamicLightSweep — Golden luxury light sweep animation
 * 
 * Creates a slow, golden luminous sweep passing over elements.
 * Very subtle, evokes luxury and premium quality.
 * Animation is very slow and elegant.
 */

import { motion } from 'framer-motion'
import { useVisualEffects } from '@/lib/visual-effects-store'

interface DynamicLightSweepProps {
  /** Duration of one sweep cycle in seconds (default: 12) */
  duration?: number
  /** Delay before first sweep (default: 3) */
  delay?: number
  /** Angle of the sweep (default: 105deg) */
  angle?: number
  /** Opacity of the sweep (default: 0.06) */
  opacity?: number
  /** Position: 'left-to-right' or 'diagonal' */
  direction?: 'left-to-right' | 'diagonal'
  className?: string
}

export default function DynamicLightSweep({
  duration = 12,
  delay = 3,
  angle = 105,
  opacity = 0.06,
  direction = 'diagonal',
  className = '',
}: DynamicLightSweepProps) {
  const { dynamicLight } = useVisualEffects()
  
  if (!dynamicLight) return null
  
  const gradientDir = direction === 'diagonal'
    ? `${angle}deg`
    : '90deg'
  
  return (
    <motion.div
      className={`absolute inset-0 pointer-events-none z-[2] ${className}`}
      aria-hidden="true"
      style={{
        background: `linear-gradient(${gradientDir}, transparent 40%, oklch(0.82 0.08 85 / ${opacity}) 45%, oklch(0.88 0.04 85 / ${opacity * 0.5}) 50%, transparent 55%)`,
        backgroundSize: '300% 100%',
      }}
      animate={{
        backgroundPosition: ['300% 0', '-300% 0'],
      }}
      transition={{
        duration,
        delay,
        repeat: Infinity,
        ease: 'linear',
        repeatDelay: duration * 0.8,
      }}
    />
  )
}
