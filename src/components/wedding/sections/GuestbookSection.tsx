// ══════════════════════════════════════════════════════════════════════════════
// src/components/wedding/sections/GuestbookSection.tsx
// Phase 1E (MISSION 5.9.0) — Manifest-registered wrapper for GuestbookWidget.
// ══════════════════════════════════════════════════════════════════════════════
//
// Narrative beat #12 — GUESTBOOK. The existing GuestbookWidget (P4.1) is
// currently rendered as a fixed appendage in /w/[slug]/page.tsx. This
// wrapper makes it positionable in the manifest flow, so designers can:
//   - place the guestbook BEFORE the CTA (canonical position)
//   - move it after the gallery for casual weddings
//   - hide it entirely for private weddings (set enabled: false)
//
// Backward compatibility: /w/[slug]/page.tsx STILL renders GuestbookWidget
// directly after the section list, so existing weddings keep their current
// behaviour. If a designer enables this section AND leaves the page-level
// appendage in place, the guestbook simply appears twice (intentional —
// designers who enable this section are expected to remove the page-level
// appendage in a future cleanup pass). No silent behaviour change.
//
// The wrapper is intentionally thin: it looks up the wedding id + slug from
// the WeddingContext (so the GuestbookWidget can call /api/weddings/{id}/guestbook)
// and renders the widget inside a section wrapper. All the entry list,
// submission form, pagination, and styling logic stays in GuestbookWidget.
// ══════════════════════════════════════════════════════════════════════════════

'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { BookOpen } from 'lucide-react';

import { GuestbookWidget } from '@/components/GuestbookWidget';
import { useWedding } from '@/app/w/[slug]/wedding-context';

export default function GuestbookSection() {
  const prefersReducedMotion = useReducedMotion();
  const wedding = useWedding();

  return (
    <motion.section
      id="guestbook-section"
      initial={prefersReducedMotion ? { opacity: 1 } : { opacity: 0, y: 30 }}
      whileInView={prefersReducedMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={{ duration: 0.8 }}
      className="py-20 md:py-32 bg-gradient-warm relative overflow-hidden"
      aria-labelledby="guestbook-section-title"
    >
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-gold/20 to-transparent" />

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section header (the widget has its own internal header, but we add
            an outer one so the section reads as a beat in the narrative flow
            when placed between Gallery and CTA). */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 text-gold/70 mb-3">
            <BookOpen className="size-5" aria-hidden="true" />
            <span className="font-display text-[10px] uppercase tracking-[0.25em] font-bold">
              Livre d&apos;Or
            </span>
          </div>
          <h2
            id="guestbook-section-title"
            className="font-serif text-3xl md:text-5xl font-bold mb-4"
          >
            <span className="gold-gradient">Vos messages aux mariés</span>
          </h2>
          <div className="section-divider max-w-xs mx-auto">
            <span className="flourish text-sm">✦</span>
          </div>
        </div>

        {/* The widget handles its own list, form, pagination, and toasts. */}
        <GuestbookWidget weddingId={wedding.id} slug={wedding.slug} />
      </div>
    </motion.section>
  );
}
