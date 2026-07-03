'use client'

import { useState, useEffect, useCallback, Suspense, useRef } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import dynamic from 'next/dynamic'
import { motion, AnimatePresence } from 'framer-motion'
import { Crown, Heart, X, Sparkles, ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import Navigation from '@/components/Navigation'
import HeroSection from '@/components/HeroSection'
import PremiumGallery from '@/components/PremiumGallery'
import OurStory from '@/components/OurStory'
import EventTimeline, { EventTimelineSkeleton } from '@/components/EventTimeline'
import MapSection, { MapSectionSkeleton } from '@/components/MapSection'
import Footer from '@/components/Footer'
import { GuestAuthProvider, useGuestAuth } from '@/components/GuestAuthProvider'
import GuestAuthForm from '@/components/GuestAuthForm'
import GuestPersonalSpace from '@/components/GuestPersonalSpace'
import AENEWSBanner from '@/components/AENEWSBanner'
import { ThemeInjector } from '@/components/wedding/ThemeInjector'
import CollectionsShowcase from '@/components/collections/CollectionsShowcase'
import FeaturedShowcase from '@/components/FeaturedShowcase'
import type { HomeInitialData } from '@/lib/home-data'
import type { FeaturedStats } from '@/components/FeaturedShowcase'
import type { ReactNode } from 'react'

// ═══ P1-PERF: Dynamic imports for heavy/rarely-used components ═══
// These components are either (a) only needed for admin interactions,
// (b) purely visual effects, or (c) only relevant on mobile. Loading
// them lazily reduces the initial JS bundle by ~40-60 KB (gzipped)
// and improves Time to Interactive on the homepage.
const AdminPanel = dynamic(() => import('@/components/admin/AdminPanel'), {
  ssr: false,
  loading: () => null,
})
const LuxuryVisualEngine = dynamic(
  () => import('@/components/luxury/LuxuryVisualEngine'),
  { ssr: false, loading: () => null }
)
const PWAInstall = dynamic(() => import('@/components/PWAInstall'), {
  ssr: false,
  loading: () => null,
})
const VisualEffectsLayer = dynamic(
  () => import('@/components/effects/VisualEffectsLayer'),
  { ssr: false, loading: () => null }
)
const AmbientMusicPlayer = dynamic(
  () => import('@/components/AmbientMusicPlayer'),
  { ssr: false, loading: () => null }
)

interface CoupleStory {
  id: string
  title: string
  description: string
  date?: string | null
  imageUrl?: string | null
  order: number
}

interface TimelineEvent {
  id: string
  time: string
  activity: string
  location?: string | null
  description?: string | null
  icon?: string | null
  order: number
}

interface VenueSettings {
  venue_name?: string
  venue_address?: string
  venue_city?: string
  venue_lat?: string
  venue_lng?: string
  venue_parking?: string
  venue_time?: string
  groom_name?: string
  bride_name?: string
  site_subtitle?: string
  welcome_message?: string
  hashtag?: string
  venue_reference?: string
  [key: string]: string | undefined
}

interface HomeClientProps {
  initialData: HomeInitialData
  /** ExpertiseShowcase is a Server Component — passed as children from page.tsx */
  expertiseShowcase: ReactNode
}

function HomeContent({ initialData, expertiseShowcase }: HomeClientProps) {
  // ═══ P1-PERF: Use SSR initialData — no loading shimmer on first paint ═══
  // If initialData is null (SSR fetch failed), fall back to client-side fetch.
  const hasInitialData = !!(initialData.settings || initialData.stories || initialData.timeline)
  const [adminOpen, setAdminOpen] = useState(false)
  const [adminAccessible, setAdminAccessible] = useState(false)
  const [adminLoggedIn, setAdminLoggedIn] = useState(false)
  const [stories, setStories] = useState<CoupleStory[]>(
    (initialData.stories as CoupleStory[] | null) || []
  )
  const [timeline, setTimeline] = useState<TimelineEvent[]>(
    (initialData.timeline as TimelineEvent[] | null) || []
  )
  const [settings, setSettings] = useState<VenueSettings | null>(
    (initialData.settings as VenueSettings | null) || null
  )
  const [musicSettings, setMusicSettings] = useState<{
    file: string
    volume: number
    enabled: boolean
    url: string
  }>({
    file: '',
    volume: initialData.music?.volume ?? 0.25,
    enabled: initialData.music?.enabled ?? false,
    url: initialData.music?.url ?? '',
  })
  // Only show loading state if SSR data is missing (graceful fallback)
  const [loading, setLoading] = useState(!hasInitialData)
  const [fetchError, setFetchError] = useState<string | null>(null)

  // Floating "Demander mon mariage" CTA dismiss state
  const [ctaDismissed, setCtaDismissed] = useState(false)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      setCtaDismissed(localStorage.getItem('onboarding_cta_dismissed') === 'true')
    }
  }, [])
  const dismissCta = useCallback(() => {
    setCtaDismissed(true)
    if (typeof window !== 'undefined') {
      localStorage.setItem('onboarding_cta_dismissed', 'true')
    }
  }, [])

  // Long-press state
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const longPressTriggeredRef = useRef(false)

  // Rapid-tap state (5 taps)
  const tapCountRef = useRef(0)
  const tapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const searchParams = useSearchParams()
  const inviteParam = searchParams.get('invite')

  const { guest, authenticated, loading: authLoading, loginByLookupToken, loginWithLinkToken } =
    useGuestAuth()

  // Check if admin is already logged in on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      // P1-SEC: admin token is now in httpOnly cookie — check via /api/me
      fetch('/api/me', { credentials: 'include' })
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (data?.authenticated) {
            setAdminAccessible(true)
            setAdminLoggedIn(true)
          }
        })
        .catch(() => {})
    }
  }, [])

  // ═══ P1-PERF: Fallback fetch only if SSR data is missing ═══
  useEffect(() => {
    if (hasInitialData) return // SSR data already loaded — skip client fetch
    let cancelled = false
    async function fetchData() {
      try {
        const [storiesRes, timelineRes, settingsRes, musicRes] = await Promise.all([
          fetch('/api/couple-story'),
          fetch('/api/timeline'),
          fetch('/api/settings'),
          fetch('/api/music'),
        ])

        if (storiesRes.ok) {
          const data = await storiesRes.json()
          if (!cancelled) setStories(data.stories || data || [])
        }
        if (timelineRes.ok) {
          const data = await timelineRes.json()
          if (!cancelled) setTimeline(data.events || data || [])
        }
        if (settingsRes.ok) {
          const data = await settingsRes.json()
          if (!cancelled) {
            if (data.settings && typeof data.settings === 'object') {
              if (Array.isArray(data.settings)) {
                const obj: Record<string, string> = {}
                data.settings.forEach((s: { key: string; value: string }) => {
                  obj[s.key] = s.value
                })
                setSettings(obj as VenueSettings)
              } else {
                setSettings(data.settings as VenueSettings)
              }
            } else if (Array.isArray(data)) {
              const obj: Record<string, string> = {}
              data.forEach((s: { key: string; value: string }) => {
                obj[s.key] = s.value
              })
              setSettings(obj as VenueSettings)
            }
          }
        }
        if (musicRes.ok) {
          const musicData = await musicRes.json()
          if (!cancelled && musicData.music) {
            setMusicSettings({
              file: musicData.music.music_file || '',
              volume: parseFloat(musicData.music.music_volume) || 0.25,
              enabled: musicData.music.music_enabled === 'true',
              url: musicData.music_url || musicData.music.music_file || '',
            })
          }
        }
      } catch {
        if (!cancelled) {
          setFetchError(
            "Impossible de charger certaines informations du mariage. Veuillez rafraîchir la page."
          )
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    fetchData()
    return () => {
      cancelled = true
    }
  }, [hasInitialData])

  // Handle admin close
  const handleAdminClose = useCallback(() => {
    setAdminOpen(false)
    if (!adminLoggedIn) {
      setAdminAccessible(false)
    }
  }, [adminLoggedIn])

  const handleAdminStateChange = useCallback((isLoggedIn: boolean) => {
    setAdminLoggedIn(isLoggedIn)
    if (isLoggedIn) {
      setAdminAccessible(true)
    }
  }, [])

  // Long-press handlers (3 seconds)
  const startLongPress = useCallback(() => {
    longPressTriggeredRef.current = false
    longPressTimerRef.current = setTimeout(() => {
      longPressTriggeredRef.current = true
      setAdminAccessible(true)
    }, 3000)
  }, [])

  const cancelLongPress = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current)
      longPressTimerRef.current = null
    }
  }, [])

  const handleRapidTap = useCallback(() => {
    tapCountRef.current += 1
    if (tapTimerRef.current) {
      clearTimeout(tapTimerRef.current)
    }
    if (tapCountRef.current >= 5) {
      setAdminAccessible(true)
      tapCountRef.current = 0
      return
    }
    tapTimerRef.current = setTimeout(() => {
      tapCountRef.current = 0
    }, 2000)
  }, [])

  const handlePointerDown = useCallback(() => {
    startLongPress()
  }, [startLongPress])

  const handlePointerUp = useCallback(() => {
    cancelLongPress()
    if (!longPressTriggeredRef.current) {
      handleRapidTap()
    }
  }, [cancelLongPress, handleRapidTap])

  const handlePointerLeave = useCallback(() => {
    cancelLongPress()
  }, [cancelLongPress])

  const shouldHideGuestSpace = adminOpen && adminLoggedIn

  // Auto-login with encrypted invite link token
  useEffect(() => {
    if (inviteParam && !authenticated && !authLoading) {
      loginWithLinkToken(inviteParam)
    }
  }, [inviteParam, authenticated, authLoading, loginWithLinkToken])

  // Regular landing page content
  const regularContent = (
    <>
      {fetchError ? (
        <div role="alert" aria-live="polite" className="mx-auto max-w-3xl mt-4 px-4">
          <div className="rounded-md border border-amber-300/50 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-700/50 p-3 text-sm text-amber-900 dark:text-amber-200 flex items-center justify-between gap-3">
            <span>{fetchError}</span>
            <button
              type="button"
              onClick={() => setFetchError(null)}
              aria-label="Fermer"
              className="text-amber-700 dark:text-amber-300 hover:underline min-h-[44px] min-w-[44px] px-2"
            >
              ✕
            </button>
          </div>
        </div>
      ) : null}

      {/* Our Story Timeline */}
      {!loading && stories.length === 0 ? (
        <section
          id="notre-histoire"
          className="py-20 md:py-28 text-center"
          aria-label="Notre histoire — aucune histoire à raconter"
        >
          <div className="max-w-xl mx-auto px-4">
            <Sparkles className="mx-auto mb-4 size-6 text-muted-foreground/60" aria-hidden="true" />
            <p className="font-serif text-xl text-muted-foreground mb-1">
              Aucune histoire à raconter pour le moment
            </p>
            <p className="font-display text-sm text-muted-foreground/70">
              Le couple n&apos;a pas encore partagé les chapitres de son histoire.
            </p>
          </div>
        </section>
      ) : (
        <OurStory stories={stories} />
      )}

      {/* Premium Gallery */}
      <PremiumGallery />

      {/* Event Timeline */}
      {loading ? <EventTimelineSkeleton /> : <EventTimeline events={timeline} />}

      {/* Map */}
      {loading ? <MapSectionSkeleton /> : <MapSection settings={settings} />}

      {/* Auth form — Name search with premium styling */}
      <GuestAuthForm
        onLoginByLookupToken={loginByLookupToken}
        onLoginWithLinkToken={loginWithLinkToken}
        initialInviteToken={inviteParam || undefined}
      />

      {/* ═══ P1-DESIGN: FeaturedShowcase — Josué & Hornella as living demo ═══ */}
      <FeaturedShowcase stats={initialData.featuredStats as FeaturedStats | null} />

      {/* ═══ P1-DESIGN: ExpertiseShowcase — platform capabilities ═══ */}
      {expertiseShowcase}

      {/* AENEWS Premium Banner */}
      <AENEWSBanner variant="homepage" />

      {/* Premium Collections Showcase — Phase 6 */}
      <CollectionsShowcase />
    </>
  )

  return (
    <div className="min-h-screen flex flex-col">
      {/* Global visual effects layer — lazy loaded */}
      <VisualEffectsLayer />

      {/* Luxury cinematic ambiance engine — lazy loaded */}
      <LuxuryVisualEngine />

      {/* Theme injector — applies wedding colors + fonts */}
      <ThemeInjector />

      <Navigation />

      <main className="flex-1">
        {/* ─── Hero: Always visible ─── */}
        <HeroSection />

        {authLoading ? (
          <div className="flex items-center justify-center py-32">
            <div className="shimmer w-full max-w-2xl h-64 rounded-2xl mx-4" />
          </div>
        ) : authenticated && guest && !shouldHideGuestSpace ? (
          <>
            <GuestPersonalSpace
              guest={guest}
              settings={settings || {}}
              onLogout={async () => {
                await fetch('/api/guest/logout', { method: 'POST' })
                window.location.href = '/'
              }}
            />
            {/* ═══ P1-DESIGN: Marketing sections shown to ALL visitors ═══ */}
            <FeaturedShowcase stats={initialData.featuredStats as FeaturedStats | null} />
            {expertiseShowcase}
            <CollectionsShowcase />
            <AENEWSBanner variant="invitation" />
          </>
        ) : (
          regularContent
        )}

        {/* ─── Onboarding CTA section — "Vous vous mariez aussi ?" ─── */}
        <motion.section
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.2 }}
          transition={{ duration: 0.7, ease: [0.25, 0.46, 0.45, 0.94] }}
          aria-label="Demande de mariage sur mesure"
          className="relative py-16 md:py-24 px-4 sm:px-6 lg:px-8 overflow-hidden"
        >
          <div className="absolute inset-0 -z-10 bg-gradient-to-br from-[oklch(0.18_0.04_290)] via-[oklch(0.22_0.06_270)] to-[oklch(0.16_0.03_300)]" />
          <div className="absolute inset-0 -z-10 bg-gradient-to-t from-background via-background/30 to-transparent" />
          <div className="absolute -top-16 -left-16 w-72 h-72 rounded-full bg-gold/10 blur-3xl -z-10" />
          <div className="absolute -bottom-16 -right-16 w-80 h-80 rounded-full bg-rose-gold/10 blur-3xl -z-10" />

          <div className="max-w-3xl mx-auto text-center">
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: 0.1 }}
              className="flex justify-center mb-5"
            >
              <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/5 backdrop-blur-sm border border-gold/30 text-gold-light text-xs sm:text-sm font-display tracking-wide">
                <Sparkles className="size-3.5" />
                Heureux Mariage
              </span>
            </motion.div>

            <motion.h2
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.7, delay: 0.15 }}
              className="font-serif text-3xl sm:text-4xl md:text-5xl font-bold leading-tight"
            >
              <span className="gold-gradient">Vous vous mariez aussi ?</span>
            </motion.h2>

            <motion.p
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.7, delay: 0.25 }}
              className="mt-4 text-white/75 font-display text-sm sm:text-base md:text-lg max-w-xl mx-auto"
            >
              Créez votre propre mariage digital en quelques minutes. Un
              conseiller vous contacte sur WhatsApp sous 24h pour finaliser
              votre offre sur mesure.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.7, delay: 0.35 }}
              className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3"
            >
              <Button
                asChild
                size="lg"
                className="btn-premium bg-gradient-gold text-white shadow-2xl shadow-gold/30 hover:shadow-gold/50 px-7 py-6 text-base w-full sm:w-auto rounded-full"
              >
                <Link href="/onboarding">
                  <Heart className="size-4" />
                  Demander mon mariage
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
              <Link
                href="/onboarding"
                className="text-white/70 hover:text-white text-sm font-display tracking-wide underline-offset-4 hover:underline transition-colors px-2"
              >
                Voir les offres →
              </Link>
            </motion.div>
          </div>
        </motion.section>
      </main>

      <Footer />

      {/* Hidden admin trigger zone */}
      {!adminAccessible && (
        <div
          className="fixed bottom-6 right-6 z-40 w-6 h-6 cursor-default select-none"
          onMouseDown={handlePointerDown}
          onMouseUp={handlePointerUp}
          onMouseLeave={handlePointerLeave}
          onTouchStart={handlePointerDown}
          onTouchEnd={handlePointerUp}
          onTouchCancel={handlePointerLeave}
          role="button"
          aria-label="Zone d'administration cachée"
          tabIndex={0}
        >
          <div className="w-1.5 h-1.5 rounded-full bg-foreground/[0.08] absolute bottom-0 right-0" />
        </div>
      )}

      {/* Floating admin button */}
      {adminAccessible && (
        <div className="fixed bottom-6 right-6 z-40">
          <Button
            onClick={() => setAdminOpen(true)}
            className="bg-gradient-gold hover:opacity-90 text-white shadow-2xl shadow-gold/30 rounded-full w-14 h-14 p-0"
            aria-label="Panneau d'administration"
          >
            <Crown className="w-6 h-6" />
          </Button>
        </div>
      )}

      {/* Floating CTA */}
      <AnimatePresence>
        {!adminAccessible && !ctaDismissed && (
          <motion.div
            initial={{ opacity: 0, x: 40, y: 0 }}
            animate={{ opacity: 1, x: 0, y: 0 }}
            exit={{ opacity: 0, x: 40 }}
            transition={{ duration: 0.4, ease: 'easeOut', delay: 0.6 }}
            className="fixed bottom-6 right-6 z-30"
          >
            <div className="relative flex items-center">
              <Link
                href="/onboarding"
                aria-label="Demander mon mariage — page d'inscription"
                className="btn-premium group inline-flex items-center gap-2 bg-gradient-gold text-white shadow-xl shadow-gold/25 hover:shadow-gold/40 rounded-full pl-5 pr-4 py-3 text-sm font-display tracking-wide transition-all hover:-translate-y-0.5"
              >
                <Heart className="size-4 fill-white/80" />
                <span className="hidden sm:inline">Demander mon mariage</span>
                <span className="sm:hidden">Mon mariage</span>
                <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
              <button
                type="button"
                onClick={dismissCta}
                aria-label="Masquer ce bouton"
                className="absolute -top-2 -left-2 w-5 h-5 rounded-full bg-background border border-gold/40 text-gold hover:bg-gold/10 flex items-center justify-center transition-colors shadow-sm"
              >
                <X className="size-3" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Ambient Music Player — lazy loaded */}
      <AmbientMusicPlayer
        musicFile={musicSettings.url || musicSettings.file}
        defaultVolume={musicSettings.volume}
        enabled={musicSettings.enabled}
      />

      {/* PWA Install — lazy loaded */}
      <PWAInstall />

      {/* Admin Panel — lazy loaded */}
      <AdminPanel
        isOpen={adminOpen}
        onClose={handleAdminClose}
        onAdminStateChange={handleAdminStateChange}
      />
    </div>
  )
}

export default function HomeClient({ initialData, expertiseShowcase }: HomeClientProps) {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <div className="shimmer w-full h-full fixed inset-0" />
        </div>
      }
    >
      <GuestAuthProvider>
        <HomeContent initialData={initialData} expertiseShowcase={expertiseShowcase} />
      </GuestAuthProvider>
    </Suspense>
  )
}
