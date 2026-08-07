'use client';

// ══════════════════════════════════════════════════════════════════════════════
// Mission 6.0 — P4.3 — ProgramTimeline (public wedding page component)
// ══════════════════════════════════════════════════════════════════════════════
//
// Renders the wedding-day program (ProgramItem[]) as a vertical timeline:
//   • Time on the LEFT (HH:MM, formatted in fr-FR)
//   • Lucide icon in the MIDDLE (on the vertical rule)
//   • Content on the RIGHT (title, description, location)
//
// This component REPLACES the legacy EventTimeline.tsx for the wedding-day
// program. EventTimeline.tsx is kept (deprecated) for backward compat with
// the love-story timeline section, but the wedding-day schedule now uses
// ProgramTimeline reading from ProgramItem (the canonical model post-P4.3).
//
// Data source: GET /api/weddings/{id}/program (public for PUBLISHED weddings).
// Falls back gracefully: empty program → empty state, fetch error → error
// state with retry button.
//
// Lucide icon mapping: iconName string → Lucide component. Unknown icon
// names fall back to Calendar (neutral "scheduled event" visual).
// ══════════════════════════════════════════════════════════════════════════════

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Clock,
  Heart,
  Utensils,
  UtensilsCrossed,
  Music,
  Camera,
  PartyPopper,
  MapPin,
  Church,
  Wine,
  Cake,
  Flower2,
  Gift,
  Sparkles,
  Calendar,
  type LucideIcon,
} from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

// ─── Types ───────────────────────────────────────────────────────────────────

interface ProgramItemDto {
  id: string;
  scheduledAt: string | null;
  title: string;
  description: string | null;
  location: string | null;
  iconName: string | null;
  sortOrder: number;
}

interface Props {
  weddingId: string;
  /** Optional className for the outer container. */
  className?: string;
}

// ─── Lucide icon registry ────────────────────────────────────────────────────
//
// ProgramItem.iconName stores a Lucide icon name as a string (e.g. "Heart",
// "UtensilsCrossed"). We map these to the actual Lucide component so the
// public site renders them as crisp vector icons rather than emoji (which
// was the legacy EventTimeline.icon format — and the reason emoji rendering
// varied across platforms).
//
// Unknown names fall back to Calendar (a neutral "scheduled event" icon).
const ICON_REGISTRY: Record<string, LucideIcon> = {
  Clock,
  Heart,
  Utensils,
  UtensilsCrossed,
  Music,
  Camera,
  PartyPopper,
  MapPin,
  Church,
  Wine,
  Cake,
  Flower2,
  Gift,
  Sparkles,
  Calendar,
};

function resolveIcon(name: string | null | undefined): LucideIcon {
  if (!name) return Calendar;
  // Direct PascalCase match (canonical form stored by ProgramManager.tsx)
  if (ICON_REGISTRY[name]) return ICON_REGISTRY[name];
  // Lowercase keyword match (defensive — covers values authored by the
  // migration script's emoji-keyword map)
  const lower = name.toLowerCase();
  if (ICON_REGISTRY[lower]) return ICON_REGISTRY[lower];
  // Camel-case first letter (defensive)
  const pascal = name.charAt(0).toUpperCase() + name.slice(1);
  if (ICON_REGISTRY[pascal]) return ICON_REGISTRY[pascal];
  return Calendar;
}

// ─── Time formatting ─────────────────────────────────────────────────────────

