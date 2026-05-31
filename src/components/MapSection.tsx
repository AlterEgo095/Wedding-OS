'use client'

import { useRef } from 'react'
import { motion, useInView } from 'framer-motion'
import { MapPin, Navigation, Car, Clock, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

interface VenueSettings {
  venue_name?: string
  venue_address?: string
  venue_lat?: string
  venue_lng?: string
  venue_parking?: string
  venue_time?: string
  [key: string]: string | undefined
}

export default function MapSection({ settings }: { settings: VenueSettings | null }) {
  const sectionRef = useRef<HTMLDivElement>(null)
  const isInView = useInView(sectionRef, { once: true, margin: '-100px' })

  const venueName = settings?.venue_name || 'Salle Polyvalente – Grand Palais Kinshasa'
  const venueAddress = settings?.venue_address || '21 / 22 Avenue Bobozo'
  const lat = settings?.venue_lat || '-4.3250'
  const lng = settings?.venue_lng || '15.3222'
  const parking = settings?.venue_parking || 'Parking disponible sur place'
  const venueTime = settings?.venue_time || '21H30'

  const googleMapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`
  const osmEmbedUrl = `https://www.openstreetmap.org/export/embed.html?bbox=${parseFloat(lng) - 0.005}%2C${parseFloat(lat) - 0.003}%2C${parseFloat(lng) + 0.005}%2C${parseFloat(lat) + 0.003}&layer=mapnik&marker=${lat}%2C${lng}`

  return (
    <section id="lieu" ref={sectionRef} className="py-20 md:py-32 bg-gradient-warm relative">
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-gold/20 to-transparent" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Title */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.8 }}
          className="text-center mb-16"
        >
          <h2 className="font-serif text-3xl md:text-5xl font-bold mb-4">
            <span className="gold-gradient">Le Lieu</span>
          </h2>
          <p className="font-display text-lg text-muted-foreground max-w-xl mx-auto">
            Là où tout commence
          </p>
          <div className="section-divider max-w-xs mx-auto mt-6">
            <MapPin className="size-4 text-gold/40" />
          </div>
        </motion.div>

        <div className="grid md:grid-cols-2 gap-8 max-w-5xl mx-auto">
          {/* Info Card */}
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            animate={isInView ? { opacity: 1, x: 0 } : {}}
            transition={{ duration: 0.8, delay: 0.2 }}
          >
            <div className="glass-card gold-border p-8 rounded-2xl h-full flex flex-col justify-center">
              {/* Venue Name */}
              <h3 className="font-serif text-2xl md:text-3xl font-bold mb-3 gold-gradient">
                {venueName}
              </h3>

              {/* Address */}
              <div className="flex items-start gap-3 mb-4">
                <MapPin className="size-5 text-gold shrink-0 mt-0.5" />
                <p className="font-display text-foreground/80 leading-relaxed">
                  {venueAddress}
                </p>
              </div>

              {/* Reference */}
              {(settings as Record<string, string>)?.venue_reference && (
                <div className="flex items-start gap-3 mb-6 ml-8">
                  <p className="font-display text-sm text-muted-foreground leading-relaxed italic">
                    {(settings as Record<string, string>).venue_reference}
                  </p>
                </div>
              )}

              {/* Time */}
              <div className="flex items-center gap-3 mb-6">
                <Clock className="size-5 text-gold shrink-0" />
                <p className="font-display text-foreground/80">
                  {venueTime}
                </p>
              </div>

              {/* Parking */}
              <div className="flex items-start gap-3 mb-8">
                <Car className="size-5 text-gold shrink-0 mt-0.5" />
                <p className="font-display text-foreground/80 leading-relaxed">
                  {parking}
                </p>
              </div>

              {/* Navigation Button */}
              <Button
                asChild
                className="bg-gradient-gold text-white hover:opacity-90 shadow-lg shadow-gold/20 font-display tracking-wide"
              >
                <a href={googleMapsUrl} target="_blank" rel="noopener noreferrer">
                  <Navigation className="size-4" />
                  Itinéraire
                  <ExternalLink className="size-3 opacity-60" />
                </a>
              </Button>
            </div>
          </motion.div>

          {/* Map Card */}
          <motion.div
            initial={{ opacity: 0, x: 30 }}
            animate={isInView ? { opacity: 1, x: 0 } : {}}
            transition={{ duration: 0.8, delay: 0.3 }}
          >
            <div className="glass-card gold-border rounded-2xl overflow-hidden h-full min-h-[400px]">
              <iframe
                src={osmEmbedUrl}
                className="w-full h-full min-h-[400px] border-0"
                loading="lazy"
                title="Carte du lieu de réception"
                allowFullScreen
              />
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  )
}

export function MapSectionSkeleton() {
  return (
    <section className="py-20 md:py-32 bg-gradient-warm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <Skeleton className="h-10 w-48 mx-auto mb-4" />
          <Skeleton className="h-5 w-36 mx-auto" />
        </div>
        <div className="grid md:grid-cols-2 gap-8 max-w-5xl mx-auto">
          <div className="glass-card p-8 rounded-2xl">
            <Skeleton className="h-8 w-48 mb-4" />
            <Skeleton className="h-4 w-full mb-3" />
            <Skeleton className="h-4 w-3/4 mb-3" />
            <Skeleton className="h-4 w-1/2 mb-6" />
            <Skeleton className="h-10 w-40" />
          </div>
          <Skeleton className="rounded-2xl min-h-[400px]" />
        </div>
      </div>
    </section>
  )
}
