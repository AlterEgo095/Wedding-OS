'use client'

/**
 * FloatingParticles — Golden dust, micro-stars, luminous particles
 * 
 * Subtle floating particles that create ambiance:
 * - Small golden dust particles
 * - Light luminous halos  
 * - Micro-star twinkles
 * - Very slow and elegant movements
 */

import { useMemo, useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { useVisualEffects } from '@/lib/visual-effects-store'

interface Particle {
  id: number
  x: number
  y: number
  size: number
  duration: number
  delay: number
  opacity: number
  type: 'dust' | 'halo' | 'micro-star'
  drift: number // horizontal drift
}

interface FloatingParticlesProps {
  count?: number
  color?: 'gold' | 'rose-gold' | 'mixed'
  className?: string
}

const PARTICLE_COLORS = {
  gold: ['#C4A265', '#D4B87A', '#8B6914', '#E8D5A3'],
  'rose-gold': ['#B05A5A', '#C47A7A', '#D4A87A', '#E8C0A0'],
  mixed: ['#C4A265', '#B05A5A', '#D4B87A', '#D4A87A'],
}

export default function FloatingParticles({ 
  count, 
  color = 'gold', 
  className = '' 
}: FloatingParticlesProps) {
  const { particles, particleCount, animationSpeed } = useVisualEffects()
  const [mounted, setMounted] = useState(false)
  
  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true))
    return () => cancelAnimationFrame(id)
  }, [])
  
  if (!mounted || !particles) return null
  
  const actualCount = count ?? Math.round((particleCount / 100) * 25 + 8)
  const speedMult = animationSpeed / 100
  
  return <FloatingParticlesInner count={actualCount} color={color} speedMult={speedMult} className={className} />
}

function FloatingParticlesInner({ 
  count, color, speedMult, className 
}: { 
  count: number; color: 'gold' | 'rose-gold' | 'mixed'; speedMult: number; className: string 
}) {
  const colors = PARTICLE_COLORS[color]
  
  const particleData = useMemo<Particle[]>(() => 
    Array.from({ length: count }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: Math.random() * 4 + 1.5,
      duration: (Math.random() * 8 + 10) * speedMult,
      delay: Math.random() * 6,
      opacity: Math.random() * 0.3 + 0.05,
      type: (['dust', 'halo', 'micro-star'] as const)[Math.floor(Math.random() * 3)],
      drift: (Math.random() - 0.5) * 20,
    })),
  [count, speedMult])
  
  return (
    <div className={`absolute inset-0 pointer-events-none overflow-hidden z-[1] ${className}`} aria-hidden="true">
      {particleData.map((p) => {
        const c = colors[p.id % colors.length]
        
        return (
          <motion.div
            key={p.id}
            className="absolute will-change-transform"
            style={{
              left: `${p.x}%`,
              top: `${p.y}%`,
            }}
            animate={{
              y: [0, -30, -15, -40, 0],
              x: [0, p.drift * 0.3, p.drift, p.drift * 0.5, 0],
              opacity: [p.opacity * 0.5, p.opacity, p.opacity * 1.5, p.opacity, p.opacity * 0.5],
              scale: [1, 1.2, 1, 1.3, 1],
            }}
            transition={{
              duration: p.duration,
              delay: p.delay,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
          >
            {p.type === 'dust' && (
              <div
                className="rounded-full"
                style={{
                  width: p.size,
                  height: p.size,
                  background: `radial-gradient(circle, ${c} 0%, ${c}40 50%, transparent 70%)`,
                }}
              />
            )}
            {p.type === 'halo' && (
              <div
                className="rounded-full"
                style={{
                  width: p.size * 3,
                  height: p.size * 3,
                  background: `radial-gradient(circle, ${c}20 0%, ${c}08 40%, transparent 70%)`,
                }}
              />
            )}
            {p.type === 'micro-star' && (
              <div
                className="relative"
                style={{ width: p.size, height: p.size }}
              >
                {/* Horizontal ray */}
                <div
                  className="absolute top-1/2 left-0 right-0 h-px -translate-y-1/2"
                  style={{
                    background: `linear-gradient(to right, transparent, ${c}60, transparent)`,
                    boxShadow: `0 0 ${p.size}px ${c}30`,
                  }}
                />
                {/* Vertical ray */}
                <div
                  className="absolute left-1/2 top-0 bottom-0 w-px -translate-x-1/2"
                  style={{
                    background: `linear-gradient(to bottom, transparent, ${c}60, transparent)`,
                    boxShadow: `0 0 ${p.size}px ${c}30`,
                  }}
                />
                {/* Center dot */}
                <div
                  className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
                  style={{
                    width: p.size * 0.5,
                    height: p.size * 0.5,
                    background: c,
                    boxShadow: `0 0 ${p.size * 2}px ${c}50`,
                  }}
                />
              </div>
            )}
          </motion.div>
        )
      })}
    </div>
  )
}
