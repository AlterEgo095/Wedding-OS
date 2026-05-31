'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { Crown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import Navigation from '@/components/Navigation'
import HeroSection from '@/components/HeroSection'
import GuestSearch from '@/components/GuestSearch'
import CoupleGallery, { CoupleGallerySkeleton } from '@/components/CoupleGallery'
import EventTimeline, { EventTimelineSkeleton } from '@/components/EventTimeline'
import MapSection, { MapSectionSkeleton } from '@/components/MapSection'
import Footer from '@/components/Footer'
import MarketingSection from '@/components/MarketingSection'
import AENEWSBanner from '@/components/AENEWSBanner'
import AdminPanel from '@/components/admin/AdminPanel'

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
  order: number
}

interface VenueSettings {
  venue_name?: string
  venue_address?: string
  venue_lat?: string
  venue_lng?: string
  venue_parking?: string
  venue_time?: string
  [key: string]: string | undefined
}

function HomeContent() {
  const [adminOpen, setAdminOpen] = useState(false)
  const [stories, setStories] = useState<CoupleStory[]>([])
  const [timeline, setTimeline] = useState<TimelineEvent[]>([])
  const [settings, setSettings] = useState<VenueSettings | null>(null)
  const [loading, setLoading] = useState(true)

  const searchParams = useSearchParams()
  const codeParam = searchParams.get('code')

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
              // Already a key-value object from the API
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

  useEffect(() => {
    if (codeParam) {
      const searchSection = document.getElementById('recherche')
      if (searchSection) {
        setTimeout(() => {
          searchSection.scrollIntoView({ behavior: 'smooth' })
        }, 500)
      }
    }
  }, [codeParam])

  return (
    <div className="min-h-screen flex flex-col">
      <Navigation />

      <main className="flex-1">
        <HeroSection />

        {loading ? (
          <CoupleGallerySkeleton />
        ) : (
          <CoupleGallery stories={stories} />
        )}

        {loading ? (
          <EventTimelineSkeleton />
        ) : (
          <EventTimeline events={timeline} />
        )}

        {loading ? (
          <MapSectionSkeleton />
        ) : (
          <MapSection settings={settings} />
        )}

        <GuestSearch initialCode={codeParam || undefined} />

        <MarketingSection />
      </main>

      <AENEWSBanner />

      <div className="fixed bottom-6 right-6 z-40">
        <Button
          onClick={() => setAdminOpen(true)}
          className="bg-gradient-gold hover:opacity-90 text-white shadow-2xl shadow-gold/30 rounded-full w-14 h-14 p-0"
          aria-label="Panneau d'administration"
        >
          <Crown className="w-6 h-6" />
        </Button>
      </div>

      <Footer />

      <AdminPanel isOpen={adminOpen} onClose={() => setAdminOpen(false)} />
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
      <HomeContent />
    </Suspense>
  )
}
