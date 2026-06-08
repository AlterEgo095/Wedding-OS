'use client'

/**
 * BokehEffect — Soft bokeh background effect
 * 
 * Creates large, soft, out-of-focus light circles that
 * float slowly across the background, creating a dreamy
 * and romantic atmosphere.
 */

import { useMemo, useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { useVisualEffects } from '@/lib/visual-effects-store'

interface BokehCircle {
  id: number
  x: number
  y: number
  size: number
  duration: number
  delay: number
  opacity: number
  color: string
}

interface BokehEffectProps {
  count?: number
  className?: string
}

const BOKEH_COLORS = [
  'oklch(0.82 0.08 85 / 8%)',   // gold light
  'oklch(0.72 0.06 30 / 6%)',   // rose-gold
  'oklch(0.88 0.04 85 / 5%)',   // champagne
  'oklch(0.68 0.12 85 / 7%)',   // gold
]

export default function BokehEffect({ count = 5, className = '' }: BokehEffectProps) {
  const { bokeh, animationSpeed } = useVisualEffects()
  const [mounted, setMounted] = useState(false)
  
  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true))
    return () => cancelAnimationFrame(id)
  }, [])
  
  if (!mounted || !bokeh) return null
  
  const speedMult = animationSpeed / 100
  
  return <BokehEffectInner count={count} speedMult={speedMult} className={className} />
}

function BokehEffectInner({ count, speedMult, className }: { count: number; speedMult: number; className: string }) {
  const circles = useMemo<BokehCircle[]>(() => 
    Array.from({ length: count }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: Math.random() * 200 + 100,
      duration: (Math.random() * 20 + 25) * speedMult,
      delay: Math.random() * 10,
      opacity: Math.random() * 0.5 + 0.3,
      color: BOKEH_COLORS[i % BOKEH_COLORS.length],
    })),
  [count, speedMult])
  
  return (
    <div className={`absolute inset-0 pointer-events-none overflow-hidden z-0 ${className}`} aria-hidden="true">
      {circles.map((c) => (
        <motion.div
          key={c.id}
          className="absolute rounded-full will-change-transform"
          style={{
            left: `${c.x}%`,
            top: `${c.y}%`,
            width: c.size,
            height: c.size,
            background: `radial-gradient(circle, ${c.color} 0%, transparent 70%)`,
            filter: 'blur(40px)',
          }}
          animate={{
            x: [0, 30, -20, 15, 0],
            y: [0, -25, 15, -30, 0],
            opacity: [c.opacity * 0.5, c.opacity, c.opacity * 0.7, c.opacity * 0.9, c.opacity * 0.5],
          }}
          transition={{
            duration: c.duration,
            delay: c.delay,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        />
      ))}
    </div>
  )
}
