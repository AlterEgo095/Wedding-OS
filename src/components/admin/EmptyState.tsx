'use client';

// ══════════════════════════════════════════════════════════════════════════════
// EmptyState — P2-UX (Sprint Premium) : zéro impasse dans les parcours admin
// ══════════════════════════════════════════════════════════════════════════════
//
// Replaces bare "Aucune donnée" lines with a premium, actionable empty state:
// icon in a gold glass medallion + one-line guidance + optional CTA. Every
// empty screen must answer "et maintenant ?" — that is the density contract
// of the re-centering (empty state = CTA, jamais un cul-de-sac).

import { motion } from 'framer-motion';
import type { LucideIcon } from 'lucide-react';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  /** Optional CTA label — renders a gold-gradient button when provided. */
  actionLabel?: string;
  onAction?: () => void;
  /** Compact variant for chart placeholders. */
  compact?: boolean;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction,
  compact = false,
}: EmptyStateProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
      className={`flex flex-col items-center justify-center text-center ${compact ? 'py-8' : 'py-12'}`}
    >
      <div
        className={`rounded-full bg-gradient-to-br from-gold/15 to-gold-light/5 gold-border flex items-center justify-center mb-4 ${
          compact ? 'w-12 h-12' : 'w-16 h-16'
        }`}
      >
        <Icon className={`${compact ? 'w-5 h-5' : 'w-7 h-7'} text-gold`} />
      </div>
      <p className={`font-medium text-foreground ${compact ? 'text-sm' : 'text-base'}`}>{title}</p>
      {description && (
        <p className="text-sm text-muted-foreground mt-1 max-w-sm">{description}</p>
      )}
      {actionLabel && onAction && (
        <button
          onClick={onAction}
          className="mt-5 inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold text-[#1a1209] bg-gradient-gold hover:opacity-90 transition-opacity shadow-lg shadow-gold/10"
        >
          {actionLabel}
        </button>
      )}
    </motion.div>
  );
}
