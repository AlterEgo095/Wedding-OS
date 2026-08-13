// ══════════════════════════════════════════════════════════════════════════════
// src/components/premium/invitation/InvitationSections.tsx
// MISSION 5.9.2 P4-shared — Shared section renderers for premium invitations.
// ══════════════════════════════════════════════════════════════════════════════
//
// Renders the 12 invitation section types declared in
// src/lib/invitations/types.ts → InvitationSectionType.
//
// Each section is a small, focused component that consumes the
// InvitationExperienceConfig (composed output from src/lib/invitations/index.ts).
// The 5 premium invitation renderers (Luxury/Editorial/Botanical/Cinematic/
// Champagne) reuse these section renderers and apply their OWN visual identity
// via the --inv-* CSS tokens declared in the template's configJson.tokens.
//
// All sections:
//   - Respect prefers-reduced-motion (no animation when set)
//   - Use the resolved media slots (config.mediaSlots[slotId].url)
//   - Use the resolved data bindings (config.resolvedBindings[placeholder])
//   - Use the resolved copy (config.copy[key])
//   - Hide on mobile when listed in `mobileHiddenSections`
//   - Apply animation rules from config.animationRules (reveal strategy + duration)
//
// Each section is exported both as a named export and as a registry map
// INVITATION_SECTION_RENDERERS so the dispatcher can look up a renderer by
// section.type.
// ══════════════════════════════════════════════════════════════════════════════

'use client';

import { useMemo, useRef } from 'react';
import Image from 'next/image';
import { motion, useInView, useReducedMotion } from 'framer-motion';
import {
  Calendar,
  Clock,
  MapPin,
  Heart,
  QrCode,
  Sparkles,
  ChevronDown,
} from 'lucide-react';
import type {
  InvitationExperienceConfig,
  InvitationSection,
  InvitationMediaAsset,
} from '@/lib/invitations/types';
import { cn } from '@/lib/utils';

// ─── Section component props ─────────────────────────────────────────────────

