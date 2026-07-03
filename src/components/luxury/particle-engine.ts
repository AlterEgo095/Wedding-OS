/**
 * Luxury Particle Engine — Canvas 2D particle system
 * 
 * A lightweight, custom-built particle engine optimized for
 * the wedding platform's cinematic ambiance. No external dependencies.
 * 
 * Features:
 * - Star field with individual twinkle cycles
 * - Golden dust with organic Perlin-like drift
 * - Micro sparkles with random lifecycle
 * - Performance-adaptive rendering
 * - requestAnimationFrame-based loop
 */

// ─── Simple Noise Function ───
// Minimal hash-based noise for organic movement
function hash(x: number, y: number): number {
  let h = x * 374761393 + y * 668265263
  h = (h ^ (h >> 13)) * 1274126177
  return (h ^ (h >> 16)) / 2147483647
}

function smoothNoise(x: number, y: number): number {
  const ix = Math.floor(x)
  const iy = Math.floor(y)
  const fx = x - ix
  const fy = y - iy
  const sx = fx * fx * (3 - 2 * fx)
  const sy = fy * fy * (3 - 2 * fy)
  const n00 = hash(ix, iy)
  const n10 = hash(ix + 1, iy)
  const n01 = hash(ix, iy + 1)
  const n11 = hash(ix + 1, iy + 1)
  const nx0 = n00 + (n10 - n00) * sx
  const nx1 = n01 + (n11 - n01) * sx
  return nx0 + (nx1 - nx0) * sy
}

function fbmNoise(x: number, y: number, octaves = 3): number {
  let value = 0
  let amplitude = 0.5
  let frequency = 1
  for (let i = 0; i < octaves; i++) {
    value += amplitude * smoothNoise(x * frequency, y * frequency)
    amplitude *= 0.5
    frequency *= 2
  }
  return value
}

// ─── Particle Types ───
interface StarParticle {
  type: 'star'
  x: number
  y: number
  baseSize: number
  baseOpacity: number
  twinkleSpeed: number
  twinklePhase: number
  // Lifecycle
  life: number
  maxLife: number
  age: number
  dead: boolean
  respawnDelay: number
  respawnTimer: number
}

interface DustParticle {
  type: 'dust'
  x: number
  y: number
  baseSize: number
  baseOpacity: number
  vx: number
  vy: number
  noiseOffsetX: number
  noiseOffsetY: number
  noiseSpeed: number
  colorIndex: number
  // Lifecycle
  life: number
  maxLife: number
  age: number
  dead: boolean
}

interface SparkleParticle {
  type: 'sparkle'
  x: number
  y: number
  size: number
  maxOpacity: number
  flashDuration: number
  // Lifecycle
  age: number
  dead: boolean
  nextSparkle: number
  timer: number
}

type Particle = StarParticle | DustParticle | SparkleParticle

// ─── Engine Configuration ───
export interface EngineConfig {
  maxStars: number
  maxDust: number
  maxSparkles: number
  speedMultiplier: number
  intensityMultiplier: number
  densityMultiplier: number
  colors: {
    dust: string[]
    star: string
  }
  width: number
  height: number
  pixelRatio: number
  darkMode: boolean
  scrollY: number
}

// ─── Particle Engine ───
export class LuxuryParticleEngine {
  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  private particles: Particle[] = []
  private rafId: number = 0
  private running: boolean = false
  private config: EngineConfig
  private lastTime: number = 0
  private globalTime: number = 0
  private fpsFrames: number = 0
  private fpsTime: number = 0
  private currentFps: number = 60
  private onFpsUpdate: ((fps: number) => void) | null = null

  constructor(canvas: HTMLCanvasElement, config: EngineConfig) {
    this.canvas = canvas
    this.ctx = canvas.getContext('2d', { alpha: true })!
    this.config = config
    this.resize()
  }

  setOnFpsUpdate(callback: (fps: number) => void) {
    this.onFpsUpdate = callback
  }

  getConfig(): EngineConfig {
    return { ...this.config }
  }

