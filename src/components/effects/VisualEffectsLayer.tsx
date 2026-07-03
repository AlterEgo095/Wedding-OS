'use client'

/**
 * VisualEffectsLayer — Master effects overlay for the entire page
 * 
 * Renders all background effects that should span the full page:
 * - Bokeh circles
 * - Global sparkles
 * - Global floating particles
 * 
 * This component is placed at the top of the page and creates
 * a subtle ambient atmosphere without interfering with content.
 */

import { useEffect, useState } from 'react'
import { useVisualEffects } from '@/lib/visual-effects-store'
import SparkleEffect from './SparkleEffect'
import FloatingParticles from './FloatingParticles'
import BokehEffect from './BokehEffect'

export default function VisualEffectsLayer() {
  const { sparkles, particles, bokeh } = useVisualEffects()
  const [mounted, setMounted] = useState(false)
  
  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true))
    return () => cancelAnimationFrame(id)
  }, [])
  
  if (!mounted) return null
  
  const hasAnyEffect = sparkles || particles || bokeh
  
  if (!hasAnyEffect) return null
  
  return (
    <div className="fixed inset-0 pointer-events-none z-[1]" aria-hidden="true">
      {bokeh && <BokehEffect count={4} />}
      {sparkles && <SparkleEffect count={12} color="mixed" />}
      {particles && <FloatingParticles count={10} color="gold" />}
    </div>
  )
}
