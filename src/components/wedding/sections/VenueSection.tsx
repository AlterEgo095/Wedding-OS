// ══════════════════════════════════════════════════════════════════════════════
// src/components/wedding/sections/VenueSection.tsx
// Phase 1E (MISSION 5.9.0) — Lightweight venue details (address-only).
// ══════════════════════════════════════════════════════════════════════════════
//
// Narrative beat #7 — VENUE. A "lightweight" variant of MapSection for
// couples who want the address card without the OSM/Google Maps iframe
// (e.g. private residences, surprise venues, low-data wedding venues).
//
// Reads the same Settings keys as MapSection so swapping map↔venue in the
// manifest editor is lossless — no Settings duplicate to maintain.
//
// Settings consumed:
//   - venue_name, venue_address, venue_city, venue_reference
//   - venue_parking, venue_time
//
// Multi-tenant safety: ALL fields default to empty so an unconfigured
// wedding renders a graceful empty state instead of leaking the default
// wedding's venue ("Salle Polyvalente – Grand Palais Kinshasa").
// ══════════════════════════════════════════════════════════════════════════════

'use client';

import { useRef } from 'react';
import { motion, useInView, useReducedMotion } from 'framer-motion'
import type { Easing } from 'framer-motion';
import { MapPin, Clock, Car, Navigation, Building2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useMotionTier } from '@/lib/motion/useMotionTier';

/** Settings shape — mirror of SectionRendererData.settings / VenueSettings. */
export interface VenueSectionSettings {
  venue_name?: string;
  venue_address?: string;
  venue_city?: string;
  venue_reference?: string;
  venue_lat?: string;
  venue_lng?: string;
  venue_parking?: string;
  venue_time?: string;
  [key: string]: string | undefined;
}

export interface VenueSectionProps {
  settings: VenueSectionSettings | null;
  /** Reserved for future loading skeletons (kept for interface symmetry). */
  loading?: boolean;
}

export default function VenueSection({ settings }: VenueSectionProps) {
  const sectionRef = useRef<HTMLElement>(null);
  const isInView = useInView(sectionRef, { once: true, margin: '-80px' });
  const prefersReducedMotion = useReducedMotion();
  const { config: motionCfg, reduced: motionTierReduced, tier } = useMotionTier();
  // Static path: render plain divs (no motion). Layout/className/children are
  // identical — only the animation layer is removed. `prefersReducedMotion`
  // is preserved for backward compatibility with the existing fadeUp logic.
  const isStatic = motionTierReduced || tier === 'none' || !!prefersReducedMotion;

  const venueName = settings?.venue_name || '';
  const venueAddress = settings?.venue_address || '';
  const venueCity = settings?.venue_city || '';
  const venueReference = settings?.venue_reference || '';
  const venueTime = settings?.venue_time || '';
  const parking = settings?.venue_parking || '';
  const lat = settings?.venue_lat || '';
  const lng = settings?.venue_lng || '';

  const hasAny = Boolean(
    venueName || venueAddress || venueCity || venueTime || parking,
  );

  // Empty state — no venue configured. Mirrors the pattern used by the
  // `story` section's empty state in SectionRenderer.
  if (!hasAny) {
    return (
      <section
        ref={sectionRef}
        id="venue"
        className="py-20 md:py-28 text-center"
        aria-label="Le lieu — informations à venir"
      >
        <div className="max-w-xl mx-auto px-4">
          <span
            className="block mb-4 text-2xl text-muted-foreground/60"
            aria-hidden="true"
          >
            ✦
          </span>
          <p className="font-serif text-xl text-muted-foreground mb-1">
            Le lieu sera bientôt communiqué
          </p>
          <p className="font-display text-sm text-muted-foreground/70">
            Les organisateurs n&apos;ont pas encore partagé l&apos;adresse de
            la cérémonie.
          </p>
        </div>
      </section>
    );
  }

  // Build a Google Maps directions link only when coordinates exist.
  const directionsUrl =
    lat && lng
      ? `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`
      : venueAddress || venueCity
        ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
            [venueName, venueAddress, venueCity].filter(Boolean).join(', '),
          )}`
        : null;

  const fadeUp = isStatic
    ? { initial: { opacity: 1 }, animate: { opacity: 1 } }
    : {
        initial: { opacity: 0, y: 30 },
        animate: isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 30 },
      };

  return (
    <section
      ref={sectionRef}
      id="venue"
      className="py-20 md:py-32 bg-gradient-warm relative overflow-hidden"
      aria-labelledby="venue-title"
    >
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-gold/20 to-transparent" />

      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          {...fadeUp}
          transition={{ duration: motionCfg.duration, ease: motionCfg.ease as Easing }}
          className="text-center mb-12"
        >
          <h2 id="venue-title" className="font-serif text-3xl md:text-5xl font-bold mb-4">
            <span className="gold-gradient">Le Lieu</span>
          </h2>
          <p className="font-display text-lg text-muted-foreground max-w-xl mx-auto">
            Là où tout commence
          </p>
          <div className="section-divider max-w-xs mx-auto mt-6">
            <MapPin className="size-4 text-gold/40" />
          </div>
        </motion.div>

        {/* Venue card */}
        <motion.div
          {...fadeUp}
          transition={{ duration: motionCfg.duration, ease: motionCfg.ease as Easing, delay: 0.2 }}
        >
          <div className="glass-card gold-border rounded-2xl p-8 md:p-10">
            {venueName && (
              <div className="flex items-center gap-3 mb-6">
                <div className="shrink-0 w-11 h-11 rounded-full bg-gradient-to-br from-gold/15 to-rose-gold/10 flex items-center justify-center">
                  <Building2 className="size-5 text-gold" />
                </div>
                <h3 className="font-serif text-2xl md:text-3xl font-bold gold-gradient">
                  {venueName}
                </h3>
              </div>
            )}

            <div className="space-y-5">
              {/* Address + city */}
              {(venueAddress || venueCity) && (
                <div className="flex items-start gap-3">
                  <MapPin
                    className="size-5 text-gold shrink-0 mt-0.5"
                    aria-hidden="true"
                  />
                  <div className="font-display text-foreground/85 leading-relaxed">
                    {venueAddress && <p>{venueAddress}</p>}
                    {venueCity && (
                      <p className="text-muted-foreground text-sm mt-0.5">
                        {venueCity}
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Reference (landmark hint) */}
              {venueReference && (
                <p className="font-display text-sm text-muted-foreground/80 italic leading-relaxed pl-8">
                  {venueReference}
                </p>
              )}

              {/* Time */}
              {venueTime && (
                <div className="flex items-center gap-3">
                  <Clock
                    className="size-5 text-gold shrink-0"
                    aria-hidden="true"
                  />
                  <p className="font-display text-foreground/85">{venueTime}</p>
                </div>
              )}

              {/* Parking */}
              {parking && (
                <div className="flex items-start gap-3">
                  <Car
                    className="size-5 text-gold shrink-0 mt-0.5"
                    aria-hidden="true"
                  />
                  <p className="font-display text-foreground/85 leading-relaxed">
                    {parking}
                  </p>
                </div>
              )}

              {/* Optional directions CTA */}
              {directionsUrl && (
                <div className="pt-4">
                  <Button
                    asChild
                    className="bg-gradient-gold text-white hover:opacity-90 shadow-lg shadow-gold/20 font-display tracking-wide"
                  >
                    <a
                      href={directionsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <Navigation className="size-4" />
                      Itinéraire
                    </a>
                  </Button>
                </div>
              )}
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}