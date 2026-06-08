'use client'

/**
 * SparkleEffect — Subtle romantic sparkle particles
 * 
 * Creates small, luminous points that:
 * - Appear slowly
 * - Twinkle gently
 * - Disappear progressively
 * - Reappear randomly
 * - Stay lightweight for the browser
 * 
 * Evokes: magic, romanticism, luxury, celebration
 */

import { useMemo, useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { useVisualEffects } from '@/lib/visual-effects-store'

interface SparkleParticle {
  id: number
  x: number
  y: number
  size: number
  duration: number
  delay: number
  opacity: number
  type: 'dot' | 'star' | 'cross'
}

interface SparkleEffectProps {
  count?: number
  color?: 'gold' | 'rose-gold' | 'mixed'
  className?: string
}

const COLORS = {
  gold: { primary: '#C4A265', secondary: '#D4B87A', tertiary: '#8B6914' },
  'rose-gold': { primary: '#B05A5A', secondary: '#C47A7A', tertiary: '#8B3A3A' },
  mixed: { primary: '#C4A265', secondary: '#B05A5A', tertiary: '#D4B87A' },
}

export default function SparkleEffect({ 
  count, 
  color = 'gold', 
  className = '' 
}: SparkleEffectProps) {
  const { sparkles, sparkleIntensity, animationSpeed } = useVisualEffects()
  const [mounted, setMounted] = useState(false)
  
  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true))
    return () => cancelAnimationFrame(id)
  }, [])
  
  if (!mounted || !sparkles) return null
  
  const actualCount = count ?? Math.round((sparkleIntensity / 100) * 20 + 5)
  const speedMult = animationSpeed / 100
  
  return <SparkleEffectInner count={actualCount} color={color} speedMult={speedMult} className={className} />
}

function SparkleEffectInner({ 
  count, color, speedMult, className 
}: { 
  count: number; color: 'gold' | 'rose-gold' | 'mixed'; speedMult: number; className: string 
}) {
  const palette = COLORS[color]
  
  const particles = useMemo<SparkleParticle[]>(() => 
    Array.from({ length: count }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: Math.random() * 3 + 1,
      duration: (Math.random() * 6 + 6) * speedMult,
      delay: Math.random() * 8,
      opacity: Math.random() * 0.4 + 0.1,
      type: (['dot', 'star', 'cross'] as const)[Math.floor(Math.random() * 3)],
    })),
  [count, speedMult])
  
  return (
    <div className={`absolute inset-0 pointer-events-none overflow-hidden z-[1] ${className}`} aria-hidden="true">
      {particles.map((p) => {
        const colorVal = p.id % 3 === 0 ? palette.primary : p.id % 3 === 1 ? palette.secondary : palette.tertiary
        
        return (
          <motion.div
            key={p.id}
            className="absolute"
            style={{
              left: `${p.x}%`,
              top: `${p.y}%`,
              width: p.size,
              height: p.size,
            }}
            initial={{ opacity: 0, scale: 0 }}
            animate={{
              opacity: [0, p.opacity, p.opacity * 1.5, p.opacity, 0],
              scale: [0, 1, 1.2, 1, 0],
              y: [0, -15, -25, -15, 0],
            }}
            transition={{
              duration: p.duration,
              delay: p.delay,
              repeat: Infinity,
              ease: 'easeInOut',
              repeatDelay: Math.random() * 3 + 2,
            }}
          >
            {p.type === 'dot' && (
              <div
                className="rounded-full w-full h-full"
                style={{
                  background: `radial-gradient(circle, ${colorVal} 0%, transparent 70%)`,
                  boxShadow: `0 0 ${p.size * 2}px ${colorVal}40`,
                }}
              />
            )}
            {p.type === 'star' && (
              <div
                className="w-full h-full rotate-45"
                style={{
                  background: colorVal,
                  boxShadow: `0 0 ${p.size * 3}px ${colorVal}50`,
                  borderRadius: '1px',
                }}
              />
            )}
            {p.type === 'cross' && (
              <div className="relative w-full h-full">
                <div
                  className="absolute top-1/2 left-0 right-0 h-px -translate-y-1/2"
                  style={{ background: colorVal, boxShadow: `0 0 ${p.size}px ${colorVal}40` }}
                />
                <div
                  className="absolute left-1/2 top-0 bottom-0 w-px -translate-x-1/2"
                  style={{ background: colorVal, boxShadow: `0 0 ${p.size}px ${colorVal}40` }}
                />
              </div>
            )}
          </motion.div>
        )
      })}
    </div>
  )
}
