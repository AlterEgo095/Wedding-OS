'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Eye, Wand2, Layers, Palette, Sparkles } from 'lucide-react'
import ThemeTheater from '@/components/aenws/ThemeTheater'
import type { ThemePackage } from '@/lib/aenws/theme-system'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { IdentityHero } from '@/components/wedding/IdentityHero'
import { IdentityGallery } from '@/components/wedding/IdentityGallery'
import {
  getIdentityPreset,
  identityPresetToThemePreset,
  isWeddingIdentity,
  type WeddingIdentity,
  IDENTITY_PRESETS,
} from '@/lib/themes/identity-presets'

/**
 * MISSION-5.9.0 Phase 0.9 — Wired ThemeTheater callbacks.
 * Previously `onSelect={() => {}}` and `onCompare={() => {}}` were no-ops.
 * Now:
 *   - onSelect(theme) → pushes /showcase?theme=<theme.slug> for deep-link preview
 *   - onCompare(theme) → opens a side-by-side comparison drawer (basic impl)
 *
 * Phase 2E (§20.4) — Added `?identity=<id>` query support.
 *   - If the query param resolves to one of the 5 wedding identities
 *     (royal-luxury / minimal-editorial / botanical-romance / cinematic-dark /
 *     modern-champagne), the page renders a preview of that identity using
 *     <IdentityHero /> with the identity's colors + demo data, plus a swatch
 *     panel + the section overrides in action.
 *   - Otherwise (no param or unknown value), the existing ThemeTheater renders
 *     unchanged (zero regression on the existing catalog experience).
 *
 * Note: `useSearchParams()` requires a Suspense boundary in Next.js App
 * Router (16+). We wrap the inner ShowcaseContent in <Suspense>.
 */

// ─── Demo data used by the identity preview ───────────────────────────────────
// Stand-in couple + venue + photos for the showcase preview. Phase 4A Preview
// Lab will replace this with real wedding data sourced from a demo tenant.

const DEMO_COUPLE = {
  coupleNames: 'Alexandre & Céleste',
  groomName: 'Alexandre',
  brideName: 'Céleste',
  weddingDate: 'Samedi 12 Septembre 2026',
  venue: 'Château de Lumière, Versailles',
  hashtag: '#AlexandreEtCéleste',
  welcomeMessage:
    "Nous serions ravis de vous accueillir pour célébrer notre amour au cœur d'un domaine d'exception.",
  backgroundImage: '/couple-hero.jpeg',
} as const

const DEMO_GALLERY_IMAGES = [
  { id: '1', src: '/uploads/couple-photo-1.jpeg', alt: 'Ensemble', caption: 'Ensemble' },
  { id: '2', src: '/uploads/couple-photo-2.jpeg', alt: 'Notre moment', caption: 'Notre moment' },
  { id: '3', src: '/photos/couple-bridge.jpeg', alt: 'Le pont', caption: 'Le pont' },
  { id: '4', src: '/photos/couple-bouquet.jpeg', alt: 'Le bouquet', caption: 'Le bouquet' },
  { id: '5', src: '/photos/couple-portrait.jpeg', alt: 'Portrait', caption: 'Portrait' },
  { id: '6', src: '/photos/couple-venue.jpeg', alt: 'Le lieu', caption: 'Le lieu' },
] as const

// ─── Inner content — consumes useSearchParams ────────────────────────────────

function ShowcaseContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [compareOpen, setCompareOpen] = useState(false)
  const [selectedTheme, setSelectedTheme] = useState<ThemePackage | null>(null)

  const identityParam = searchParams.get('identity')
  const hasValidIdentity =
    identityParam !== null && isWeddingIdentity(identityParam)
  const identityId = hasValidIdentity ? (identityParam as WeddingIdentity) : null
  const identity = identityId ? getIdentityPreset(identityId) : null

  const handleSelect = (theme: ThemePackage) => {
    setSelectedTheme(theme)
    router.push(`/showcase?theme=${encodeURIComponent(theme.slug)}`)
  }

  const handleCompare = (theme: ThemePackage) => {
    setSelectedTheme(theme)
    setCompareOpen(true)
  }

  // ─── Identity preview path (Phase 2E) ──────────────────────────────────────
  if (identity) {
    return <IdentityShowcasePreview identityId={identity.id} />
  }

  // ─── Default path — existing ThemeTheater (unchanged) ───────────────────────
  return (
    <main id="main" className="min-h-screen bg-[#0a0a0a]">
      <section className="relative min-h-[50vh] flex flex-col items-center justify-center px-4 text-center overflow-hidden">
        <div className="absolute inset-0 -z-10">
          <div className="absolute inset-0 bg-gradient-to-b from-[#0a0a0a] via-[#0f0f0f] to-[#0a0a0a]" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full bg-[#D4AF37]/5 blur-[100px]" />
        </div>
        <div className="max-w-3xl">
          <span className="inline-block px-4 py-1.5 rounded-full text-[10px] font-body tracking-[0.25em] uppercase text-[#D4AF37] bg-[#D4AF37]/10 border border-[#D4AF37]/20 mb-6">
            AENWS Showcase
          </span>
          <h1 className="font-display text-4xl sm:text-5xl md:text-6xl font-bold mb-4">
            <span className="gold-gradient">Douze mondes, douze identités</span>
          </h1>
          <p className="font-body text-sm sm:text-base text-white/50 max-w-xl mx-auto leading-relaxed">
            Chaque thème possède sa propre identité, son arrangement, ses composants et ses modèles.
          </p>
        </div>
      </section>
      <ThemeTheater onSelect={handleSelect} onCompare={handleCompare} />

      {/* Compare drawer (basic) */}
      {compareOpen && selectedTheme && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setCompareOpen(false)}>
          <div className="bg-card border border-gold/20 rounded-lg p-6 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <h2 className="font-display text-xl mb-2 text-foreground">Comparer le thème</h2>
            <p className="text-sm text-muted-foreground mb-4">
              Thème sélectionné : <strong className="text-gold">{selectedTheme.name}</strong>
              <span className="block text-xs mt-1 opacity-70">Slug : {selectedTheme.slug}</span>
            </p>
            <p className="text-xs text-muted-foreground mb-6">
              La comparaison côte-à-côte complète arrivera dans la Phase 2 (Preview Lab multi-thème).
              Pour l&apos;instant, cliquez sur « Aperçu » pour voir ce thème en contexte réel.
            </p>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => setCompareOpen(false)}>Fermer</Button>
              <Button size="sm" onClick={() => { handleSelect(selectedTheme); setCompareOpen(false) }}>Aperçu</Button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}

