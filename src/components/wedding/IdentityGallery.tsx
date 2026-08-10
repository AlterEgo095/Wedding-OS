// ══════════════════════════════════════════════════════════════════════════════
// src/components/wedding/IdentityGallery.tsx
// Phase 2E (MISSION 5.9.0 §20.4) — Smart gallery dispatcher per wedding identity.
// MISSION 5.9.2 P0 (QW1) — Auto-fetch images for luxury variants.
// ══════════════════════════════════════════════════════════════════════════════
//
// Replaces the direct <PremiumGallery /> call in SectionRenderer when the
// wedding has opted into one of the 5 identity presets (themeConfig.identity).
// The dispatcher reads the identity's gallery override (LuxuryGallery /
// ImmersiveGallery / PremiumGallery) and renders the matching variant.
//
// Backward compatibility: if no `identity` prop is passed (or the identity has
// no gallery override), IdentityGallery renders the default <PremiumGallery />.
//
// MISSION 5.9.2 P0 (QW1) FIX: Previously, when a wedding used an identity with
// a LuxuryGallery override (royal-luxury, botanical-romance, cinematic-dark)
// but no explicit `images` prop was passed, IdentityGallery rendered
// <LuxuryGallery images={[]} /> — an empty gallery. LuxuryGallery doesn't
// self-fetch. This broke 3 of 5 identity presets in production.
//
// FIX: IdentityGallery now self-fetches from /api/media when images is not
// provided, mirroring PremiumGallery's behaviour. The fetched images are
// passed to LuxuryGallery. When no images are available, a graceful empty
// state is shown (not the default wedding's photos).
// ══════════════════════════════════════════════════════════════════════════════

'use client';

import { useEffect, useMemo, useState } from 'react';
import { Camera } from 'lucide-react';
import PremiumGallery from '@/components/PremiumGallery';
import {
  LuxuryGallery,
  type LuxuryGalleryImage,
  type LuxuryGalleryProps,
} from '@/components/premium/LuxuryGallery';
import {
  getIdentityPreset,
  getSectionOverride,
  isWeddingIdentity,
  type WeddingIdentity,
} from '@/lib/themes/identity-presets';

/**
 * Image shape accepted by IdentityGallery. Compatible with the existing
 * PremiumGallery image shape ({ id, url, title?, description?, category? })
 * AND the LuxuryGallery image shape ({ id, src, alt, caption?, span? }).
 * IdentityGallery normalises between the two.
 */
export interface IdentityGalleryImage {
  id: string;
  /** Image URL (root-relative or absolute). */
  src?: string;
  /** Alias for `src` (PremiumGallery uses `url`). */
  url?: string;
  /** Alt text (LuxuryGallery). */
  alt?: string;
  /** Title (PremiumGallery). Falls back to alt if absent. */
  title?: string | null;
  /** Caption shown on hover (LuxuryGallery). */
  caption?: string;
  /** Description (PremiumGallery, unused by luxury variants). */
  description?: string | null;
  /** Category (PremiumGallery, unused by luxury variants). */
  category?: string | null;
  /** Span preset (LuxuryGallery only). */
  span?: LuxuryGalleryImage['span'];
}

/**
 * Props for IdentityGallery.
 */
export interface IdentityGalleryProps {
  /**
   * Wedding identity to dispatch on. Same semantics as IdentityHero.identity:
   *   - valid WeddingIdentity → dispatches to the identity's gallery override
   *   - undefined / null / '' → falls back to <PremiumGallery />
   *   - unknown string → falls back to <PremiumGallery /> (with a dev-time warn)
   */
  identity?: WeddingIdentity | string | null;
  /**
   * Explicit image list. When omitted, IdentityGallery auto-fetches from
   * /api/media (QW1 fix). When provided, the explicit list always wins.
   */
  images?: IdentityGalleryImage[];
  /** Number of columns for LuxuryGallery. Default 3. */
  columns?: LuxuryGalleryProps['columns'];
  /** Optional section heading for LuxuryGallery. */
  heading?: string;
  /** Optional section subheading for LuxuryGallery. */
  subheading?: string;
}

/**
 * Normalises an IdentityGalleryImage into the LuxuryGallery image shape.
 * Falls back to sensible defaults for alt/caption so the luxury grid always
 * has accessible labels.
 */
function toLuxuryImage(img: IdentityGalleryImage): LuxuryGalleryImage {
  const src = img.src ?? img.url ?? '';
  const alt = img.alt ?? img.title ?? 'Photo de galerie';
  const caption = img.caption ?? (typeof img.title === 'string' ? img.title : undefined);
  return {
    id: img.id,
    src,
    alt,
    caption,
    span: img.span,
  };
}

/**
 * Normalises an IdentityGalleryImage into the PremiumGallery image shape.
 */
function toPremiumImage(img: IdentityGalleryImage) {
  const url = img.url ?? img.src ?? '';
  return {
    id: img.id,
    url,
    title: img.title ?? null,
    description: img.description ?? null,
    category: img.category ?? null,
  };
}

/**
 * Graceful empty state for the luxury gallery variant when no images are
 * available. Shows a placeholder with a camera icon + invite-to-upload message
 * instead of rendering an empty grid or the default wedding's photos.
 */
