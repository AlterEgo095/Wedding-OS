// ══════════════════════════════════════════════════════════════════════════════
// src/app/platform/admin/tabs/production/IdentityPresetsManager.tsx
// Phase 2E (MISSION 5.9.0 §20.4) — Admin viewer for the 5 wedding identity presets.
// ══════════════════════════════════════════════════════════════════════════════
//
// Read-only viewer for the 5 curated wedding identities (royal-luxury,
// minimal-editorial, botanical-romance, cinematic-dark, modern-champagne).
// Lists them as cards with a color swatch preview, label, and description.
// Clicking a card opens a detail panel showing the full DNA: colors, fonts,
// pattern, motion tier, copy tone, and section component overrides.
//
// Each card has an "Aperçu" button linking to /showcase?identity=<id> so
// designers can see the identity rendered with the IdentityHero dispatcher
// (Phase 2E showcase support).
//
// Full editing (custom colors, pattern upload, motion tier slider) comes in
// Phase 4A Preview Lab — this viewer is the curated catalog only.
//
// French labels throughout (audit constraint). Uses shadcn Card, Badge,
// Button. Token-driven (gold / muted-foreground / border tokens). No new
// API call — reads directly from the IDENTITY_PRESETS static registry.
// ══════════════════════════════════════════════════════════════════════════════

'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Eye,
  Palette,
  Type,
  Sparkles,
  Layers,
  Wand2,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  IDENTITY_PRESETS,
  identityPresetToThemePreset,
  type IdentityPreset,
  type WeddingIdentity,
} from '@/lib/themes/identity-presets';
import { getThemePreset } from '@/lib/themes/presets';

// ─── Motion tier badge styling ────────────────────────────────────────────────

const MOTION_TIER_BADGE: Record<IdentityPreset['motionTier'], string> = {
  subtle: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
  elegant: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  cinematic: 'bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-500/30',
  none: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30',
};

const MOTION_TIER_LABEL: Record<IdentityPreset['motionTier'], string> = {
  subtle: 'Subtile',
  elegant: 'Élégante',
  cinematic: 'Cinématique',
  none: 'Aucune',
};

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * IdentityPresetsManager — read-only viewer for the 5 wedding identity presets.
 *
 * Phase 2E: catalog view + detail drawer. Phase 4A will add full editing.
 */
export function IdentityPresetsManager(): React.ReactNode {
  const [selectedId, setSelectedId] = useState<WeddingIdentity | null>(null);
  const selected = selectedId
    ? IDENTITY_PRESETS.find((p) => p.id === selectedId) ?? null
    : null;

  return (
    <div className="space-y-6">
      {/* ─── Header ──────────────────────────────────────────────────────── */}
      <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="font-display text-2xl text-gold tracking-wide">
            Identités Mariage
          </h2>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Cinq identités curated associant thème, composants premium et
            ambiance. Lecture seule pour la Phase 2E — l&apos;édition complète
            arrive avec le Preview Lab (Phase 4A).
          </p>
        </div>
        <Badge variant="outline" className="text-[10px] uppercase tracking-wide self-start">
          {IDENTITY_PRESETS.length} identités
        </Badge>
      </header>

      {/* ─── Detail drawer (overlaying the grid) ─────────────────────────── */}
      {selected ? (
        <IdentityDetailPanel
          identity={selected}
          onBack={() => setSelectedId(null)}
        />
      ) : (
        <IdentityCardGrid onSelect={setSelectedId} />
      )}
    </div>
  );
}

export default IdentityPresetsManager;

// ─── Sub-components ───────────────────────────────────────────────────────────

/**
 * Grid of identity cards — the default catalog view.
 */
function IdentityCardGrid({
  onSelect,
}: {
  onSelect: (id: WeddingIdentity) => void;
}): React.ReactNode {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {IDENTITY_PRESETS.map((identity) => (
        <IdentityCard key={identity.id} identity={identity} onSelect={onSelect} />
      ))}
    </div>
  );
}

/**
 * A single identity card in the catalog grid.
 */
