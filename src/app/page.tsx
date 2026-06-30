'use client'

import { useState, useEffect, useCallback, Suspense, useRef } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
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
import AdminPanel from '@/components/admin/AdminPanel'
import PWAInstall from '@/components/PWAInstall'
import { GuestAuthProvider, useGuestAuth } from '@/components/GuestAuthProvider'
import GuestAuthForm from '@/components/GuestAuthForm'
import GuestPersonalSpace from '@/components/GuestPersonalSpace'
import AENEWSBanner from '@/components/AENEWSBanner'
import AmbientMusicPlayer from '@/components/AmbientMusicPlayer'
import VisualEffectsLayer from '@/components/effects/VisualEffectsLayer'
import LuxuryVisualEngine from '@/components/luxury/LuxuryVisualEngine'
import { ThemeInjector } from '@/components/wedding/ThemeInjector'
import CollectionsShowcase from '@/components/collections/CollectionsShowcase'

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

function HomeContent() {
  const [adminOpen, setAdminOpen] = useState(false)
  const [adminAccessible, setAdminAccessible] = useState(false)
  const [adminLoggedIn, setAdminLoggedIn] = useState(false)
  const [stories, setStories] = useState<CoupleStory[]>([])
  const [timeline, setTimeline] = useState<TimelineEvent[]>([])
  const [settings, setSettings] = useState<VenueSettings | null>(null)
  const [musicSettings, setMusicSettings] = useState<{ file: string; volume: number; enabled: boolean; url: string }>({ file: '', volume: 0.25, enabled: false, url: '' })
  const [loading, setLoading] = useState(true)

  // Floating "Demander mon mariage" CTA dismiss state (persisted across reloads)
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

  const { guest, authenticated, loading: authLoading, loginByLookupToken, loginWithLinkToken } = useGuestAuth()

  // Check if admin is already logged in on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const hasAdminToken = !!localStorage.getItem('admin_token')
      if (hasAdminToken) {
        setAdminAccessible(true)
        setAdminLoggedIn(true)
      }
    }
  }, [])

  // Handle admin close: reset adminAccessible if not logged in
  const handleAdminClose = useCallback(() => {
    setAdminOpen(false)
    if (!adminLoggedIn) {
      setAdminAccessible(false)
    }
  }, [adminLoggedIn])

  // Handle admin state change from AdminPanel
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

  // Rapid tap handler (5 taps within 2 seconds)
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

  // Combined touch/mouse event handlers for the trigger zone
  const handlePointerDown = useCallback(() => {
    startLongPress()
  }, [startLongPress])

  const handlePointerUp = useCallback(() => {
    cancelLongPress()
    // If long press didn't trigger, count as a rapid tap
    if (!longPressTriggeredRef.current) {
      handleRapidTap()
    }
  }, [cancelLongPress, handleRapidTap])

  const handlePointerLeave = useCallback(() => {
    cancelLongPress()
  }, [cancelLongPress])

  // Determine if guest personal space should be hidden
  // When admin panel is open and user has admin_token, don't show guest personal space
  const shouldHideGuestSpace = adminOpen && adminLoggedIn

  useEffect(() => {
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
          setStories(data.stories || data || [])
        }
        if (timelineRes.ok) {
          const data = await timelineRes.json()
          setTimeline(data.events || data || [])
        }
        if (settingsRes.ok) {
          const data = await settingsRes.json()
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
        // Fetch music settings
        if (musicRes.ok) {
          const musicData = await musicRes.json()
          if (musicData.music) {
            setMusicSettings({
              file: musicData.music.music_file || '',
              volume: parseFloat(musicData.music.music_volume) || 0.25,
              enabled: musicData.music.music_enabled === 'true',
              url: musicData.music_url || musicData.music.music_file || '',
            })
          }
        }
      } catch (error) {
        console.error('Error fetching data:', error)
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [])

  // Auto-login with encrypted invite link token
  useEffect(() => {
    if (inviteParam && !authenticated && !authLoading) {
      loginWithLinkToken(inviteParam)
    }
  }, [inviteParam, authenticated, authLoading, loginWithLinkToken])

  // Regular landing page content (shown when not authenticated or admin is viewing)
  const regularContent = (
    <>
      {/* Our Story Timeline */}
      <OurStory stories={stories} />

      {/* Premium Gallery */}
      <PremiumGallery />

      {/* Event Timeline */}
      {loading ? (
        <EventTimelineSkeleton />
      ) : (
        <EventTimeline events={timeline} />
      )}

      {/* Map */}
      {loading ? (
        <MapSectionSkeleton />
      ) : (
        <MapSection settings={settings} />
      )}

      {/* Auth form — Name search with premium styling */}
      <GuestAuthForm
        onLoginByLookupToken={loginByLookupToken}
        onLoginWithLinkToken={loginWithLinkToken}
        initialInviteToken={inviteParam || undefined}
      />

      {/* AENEWS Premium Banner */}
      <AENEWSBanner variant="homepage" />

      {/* Premium Collections Showcase — Phase 6 */}
      <CollectionsShowcase />
    </>
  )

  return (
    <div className="min-h-screen flex flex-col">
      {/* Global visual effects layer — sparkles, particles, bokeh */}
      <VisualEffectsLayer />

      {/* Luxury cinematic ambiance engine — independent layer */}
      <LuxuryVisualEngine />

      {/* Phase 8: Theme injector — applies wedding colors + fonts */}
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
          /* ─── AUTHENTICATED: Show personal space with envelope reveal ─── */
          <>
            <GuestPersonalSpace
              guest={guest}
              settings={settings || {}}
              onLogout={async () => {
                await fetch('/api/guest/logout', { method: 'POST' })
                window.location.href = '/'
              }}
            />
            <AENEWSBanner variant="invitation" />
          </>
        ) : (
          /* ─── NOT AUTHENTICATED / ADMIN VIEWING: Full premium experience ─── */
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
          {/* Dark romantic backdrop with golden halos */}
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

      {/* Hidden admin trigger zone — tiny dot in bottom-right corner */}
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
          {/* Nearly invisible dot — only visible on very close inspection */}
          <div className="w-1.5 h-1.5 rounded-full bg-foreground/[0.08] absolute bottom-0 right-0" />
        </div>
      )}

      {/* Floating admin button — only visible when admin is accessible */}
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

      {/* Floating "Demander mon mariage" CTA — bottom-right, dismissible.
          Renders only when (a) admin is NOT accessible (so it never overlaps
          the Crown admin button), and (b) the user hasn't dismissed it.
          z-30 sits below the admin trigger zone (z-40) so the invisible
          long-press dot at the very corner still receives pointer events. */}
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

      {/* Ambient Music Player */}
      <AmbientMusicPlayer
        musicFile={musicSettings.url || musicSettings.file}
        defaultVolume={musicSettings.volume}
        enabled={musicSettings.enabled}
      />

      <PWAInstall />
      <AdminPanel
        isOpen={adminOpen}
        onClose={handleAdminClose}
        onAdminStateChange={handleAdminStateChange}
      />
    </div>
  )
}

export default function Home() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <div className="shimmer w-full h-full fixed inset-0" />
      </div>
    }>
      <GuestAuthProvider>
        <HomeContent />
      </GuestAuthProvider>
    </Suspense>
  )
}
