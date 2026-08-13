/**
 * MISSION 5.9.5 — PHASE C
 * Skeleton presets — compositions prêtes à l'emploi qui miment les vrais
 * layouts de la plateforme mariage (dashboards admin, listes d'invités,
 * galeries média, pages mariage, tables de données, etc.).
 *
 * Tous les presets sont des composants serveur (pas de hooks) — ils délèguent
 * aux primitives <Skeleton>/'use client' qui gèrent `useReducedMotion`.
 *
 * Chaque preset accepte :
 *  - `accent?` ('gold' | 'emerald' | 'none') — défaut 'gold'
 *  - `variant?` ('shimmer' | 'pulse' | 'static') — défaut 'shimmer'
 *  - `className?` — override
 *
 * Tous les éléments sont décoratifs (aria-hidden) — l'annonce de chargement
 * SR vient d'une région `aria-live="polite"` séparée dans la page hôte.
 */

import * as React from 'react'
import { Skeleton, SkeletonText, SkeletonCircle, SkeletonButton } from './skeleton'
import type { SkeletonAccent, SkeletonVariant } from './skeleton'
import { cn } from '@/lib/utils'

/* ----------------------------------------------------------------
   Types partagés
---------------------------------------------------------------- */
interface PresetBaseProps {
  accent?: SkeletonAccent
  variant?: SkeletonVariant
  className?: string
}

const DEFAULT_ACCENT: SkeletonAccent = 'gold'

/* ----------------------------------------------------------------
   1. SkeletonDashboardCard — carte métrique admin premium
   (PremiumCard mimic : header avec icône + titre + sous-titre,
    3 lignes de métriques, footer bouton)
---------------------------------------------------------------- */
export function SkeletonDashboardCard({
  accent = DEFAULT_ACCENT,
  variant = 'shimmer',
  className,
}: PresetBaseProps) {
  return (
    <div
      role="presentation"
      aria-hidden="true"
      className={cn(
        'relative overflow-hidden rounded-2xl border border-border bg-card p-5',
        'shadow-[var(--shadow-md)]',
        className,
      )}
    >
      {/* Header : icône circle + titre + sous-titre */}
      <div className="flex items-center gap-3 pb-4">
        <SkeletonCircle size={36} accent={accent} variant={variant} />
        <div className="flex-1 space-y-2">
          <Skeleton variant={variant} accent={accent} width="60%" height={14} />
          <Skeleton variant={variant} accent={accent} width="40%" height={10} />
        </div>
      </div>

      {/* 3 lignes de métriques */}
      <div className="space-y-3 pb-4">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="flex items-center justify-between gap-3 border-b border-border/50 pb-3 last:border-b-0 last:pb-0"
          >
            <Skeleton variant={variant} accent={accent} width="35%" height={12} delay={i * 80} />
            <Skeleton variant={variant} accent={accent} width="20%" height={16} delay={i * 80} />
          </div>
        ))}
      </div>

      {/* Footer bouton */}
      <SkeletonButton size="sm" accent={accent} variant={variant} className="w-full" />
    </div>
  )
}

/* ----------------------------------------------------------------
   2. SkeletonDashboardGrid — grille responsive de 6 cards
---------------------------------------------------------------- */
export function SkeletonDashboardGrid({
  accent = DEFAULT_ACCENT,
  variant = 'shimmer',
  className,
}: PresetBaseProps) {
  return (
    <div
      role="presentation"
      aria-hidden="true"
      className={cn('grid gap-4 sm:grid-cols-2 lg:grid-cols-3', className)}
    >
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <SkeletonDashboardCard key={i} accent={accent} variant={variant} />
      ))}
    </div>
  )
}

/* ----------------------------------------------------------------
   3. SkeletonListRow — ligne d'invité/user horizontal
   (avatar + 2-line text + trailing mini-button icon)
---------------------------------------------------------------- */
export function SkeletonListRow({
  accent = DEFAULT_ACCENT,
  variant = 'shimmer',
  className,
}: PresetBaseProps) {
  return (
    <div
      role="presentation"
      aria-hidden="true"
      className={cn('flex items-center gap-3 p-3', className)}
    >
      <SkeletonCircle size={40} accent={accent} variant={variant} />
      <div className="flex-1 space-y-2">
        <Skeleton variant={variant} accent={accent} width="50%" height={12} />
        <Skeleton variant={variant} accent={accent} width="35%" height={10} delay={60} />
      </div>
      <SkeletonButton
        size="icon"
        accent={accent}
        variant={variant}
        delay={120}
      />
    </div>
  )
}

/* ----------------------------------------------------------------
   4. SkeletonList — 5 SkeletonListRow empilés
---------------------------------------------------------------- */
export function SkeletonList({
  accent = DEFAULT_ACCENT,
  variant = 'shimmer',
  className,
}: PresetBaseProps) {
  return (
    <div
      role="presentation"
      aria-hidden="true"
      className={cn('flex flex-col gap-2', className)}
    >
      {[0, 1, 2, 3, 4].map((i) => (
        <SkeletonListRow key={i} accent={accent} variant={variant} />
      ))}
    </div>
  )
}

