'use client'

/**
 * AppearanceManager — Admin panel section for visual effects control
 * 
 * Section: ✨ Apparence & Animations
 * Allows admins to toggle all visual effects without modifying code.
 */

import { motion } from 'framer-motion'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Slider } from '@/components/ui/slider'
import { Button } from '@/components/ui/button'
import { 
  Sparkles, Wind, Layers, Sun, Lightbulb, Circle, 
  MoveUp, Wand2, GlassWater, MousePointerClick, 
  Eye, EyeOff, RotateCcw, Music, Star
} from 'lucide-react'
import { useVisualEffects } from '@/lib/visual-effects-store'

interface EffectToggle {
  key: 'sparkles' | 'particles' | 'parallax' | 'dynamicLight' | 'glowEffects' | 
        'bokeh' | 'floatingElements' | 'microAnimations' | 'glassmorphism' | 
        'premiumButtons' | 'scrollReveal' | 'music'
  label: string
  description: string
  icon: React.ComponentType<{ className?: string }>
}

const EFFECT_TOGGLES: EffectToggle[] = [
  { key: 'sparkles', label: 'Étincelles', description: 'Particules lumineuses scintillantes', icon: Sparkles },
  { key: 'particles', label: 'Particules', description: 'Poussières dorées et micro-étoiles flottantes', icon: Wind },
  { key: 'parallax', label: 'Parallax', description: 'Effet de profondeur au défilement', icon: Layers },
  { key: 'dynamicLight', label: 'Lumière dynamique', description: 'Reflet doré animé (effet luxury)', icon: Sun },
  { key: 'glowEffects', label: 'Glow', description: 'Halo lumineux sur les éléments', icon: Lightbulb },
  { key: 'bokeh', label: 'Bokeh', description: 'Cercles de lumière douce en arrière-plan', icon: Circle },
  { key: 'floatingElements', label: 'Floating', description: 'Micro-animations flottantes', icon: MoveUp },
  { key: 'microAnimations', label: 'Micro-animations', description: 'Fade-in, slide-up, scale au scroll', icon: Wand2 },
  { key: 'glassmorphism', label: 'Verre premium', description: 'Effet verre dépoli sur les cartes', icon: GlassWater },
  { key: 'premiumButtons', label: 'Boutons premium', description: 'Glow doré et ombre dynamique', icon: MousePointerClick },
  { key: 'scrollReveal', label: 'Scroll reveal', description: 'Apparition progressive au défilement', icon: Eye },
  { key: 'music', label: 'Musique', description: 'Musique d\'ambiance romantique', icon: Music },
]

interface AppearanceManagerProps {
  token: string
  onSessionExpired: () => void
}

export default function AppearanceManager({ token, onSessionExpired }: AppearanceManagerProps) {
  const state = useVisualEffects()
  
  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="flex items-center justify-between"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-gold/20 to-rose-gold/15 flex items-center justify-center">
            <Star className="w-5 h-5 text-gold" />
          </div>
          <div>
            <h2 className="font-serif text-xl font-bold gold-gradient">Apparence & Animations</h2>
            <p className="text-xs text-muted-foreground">Contrôlez les effets visuels du site</p>
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
      
      {/* Effect Toggles Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {EFFECT_TOGGLES.map((effect, i) => {
          const isEnabled = state[effect.key] as boolean
          const Icon = effect.icon
          
          return (
            <motion.div
              key={effect.key}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04, duration: 0.3 }}
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
      
      {/* Intensity Controls */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3, duration: 0.3 }}
      >
        <Card className="glass-card gold-border border-0">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Wand2 className="w-4 h-4 text-gold" />
              Réglages avancés
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Sparkle Intensity */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">Intensité des étincelles</label>
                <span className="text-xs text-muted-foreground font-mono">{state.sparkleIntensity}%</span>
              </div>
              <Slider
                value={[state.sparkleIntensity]}
                onValueChange={([v]) => state.setValue('sparkleIntensity', v)}
                min={10}
                max={100}
                step={5}
                className="w-full"
              />
            </div>
            
            {/* Particle Count */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">Densité des particules</label>
                <span className="text-xs text-muted-foreground font-mono">{state.particleCount}%</span>
              </div>
              <Slider
                value={[state.particleCount]}
                onValueChange={([v]) => state.setValue('particleCount', v)}
                min={10}
                max={100}
                step={5}
                className="w-full"
              />
            </div>
            
            {/* Animation Speed */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">Vitesse des animations</label>
                <span className="text-xs text-muted-foreground font-mono">{state.animationSpeed}%</span>
              </div>
              <Slider
                value={[state.animationSpeed]}
                onValueChange={([v]) => state.setValue('animationSpeed', v)}
                min={25}
                max={200}
                step={25}
                className="w-full"
              />
            </div>
          </CardContent>
        </Card>
      </motion.div>
      
      {/* Preview Note */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
        className="text-center py-4"
      >
        <p className="text-xs text-muted-foreground/60 font-display">
          ✦ Les modifications sont appliquées en temps réel sur le site principal ✦
        </p>
      </motion.div>
    </div>
  )
}