  resize() {
    const { width, height, pixelRatio } = this.config
    this.canvas.width = width * pixelRatio
    this.canvas.height = height * pixelRatio
    this.canvas.style.width = `${width}px`
    this.canvas.style.height = `${height}px`
    this.ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0)
  }

  updateConfig(config: Partial<EngineConfig>) {
    const needsResize = config.width !== this.config.width || 
                       config.height !== this.config.height ||
                       config.pixelRatio !== this.config.pixelRatio
    
    this.config = { ...this.config, ...config }
    
    if (needsResize) {
      this.resize()
    }
  }

  start() {
    if (this.running) return
    this.running = true
    this.lastTime = performance.now()
    this.fpsTime = this.lastTime
    this.initializeParticles()
    this.loop()
  }

  stop() {
    this.running = false
    if (this.rafId) {
      cancelAnimationFrame(this.rafId)
      this.rafId = 0
    }
    this.particles = []
  }

  getFps(): number {
    return this.currentFps
  }

  private initializeParticles() {
    this.particles = []
    const { maxStars, maxDust, maxSparkles, densityMultiplier } = this.config

    // Stars
    const starCount = Math.round(maxStars * (densityMultiplier / 100))
    for (let i = 0; i < starCount; i++) {
      this.particles.push(this.createStar())
    }

    // Dust
    const dustCount = Math.round(maxDust * (densityMultiplier / 100))
    for (let i = 0; i < dustCount; i++) {
      this.particles.push(this.createDust())
    }

    // Sparkles
    const sparkleCount = Math.round(maxSparkles * (densityMultiplier / 100))
    for (let i = 0; i < sparkleCount; i++) {
      this.particles.push(this.createSparkle())
    }
  }

  private createStar(): StarParticle {
    const { width, height } = this.config
    const maxLife = 20 + Math.random() * 60 // 20-80 seconds
    return {
      type: 'star',
      x: Math.random() * width,
      y: Math.random() * height,
      baseSize: 0.3 + Math.random() * 1.5,
      baseOpacity: 0.05 + Math.random() * 0.2,
      twinkleSpeed: 0.2 + Math.random() * 0.8,
      twinklePhase: Math.random() * Math.PI * 2,
      life: maxLife,
      maxLife,
      age: Math.random() * maxLife, // Stagger initial ages
      dead: false,
      respawnDelay: 5 + Math.random() * 30,
      respawnTimer: 0,
    }
  }

  private createDust(): DustParticle {
    const { width, height } = this.config
    const maxLife = 12 + Math.random() * 30 // 12-42 seconds
    return {
      type: 'dust',
      x: Math.random() * width,
      y: Math.random() * height,
      baseSize: 0.5 + Math.random() * 2.5,
      baseOpacity: 0.03 + Math.random() * 0.15,
      vx: (Math.random() - 0.5) * 0.2,
      vy: -(0.1 + Math.random() * 0.3), // Upward drift
      noiseOffsetX: Math.random() * 1000,
      noiseOffsetY: Math.random() * 1000,
      noiseSpeed: 0.3 + Math.random() * 0.5,
      colorIndex: Math.floor(Math.random() * 4),
      life: maxLife,
      maxLife,
      age: Math.random() * maxLife, // Stagger
      dead: false,
    }
  }

  private createSparkle(): SparkleParticle {
    const { width, height } = this.config
    return {
      type: 'sparkle',
      x: Math.random() * width,
      y: Math.random() * height,
      size: 1 + Math.random() * 2,
      maxOpacity: 0.2 + Math.random() * 0.4,
      flashDuration: 0.3 + Math.random() * 0.6,
      age: 0,
      dead: false,
      nextSparkle: 3 + Math.random() * 12, // 3-15 seconds between flashes
      timer: Math.random() * 10, // Stagger
    }
  }

  private loop = () => {
    if (!this.running) return

    const now = performance.now()
    const delta = Math.min((now - this.lastTime) / 1000, 0.1) // Cap delta at 100ms
    this.lastTime = now
    this.globalTime += delta * this.config.speedMultiplier

    // FPS tracking
    this.fpsFrames++
    if (now - this.fpsTime >= 1000) {
      this.currentFps = this.fpsFrames
      this.fpsFrames = 0
      this.fpsTime = now
      this.onFpsUpdate?.(this.currentFps)
    }

    this.update(delta)
    this.render()
    this.rafId = requestAnimationFrame(this.loop)
  }

  private update(delta: number) {
    const { width, height, intensityMultiplier } = this.config
    const effectiveDelta = delta * this.config.speedMultiplier

    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i]

      if (p.type === 'star') {
        p.age += effectiveDelta
        if (p.age >= p.maxLife) {
          p.dead = true
          p.respawnTimer += effectiveDelta
          if (p.respawnTimer >= p.respawnDelay) {
            // Respawn at new random position
            const newStar = this.createStar()
            newStar.age = 0
            this.particles[i] = newStar
          }
        }
      }

      else if (p.type === 'dust') {
        p.age += effectiveDelta
        if (p.age >= p.maxLife) {
          // Respawn
          const newDust = this.createDust()
          newDust.age = 0
          this.particles[i] = newDust
          continue
        }

        // Organic movement via noise
        const noiseX = fbmNoise(p.noiseOffsetX + this.globalTime * p.noiseSpeed * 0.1, 0) - 0.5
        const noiseY = fbmNoise(0, p.noiseOffsetY + this.globalTime * p.noiseSpeed * 0.1) - 0.5

        p.x += (p.vx + noiseX * 0.5) * effectiveDelta * 30
        p.y += (p.vy + noiseY * 0.2) * effectiveDelta * 30

        // Wrap around screen
        if (p.x < -10) p.x = width + 10
        if (p.x > width + 10) p.x = -10
        if (p.y < -10) p.y = height + 10
        if (p.y > height + 10) p.y = -10
      }

      else if (p.type === 'sparkle') {
        p.timer += effectiveDelta
        if (p.timer >= p.nextSparkle) {
          p.age = 0
          p.dead = false
          p.x = Math.random() * width
          p.y = Math.random() * height
        }
        if (!p.dead) {
          p.age += effectiveDelta
          if (p.age >= p.flashDuration) {
            p.dead = true
            p.timer = 0
            p.nextSparkle = 3 + Math.random() * 12
          }
        }
      }
    }
  }

  private render() {
    const { width, height, intensityMultiplier, darkMode, colors } = this.config
    this.ctx.clearRect(0, 0, width, height)

    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i]

      if (p.type === 'star' && !p.dead) {
        // Lifecycle fade: fade in during first 10%, fade out during last 10%
        const lifeRatio = p.age / p.maxLife
        let lifecycleFade = 1
        if (lifeRatio < 0.1) lifecycleFade = lifeRatio / 0.1
        else if (lifeRatio > 0.9) lifecycleFade = (1 - lifeRatio) / 0.1

        // Twinkle
        const twinkle = 0.5 + 0.5 * Math.sin(this.globalTime * p.twinkleSpeed + p.twinklePhase)
        const opacity = p.baseOpacity * twinkle * lifecycleFade * intensityMultiplier

        if (opacity < 0.005) continue // Skip invisible

        // Parallax offset based on scroll
        const parallaxY = this.config.scrollY * 0.02
        const drawY = ((p.y - parallaxY) % height + height) % height

        this.ctx.beginPath()
        this.ctx.arc(p.x, drawY, p.baseSize, 0, Math.PI * 2)
        
        if (darkMode) {
          this.ctx.fillStyle = `rgba(220, 210, 190, ${opacity})`
        } else {
          this.ctx.fillStyle = `rgba(139, 105, 20, ${opacity * 0.6})`
        }
        this.ctx.fill()

        // Subtle glow for brighter stars
        if (p.baseSize > 1 && opacity > 0.08) {
          this.ctx.beginPath()
          this.ctx.arc(p.x, drawY, p.baseSize * 3, 0, Math.PI * 2)
          if (darkMode) {
            this.ctx.fillStyle = `rgba(196, 162, 101, ${opacity * 0.15})`
          } else {
            this.ctx.fillStyle = `rgba(196, 162, 101, ${opacity * 0.1})`
          }
          this.ctx.fill()
        }
      }

      else if (p.type === 'dust') {
        // Lifecycle fade
        const lifeRatio = p.age / p.maxLife
        let lifecycleFade = 1
        if (lifeRatio < 0.15) lifecycleFade = lifeRatio / 0.15
        else if (lifeRatio > 0.85) lifecycleFade = (1 - lifeRatio) / 0.15

        const opacity = p.baseOpacity * lifecycleFade * intensityMultiplier
        if (opacity < 0.005) continue

        const color = colors.dust[p.colorIndex % colors.dust.length]
        const size = p.baseSize

        // Draw with radial gradient for soft look
        const gradient = this.ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, size * 2)
        gradient.addColorStop(0, this.colorWithAlpha(color, opacity))
        gradient.addColorStop(0.5, this.colorWithAlpha(color, opacity * 0.4))
        gradient.addColorStop(1, this.colorWithAlpha(color, 0))
        
        this.ctx.beginPath()
        this.ctx.arc(p.x, p.y, size * 2, 0, Math.PI * 2)
        this.ctx.fillStyle = gradient
        this.ctx.fill()
      }

      else if (p.type === 'sparkle' && !p.dead) {
        // Flash effect: quick rise and fall
        const progress = p.age / p.flashDuration
        const flashCurve = progress < 0.3 
          ? progress / 0.3  // Rise
          : 1 - (progress - 0.3) / 0.7  // Fall
        
        const opacity = p.maxOpacity * flashCurve * intensityMultiplier
        if (opacity < 0.01) continue

        // Draw as a small cross/star shape
        const s = p.size
        this.ctx.save()
        this.ctx.translate(p.x, p.y)
        
        // Core dot
        this.ctx.beginPath()
        this.ctx.arc(0, 0, s * 0.5, 0, Math.PI * 2)
        this.ctx.fillStyle = this.colorWithAlpha(colors.dust[0], opacity)
        this.ctx.fill()

        // Cross rays
        this.ctx.strokeStyle = this.colorWithAlpha(colors.dust[0], opacity * 0.5)
        this.ctx.lineWidth = 0.5
        this.ctx.beginPath()
        this.ctx.moveTo(-s * 1.5, 0)
        this.ctx.lineTo(s * 1.5, 0)
        this.ctx.moveTo(0, -s * 1.5)
        this.ctx.lineTo(0, s * 1.5)
        this.ctx.stroke()

        // Glow
        this.ctx.beginPath()
        this.ctx.arc(0, 0, s * 3, 0, Math.PI * 2)
        this.ctx.fillStyle = this.colorWithAlpha(colors.dust[0], opacity * 0.1)
        this.ctx.fill()

        this.ctx.restore()
      }
    }
  }

  private colorWithAlpha(hex: string, alpha: number): string {
    // Convert hex to rgba
    const r = parseInt(hex.slice(1, 3), 16)
    const g = parseInt(hex.slice(3, 5), 16)
    const b = parseInt(hex.slice(5, 7), 16)
    return `rgba(${r}, ${g}, ${b}, ${alpha})`
  }

  destroy() {
    this.stop()
    this.onFpsUpdate = null
  }
}
