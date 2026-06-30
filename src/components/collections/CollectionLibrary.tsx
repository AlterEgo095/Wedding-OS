'use client';

import { useEffect, useState, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Crown, Sparkles, Check, Loader2, Lock } from 'lucide-react';
import { toast } from 'sonner';
import type { CollectionPublic, CollectionVariantPublic } from '@/lib/collections';

interface CollectionLibraryProps {
  /** Optional slug — when set, the fetch interceptor on /w/[slug]/admin attaches
   *  X-Wedding-Slug + Authorization headers transparently. */
  slug?: string;
}

/**
 * CollectionLibrary — the couple-facing Collection Product catalog.
 *
 * Phase 1 scope:
 *   - Lists all Collections accessible to the wedding's billing plan
 *   - Lets the couple select a Collection + Variant
 *   - Calls POST /api/collections/apply on confirmation
 *   - Shows the currently-applied Collection with a "Appliquée" badge
 *
 * What it does NOT do yet (Phase 2+):
 *   - Palette override picker (the couple can still fine-tune via ThemeCustomizer tab)
 *   - Module preview (Website/Invitations/Print/Communication frames)
 *   - Designer Portal CRUD
 */
export function CollectionLibrary({ slug }: CollectionLibraryProps) {
  const [collections, setCollections] = useState<CollectionPublic[]>([]);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState<string | null>(null);
  const [selectedVariant, setSelectedVariant] = useState<Record<string, string>>({});
  const [appliedCollectionSlug, setAppliedCollectionSlug] = useState<string | null>(null);

  // Load catalog
  const loadCollections = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/collections');
      if (!res.ok) throw new Error('Failed to load');
      const data = await res.json();
      setCollections(data.collections || []);
      // Pre-select the default variant for each Collection
      const defaults: Record<string, string> = {};
      for (const c of data.collections || []) {
        const def = c.variants.find((v) => v.isDefault) ?? c.variants[0];
        if (def) defaults[c.id] = def.id;
      }
      setSelectedVariant(defaults);
    } catch {
      toast.error('Impossible de charger le catalogue des Collections');
    } finally {
      setLoading(false);
    }
  }, []);

  // Load currently-applied Collection (from /api/theme customizations.collectionMeta)
  const loadAppliedCollection = useCallback(async () => {
    try {
      const res = await fetch('/api/theme');
      if (!res.ok) return;
      const data = await res.json();
      const customizations =
        typeof data.customizations === 'string'
          ? (() => {
              try {
                return JSON.parse(data.customizations);
              } catch {
                return null;
              }
            })()
          : data.customizations;
      const meta = customizations?.collectionMeta;
      if (meta?.collectionSlug) {
        setAppliedCollectionSlug(meta.collectionSlug);
      }
    } catch {
      // silent — cosmetic only
    }
  }, []);

  useEffect(() => {
    loadCollections();
    loadAppliedCollection();
  }, [loadCollections, loadAppliedCollection]);

  const handleApply = async (collection: CollectionPublic) => {
    const variantId = selectedVariant[collection.id];
    if (!variantId) {
      toast.error('Veuillez sélectionner une variante');
      return;
    }
    setApplying(collection.id);
    try {
      const res = await fetch('/api/collections/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          collectionId: collection.id,
          variantId,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Échec de l\'application');
      }
      const result = await res.json();
      if (result.alreadyApplied) {
        toast.info(`Collection "${collection.name}" déjà appliquée`);
      } else {
        toast.success(`Collection "${collection.name}" appliquée avec succès`);
      }
      setAppliedCollectionSlug(collection.slug);
      // Reload the page after a short delay so ThemeInjector picks up the new theme
      setTimeout(() => window.location.reload(), 800);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erreur inconnue');
    } finally {
      setApplying(null);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-serif tracking-tight flex items-center gap-2">
            <Crown className="w-6 h-6 text-primary" />
            Collections
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Choisissez une Collection Premium pour votre mariage.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-72 w-full rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-serif tracking-tight flex items-center gap-2">
          <Crown className="w-6 h-6 text-primary" />
          Collections
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Choisissez une Collection Premium pour votre mariage. Chaque Collection
          inclut le thème, l&apos;ambiance visuelle et les designs Penpot associés.
        </p>
      </div>

      {collections.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Aucune Collection disponible pour votre plan actuel.
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {collections.map((collection) => (
            <CollectionCard
              key={collection.id}
              collection={collection}
              isApplied={appliedCollectionSlug === collection.slug}
              applying={applying === collection.id}
              selectedVariantId={selectedVariant[collection.id]}
              onVariantChange={(variantId) =>
                setSelectedVariant((prev) => ({ ...prev, [collection.id]: variantId }))
              }
              onApply={() => handleApply(collection)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Single Collection card ──────────────────────────────────────────────────

interface CollectionCardProps {
  collection: CollectionPublic;
  isApplied: boolean;
  applying: boolean;
  selectedVariantId: string | undefined;
  onVariantChange: (variantId: string) => void;
  onApply: () => void;
}

function CollectionCard({
  collection,
  isApplied,
  applying,
  selectedVariantId,
  onVariantChange,
  onApply,
}: CollectionCardProps) {
  const { themeSeed, luxuryPreset, variants } = collection;

  return (
    <Card
      className={`overflow-hidden transition-all hover:shadow-lg ${
        isApplied ? 'ring-2 ring-primary' : ''
      }`}
    >
      {/* Visual preview — a gradient swatch using the Collection's themeSeed */}
      <div
        className="h-40 relative flex items-center justify-center overflow-hidden"
        style={{
          background: `linear-gradient(135deg, ${themeSeed.primaryColor}, ${themeSeed.accentColor})`,
        }}
      >
        <div className="absolute inset-0 opacity-30">
          {/* Decorative sparkle overlay */}
          <Sparkles className="absolute top-4 right-4 w-6 h-6 text-white/70" />
          <Sparkles className="absolute bottom-6 left-6 w-4 h-4 text-white/50" />
        </div>
        <div className="relative text-center px-4">
          <div
            className="text-2xl font-serif text-white drop-shadow-lg"
            style={{ fontFamily: `'${themeSeed.fontDisplay}', serif` }}
          >
            {collection.name}
          </div>
          <div
            className="text-xs text-white/80 mt-1"
            style={{ fontFamily: `'${themeSeed.fontBody}', sans-serif` }}
          >
            {collection.category}
          </div>
        </div>
        {isApplied && (
          <div className="absolute top-2 left-2 bg-primary text-primary-foreground text-xs px-2 py-1 rounded-full flex items-center gap-1 shadow">
            <Check className="w-3 h-3" />
            Appliquée
          </div>
        )}
      </div>

      <CardContent className="p-4 space-y-4">
        {/* Description */}
        {collection.description && (
          <p className="text-xs text-muted-foreground line-clamp-2">
            {collection.description}
          </p>
        )}

        {/* Theme swatches */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Palette:</span>
          <div
            className="w-5 h-5 rounded-full border-2 border-white shadow"
            style={{ backgroundColor: themeSeed.primaryColor }}
            title={`Primaire: ${themeSeed.primaryColor}`}
          />
          <div
            className="w-5 h-5 rounded-full border-2 border-white shadow"
            style={{ backgroundColor: themeSeed.accentColor }}
            title={`Accent: ${themeSeed.accentColor}`}
          />
          {luxuryPreset && (
            <Badge variant="secondary" className="text-xs">
              <Sparkles className="w-3 h-3 mr-1" />
              {luxuryPreset.theme}
            </Badge>
          )}
        </div>

        {/* Fonts */}
        <div className="text-xs text-muted-foreground">
          <span style={{ fontFamily: `'${themeSeed.fontDisplay}', serif` }} className="font-medium">
            {themeSeed.fontDisplay}
          </span>
          {' · '}
          <span style={{ fontFamily: `'${themeSeed.fontBody}', sans-serif` }}>
            {themeSeed.fontBody}
          </span>
        </div>

        {/* Variant picker (only if more than 1 variant) */}
        {variants.length > 1 && (
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Variante</label>
            <Select
              value={selectedVariantId}
              onValueChange={onVariantChange}
              disabled={applying}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {variants.map((v) => (
                  <SelectItem key={v.id} value={v.id} className="text-xs">
                    {v.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Apply button */}
        <Button
          onClick={onApply}
          disabled={applying || isApplied}
          className="w-full"
          variant={isApplied ? 'secondary' : 'default'}
        >
          {applying ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Application…
            </>
          ) : isApplied ? (
            <>
              <Check className="w-4 h-4 mr-2" />
              Appliquée
            </>
          ) : (
            <>
              <Crown className="w-4 h-4 mr-2" />
              Appliquer cette Collection
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