function IdentityCard({
  identity,
  onSelect,
}: {
  identity: IdentityPreset;
  onSelect: (id: WeddingIdentity) => void;
}): React.ReactNode {
  return (
    <Card className="group relative overflow-hidden border-white/10 bg-white/[0.02] transition-colors hover:border-gold/30 hover:bg-white/[0.04]">
      {/* Color swatch header */}
      <div
        className="h-24 w-full"
        style={{ backgroundColor: identity.preview.bg }}
        aria-hidden="true"
      >
        <div className="flex h-full w-full items-end justify-start gap-1.5 p-3">
          {identity.preview.swatch.map((color, i) => (
            <span
              key={i}
              className="size-6 rounded-full border border-white/20 shadow-sm"
              style={{ backgroundColor: color }}
              aria-hidden="true"
            />
          ))}
        </div>
      </div>

      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base font-display text-foreground">
            {identity.label}
          </CardTitle>
          <Badge
            variant="outline"
            className={`text-[9px] uppercase tracking-wide ${MOTION_TIER_BADGE[identity.motionTier]}`}
          >
            {MOTION_TIER_LABEL[identity.motionTier]}
          </Badge>
        </div>
        <CardDescription className="text-xs leading-relaxed line-clamp-3">
          {identity.description}
        </CardDescription>
      </CardHeader>

      <CardContent className="pb-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {identity.sectionOverrides.map((override) => (
            <Badge
              key={`${override.sectionType}-${override.component}`}
              variant="outline"
              className="text-[9px] uppercase tracking-wide bg-gold/10 text-gold border-gold/20"
            >
              {override.sectionType} → {override.component}
            </Badge>
          ))}
        </div>
      </CardContent>

      <CardFooter className="gap-2 pt-0">
        <Button
          size="sm"
          variant="outline"
          className="h-9 text-xs"
          onClick={() => onSelect(identity.id)}
        >
          Détails
        </Button>
        <Button asChild size="sm" className="h-9 text-xs">
          <Link href={`/showcase?identity=${encodeURIComponent(identity.id)}`}>
            <Eye className="size-3.5 mr-1" />
            Aperçu
          </Link>
        </Button>
      </CardFooter>
    </Card>
  );
}

/**
 * Detail panel shown when a card is clicked — full DNA of the identity.
 */
