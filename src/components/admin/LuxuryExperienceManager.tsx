'use client'

/**
 * LuxuryExperienceManager — Admin panel section for Luxury Engine
 * 
 * Section: ✨ Luxury Experience
 * Allows admins to control the cinematic ambiance independently.
 * Zero modification to the existing AppearanceManager.
 */

import { motion } from 'framer-motion'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Slider } from '@/components/ui/slider'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Sparkles, Stars, Sun, Wind, CircleDot, Heart, 
  Eye, EyeOff, RotateCcw, Gauge, Palette, Zap,
  Monitor, Smartphone, Cpu, ArrowDown, ArrowUp,
  Crown, Moon, Sun as SunIcon,
} from 'lucide-react'
import { useLuxuryEngine, LUXURY_THEMES, TIER_CONFIG, type PerformanceTier, type LuxuryTheme } from '@/lib/luxury-engine-store'

interface LuxuryExperienceManagerProps {
  token: string
  onSessionExpired: () => void
}

const EFFECT_CONTROLS = [
  { key: 'starrySky' as const, label: 'Ciel étoilé', description: 'Micro-étoiles scintillantes en arrière-plan', icon: Stars },
  { key: 'goldenDust' as const, label: 'Poussières dorées', description: 'Particules flottantes organiques', icon: Wind },
  { key: 'microSparkles' as const, label: 'Micro scintillements', description: 'Apparitions lumineuses aléatoires', icon: Sparkles },
  { key: 'luminousHalos' as const, label: 'Halos lumineux', description: 'Cercles diffus traversant lentement', icon: CircleDot },
  { key: 'globalBreathing' as const, label: 'Respiration', description: 'Variation lumineuse douce (20-30s)', icon: Heart },
  { key: 'sectionAmbiance' as const, label: 'Ambiance par section', description: 'Identité visuelle unique par zone', icon: Sun },
  { key: 'scrollReflections' as const, label: 'Reflets au scroll', description: 'Éclats lumineux au défilement', icon: Zap },
]

const THEME_OPTIONS: { key: LuxuryTheme; label: string; description: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { key: 'gold', label: 'Or', description: 'Classique doré luxueux', icon: Crown },
  { key: 'rose', label: 'Rose', description: 'Rose romantique chaleureux', icon: Heart },
  { key: 'champagne', label: 'Champagne', description: 'Champagne lumineux délicat', icon: Sparkles },
  { key: 'midnight', label: 'Nuit bleue', description: 'Bleu nuit profond élégant', icon: Moon },
]

const TIER_LABELS: Record<PerformanceTier, { label: string; icon: React.ComponentType<{ className?: string }>; color: string }> = {
  ultra: { label: 'Ultra', icon: Monitor, color: 'text-emerald-500' },
  high: { label: 'Élevé', icon: Monitor, color: 'text-blue-500' },
  medium: { label: 'Moyen', icon: Smartphone, color: 'text-yellow-500' },
  low: { label: 'Faible', icon: Smartphone, color: 'text-orange-500' },
  minimal: { label: 'Minimal', icon: Cpu, color: 'text-red-500' },
}

