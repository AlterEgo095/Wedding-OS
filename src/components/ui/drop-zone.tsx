// ══════════════════════════════════════════════════════════════════════════════
// src/components/ui/drop-zone.tsx
// Phase 3D (MISSION 5.9.0) — Micro-interaction #4: Drag-drop zone w/ gold accent.
// ══════════════════════════════════════════════════════════════════════════════
//
// A reusable drag-drop zone that highlights in gold when a file is dragged
// over it. Used in the admin MediaManager upload dialog (Phase 3D task #4)
// but designed to drop into any surface that needs file drag-drop.
//
// API:
//   <DropZone onDrop={(files) => handleFiles(files)} accept="image/*,video/*">
//     <p>Glissez vos fichiers ici</p>
//   </DropZone>
//
// Reduced motion:
//   - The drag-over highlight is a static colour swap — no transition is
//     applied when `prefers-reduced-motion: reduce` is set, so the gold
//     border appears instantly instead of fading in. This matches the spec
//     ("no transition on border color change" under reduced motion).
//
// Accessibility:
//   - The zone is a `<div>` (not a button) — the consumer is expected to
//     ALSO render a "browse" button that opens the OS file picker, since
//     drag-drop alone is not keyboard-accessible. DropZone just exposes
//     the `onDrop` handler; the consumer wires it to their existing file
//     input (see MediaManager for the canonical pattern).
//   - `aria-label="Zone de dépôt de fichiers"` + role="region" so screen
//     readers announce the zone's purpose.
//   - The `dragover`/`dragleave` handlers call `e.preventDefault()` so the
//     browser doesn't navigate to the dropped file (the default behaviour).
// ══════════════════════════════════════════════════════════════════════════════

'use client';

import { useState, useCallback, type ReactNode, type DragEvent } from 'react';
import { useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';

/**
 * Handler invoked with the dropped File[] when the user releases files.
 *
 * The `files` parameter name is part of the public API documentation and is
 * referenced in JSDoc — it's intentionally "unused" in the type-signature
 * sense (this is a function type, not an implementation).
 */
// eslint-disable-next-line no-unused-vars
export type DropZoneHandler = (files: File[]) => void;

export interface DropZoneProps {
  /** Called with the dropped File[] when the user releases files here. */
  onDrop: DropZoneHandler;
  /**
   * Optional `accept` hint — used purely for the aria-label so AT users
   * hear which file types are accepted. The OS-level filtering happens
   * in the consumer's hidden `<input type="file">`.
   */
  accept?: string;
  /** Content rendered inside the zone (label, icon, hint, etc.). */
  children: ReactNode;
  /** Optional className — merged with the zone's base classes. */
  className?: string;
  /** Accessible label. Defaults to "Zone de dépôt de fichiers". */
  ariaLabel?: string;
}

export function DropZone({
  onDrop,
  accept,
  children,
  className,
  ariaLabel = 'Zone de dépôt de fichiers',
}: DropZoneProps) {
  const [isDragActive, setIsDragActive] = useState(false);
  const prefersReducedMotion = useReducedMotion();

  const handleDragEnter = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(true);
  }, []);

  const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    // Some browsers fire dragenter only once; dragover fires continuously,
    // so we re-assert the active state here (idempotent).
    if (!isDragActive) setIsDragActive(true);
  }, [isDragActive]);

  const handleDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    // Only deactivate when leaving the zone itself (not when entering a
    // child element). `relatedTarget` is the element entering; if it's
    // null or not contained by the zone, we're truly leaving.
    const related = e.relatedTarget as Node | null;
    if (related && e.currentTarget.contains(related)) return;
    setIsDragActive(false);
  }, []);

  const handleDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragActive(false);
      const files = Array.from(e.dataTransfer?.files ?? []);
      if (files.length > 0) onDrop(files);
    },
    [onDrop],
  );

  return (
    <div
      role="region"
      aria-label={accept ? `${ariaLabel} (${accept})` : ariaLabel}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={cn(
        // Base: dashed border, subtle bg, rounded, padded.
        'rounded-lg border-2 border-dashed p-6 text-center',
        // Resting state: muted border + transparent bg.
        'border-white/20 bg-transparent',
        // Drag-active state: gold border + soft gold tint + gold glow.
        // The glow itself is a static shadow (no transition).
        isDragActive &&
          'border-[var(--gold-light)] bg-[var(--gold-light)]/5 ' +
            'shadow-[0_0_18px_var(--gold-light)]',
        // Reduced-motion: instant border/bg swap (no transition).
        // Non-reduced: smooth 200ms transition on border/bg/shadow.
        prefersReducedMotion ? '' : 'transition-colors duration-200',
        className,
      )}
    >
      {children}
    </div>
  );
}

export default DropZone;
