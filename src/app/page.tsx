'use client'

import { useState, useEffect, useCallback, Suspense, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import { Crown } from 'lucide-react'
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
  const [loading, setLoading] = useState(true)

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
        const [storiesRes, timelineRes, settingsRes] = await Promise.all([
          fetch('/api/couple-story'),
          fetch('/api/timeline'),
          fetch('/api/settings'),
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
    </>
  )

  return (
    <div className="min-h-screen flex flex-col">
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