export interface InvitationSectionProps {
  section: InvitationSection;
  config: InvitationExperienceConfig;
  mobileHidden: boolean;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Read a resolved media asset for a given slotId. */
function useMediaAsset(config: InvitationExperienceConfig, slotId: string): InvitationMediaAsset | null {
  return config.mediaSlots[slotId] ?? null;
}

/** Read a resolved copy string by key (with fallback). */
function useCopy(config: InvitationExperienceConfig, key: string): string {
  return config.copy[key] ?? key;
}

/** Build framer-motion variants from the config's animation rules. */
function useRevealVariants(config: InvitationExperienceConfig) {
  const prefersReducedMotion = useReducedMotion();
  const rules = config.animationRules;
  return useMemo(() => {
    if (prefersReducedMotion || rules.reveal === 'none') {
      return { hidden: { opacity: 1 }, visible: { opacity: 1 } };
    }
    const distance = 40;
    switch (rules.reveal) {
      case 'fade-in':
        return { hidden: { opacity: 0 }, visible: { opacity: 1 } };
      case 'slide-up':
        return { hidden: { opacity: 0, y: distance }, visible: { opacity: 1, y: 0 } };
      case 'scroll':
      default:
        return { hidden: { opacity: 0, y: distance }, visible: { opacity: 1, y: 0 } };
    }
  }, [prefersReducedMotion, rules.reveal]);
}

function getAnimationTransition(config: InvitationExperienceConfig) {
  return {
    duration: (config.animationRules.duration || 800) / 1000,
    ease: (config.animationRules.easing || 'easeOut') as 'easeOut' | 'easeIn' | 'easeInOut' | 'linear',
    delay: config.animationRules.stagger ? (config.animationRules.stagger / 1000) : 0,
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// 1. COVER SECTION — full-bleed hero photo + couple names
// ══════════════════════════════════════════════════════════════════════════════

export function CoverSection({ section, config }: InvitationSectionProps) {
  const prefersReducedMotion = useReducedMotion();
  const variants = useRevealVariants(config);
  const transition = getAnimationTransition(config);
  const heroAsset = useMediaAsset(config, section.mediaSlots?.[0] ?? 'couple-hero');
  const heading = useCopy(config, 'cover.heading');
  const subheading = useCopy(config, 'cover.subheading');
  const cta = useCopy(config, 'cover.cta');
  const coupleNames = config.resolvedBindings.coupleNames || '';
  const date = config.resolvedBindings.date || '';

  const heroOpacity = parseFloat(config.tokens['--inv-hero-opacity'] ?? '0.7');
  const heroHeight = `calc(${config.responsiveRules.desktop.heroHeight}vh)`;
  const heroHeightMobile = `calc(${config.responsiveRules.mobile.heroHeight}vh)`;

  return (
    <section
      id={section.id}
      className="relative w-full overflow-hidden"
      style={{ minHeight: heroHeightMobile }}
      aria-labelledby={`${section.id}-title`}
    >
      <div className="md:hidden absolute inset-0" style={{ minHeight: heroHeightMobile }} />
      <div className="hidden md:block absolute inset-0" style={{ minHeight: heroHeight }} />

      {/* Background image with Ken Burns effect */}
      <div className="absolute inset-0 z-0" aria-hidden="true">
        {heroAsset?.url ? (
          prefersReducedMotion ? (
            <Image
              src={heroAsset.url}
              alt={heroAsset.alt ?? ''}
              fill
              priority
              sizes="100vw"
              className="object-cover"
              style={{ opacity: heroOpacity }}
            />
          ) : (
            <motion.div
              initial={{ scale: 1 }}
              animate={{ scale: 1.08 }}
              transition={{
                duration: (config.animationRules.heroDuration || 1200) / 1000,
                ease: 'easeOut',
                repeat: Infinity,
                repeatType: 'reverse',
              }}
              className="absolute inset-0"
            >
              <Image
                src={heroAsset.url}
                alt={heroAsset.alt ?? ''}
                fill
                priority
                sizes="100vw"
                className="object-cover"
                style={{ opacity: heroOpacity }}
              />
            </motion.div>
          )
        ) : (
          <div
            className="absolute inset-0"
            style={{
              background:
                'linear-gradient(135deg, var(--inv-surface, #1a1a2e) 0%, var(--inv-bg, #0a0a0a) 100%)',
            }}
          />
        )}
        {/* Overlay */}
        <div
          className="absolute inset-0"
          style={{
            background: config.tokens['--inv-overlay'] ?? 'rgba(0,0,0,0.5)',
          }}
        />
      </div>

      {/* Content */}
      <div className="relative z-10 flex flex-col items-center justify-center min-h-[inherit] px-6 text-center">
        <motion.div
          variants={variants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-80px' }}
          transition={transition}
          className="max-w-3xl mx-auto"
        >
          <p
            className="text-xs sm:text-sm uppercase tracking-[0.3em] mb-4 sm:mb-6"
            style={{ color: 'var(--inv-accent, #D4AF37)' }}
          >
            {subheading}
          </p>
          <h1
            id={`${section.id}-title`}
            className="font-display text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold mb-4 sm:mb-6 leading-tight"
            style={{
              color: 'var(--inv-text, #FAF8F5)',
              fontFamily: 'var(--inv-font-display, serif)',
            }}
          >
            {coupleNames}
          </h1>
          {date && (
            <p
              className="text-base sm:text-lg md:text-xl mb-8"
              style={{
                color: 'var(--inv-text, #FAF8F5)',
                opacity: 0.85,
                fontFamily: 'var(--inv-font-body, sans-serif)',
              }}
            >
              {date}
            </p>
          )}
          <div className="flex flex-col items-center gap-4">
            <button
              onClick={() => {
                document.getElementById('couple-introduction')?.scrollIntoView({ behavior: 'smooth' });
              }}
              className="inline-flex items-center justify-center h-12 px-8 rounded-full font-semibold text-sm transition-all hover:scale-105 focus:outline-none focus:ring-2 focus:ring-offset-2"
              style={{
                background: 'var(--inv-accent, #D4AF37)',
                color: 'var(--inv-bg, #0a0a0a)',
              }}
              aria-label={cta}
            >
              {cta}
              <ChevronDown className="ml-2 w-4 h-4 animate-bounce" />
            </button>
          </div>
        </motion.div>
      </div>

      {/* Decorative scroll indicator */}
      <motion.div
        className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10"
        animate={prefersReducedMotion ? {} : { y: [0, 8, 0] }}
        transition={{ duration: 2, repeat: Infinity }}
        aria-hidden="true"
      >
        <Sparkles
          className="w-4 h-4"
          style={{ color: 'var(--inv-accent, #D4AF37)' }}
        />
      </motion.div>
    </section>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// 2. WEDDING DATE SECTION — typographic date display
// ══════════════════════════════════════════════════════════════════════════════

export function WeddingDateSection({ section, config }: InvitationSectionProps) {
  const variants = useRevealVariants(config);
  const transition = getAnimationTransition(config);
  const heading = useCopy(config, 'date.heading');
  const dateLong = config.resolvedBindings.date || '';

  // Parse the date to display day/month/year separately
  const dateParts = useMemo(() => {
    if (!config.wedding.weddingDate) return null;
    try {
      const d = new Date(config.wedding.weddingDate);
      if (isNaN(d.getTime())) return null;
      return {
        day: d.getDate().toString().padStart(2, '0'),
        month: d.toLocaleString('fr-FR', { month: 'long' }),
        year: d.getFullYear().toString(),
        weekday: d.toLocaleString('fr-FR', { weekday: 'long' }),
      };
    } catch {
      return null;
    }
  }, [config.wedding.weddingDate]);

  return (
    <section
      id={section.id}
      className="relative py-16 md:py-24"
      style={{
        background: 'var(--inv-bg, #0a0a0a)',
        padding: 'var(--inv-section-padding, 5rem 1.5rem)',
      }}
      aria-labelledby={`${section.id}-title`}
    >
      <motion.div
        variants={variants}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: '-80px' }}
        transition={transition}
        className="max-w-3xl mx-auto text-center"
      >
        <p
          className="text-xs sm:text-sm uppercase tracking-[0.3em] mb-4"
          style={{ color: 'var(--inv-accent, #D4AF37)' }}
        >
          {heading}
        </p>
        {dateParts ? (
          <div className="flex flex-col items-center gap-4">
            <p
              className="text-base italic"
              style={{ color: 'var(--inv-text, #FAF8F5)', opacity: 0.7 }}
            >
              {dateParts.weekday}
            </p>
            <div className="flex items-baseline gap-4 sm:gap-6">
              <span
                className="font-display text-5xl sm:text-6xl md:text-7xl font-bold"
                style={{
                  color: 'var(--inv-text, #FAF8F5)',
                  fontFamily: 'var(--inv-font-display, serif)',
                }}
              >
                {dateParts.day}
              </span>
              <span
                className="font-display text-3xl sm:text-4xl md:text-5xl"
                style={{
                  color: 'var(--inv-accent, #D4AF37)',
                  fontFamily: 'var(--inv-font-display, serif)',
                }}
              >
                {dateParts.month}
              </span>
              <span
                className="font-display text-3xl sm:text-4xl md:text-5xl"
                style={{
                  color: 'var(--inv-text, #FAF8F5)',
                  opacity: 0.7,
                  fontFamily: 'var(--inv-font-display, serif)',
                }}
              >
                {dateParts.year}
              </span>
            </div>
            <p
              className="mt-4 text-sm"
              style={{ color: 'var(--inv-text, #FAF8F5)', opacity: 0.5 }}
            >
              {dateLong}
            </p>
          </div>
        ) : (
          <p
            className="font-display text-3xl sm:text-4xl"
            style={{ color: 'var(--inv-text, #FAF8F5)', fontFamily: 'var(--inv-font-display, serif)' }}
          >
            {dateLong || 'Date à confirmer'}
          </p>
        )}
      </motion.div>
    </section>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// 3. COUNTDOWN SECTION — live countdown timer
// ══════════════════════════════════════════════════════════════════════════════

export function CountdownSection({ section, config }: InvitationSectionProps) {
  const variants = useRevealVariants(config);
  const transition = getAnimationTransition(config);
  const heading = useCopy(config, 'countdown.heading');
  const daysLabel = useCopy(config, 'countdown.days');
  const hoursLabel = useCopy(config, 'countdown.hours');
  const minutesLabel = useCopy(config, 'countdown.minutes');
  const secondsLabel = useCopy(config, 'countdown.seconds');

  const targetDate = config.wedding.weddingDate ? new Date(config.wedding.weddingDate) : null;
  const validTarget = targetDate && !isNaN(targetDate.getTime()) ? targetDate : null;

  if (!validTarget) {
    return null; // Hide countdown if no wedding date
  }

  return (
    <section
      id={section.id}
      className="relative py-16 md:py-24"
      style={{
        background: 'var(--inv-surface, #1a1a2e)',
        padding: 'var(--inv-section-padding, 5rem 1.5rem)',
      }}
      aria-labelledby={`${section.id}-title`}
    >
      <motion.div
        variants={variants}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: '-80px' }}
        transition={transition}
        className="max-w-4xl mx-auto text-center"
      >
        <p
          className="text-xs sm:text-sm uppercase tracking-[0.3em] mb-8"
          style={{ color: 'var(--inv-accent, #D4AF37)' }}
        >
          {heading}
        </p>
        <CountdownTimer
          target={validTarget}
          labels={{ days: daysLabel, hours: hoursLabel, minutes: minutesLabel, seconds: secondsLabel }}
        />
      </motion.div>
    </section>
  );
}

function CountdownTimer({
  target,
  labels,
}: {
  target: Date;
  labels: { days: string; hours: string; minutes: string; seconds: string };
}) {
  const prefersReducedMotion = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: '-80px' });

  // Compute remaining time
  const remaining = useMemo(() => {
    const now = Date.now();
    const diff = Math.max(0, target.getTime() - now);
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);
    return { days, hours, minutes, seconds };
  }, [target]);

  const items = [
    { value: remaining.days, label: labels.days },
    { value: remaining.hours, label: labels.hours },
    { value: remaining.minutes, label: labels.minutes },
    { value: remaining.seconds, label: labels.seconds },
  ];

  return (
    <div ref={ref} className="grid grid-cols-4 gap-2 sm:gap-4 md:gap-6 max-w-2xl mx-auto">
      {items.map((item, i) => (
        <motion.div
          key={item.label}
          initial={prefersReducedMotion ? { opacity: 1 } : { opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
          transition={{ delay: i * 0.1, duration: 0.5 }}
          className="flex flex-col items-center"
        >
          <div
            className="rounded-lg border backdrop-blur-sm px-2 py-4 sm:px-4 sm:py-6 w-full"
            style={{
              borderColor: 'var(--inv-accent, #D4AF37)',
              borderWidth: '1px',
              background: 'rgba(255,255,255,0.03)',
            }}
          >
            <span
              className="font-display text-3xl sm:text-4xl md:text-5xl font-bold tabular-nums"
              style={{
                color: 'var(--inv-text, #FAF8F5)',
                fontFamily: 'var(--inv-font-display, serif)',
              }}
            >
              {String(item.value).padStart(2, '0')}
            </span>
          </div>
          <span
            className="mt-2 text-[10px] sm:text-xs uppercase tracking-wider"
            style={{ color: 'var(--inv-text, #FAF8F5)', opacity: 0.6 }}
          >
            {item.label}
          </span>
        </motion.div>
      ))}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// 4. COUPLE INTRODUCTION SECTION — couple intro card with portrait
// ══════════════════════════════════════════════════════════════════════════════

export function CoupleIntroductionSection({ section, config }: InvitationSectionProps) {
  const variants = useRevealVariants(config);
  const transition = getAnimationTransition(config);
  const heading = useCopy(config, 'couple.heading');
  const portraitAsset = useMediaAsset(config, section.mediaSlots?.[0] ?? 'couple-portrait');

  return (
    <section
      id={section.id}
      className="relative py-16 md:py-24"
      style={{
        background: 'var(--inv-bg, #0a0a0a)',
        padding: 'var(--inv-section-padding, 5rem 1.5rem)',
      }}
      aria-labelledby={`${section.id}-title`}
    >
      <motion.div
        variants={variants}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: '-80px' }}
        transition={transition}
        className="max-w-5xl mx-auto grid md:grid-cols-2 gap-8 md:gap-12 items-center"
      >
        <div className="order-2 md:order-1">
          <p
            className="text-xs sm:text-sm uppercase tracking-[0.3em] mb-4"
            style={{ color: 'var(--inv-accent, #D4AF37)' }}
          >
            {heading}
          </p>
          <h2
            id={`${section.id}-title`}
            className="font-display text-4xl sm:text-5xl md:text-6xl font-bold mb-6"
            style={{
              color: 'var(--inv-text, #FAF8F5)',
              fontFamily: 'var(--inv-font-display, serif)',
            }}
          >
            {config.wedding.groomName}
          </h2>
          <p
            className="font-display text-2xl sm:text-3xl mb-6"
            style={{
              color: 'var(--inv-accent, #D4AF37)',
              fontFamily: 'var(--inv-font-display, serif)',
            }}
          >
            &
          </p>
          <h2
            className="font-display text-4xl sm:text-5xl md:text-6xl font-bold mb-8"
            style={{
              color: 'var(--inv-text, #FAF8F5)',
              fontFamily: 'var(--inv-font-display, serif)',
            }}
          >
            {config.wedding.brideName}
          </h2>
          <p
            className="text-base leading-relaxed"
            style={{
              color: 'var(--inv-text, #FAF8F5)',
              opacity: 0.8,
              fontFamily: 'var(--inv-font-body, sans-serif)',
            }}
          >
            {config.wedding.coupleLabel}
          </p>
        </div>
        <div className="order-1 md:order-2">
          {portraitAsset?.url ? (
            <div
              className="relative w-full aspect-[4/5] overflow-hidden"
              style={{ borderRadius: 'var(--inv-radius, 0)' }}
            >
              <Image
                src={portraitAsset.url}
                alt={portraitAsset.alt ?? ''}
                fill
                sizes="(max-width: 768px) 100vw, 50vw"
                className="object-cover"
              />
            </div>
          ) : (
            <div
              className="w-full aspect-[4/5] flex items-center justify-center"
              style={{
                background: 'var(--inv-surface, #1a1a2e)',
                borderRadius: 'var(--inv-radius, 0)',
              }}
            >
              <Heart
                className="w-12 h-12"
                style={{ color: 'var(--inv-accent, #D4AF37)', opacity: 0.3 }}
              />
            </div>
          )}
        </div>
      </motion.div>
    </section>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// 5. STORY SECTION — couple story timeline
// ══════════════════════════════════════════════════════════════════════════════

export function StorySection({ section, config }: InvitationSectionProps) {
  const variants = useRevealVariants(config);
  const transition = getAnimationTransition(config);
  const heading = useCopy(config, 'story.heading');
  const stories = config.wedding.stories ?? [];

  if (stories.length === 0) return null;

  return (
    <section
      id={section.id}
      className="relative py-16 md:py-24"
      style={{
        background: 'var(--inv-surface, #1a1a2e)',
        padding: 'var(--inv-section-padding, 5rem 1.5rem)',
      }}
      aria-labelledby={`${section.id}-title`}
    >
      <motion.div
        variants={variants}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: '-80px' }}
        transition={transition}
        className="max-w-4xl mx-auto"
      >
        <p
          className="text-xs sm:text-sm uppercase tracking-[0.3em] mb-4 text-center"
          style={{ color: 'var(--inv-accent, #D4AF37)' }}
        >
          {heading}
        </p>
        <div className="relative">
          {/* Vertical line */}
          <div
            className="absolute left-4 md:left-1/2 top-0 bottom-0 w-px"
            style={{ background: 'var(--inv-accent, #D4AF37)', opacity: 0.3 }}
          />
          {stories.map((story, i) => (
            <motion.div
              key={story.storyId}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-80px' }}
              transition={{ delay: i * 0.1, duration: 0.6 }}
              className={cn(
                'relative mb-12 last:mb-0 pl-12 md:pl-0',
                i % 2 === 0 ? 'md:pr-1/2 md:text-right' : 'md:pl-1/2',
              )}
            >
              <div
                className="absolute left-4 md:left-1/2 top-2 w-3 h-3 rounded-full -translate-x-1/2 md:translate-x-0"
                style={{
                  background: 'var(--inv-accent, #D4AF37)',
                  ...(i % 2 === 0 ? { transform: 'translate(50%, 0)' } : {}),
                }}
              />
              <div className="md:px-8">
                {story.date && (
                  <p
                    className="text-xs uppercase tracking-wider mb-2"
                    style={{ color: 'var(--inv-accent, #D4AF37)' }}
                  >
                    {new Date(story.date).toLocaleDateString('fr-FR', { year: 'numeric', month: 'long' })}
                  </p>
                )}
                <h3
                  className="font-display text-2xl font-semibold mb-3"
                  style={{
                    color: 'var(--inv-text, #FAF8F5)',
                    fontFamily: 'var(--inv-font-display, serif)',
                  }}
                >
                  {story.title}
                </h3>
                <p
                  className="text-sm leading-relaxed"
                  style={{
                    color: 'var(--inv-text, #FAF8F5)',
                    opacity: 0.7,
                    fontFamily: 'var(--inv-font-body, sans-serif)',
                  }}
                >
                  {story.body}
                </p>
              </div>
            </motion.div>
          ))}
        </div>
      </motion.div>
    </section>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// 6. GALLERY SECTION — photo gallery grid
// ══════════════════════════════════════════════════════════════════════════════

export function GallerySection({ section, config }: InvitationSectionProps) {
  const variants = useRevealVariants(config);
  const transition = getAnimationTransition(config);
  const heading = useCopy(config, 'gallery.heading');
  const slotIds = section.mediaSlots ?? ['gallery-01', 'gallery-02', 'gallery-03'];
  const assets = slotIds.map((id) => config.mediaSlots[id]).filter(Boolean);

  if (assets.length === 0) return null;

  return (
    <section
      id={section.id}
      className="relative py-16 md:py-24"
      style={{
        background: 'var(--inv-bg, #0a0a0a)',
        padding: 'var(--inv-section-padding, 5rem 1.5rem)',
      }}
      aria-labelledby={`${section.id}-title`}
    >
      <motion.div
        variants={variants}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: '-80px' }}
        transition={transition}
        className="max-w-5xl mx-auto"
      >
        <p
          className="text-xs sm:text-sm uppercase tracking-[0.3em] mb-8 text-center"
          style={{ color: 'var(--inv-accent, #D4AF37)' }}
        >
          {heading}
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {assets.map((asset, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, scale: 0.9 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1, duration: 0.5 }}
              className="relative aspect-square overflow-hidden"
              style={{ borderRadius: 'var(--inv-radius, 0)' }}
            >
              <Image
                src={asset.url}
                alt={asset.alt ?? ''}
                fill
                sizes="(max-width: 640px) 100vw, 33vw"
                className="object-cover transition-transform duration-500 hover:scale-105"
              />
            </motion.div>
          ))}
        </div>
      </motion.div>
    </section>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// 7. CEREMONY SECTION — ceremony details
// ══════════════════════════════════════════════════════════════════════════════

export function CeremonySection({ section, config }: InvitationSectionProps) {
  const variants = useRevealVariants(config);
  const transition = getAnimationTransition(config);
  const heading = useCopy(config, 'ceremony.heading');
  const ceremony = config.wedding.events?.find((e) => e.type === 'ceremony');

  if (!ceremony) return null;

  return (
    <section
      id={section.id}
      className="relative py-16 md:py-24"
      style={{
        background: 'var(--inv-surface, #1a1a2e)',
        padding: 'var(--inv-section-padding, 5rem 1.5rem)',
      }}
      aria-labelledby={`${section.id}-title`}
    >
      <motion.div
        variants={variants}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: '-80px' }}
        transition={transition}
        className="max-w-3xl mx-auto text-center"
      >
        <Calendar
          className="w-10 h-10 mx-auto mb-4"
          style={{ color: 'var(--inv-accent, #D4AF37)' }}
        />
        <p
          className="text-xs sm:text-sm uppercase tracking-[0.3em] mb-4"
          style={{ color: 'var(--inv-accent, #D4AF37)' }}
        >
          {heading}
        </p>
        <h2
          id={`${section.id}-title`}
          className="font-display text-3xl sm:text-4xl md:text-5xl font-bold mb-6"
          style={{
            color: 'var(--inv-text, #FAF8F5)',
            fontFamily: 'var(--inv-font-display, serif)',
          }}
        >
          {ceremony.title}
        </h2>
        {ceremony.startTime && (
          <p
            className="text-base mb-2"
            style={{ color: 'var(--inv-text, #FAF8F5)', opacity: 0.85 }}
          >
            <Clock className="inline-block w-4 h-4 mr-2" />
            {new Date(ceremony.startTime).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
          </p>
        )}
        {ceremony.location && (
          <p
            className="text-base mb-2"
            style={{ color: 'var(--inv-text, #FAF8F5)', opacity: 0.85 }}
          >
            <MapPin className="inline-block w-4 h-4 mr-2" />
            {ceremony.location}
          </p>
        )}
      </motion.div>
    </section>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// 8. RECEPTION SECTION — reception details
// ══════════════════════════════════════════════════════════════════════════════

export function ReceptionSection({ section, config }: InvitationSectionProps) {
  const variants = useRevealVariants(config);
  const transition = getAnimationTransition(config);
  const heading = useCopy(config, 'reception.heading');
  const reception = config.wedding.events?.find((e) => e.type === 'reception' || e.type === 'dinner' || e.type === 'party');

  if (!reception) return null;

  return (
    <section
      id={section.id}
      className="relative py-16 md:py-24"
      style={{
        background: 'var(--inv-bg, #0a0a0a)',
        padding: 'var(--inv-section-padding, 5rem 1.5rem)',
      }}
      aria-labelledby={`${section.id}-title`}
    >
      <motion.div
        variants={variants}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: '-80px' }}
        transition={transition}
        className="max-w-3xl mx-auto text-center"
      >
        <Heart
          className="w-10 h-10 mx-auto mb-4"
          style={{ color: 'var(--inv-accent, #D4AF37)' }}
        />
        <p
          className="text-xs sm:text-sm uppercase tracking-[0.3em] mb-4"
          style={{ color: 'var(--inv-accent, #D4AF37)' }}
        >
          {heading}
        </p>
        <h2
          id={`${section.id}-title`}
          className="font-display text-3xl sm:text-4xl md:text-5xl font-bold mb-6"
          style={{
            color: 'var(--inv-text, #FAF8F5)',
            fontFamily: 'var(--inv-font-display, serif)',
          }}
        >
          {reception.title}
        </h2>
        {reception.startTime && (
          <p
            className="text-base mb-2"
            style={{ color: 'var(--inv-text, #FAF8F5)', opacity: 0.85 }}
          >
            <Clock className="inline-block w-4 h-4 mr-2" />
            {new Date(reception.startTime).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
          </p>
        )}
        {reception.location && (
          <p
            className="text-base"
            style={{ color: 'var(--inv-text, #FAF8F5)', opacity: 0.85 }}
          >
            <MapPin className="inline-block w-4 h-4 mr-2" />
            {reception.location}
          </p>
        )}
      </motion.div>
    </section>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// 9. VENUE SECTION — venue info + image
// ══════════════════════════════════════════════════════════════════════════════

export function VenueSection({ section, config }: InvitationSectionProps) {
  const variants = useRevealVariants(config);
  const transition = getAnimationTransition(config);
  const heading = useCopy(config, 'venue.heading');
  const venueAsset = useMediaAsset(config, section.mediaSlots?.[0] ?? 'venue-image');
  const venueName = config.resolvedBindings.venue || '';
  const venueAddress = config.resolvedBindings.address || '';
  const venueCity = config.resolvedBindings.city || '';

  return (
    <section
      id={section.id}
      className="relative py-16 md:py-24"
      style={{
        background: 'var(--inv-surface, #1a1a2e)',
        padding: 'var(--inv-section-padding, 5rem 1.5rem)',
      }}
      aria-labelledby={`${section.id}-title`}
    >
      <motion.div
        variants={variants}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: '-80px' }}
        transition={transition}
        className="max-w-5xl mx-auto grid md:grid-cols-2 gap-8 items-center"
      >
        <div>
          <MapPin
            className="w-10 h-10 mb-4"
            style={{ color: 'var(--inv-accent, #D4AF37)' }}
          />
          <p
            className="text-xs sm:text-sm uppercase tracking-[0.3em] mb-4"
            style={{ color: 'var(--inv-accent, #D4AF37)' }}
          >
            {heading}
          </p>
          <h2
            id={`${section.id}-title`}
            className="font-display text-3xl sm:text-4xl font-bold mb-4"
            style={{
              color: 'var(--inv-text, #FAF8F5)',
              fontFamily: 'var(--inv-font-display, serif)',
            }}
          >
            {venueName}
          </h2>
          {venueAddress && (
            <p
              className="text-base mb-2"
              style={{ color: 'var(--inv-text, #FAF8F5)', opacity: 0.85 }}
            >
              {venueAddress}
            </p>
          )}
          {venueCity && (
            <p
              className="text-base"
              style={{ color: 'var(--inv-text, #FAF8F5)', opacity: 0.85 }}
            >
              {venueCity}
            </p>
          )}
        </div>
        <div>
          {venueAsset?.url ? (
            <div
              className="relative w-full aspect-video overflow-hidden"
              style={{ borderRadius: 'var(--inv-radius, 0)' }}
            >
              <Image
                src={venueAsset.url}
                alt={venueAsset.alt ?? venueName}
                fill
                sizes="(max-width: 768px) 100vw, 50vw"
                className="object-cover"
              />
            </div>
          ) : (
            <div
              className="w-full aspect-video flex items-center justify-center"
              style={{
                background: 'var(--inv-bg, #0a0a0a)',
                borderRadius: 'var(--inv-radius, 0)',
              }}
            >
              <MapPin
                className="w-12 h-12"
                style={{ color: 'var(--inv-accent, #D4AF37)', opacity: 0.3 }}
              />
            </div>
          )}
        </div>
      </motion.div>
    </section>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// 10. RSVP SECTION — call-to-action
// ══════════════════════════════════════════════════════════════════════════════

export function RsvpSection({ section, config }: InvitationSectionProps) {
  const variants = useRevealVariants(config);
  const transition = getAnimationTransition(config);
  const heading = useCopy(config, 'rsvp.heading');
  const cta = useCopy(config, 'rsvp.cta');
  const rsvpUrl = config.guest?.rsvpUrl || config.resolvedBindings.rsvpUrl || '#rsvp';

  return (
    <section
      id={section.id}
      className="relative py-16 md:py-24"
      style={{
        background: 'var(--inv-bg, #0a0a0a)',
        padding: 'var(--inv-section-padding, 5rem 1.5rem)',
      }}
      aria-labelledby={`${section.id}-title`}
    >
      <motion.div
        variants={variants}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: '-80px' }}
        transition={transition}
        className="max-w-3xl mx-auto text-center"
      >
        <p
          className="text-xs sm:text-sm uppercase tracking-[0.3em] mb-4"
          style={{ color: 'var(--inv-accent, #D4AF37)' }}
        >
          {section.subtitle ?? heading}
        </p>
        <h2
          id={`${section.id}-title`}
          className="font-display text-3xl sm:text-4xl md:text-5xl font-bold mb-8"
          style={{
            color: 'var(--inv-text, #FAF8F5)',
            fontFamily: 'var(--inv-font-display, serif)',
          }}
        >
          {heading}
        </h2>
        <a
          href={rsvpUrl}
          className="inline-flex items-center justify-center h-12 px-8 rounded-full font-semibold text-sm transition-all hover:scale-105 focus:outline-none focus:ring-2 focus:ring-offset-2"
          style={{
            background: 'var(--inv-accent, #D4AF37)',
            color: 'var(--inv-bg, #0a0a0a)',
          }}
        >
          {cta}
        </a>
      </motion.div>
    </section>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// 11. QR ACCESS SECTION — guest QR code display
// ══════════════════════════════════════════════════════════════════════════════

export function QrAccessSection({ section, config }: InvitationSectionProps) {
  const variants = useRevealVariants(config);
  const transition = getAnimationTransition(config);
  const heading = useCopy(config, 'qr.heading');
  const help = useCopy(config, 'qr.help');
  const greeting = useCopy(config, 'guest.greeting');
  const tableLabel = useCopy(config, 'guest.table');
  const accessCodeLabel = useCopy(config, 'guest.accessCode');

  // Hide QR section for anonymous (non-guest) viewers
  if (!config.guest) {
    return null;
  }

  return (
    <section
      id={section.id}
      className="relative py-16 md:py-24"
      style={{
        background: 'var(--inv-surface, #1a1a2e)',
        padding: 'var(--inv-section-padding, 5rem 1.5rem)',
      }}
      aria-labelledby={`${section.id}-title`}
    >
      <motion.div
        variants={variants}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: '-80px' }}
        transition={transition}
        className="max-w-md mx-auto text-center"
      >
        <p
          className="text-base mb-2"
          style={{ color: 'var(--inv-text, #FAF8F5)', opacity: 0.7 }}
        >
          {greeting},
        </p>
        <h2
          id={`${section.id}-title`}
          className="font-display text-3xl font-bold mb-6"
          style={{
            color: 'var(--inv-accent, #D4AF37)',
            fontFamily: 'var(--inv-font-display, serif)',
          }}
        >
          {config.guest.firstName}
        </h2>

        {/* QR Code display */}
        <div className="inline-block p-4 bg-white rounded-lg mb-6">
          <QrCode className="w-32 h-32 text-black" />
        </div>

        <p
          className="text-sm mb-6"
          style={{ color: 'var(--inv-text, #FAF8F5)', opacity: 0.7 }}
        >
          {help}
        </p>

        {config.guest.tableLabel && (
          <p
            className="text-sm mb-2"
            style={{ color: 'var(--inv-text, #FAF8F5)' }}
          >
            <span style={{ opacity: 0.6 }}>{tableLabel}:</span>{' '}
            <span className="font-semibold">{config.guest.tableLabel}</span>
          </p>
        )}
        {config.guest.accessCode && (
          <p
            className="text-sm"
            style={{ color: 'var(--inv-text, #FAF8F5)' }}
          >
            <span style={{ opacity: 0.6 }}>{accessCodeLabel}:</span>{' '}
            <span className="font-mono font-semibold">{config.guest.accessCode}</span>
          </p>
        )}
      </motion.div>
    </section>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// 12. FOOTER SECTION — closing
// ══════════════════════════════════════════════════════════════════════════════

export function FooterSection({ section, config }: InvitationSectionProps) {
  const signature = useCopy(config, 'footer.signature');
  const monogramAsset = useMediaAsset(config, section.mediaSlots?.[0] ?? 'monogram');

  return (
    <footer
      id={section.id}
      className="relative py-12"
      style={{
        background: 'var(--inv-surface-deep, #050505)',
      }}
    >
      <div className="max-w-3xl mx-auto px-6 text-center">
        {monogramAsset?.url ? (
          <div className="inline-block mb-4 w-12 h-12 relative">
            <Image
              src={monogramAsset.url}
              alt="Monogramme"
              fill
              sizes="48px"
              className="object-contain"
            />
          </div>
        ) : (
          <Heart
            className="w-8 h-8 mx-auto mb-4"
            style={{ color: 'var(--inv-accent, #D4AF37)', opacity: 0.5 }}
          />
        )}
        <p
          className="font-display text-xl mb-2"
          style={{
            color: 'var(--inv-text, #FAF8F5)',
            fontFamily: 'var(--inv-font-display, serif)',
          }}
        >
          {config.wedding.coupleLabel}
        </p>
        <p
          className="text-xs uppercase tracking-[0.3em]"
          style={{ color: 'var(--inv-accent, #D4AF37)', opacity: 0.7 }}
        >
          {signature}
        </p>
      </div>
    </footer>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// SECTION REGISTRY — map section.type → component
// ══════════════════════════════════════════════════════════════════════════════

export const INVITATION_SECTION_RENDERERS: Record<
  string,
  React.ComponentType<InvitationSectionProps>
> = {
  cover: CoverSection,
  'wedding-date': WeddingDateSection,
  countdown: CountdownSection,
  'couple-introduction': CoupleIntroductionSection,
  story: StorySection,
  gallery: GallerySection,
  ceremony: CeremonySection,
  reception: ReceptionSection,
  venue: VenueSection,
  rsvp: RsvpSection,
  'qr-access': QrAccessSection,
  footer: FooterSection,
};

/**
 * Render all enabled sections of an InvitationExperienceConfig in order.
 * Used by the 5 premium invitation renderers (Luxury/Editorial/Botanical/
 * Cinematic/Champagne) so they share the same section rendering pipeline
 * and differ only in tokens + per-section styling overrides.
 */
export function InvitationSectionRenderer({
  config,
  mobileHiddenSections,
  className,
}: {
  config: InvitationExperienceConfig;
  mobileHiddenSections: string[];
  className?: string;
}): React.ReactNode {
  const enabledSections = config.sections
    .filter((s) => s.enabled)
    .sort((a, b) => a.order - b.order);

  return (
    <div className={className}>
      {enabledSections.map((section) => {
        const Renderer = INVITATION_SECTION_RENDERERS[section.type];
        if (!Renderer) {
          if (process.env.NODE_ENV !== 'production') {
            // eslint-disable-next-line no-console
            console.warn(`[IdentityInvitation] Unknown section type: ${section.type}`);
          }
          return null;
        }
        const isHiddenOnMobile = mobileHiddenSections.includes(section.id);
        return (
          <div
            key={section.id}
            className={cn(isHiddenOnMobile && 'hidden md:block')}
            data-section-id={section.id}
            data-section-type={section.type}
          >
            <Renderer section={section} config={config} mobileHidden={isHiddenOnMobile} />
          </div>
        );
      })}
    </div>
  );
}

export default InvitationSectionRenderer;