function formatTime(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Intl.DateTimeFormat('fr-FR', {
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(iso));
  } catch {
    return '—';
  }
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function ProgramTimeline({ weddingId, className }: Props) {
  const [items, setItems] = useState<ProgramItemDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchProgram = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/weddings/${weddingId}/program`, {
        cache: 'no-store',
      });
      if (!res.ok) {
        if (res.status === 404) {
          setError('Programme introuvable pour ce mariage.');
        } else if (res.status === 401 || res.status === 403) {
          setError('Ce mariage n’est pas encore publié.');
        } else {
          setError('Erreur lors du chargement du programme.');
        }
        setItems([]);
        return;
      }
      const json = (await res.json()) as { program?: ProgramItemDto[] };
      setItems(Array.isArray(json.program) ? json.program : []);
    } catch {
      setError('Erreur de connexion.');
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProgram();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weddingId]);

  // ─── Loading state ─────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className={`space-y-6 ${className ?? ''}`} aria-busy="true">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex gap-4 items-start">
            <Skeleton className="h-10 w-16 rounded-md shrink-0" />
            <Skeleton className="h-10 w-10 rounded-full shrink-0" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-5 w-2/3" />
              <Skeleton className="h-4 w-full" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  // ─── Error state ──────────────────────────────────────────────────────
  if (error) {
    return (
      <div className={`text-center py-12 ${className ?? ''}`}>
        <Calendar className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
        <p className="text-muted-foreground mb-4">{error}</p>
        <button
          onClick={fetchProgram}
          className="text-sm text-gold-light hover:underline"
        >
          Réessayer
        </button>
      </div>
    );
  }

  // ─── Empty state ──────────────────────────────────────────────────────
  if (items.length === 0) {
    return (
      <div className={`text-center py-12 ${className ?? ''}`}>
        <Calendar className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
        <p className="text-muted-foreground">
          Le programme de la journée n’a pas encore été publié.
        </p>
      </div>
    );
  }

  // ─── Timeline ─────────────────────────────────────────────────────────
  return (
    <div className={`relative ${className ?? ''}`}>
      {/* Vertical rule — sits under the icon column. */}
      <div
        aria-hidden="true"
        className="absolute left-[88px] sm:left-[120px] top-2 bottom-2 w-px bg-gradient-to-b from-gold-light/40 via-gold-light/20 to-transparent"
      />

      <ul className="space-y-6">
        {items.map((item, idx) => {
          const Icon = resolveIcon(item.iconName);
          return (
            <motion.li
              key={item.id}
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-40px' }}
              transition={{ duration: 0.4, delay: Math.min(idx * 0.05, 0.3) }}
              className="relative flex gap-4 items-start"
            >
              {/* Time (left) */}
              <div className="w-16 sm:w-24 shrink-0 pt-1 text-right">
                <span className="font-display text-lg sm:text-xl tabular-nums text-gold-light">
                  {formatTime(item.scheduledAt)}
                </span>
              </div>

              {/* Icon (middle, on the rule) */}
              <div className="relative z-10 shrink-0">
                <div className="flex items-center justify-center w-10 h-10 rounded-full bg-background border-2 border-gold-light/40 shadow-sm">
                  <Icon className="w-5 h-5 text-gold-light" aria-hidden="true" />
                </div>
              </div>

              {/* Content (right) */}
              <div className="flex-1 min-w-0 pb-2">
                <h3 className="font-display text-lg sm:text-xl font-semibold leading-tight">
                  {item.title}
                </h3>
                {item.description && (
                  <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
                    {item.description}
                  </p>
                )}
                {item.location && (
                  <div className="flex items-center gap-1 text-xs text-muted-foreground mt-2">
                    <MapPin className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>{item.location}</span>
                  </div>
                )}
              </div>
            </motion.li>
          );
        })}
      </ul>
    </div>
  );
}

// ─── Skeleton export (for SSR suspense placeholders) ─────────────────────────

export function ProgramTimelineSkeleton({ className }: { className?: string }) {
  return (
    <div className={`space-y-6 ${className ?? ''}`} aria-busy="true">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="flex gap-4 items-start">
          <Skeleton className="h-10 w-16 rounded-md shrink-0" />
          <Skeleton className="h-10 w-10 rounded-full shrink-0" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-4 w-full" />
          </div>
        </div>
      ))}
    </div>
  );
}