function IdentityDetailPanel({
  identity,
  onBack,
}: {
  identity: IdentityPreset;
  onBack: () => void;
}): React.ReactNode {
  const theme = identityPresetToThemePreset(identity);
  const basePreset = getThemePreset(identity.basePresetSlug);

  return (
    <div className="space-y-6">
      {/* ─── Back button ─────────────────────────────────────────────────── */}
      <Button
        size="sm"
        variant="ghost"
        className="text-muted-foreground hover:text-foreground"
        onClick={onBack}
      >
        <ArrowLeft className="size-4 mr-1.5" />
        Retour au catalogue
      </Button>

      {/* ─── Identity header card ────────────────────────────────────────── */}
      <Card className="border-white/10 bg-white/[0.02]">
        <div
          className="h-32 w-full rounded-t-lg"
          style={{ backgroundColor: identity.preview.bg }}
          aria-hidden="true"
        >
          <div className="flex h-full w-full items-end justify-start gap-2 p-4">
            {identity.preview.swatch.map((color, i) => (
              <span
                key={i}
                className="size-10 rounded-full border-2 border-white/20 shadow-md"
                style={{ backgroundColor: color }}
                aria-hidden="true"
              />
            ))}
          </div>
        </div>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle className="text-xl font-display text-gold">
              {identity.label}
            </CardTitle>
            <Badge
              variant="outline"
              className={`text-[10px] uppercase tracking-wide ${MOTION_TIER_BADGE[identity.motionTier]}`}
            >
              Motion : {MOTION_TIER_LABEL[identity.motionTier]}
            </Badge>
            <Badge
              variant="outline"
              className="text-[10px] uppercase tracking-wide bg-violet-500/15 text-violet-300 border-violet-500/30"
            >
              <Wand2 className="size-3 mr-1" />
              Ton : {identity.copyTone}
            </Badge>
          </div>
          <CardDescription className="text-sm leading-relaxed pt-2">
            {identity.description}
          </CardDescription>
        </CardHeader>
      </Card>

      {/* ─── Detail grid ─────────────────────────────────────────────────── */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* ─── Colors ──────────────────────────────────────────────────── */}
        <Card className="border-white/10 bg-white/[0.02]">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm font-display text-foreground">
              <Palette className="size-4 text-gold" />
              Couleurs
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <ColorRow label="Primaire" value={theme.primaryColor} />
            <ColorRow label="Accent" value={theme.accentColor} />
            <ColorRow label="Surface" value={theme.surface ?? '—'} />
            <ColorRow label="Surface profonde" value={theme.surfaceDeep ?? '—'} />
            <ColorRow label="Texte" value={theme.text ?? '—'} />
          </CardContent>
        </Card>

        {/* ─── Fonts ───────────────────────────────────────────────────── */}
        <Card className="border-white/10 bg-white/[0.02]">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm font-display text-foreground">
              <Type className="size-4 text-gold" />
              Typographie
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
                Titre
              </p>
              <p className="font-display text-lg text-foreground">
                {theme.fontDisplay}
              </p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
                Corps
              </p>
              <p className="font-body text-base text-foreground">
                {theme.fontBody}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* ─── Pattern & Ambiance ──────────────────────────────────────── */}
        <Card className="border-white/10 bg-white/[0.02]">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm font-display text-foreground">
              <Sparkles className="size-4 text-gold" />
              Motif & Ambiance
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
                Motif
              </p>
              <p className="font-mono text-xs text-foreground/80 break-all">
                {identity.pattern === 'none' ? 'aucun' : identity.pattern.slice(0, 80) + (identity.pattern.length > 80 ? '…' : '')}
              </p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
                Ambiance
              </p>
              <p className="font-mono text-xs text-foreground/80 break-all">
                {identity.ambiance.slice(0, 100)}{identity.ambiance.length > 100 ? '…' : ''}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* ─── Section overrides ───────────────────────────────────────── */}
        <Card className="border-white/10 bg-white/[0.02]">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm font-display text-foreground">
              <Layers className="size-4 text-gold" />
              Surcharges de sections
            </CardTitle>
            <CardDescription className="text-xs">
              Composants premium utilisés à la place des composants par défaut.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {identity.sectionOverrides.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">
                Aucune surcharge — utilise les composants par défaut.
              </p>
            ) : (
              identity.sectionOverrides.map((override) => (
                <div
                  key={`${override.sectionType}-${override.component}`}
                  className="flex items-center justify-between gap-2 rounded-md border border-white/10 bg-white/[0.02] px-3 py-2"
                >
                  <span className="text-xs font-mono text-muted-foreground">
                    {override.sectionType}
                  </span>
                  <span className="text-xs text-gold font-semibold">
                    → {override.component}
                  </span>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {/* ─── Base preset reference ──────────────────────────────────────── */}
      <Card className="border-white/10 bg-white/[0.02]">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-display text-foreground">
            Preset de base
          </CardTitle>
          <CardDescription className="text-xs">
            L&apos;identité surcharge ce ThemePreset canonique (Phase 1B).
          </CardDescription>
        </CardHeader>
        <CardContent>
          {basePreset ? (
            <div className="flex items-center gap-3">
              <Badge variant="outline" className="text-[10px] uppercase tracking-wide bg-emerald-500/15 text-emerald-300 border-emerald-500/30">
                {basePreset.slug}
              </Badge>
              <span className="text-sm text-foreground">{basePreset.label}</span>
              <span className="text-xs text-muted-foreground">
                ({basePreset.category} · {basePreset.tier})
              </span>
            </div>
          ) : (
            <p className="text-xs text-red-300">
              Preset de base introuvable — erreur de configuration.
            </p>
          )}
        </CardContent>
      </Card>

      {/* ─── Preview CTA ────────────────────────────────────────────────── */}
      <div className="flex justify-end gap-2">
        <Button asChild>
          <Link href={`/showcase?identity=${encodeURIComponent(identity.id)}`}>
            <Eye className="size-4 mr-1.5" />
            Aperçu sur /showcase
          </Link>
        </Button>
      </div>
    </div>
  );
}

/**
 * A single color row in the detail panel — label + hex value + swatch.
 */
function ColorRow({ label, value }: { label: string; value: string }): React.ReactNode {
  const isHex = /^#[0-9A-Fa-f]{3,8}$/.test(value);
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="flex items-center gap-2">
        <span className="font-mono text-xs text-foreground/80">{value}</span>
        {isHex && (
          <span
            className="size-5 rounded-full border border-white/20"
            style={{ backgroundColor: value }}
            aria-hidden="true"
          />
        )}
      </div>
    </div>
  );
}
