'use client';

// ══════════════════════════════════════════════════════════════════════════════
// SetupProgress — P2-UX (Sprint Premium) : le parcours de configuration visible
// ══════════════════════════════════════════════════════════════════════════════
//
// Premium banner rendered at the top of the wedding admin Dashboard (PX-1):
//   - Gold SVG completion ring (percent across 8 milestones)
//   - Milestone chips (done = gold check · todo = dashed outline)
//   - ONE next-best-action CTA (first incomplete milestone, deep-linked into
//     the /w/[slug]/setup wizard when the milestone is wizard-covered)
//
// Contract: the banner is an ENHANCEMENT — on any fetch error it renders
// null (the dashboard must never break because of it). At 100% it renders
// null as well: premium means no residual noise once the journey is done.
// Data source: GET /api/admin/setup-progress (same auth surface as
// /api/admin/dashboard). The global fetch interceptor installed by the admin
// shell transparently adds X-Wedding-Slug + credentials.

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import {
  CircleCheck,
  Circle,
  ArrowRight,
  Sparkles,
  Users,
  BookOpen,
  Clock,
  CalendarDays,
  ImageIcon,
  Music,
  Crown,
  UserPlus,
} from 'lucide-react';

interface Milestone {
  id: string;
  label: string;
  done: boolean;
  detail: string;
}

interface SetupProgressData {
  slug: string;
  percent: number;
  milestones: Milestone[];
  nextAction: { label: string; href: string } | null;
}

const MILESTONE_ICONS: Record<string, typeof Users> = {
  profil: CalendarDays,
  invites: UserPlus,
  histoire: BookOpen,
  chronologie: Clock,
  programme: CalendarDays,
  medias: ImageIcon,
  musique: Music,
  publication: Crown,
};

const RING_RADIUS = 34;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

export function SetupProgress() {
  const [data, setData] = useState<SetupProgressData | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/admin/setup-progress', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((json: SetupProgressData | null) => {
        if (!cancelled && json && typeof json.percent === 'number') setData(json);
      })
      .catch(() => null)
      .finally(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Enhancement contract: never render on error, never render when complete.
  if (!ready || !data || data.percent >= 100) return null;

  const offset = RING_CIRCUMFERENCE * (1 - data.percent / 100);

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: 'easeOut', delay: 0.1 }}
      className="glass-card gold-border border-0 rounded-2xl p-4 md:p-5"
    >
      <div className="flex flex-col md:flex-row md:items-center gap-5">
        {/* Completion ring */}
        <div className="flex items-center gap-4 shrink-0">
          <div className="relative w-[84px] h-[84px]">
            <svg viewBox="0 0 84 84" className="w-full h-full -rotate-90">
              <defs>
                <linearGradient id="setupGoldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#d4a853" />
                  <stop offset="100%" stopColor="#f0d9a8" />
                </linearGradient>
              </defs>
              <circle
                cx="42"
                cy="42"
                r={RING_RADIUS}
                fill="none"
                stroke="rgba(212,168,83,0.15)"
                strokeWidth="6"
              />
              <motion.circle
                cx="42"
                cy="42"
                r={RING_RADIUS}
                fill="none"
                stroke="url(#setupGoldGrad)"
                strokeWidth="6"
                strokeLinecap="round"
                strokeDasharray={RING_CIRCUMFERENCE}
                initial={{ strokeDashoffset: RING_CIRCUMFERENCE }}
                animate={{ strokeDashoffset: offset }}
                transition={{ duration: 1.1, ease: 'easeOut', delay: 0.3 }}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-lg font-bold gold-gradient leading-none">{data.percent}%</span>
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground mt-0.5">
                prêt
              </span>
            </div>
          </div>
          <div>
            <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
              <Sparkles className="w-4 h-4 text-gold" />
              Parcours de configuration
            </p>
            <p className="text-xs text-muted-foreground mt-1 max-w-[220px]">
              {data.percent === 0
                ? 'Commencez par le profil de votre mariage.'
                : 'Chaque étape rapproche vos invités du grand jour.'}
            </p>
          </div>
        </div>

        {/* Milestone chips */}
        <div className="flex-1 flex flex-wrap gap-2">
          {data.milestones.map((m, i) => {
            const Icon = MILESTONE_ICONS[m.id] || Circle;
            return (
              <motion.div
                key={m.id}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.35 + i * 0.04, duration: 0.25 }}
                title={m.detail}
                className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium border ${
                  m.done
                    ? 'border-gold/40 bg-gold/10 text-gold'
                    : 'border-dashed border-white/15 text-muted-foreground'
                }`}
              >
                {m.done ? (
                  <CircleCheck className="w-3.5 h-3.5 text-gold" />
                ) : (
                  <Icon className="w-3.5 h-3.5 opacity-60" />
                )}
                {m.label}
              </motion.div>
            );
          })}
        </div>

        {/* Next best action */}
        {data.nextAction && (
          <Link
            href={data.nextAction.href}
            className="shrink-0 inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold text-[#1a1209] bg-gradient-gold hover:opacity-90 transition-opacity shadow-lg shadow-gold/10"
          >
            {data.nextAction.label}
            <ArrowRight className="w-4 h-4" />
          </Link>
        )}
      </div>
    </motion.div>
  );
}