/* ----------------------------------------------------------------
   5. SkeletonForm — formulaire vertical (4 champs + submit)
---------------------------------------------------------------- */
export function SkeletonForm({
  accent = 'emerald',
  variant = 'shimmer',
  className,
}: PresetBaseProps) {
  return (
    <div
      role="presentation"
      aria-hidden="true"
      className={cn('flex flex-col gap-4', className)}
    >
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="flex flex-col gap-2">
          <Skeleton variant={variant} accent={accent} width={80} height={12} />
          <Skeleton variant={variant} accent={accent} className="w-full h-11" delay={i * 80} />
        </div>
      ))}
      <SkeletonButton fullWidth accent={accent} variant={variant} className="h-11" delay={320} />
    </div>
  )
}

/* ----------------------------------------------------------------
   6. SkeletonMediaCard — carte média (16:9 + title + meta)
---------------------------------------------------------------- */
export function SkeletonMediaCard({
  accent = DEFAULT_ACCENT,
  variant = 'shimmer',
  className,
}: PresetBaseProps) {
  return (
    <div
      role="presentation"
      aria-hidden="true"
      className={cn(
        'overflow-hidden rounded-xl border border-border bg-card shadow-[var(--shadow-sm)]',
        className,
      )}
    >
      {/* Media block — 16:9 aspect */}
      <Skeleton
        variant={variant}
        accent={accent}
        rounded="none"
        className="aspect-video w-full"
      />
      {/* Title + meta */}
      <div className="space-y-2 p-3">
        <Skeleton variant={variant} accent={accent} width="66%" height={14} delay={60} />
        <div className="flex items-center gap-2 pt-1">
          <SkeletonCircle size={20} accent={accent} variant={variant} delay={120} />
          <Skeleton variant={variant} accent={accent} width="50%" height={10} delay={140} />
        </div>
      </div>
    </div>
  )
}

/* ----------------------------------------------------------------
   7. SkeletonMediaGrid — grille de 8 SkeletonMediaCard (compacte)
   (4 cols sur desktop, 3 sur tablet, 2 sur mobile)
---------------------------------------------------------------- */
export function SkeletonMediaGrid({
  accent = DEFAULT_ACCENT,
  variant = 'shimmer',
  className,
}: PresetBaseProps) {
  return (
    <div
      role="presentation"
      aria-hidden="true"
      className={cn('grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4', className)}
    >
      {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
        <SkeletonMediaCard key={i} accent={accent} variant={variant} />
      ))}
    </div>
  )
}

/* ----------------------------------------------------------------
   8. SkeletonWeddingHero — hero page mariage publique
   (full-width 60vh media + centered title + subtitle + date badge + CTA)
---------------------------------------------------------------- */
export function SkeletonWeddingHero({
  accent = DEFAULT_ACCENT,
  variant = 'shimmer',
  className,
}: PresetBaseProps) {
  return (
    <div
      role="presentation"
      aria-hidden="true"
      className={cn(
        'relative flex flex-col items-center justify-center gap-4 overflow-hidden rounded-xl',
        className,
      )}
    >
      {/* Media backdrop 60vh */}
      <Skeleton
        variant={variant}
        accent={accent}
        rounded="none"
        className="absolute inset-0 w-full h-full"
      />
      {/* Centered title + subtitle + date + CTA (au-dessus) */}
      <div className="relative z-10 flex flex-col items-center gap-4 p-6">
        <Skeleton variant={variant} accent={accent} width="66%" height={48} />
        <Skeleton variant={variant} accent={accent} width="50%" height={20} delay={80} />
        <Skeleton variant={variant} accent={accent} width={128} height={32} delay={160} />
        <div className="flex items-center gap-3 pt-2">
          <SkeletonButton size="default" accent={accent} variant={variant} delay={240} />
          <SkeletonButton size="default" accent={accent} variant={variant} delay={320} />
        </div>
      </div>
    </div>
  )
}

/* ----------------------------------------------------------------
   9. SkeletonAdminShell — layout admin complet
   (top bar + sidebar w-60 + main content SkeletonDashboardGrid)
   Wrap dans AppShell pour cohérence layout.
---------------------------------------------------------------- */
export function SkeletonAdminShell({
  accent = 'emerald',
  variant = 'shimmer',
  className,
}: PresetBaseProps) {
  return (
    <div
      role="presentation"
      aria-hidden="true"
      className={cn('flex min-h-[480px] flex-col overflow-hidden rounded-xl border border-border bg-background', className)}
    >
      {/* Top bar : logo circle + 2 nav pills + spacer */}
      <div className="flex h-14 items-center gap-3 border-b border-border bg-card px-4">
        <SkeletonCircle size={32} accent={accent} variant={variant} />
        <div className="hidden sm:flex items-center gap-2">
          <Skeleton variant={variant} accent={accent} width={64} height={28} rounded="full" />
          <Skeleton variant={variant} accent={accent} width={72} height={28} rounded="full" delay={80} />
        </div>
        <div className="flex-1" />
        <Skeleton variant={variant} accent={accent} width={120} height={28} rounded="full" delay={160} />
      </div>

      {/* Body : sidebar + main content */}
      <div className="flex flex-1">
        {/* Sidebar w-60 (hidden on mobile) */}
        <aside className="hidden w-60 shrink-0 flex-col gap-1 border-r border-border bg-card p-3 md:flex">
          {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
            <div key={i} className="flex items-center gap-2 rounded-lg p-2">
              <SkeletonCircle size={20} accent={accent} variant={variant} delay={i * 60} />
              <Skeleton
                variant={variant}
                accent={accent}
                width="70%"
                height={12}
                delay={i * 60}
              />
            </div>
          ))}
        </aside>

        {/* Main content area */}
        <main className="flex-1 bg-muted/30 p-4 sm:p-6">
          <SkeletonDashboardGrid accent={accent} variant={variant} />
        </main>
      </div>
    </div>
  )
}