export default function LuxuryExperienceManager({ token, onSessionExpired }: LuxuryExperienceManagerProps) {
  const state = useLuxuryEngine()
  const themeColors = LUXURY_THEMES[state.theme]
  const tierConfig = TIER_CONFIG[state.performanceTier]

  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="flex items-center justify-between flex-wrap gap-3"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-gold/20 to-rose-gold/15 flex items-center justify-center">
            <Crown className="w-5 h-5 text-gold" />
          </div>
          <div>
            <h2 className="font-serif text-xl font-bold gold-gradient">Luxury Experience</h2>
            <p className="text-xs text-muted-foreground">Ambiance cinématographique immersive</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={state.enableAll}
            className="text-gold hover:text-gold-light hover:bg-gold/10 text-xs"
          >
            <Eye className="w-3.5 h-3.5 mr-1" />
            Tout activer
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={state.disableAll}
            className="text-muted-foreground hover:text-foreground text-xs"
          >
            <EyeOff className="w-3.5 h-3.5 mr-1" />
            Tout désactiver
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={state.resetToDefaults}
            className="text-muted-foreground hover:text-foreground text-xs"
          >
            <RotateCcw className="w-3.5 h-3.5 mr-1" />
            Réinitialiser
          </Button>
        </div>
      </motion.div>

      {/* Master Toggle */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1, duration: 0.3 }}
      >
        <Card className={`glass-card border-0 transition-all duration-500 ${state.enabled ? 'gold-border' : 'opacity-60'}`}>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className={`w-14 h-14 rounded-xl flex items-center justify-center transition-all duration-500 ${
                  state.enabled 
                    ? 'bg-gradient-to-br from-gold/25 to-rose-gold/15 shadow-lg shadow-gold/10' 
                    : 'bg-white/5'
                }`}>
                  <Crown className={`w-7 h-7 transition-colors ${state.enabled ? 'text-gold' : 'text-muted-foreground'}`} />
                </div>
                <div>
                  <h3 className="font-serif text-lg font-bold">Moteur Cinématographique</h3>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    {state.enabled 
                      ? 'Ambiance immersive active — le site est vivant' 
                      : 'Moteur désactivé — version classique du site'}
                  </p>
                </div>
              </div>
              <Switch
                checked={state.enabled}
                onCheckedChange={() => state.toggle('enabled')}
                className="shrink-0 scale-125"
              />
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Effect Controls Grid */}
      {state.enabled && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {EFFECT_CONTROLS.map((effect, i) => {
            const isEnabled = state[effect.key] as boolean
            const Icon = effect.icon

            return (
              <motion.div
                key={effect.key}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 + i * 0.04, duration: 0.3 }}
              >
                <Card className={`glass-card border-0 transition-all duration-300 ${
                  isEnabled ? 'gold-border' : 'opacity-60'
                }`}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3 flex-1 min-w-0">
                        <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 transition-colors ${
                          isEnabled 
                            ? 'bg-gradient-to-br from-gold/20 to-rose-gold/10' 
                            : 'bg-white/5'
                        }`}>
                          <Icon className={`w-4.5 h-4.5 transition-colors ${
                            isEnabled ? 'text-gold' : 'text-muted-foreground'
                          }`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium leading-tight">{effect.label}</p>
                          <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">{effect.description}</p>
                        </div>
                      </div>
                      <Switch
                        checked={isEnabled}
                        onCheckedChange={() => state.toggle(effect.key)}
                        className="shrink-0"
                      />
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            )
          })}
        </div>
      )}

      {/* Theme Selection */}
      {state.enabled && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 0.3 }}
        >
          <Card className="glass-card gold-border border-0">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Palette className="w-4 h-4 text-gold" />
                Thème lumineux
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {THEME_OPTIONS.map((opt) => {
                  const isActive = state.theme === opt.key
                  const colors = LUXURY_THEMES[opt.key]
                  const Icon = opt.icon

                  return (
                    <button
                      key={opt.key}
                      onClick={() => state.setTheme(opt.key)}
                      className={`relative p-4 rounded-xl text-left transition-all duration-300 ${
                        isActive 
                          ? 'ring-2 ring-gold/60 shadow-lg shadow-gold/10' 
                          : 'hover:bg-white/5'
                      }`}
                      style={{
                        background: isActive 
                          ? `linear-gradient(135deg, ${colors.primary}10, ${colors.secondary}08)` 
                          : 'transparent',
                        border: `1px solid ${isActive ? colors.primary + '30' : 'transparent'}`,
                      }}
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <div 
                          className="w-6 h-6 rounded-full"
                          style={{ background: `linear-gradient(135deg, ${colors.primary}, ${colors.secondary})` }}
                        />
                        <Icon className={`w-4 h-4 ${isActive ? 'text-gold' : 'text-muted-foreground'}`} />
                      </div>
                      <p className="text-sm font-medium">{opt.label}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">{opt.description}</p>
                      {isActive && (
                        <Badge className="absolute top-2 right-2 text-[9px] px-1.5 py-0" style={{ 
                          background: colors.primary + '20', 
                          color: colors.primary,
                          border: `1px solid ${colors.primary}30`
                        }}>
                          Actif
                        </Badge>
                      )}
                    </button>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Intensity & Density Controls */}
      {state.enabled && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5, duration: 0.3 }}
        >
          <Card className="glass-card gold-border border-0">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Gauge className="w-4 h-4 text-gold" />
                Réglages avancés
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Intensity */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium">Intensité globale</label>
                  <span className="text-xs text-muted-foreground font-mono">{state.intensity}%</span>
                </div>
                <Slider
                  value={[state.intensity]}
                  onValueChange={([v]) => state.setValue('intensity', v)}
                  min={10}
                  max={100}
                  step={5}
                  className="w-full"
                />
              </div>

              {/* Density */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium">Densité des particules</label>
                  <span className="text-xs text-muted-foreground font-mono">{state.density}%</span>
                </div>
                <Slider
                  value={[state.density]}
                  onValueChange={([v]) => state.setValue('density', v)}
                  min={10}
                  max={100}
                  step={5}
                  className="w-full"
                />
              </div>

              {/* Speed */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium">Vitesse d'animation</label>
                  <span className="text-xs text-muted-foreground font-mono">{state.speed}%</span>
                </div>
                <Slider
                  value={[state.speed]}
                  onValueChange={([v]) => state.setValue('speed', v)}
                  min={20}
                  max={150}
                  step={10}
                  className="w-full"
                />
              </div>

              {/* Halo Count */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium">Nombre de halos</label>
                  <span className="text-xs text-muted-foreground font-mono">{state.haloCount}</span>
                </div>
                <Slider
                  value={[state.haloCount]}
                  onValueChange={([v]) => state.setValue('haloCount', v)}
                  min={2}
                  max={8}
                  step={1}
                  className="w-full"
                />
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Performance Monitoring */}
      {state.enabled && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6, duration: 0.3 }}
        >
          <Card className="glass-card border-0">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Cpu className="w-4 h-4 text-gold" />
                Performance adaptive
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Auto Performance Toggle */}
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Auto-détection</p>
                  <p className="text-[11px] text-muted-foreground">Ajuste automatiquement la qualité selon les performances</p>
                </div>
                <Switch
                  checked={state.autoPerformance}
                  onCheckedChange={() => state.toggle('autoPerformance')}
                />
              </div>

              {/* Current FPS */}
              <div className="flex items-center justify-between p-3 rounded-lg bg-white/5">
                <div className="flex items-center gap-2">
                  <Gauge className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm">FPS actuel</span>
                </div>
                <span className={`text-lg font-mono font-bold ${
                  state.currentFps >= 50 ? 'text-emerald-500' : 
                  state.currentFps >= 30 ? 'text-yellow-500' : 
                  'text-red-500'
                }`}>
                  {state.currentFps}
                </span>
              </div>

              {/* Performance Tier Selector */}
              <div className="space-y-2">
                <p className="text-sm font-medium">Niveau de qualité</p>
                <div className="flex flex-wrap gap-2">
                  {(Object.keys(TIER_LABELS) as PerformanceTier[]).map((tier) => {
                    const info = TIER_LABELS[tier]
                    const isActive = state.performanceTier === tier
                    const TierIcon = info.icon

                    return (
                      <button
                        key={tier}
                        onClick={() => {
                          state.setValue('autoPerformance', false)
                          state.setPerformanceTier(tier)
                        }}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                          isActive 
                            ? 'bg-gold/15 text-gold ring-1 ring-gold/30' 
                            : 'bg-white/5 text-muted-foreground hover:bg-white/10'
                        }`}
                      >
                        <TierIcon className="w-3 h-3" />
                        {info.label}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Tier Details */}
              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div className="flex items-center justify-between p-2 rounded bg-white/3">
                  <span className="text-muted-foreground">Étoiles</span>
                  <span className="font-mono">{tierConfig.maxStars}</span>
                </div>
                <div className="flex items-center justify-between p-2 rounded bg-white/3">
                  <span className="text-muted-foreground">Poussières</span>
                  <span className="font-mono">{tierConfig.maxDust}</span>
                </div>
                <div className="flex items-center justify-between p-2 rounded bg-white/3">
                  <span className="text-muted-foreground">Scintillements</span>
                  <span className="font-mono">{tierConfig.maxSparkles}</span>
                </div>
                <div className="flex items-center justify-between p-2 rounded bg-white/3">
                  <span className="text-muted-foreground">Halos</span>
                  <span className="font-mono">{tierConfig.maxHalos}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Footer Note */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.7 }}
        className="text-center py-4"
      >
        <p className="text-xs text-muted-foreground/60 font-display">
          ✦ Luxury Engine — Les modifications sont appliquées en temps réel ✦
        </p>
        <p className="text-[10px] text-muted-foreground/40 font-display mt-1">
          Aucune régression fonctionnelle — Le site classique reste accessible en désactivant le moteur
        </p>
      </motion.div>
    </div>
  )
}