function LuxuryGalleryEmptyState({
  heading,
  subheading,
}: {
  heading?: string;
  subheading?: string;
}) {
  return (
    <section className="py-20 md:py-32 relative overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gradient-to-br from-gold/15 to-rose-gold/10 mb-6">
          <Camera className="size-7 text-gold" />
        </div>
        <h2 className="font-serif text-3xl md:text-5xl font-bold mb-4">
          <span className="gold-gradient">{heading ?? 'Notre Galerie'}</span>
        </h2>
        <p className="font-display text-lg text-muted-foreground max-w-xl mx-auto">
          {subheading ?? 'Les photos seront bientôt disponibles.'}
        </p>
        <div className="section-divider max-w-xs mx-auto mt-6" />
        <p className="mt-8 text-sm text-muted-foreground italic">
          La galerie sera enrichie prochainement.
        </p>
      </div>
    </section>
  );
}

/**
 * IdentityGallery — smart gallery dispatcher per wedding identity.
 *
 * @example Backward-compatible (no identity → default PremiumGallery):
 *   <IdentityGallery />
 *
 * @example Royal Luxury identity with explicit images:
 *   <IdentityGallery
 *     identity="royal-luxury"
 *     images={photos.map(p => ({ id: p.id, src: p.url, alt: p.title }))}
 *     columns={3}
 *   />
 *
 * @example Royal Luxury identity, auto-fetch from /api/media (QW1):
 *   <IdentityGallery identity="royal-luxury" />
 */
export function IdentityGallery({
  identity,
  images,
  columns,
  heading,
  subheading,
}: IdentityGalleryProps): React.ReactNode {
  // ─── Resolve the identity's gallery override ─────────────────────────────────
  const galleryComponent = useMemo<string | null>(() => {
    if (!identity) return null;
    if (!isWeddingIdentity(identity)) {
      if (process.env.NODE_ENV !== 'production') {
        // eslint-disable-next-line no-console
        console.warn(
          `[IdentityGallery] Identité inconnue "${identity}" — retour au PremiumGallery par défaut.`,
        );
      }
      return null;
    }
    const preset = getIdentityPreset(identity);
    if (!preset) return null;
    const override = getSectionOverride(preset, 'gallery');
    return override ?? null;
  }, [identity]);

  // ─── QW1: Auto-fetch images from /api/media when not explicitly provided ────
  // LuxuryGallery and ImmersiveGallery don't self-fetch. Previously this caused
  // empty galleries for royal-luxury, botanical-romance, and cinematic-dark.
  // Now IdentityGallery fetches from /api/media (same endpoint PremiumGallery
  // uses) and passes the images to the luxury variant.
  const isLuxuryVariant = galleryComponent === 'LuxuryGallery' || galleryComponent === 'ImmersiveGallery';
  const needsFetch = isLuxuryVariant && (!images || images.length === 0);

  const [fetchedImages, setFetchedImages] = useState<IdentityGalleryImage[]>([]);

  useEffect(() => {
    if (!needsFetch) return;
    let cancelled = false;
    fetch('/api/media?type=PHOTO&category=GALLERY')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled) return;
        const media = Array.isArray(data?.media) ? data.media : [];
        const galleryImages: IdentityGalleryImage[] = media
          .filter((m: { url?: string }) => m?.url)
          .map((m: { id: string; url: string; title?: string | null; description?: string | null; category?: string | null }) => ({
            id: m.id,
            src: m.url,
            url: m.url,
            alt: typeof m.title === 'string' ? m.title : 'Photo de galerie',
            title: m.title ?? null,
            description: m.description ?? null,
            category: m.category ?? null,
          }));
        setFetchedImages(galleryImages);
      })
      .catch(() => {
        // Silent — empty state will show
      });
    return () => {
      cancelled = true;
    };
  }, [needsFetch]);

  // ─── No identity or no gallery override → default PremiumGallery ─────────────
  if (!galleryComponent) {
    // Only pass `images` if explicitly provided — PremiumGallery fetches from
    // /api/media when images is undefined (preserves existing behaviour).
    return <PremiumGallery images={images ? images.map(toPremiumImage) : undefined} />;
  }

  // ─── Dispatch to the premium variant ─────────────────────────────────────────
  if (isLuxuryVariant) {
    // Use explicit images if provided, otherwise use fetched images (QW1).
    const sourceImages = images && images.length > 0 ? images : fetchedImages;
    const luxuryImages: LuxuryGalleryImage[] = sourceImages.map(toLuxuryImage);

    // QW1: graceful empty state when no images are available.
    if (luxuryImages.length === 0) {
      return <LuxuryGalleryEmptyState heading={heading} subheading={subheading} />;
    }

    return (
      <LuxuryGallery
        images={luxuryImages}
        columns={columns ?? 3}
        heading={heading}
        subheading={subheading}
      />
    );
  }

  // Identity maps to 'PremiumGallery' explicitly → default renderer.
  return <PremiumGallery images={images ? images.map(toPremiumImage) : undefined} />;
}

export default IdentityGallery;