/* ----------------------------------------------------------------
   10. SkeletonTable — table de données
   (header row 5 cols + 6 body rows, première cellule = avatar+text)
---------------------------------------------------------------- */
export function SkeletonTable({
  accent = 'emerald',
  variant = 'shimmer',
  className,
}: PresetBaseProps) {
  const headers = [0, 1, 2, 3, 4]
  const rows = [0, 1, 2, 3, 4, 5]
  return (
    <div
      role="presentation"
      aria-hidden="true"
      className={cn('overflow-hidden rounded-xl border border-border bg-card', className)}
    >
      <table className="w-full border-collapse" role="presentation">
        <thead role="presentation">
          <tr role="presentation" className="border-b border-border bg-muted/40">
            {headers.map((i) => (
              <th
                key={i}
                role="presentation"
                className="p-3 text-left"
              >
                <Skeleton
                  variant={variant}
                  accent={accent}
                  width={80}
                  height={12}
                  delay={i * 50}
                />
              </th>
            ))}
          </tr>
        </thead>
        <tbody role="presentation" className="divide-y divide-border">
          {rows.map((r) => (
            <tr key={r} role="presentation">
              {/* Première cellule = avatar + texte */}
              <td role="presentation" className="p-3">
                <div className="flex items-center gap-2">
                  <SkeletonCircle size={28} accent={accent} variant={variant} delay={r * 80} />
                  <div className="space-y-1.5">
                    <Skeleton
                      variant={variant}
                      accent={accent}
                      width={90}
                      height={10}
                      delay={r * 80}
                    />
                    <Skeleton
                      variant={variant}
                      accent={accent}
                      width={60}
                      height={8}
                      delay={r * 80 + 40}
                    />
                  </div>
                </div>
              </td>
              {/* 4 autres cellules = h-3 w-16 */}
              {headers.slice(1).map((c) => (
                <td key={c} role="presentation" className="p-3">
                  <Skeleton
                    variant={variant}
                    accent={accent}
                    width={64}
                    height={12}
                    delay={r * 80 + c * 40}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/* ----------------------------------------------------------------
   11. SkeletonTabs — barre d'onglets + content (SkeletonList)
---------------------------------------------------------------- */
export function SkeletonTabs({
  accent = DEFAULT_ACCENT,
  variant = 'shimmer',
  className,
}: PresetBaseProps) {
  return (
    <div
      role="presentation"
      aria-hidden="true"
      className={cn('flex flex-col gap-4', className)}
    >
      {/* Tabs bar — 4 pills, première active (plus large) */}
      <div className="flex items-center gap-2 border-b border-border pb-3">
        <Skeleton
          variant={variant}
          accent={accent}
          width={96}
          height={32}
          rounded="full"
        />
        <Skeleton
          variant={variant}
          accent={accent}
          width={64}
          height={32}
          rounded="full"
          delay={80}
        />
        <Skeleton
          variant={variant}
          accent={accent}
          width={80}
          height={32}
          rounded="full"
          delay={160}
        />
        <Skeleton
          variant={variant}
          accent={accent}
          width={72}
          height={32}
          rounded="full"
          delay={240}
        />
      </div>
      {/* Content — SkeletonList */}
      <SkeletonList accent={accent} variant={variant} />
    </div>
  )
}

/* ----------------------------------------------------------------
   12. SkeletonMetric — KPI metric tile
   (label + big number + delta avec up-arrow circle)
---------------------------------------------------------------- */
export function SkeletonMetric({
  accent = DEFAULT_ACCENT,
  variant = 'shimmer',
  className,
}: PresetBaseProps) {
  return (
    <div
      role="presentation"
      aria-hidden="true"
      className={cn(
        'rounded-xl border border-border bg-card p-4 shadow-[var(--shadow-sm)]',
        className,
      )}
    >
      <Skeleton variant={variant} accent={accent} width={64} height={12} />
      <Skeleton
        variant={variant}
        accent={accent}
        width={96}
        height={32}
        className="mt-2"
        delay={80}
      />
      <div className="mt-2 flex items-center gap-1.5">
        <SkeletonCircle size={16} accent={accent} variant={variant} delay={160} />
        <Skeleton variant={variant} accent={accent} width={48} height={10} delay={180} />
      </div>
    </div>
  )
}