// ─── Identity preview component ───────────────────────────────────────────────

/**
 * Renders a lightweight preview of one wedding identity:
 *   - IdentityHero (dispatches to CinematicHero / EditorialHero / HeroSection)
 *   - IdentityGallery (dispatches to LuxuryGallery / PremiumGallery / ImmersiveGallery)
 *   - Swatch panel + section overrides list
 *
 * Full Preview Lab is Phase 4A.
 */
function IdentityShowcasePreview({ identityId }: { identityId: WeddingIdentity }) {
  const identity = getIdentityPreset(identityId)
  if (!identity) {
    return (
      <main className="min-h-screen bg-[#0a0a0a] flex items-center justify-center p-4">
        <div className="text-center max-w-md">
          <p className="text-sm text-white/60 mb-4">
            Identité introuvable : <code className="text-gold">{identityId}</code>
          </p>
          <Button asChild>
            <Link href="/showcase">Retour au showcase</Link>
          </Button>
        </div>
      </main>
    )
  }

  const theme = identityPresetToThemePreset(identity)

  return (
    <main
      id="main"
      className="min-h-screen"
      style={{
        backgroundColor: theme.surface ?? '#0a0a0a',
        color: theme.text ?? '#ffffff',
      }}
    >
      {/* ─── Top bar ──────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-30 backdrop-blur-md bg-black/40 border-b border-white/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between gap-4">
          <Link
            href="/showcase"
            className="flex items-center gap-1.5 text-xs text-white/60 hover:text-white transition-colors"
          >
            <ArrowLeft className="size-3.5" />
            Retour au showcase
          </Link>
          <div className="flex items-center gap-2">
            <Badge
              variant="outline"
              className="text-[10px] uppercase tracking-wide bg-gold/10 text-gold border-gold/30"
            >
              Identité
            </Badge>
            <span className="font-display text-sm text-white/90">{identity.label}</span>
          </div>
        </div>
      </header>

      {/* ─── IdentityHero preview ─────────────────────────────────────────── */}
      <IdentityHero
        identity={identity.id}
        coupleNames={DEMO_COUPLE.coupleNames}
        groomName={DEMO_COUPLE.groomName}
        brideName={DEMO_COUPLE.brideName}
        weddingDate={DEMO_COUPLE.weddingDate}
        venue={DEMO_COUPLE.venue}
        backgroundImage={DEMO_COUPLE.backgroundImage}
        hashtag={DEMO_COUPLE.hashtag}
        welcomeMessage={DEMO_COUPLE.welcomeMessage}
      />

      {/* ─── Identity preview details ─────────────────────────────────────── */}
      <section className="py-16 md:py-24 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto space-y-8">
          {/* ─── Identity description ───────────────────────────────────── */}
          <div className="text-center max-w-3xl mx-auto">
            <Badge
              variant="outline"
              className="text-[10px] uppercase tracking-wide bg-gold/10 text-gold border-gold/30 mb-3"
            >
              Phase 2E · Aperçu léger
            </Badge>
            <h2 className="font-display text-3xl sm:text-4xl font-bold mb-3 text-balance">
              <span className="gold-gradient">{identity.label}</span>
            </h2>
            <p className="text-sm sm:text-base text-white/60 leading-relaxed">
              {identity.description}
            </p>
            <p className="text-xs text-white/40 mt-4">
              Preview Lab complet (avec sauvegarde + multi-identités côte-à-côte) arrive en Phase 4A.
            </p>
          </div>

          {/* ─── Cards grid: Colors / Fonts / Pattern+Ambiance / Overrides ─ */}
          <div className="grid gap-4 md:grid-cols-2">
            <Card className="border-white/10 bg-white/[0.02]">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-sm font-display text-foreground">
                  <Palette className="size-4 text-gold" />
                  Couleurs
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <SwatchRow label="Primaire" value={theme.primaryColor} />
                <SwatchRow label="Accent" value={theme.accentColor} />
                <SwatchRow label="Surface" value={theme.surface ?? '—'} />
                <SwatchRow label="Surface profonde" value={theme.surfaceDeep ?? '—'} />
                <SwatchRow label="Texte" value={theme.text ?? '—'} />
              </CardContent>
            </Card>

            <Card className="border-white/10 bg-white/[0.02]">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-sm font-display text-foreground">
                  <Wand2 className="size-4 text-gold" />
                  Ton & Motion
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Ton de copie</span>
                  <Badge variant="outline" className="text-[10px] uppercase tracking-wide bg-violet-500/15 text-violet-300 border-violet-500/30">
                    {identity.copyTone}
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Motion tier</span>
                  <Badge variant="outline" className="text-[10px] uppercase tracking-wide bg-amber-500/15 text-amber-300 border-amber-500/30">
                    {identity.motionTier}
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Preset de base</span>
                  <span className="text-xs font-mono text-gold">{identity.basePresetSlug}</span>
                </div>
              </CardContent>
            </Card>

            <Card className="border-white/10 bg-white/[0.02]">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-sm font-display text-foreground">
                  <Sparkles className="size-4 text-gold" />
                  Motif & Ambiance
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Motif</p>
                  <p className="font-mono text-xs text-foreground/80 break-all">
                    {identity.pattern === 'none'
                      ? 'aucun'
                      : identity.pattern.slice(0, 80) + (identity.pattern.length > 80 ? '…' : '')}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Ambiance</p>
                  <p className="font-mono text-xs text-foreground/80 break-all">
                    {identity.ambiance.slice(0, 100)}{identity.ambiance.length > 100 ? '…' : ''}
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card className="border-white/10 bg-white/[0.02]">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-sm font-display text-foreground">
                  <Layers className="size-4 text-gold" />
                  Surcharges de sections
                </CardTitle>
                <CardDescription className="text-xs">
                  Composants premium à la place des composants par défaut.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {identity.sectionOverrides.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic">
                    Aucune surcharge — utilise les composants par défaut.
                  </p>
                ) : (
                  identity.sectionOverrides.map((override) => (
                    <div
                      key={`${override.sectionType}-${override.component}`}
                      className="flex items-center justify-between gap-2 rounded-md border border-white/10 bg-white/[0.02] px-3 py-2"
                    >
                      <span className="text-xs font-mono text-muted-foreground">
                        {override.sectionType}
                      </span>
                      <span className="text-xs text-gold font-semibold">
                        → {override.component}
                      </span>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>

          {/* ─── IdentityGallery preview (only if the identity has a gallery override) ─── */}
          {identity.sectionOverrides.some((o) => o.sectionType === 'gallery') && (
            <div className="pt-8">
              <IdentityGallery
                identity={identity.id}
                images={DEMO_GALLERY_IMAGES.map((img) => ({ ...img }))}
                columns={3}
                heading="Notre galerie"
                subheading="Aperçu de la galerie premium"
              />
            </div>
          )}

          {/* ─── Other identities quick-nav ──────────────────────────────── */}
          <div className="pt-12 border-t border-white/10">
            <h3 className="font-display text-sm uppercase tracking-wider text-white/40 mb-4 text-center">
              Autres identités
            </h3>
            <div className="flex flex-wrap justify-center gap-2">
              {IDENTITY_PRESETS.filter((p) => p.id !== identity.id).map((p) => (
                <Button
                  key={p.id}
                  asChild
                  size="sm"
                  variant="outline"
                  className="h-9 text-xs"
                >
                  <Link href={`/showcase?identity=${encodeURIComponent(p.id)}`}>
                    <Eye className="size-3.5 mr-1" />
                    {p.label}
                  </Link>
                </Button>
              ))}
            </div>
          </div>
        </div>
      </section>
    </main>
  )
}

/**
 * A single color row in the showcase preview — label + hex value + swatch.
 */
function SwatchRow({ label, value }: { label: string; value: string }) {
  const isHex = /^#[0-9A-Fa-f]{3,8}$/.test(value)
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="flex items-center gap-2">
        <span className="font-mono text-xs text-foreground/80">{value}</span>
        {isHex && (
          <span
            className="size-5 rounded-full border border-white/20"
            style={{ backgroundColor: value }}
            aria-hidden="true"
          />
        )}
      </div>
    </div>
  )
}

// ─── Page default export — wraps content in <Suspense> for useSearchParams ────

export default function ShowcasePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
          <div className="text-xs text-white/40">Chargement du showcase…</div>
        </div>
      }
    >
      <ShowcaseContent />
    </Suspense>
  )
}
