'use client'

import { motion } from 'framer-motion'
import {
  Crown, Gem, Heart, Sparkles, MapPin, Clock, Calendar, QrCode,
  Ticket, Hash, Users, Mail, Facebook, Instagram, MessageCircle,
} from 'lucide-react'
import type { DesignSystem } from '@/lib/collections/types'

// ══════════════════════════════════════════════════════════════════════════════
// DESIGN RENDERER — renders a REAL visual design for any (collection, module, variant)
// Every renderer uses the Collection's DesignSystem so all 5 collections look distinct.
// Royal Gold renderers (rg-*) have the most polish; others use the same components
// themed by their design system.
// ══════════════════════════════════════════════════════════════════════════════

export interface DesignRendererProps {
  renderer: string
  ds: DesignSystem
  // Sample data for preview. Phase B: defaults are NEUTRAL placeholders
  // ("Mari" / "Mme" / "Mariage") so the catalog previews never leak the
  // default wedding's couple identity ("Josué" / "Hornella"). The actual
  // couple from Settings is passed by CollectionsShowcase via /api/settings.
  couple?: { bride: string; groom: string; label: string; date: string; venue: string; hashtag?: string }
  guest?: { name: string; table: number; seats: number; category: string; code: string }
}

const DEFAULT_COUPLE = {
  bride: 'Mme',
  groom: 'M.',
  label: 'Mari & Mme',
  date: 'Date à définir',
  venue: 'Lieu à définir',
  hashtag: '',
}

// ─── Helper: resolve a renderer key to its collection prefix + module + variant ─
function parseRenderer(r: string): { prefix: string; rest: string } {
  const dash = r.indexOf('-')
  return { prefix: r.slice(0, dash), rest: r.slice(dash + 1) }
}

// ─── Ornamental flourish (gold foil line) ──────────────────────────────────────
function Flourish({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 200 20" className="w-32 mx-auto" fill="none" aria-hidden>
      <path d="M5 10 Q 30 1, 60 10 T 120 10 T 195 10" stroke={color} strokeWidth="0.8" opacity="0.7" />
      <circle cx="100" cy="10" r="1.5" fill={color} opacity="0.9" />
      <path d="M5 10 Q 30 19, 60 10 T 120 10 T 195 10" stroke={color} strokeWidth="0.8" opacity="0.4" />
    </svg>
  )
}

function CornerOrnament({ color, className = '' }: { color: string; className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={className} fill="none" aria-hidden>
      <path d="M2 2 L 18 2 M 2 2 L 2 18 M 2 2 Q 20 4, 20 20 Q 4 20, 2 2" stroke={color} strokeWidth="0.8" opacity="0.6" />
      <circle cx="6" cy="6" r="1" fill={color} opacity="0.8" />
    </svg>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// HERO DESIGNS
// ══════════════════════════════════════════════════════════════════════════════

function HeroA({ ds, couple }: { ds: DesignSystem; couple: NonNullable<DesignRendererProps['couple']> }) {
  return (
    <div
      className="relative w-full aspect-[16/9] rounded-xl overflow-hidden flex flex-col items-center justify-center text-center p-8"
      style={{ background: `linear-gradient(135deg, ${ds.background}, ${ds.surface})` }}
    >
      {/* Decorative bg pattern */}
      <div className="absolute inset-0 opacity-20" style={{
        backgroundImage: `radial-gradient(circle at 20% 20%, ${ds.primary}30 0%, transparent 50%), radial-gradient(circle at 80% 80%, ${ds.secondary}30 0%, transparent 50%)`,
      }} />
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8 }} className="relative z-10">
        <Crown className="mx-auto mb-3" style={{ color: ds.primary }} size={28} />
        <p style={{ color: ds.textMuted }} className="text-xs tracking-[0.4em] uppercase mb-3">Nous nous marions</p>
        <h1 className="font-serif text-4xl md:text-6xl font-bold mb-2" style={{ color: ds.text, fontFamily: ds.fontDisplay }}>
          {couple.label}
        </h1>
        <Flourish color={ds.primary} />
        <p style={{ color: ds.textMuted }} className="mt-3 text-sm tracking-[0.2em] uppercase">{couple.date} · {couple.venue}</p>
      </motion.div>
    </div>
  )
}

function HeroB({ ds, couple }: { ds: DesignSystem; couple: NonNullable<DesignRendererProps['couple']> }) {
  return (
    <div className="relative w-full aspect-[16/9] rounded-xl overflow-hidden grid grid-cols-2" style={{ background: ds.background }}>
      {/* Left: photo placeholder */}
      <div className="relative" style={{ background: `linear-gradient(135deg, ${ds.primary}40, ${ds.secondary}30)` }}>
        <div className="absolute inset-0 flex items-center justify-center">
          <Heart className="opacity-30" style={{ color: ds.text }} size={48} />
        </div>
        <div className="absolute inset-0" style={{ borderRight: `1px solid ${ds.primary}60` }} />
      </div>
      {/* Right: text */}
      <div className="flex flex-col justify-center px-8 py-6 relative">
        <CornerOrnament color={ds.primary} className="absolute top-3 right-3 w-8 h-8" />
        <p style={{ color: ds.textMuted }} className="text-[10px] tracking-[0.4em] uppercase mb-3">Save our date</p>
        <h2 className="font-serif text-3xl md:text-5xl font-bold leading-tight mb-3" style={{ color: ds.text, fontFamily: ds.fontDisplay }}>
          {couple.groom}<br/>&amp; {couple.bride}
        </h2>
        <div className="h-px w-16 my-3" style={{ background: ds.primary }} />
        <p style={{ color: ds.textMuted }} className="text-sm">{couple.date}</p>
        <p style={{ color: ds.textMuted }} className="text-xs flex items-center gap-1 mt-1"><MapPin size={10} />{couple.venue}</p>
      </div>
    </div>
  )
}

function HeroC({ ds, couple }: { ds: DesignSystem; couple: NonNullable<DesignRendererProps['couple']> }) {
  return (
    <div className="relative w-full aspect-[16/9] rounded-xl overflow-hidden flex items-end" style={{ background: `linear-gradient(180deg, ${ds.background}40, ${ds.background})` }}>
      {/* Veil overlay */}
      <div className="absolute inset-0" style={{ background: `linear-gradient(180deg, ${ds.primary}20 0%, transparent 40%, ${ds.background}cc 100%)` }} />
      {/* Giant typography */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 1, delay: 0.3 }} className="relative z-10 p-8 w-full">
        <h1 className="font-serif text-5xl md:text-7xl lg:text-8xl font-black leading-none tracking-tight" style={{ color: ds.text, fontFamily: ds.fontDisplay }}>
          {couple.groom.toUpperCase()}
        </h1>
        <div className="flex items-center gap-3 my-2">
          <div className="h-px flex-1" style={{ background: ds.primary }} />
          <Sparkles size={14} style={{ color: ds.primary }} />
          <div className="h-px flex-1" style={{ background: ds.primary }} />
        </div>
        <h1 className="font-serif text-5xl md:text-7xl lg:text-8xl font-black leading-none tracking-tight text-right" style={{ color: ds.text, fontFamily: ds.fontDisplay }}>
          {couple.bride.toUpperCase()}
        </h1>
        <p style={{ color: ds.textMuted }} className="text-center text-xs tracking-[0.3em] uppercase mt-3">{couple.date}</p>
      </motion.div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// COUNTDOWN
// ══════════════════════════════════════════════════════════════════════════════
function CountdownA({ ds }: { ds: DesignSystem }) {
  const units = [
    { v: '42', l: 'JOURS' },
    { v: '08', l: 'HEURES' },
    { v: '30', l: 'MIN' },
    { v: '15', l: 'SEC' },
  ]
  return (
    <div className="w-full rounded-xl p-6 flex items-center justify-center gap-4" style={{ background: ds.surface }}>
      {units.map((u, i) => (
        <div key={i} className="flex flex-col items-center">
          <div className="relative w-16 h-16 rounded-full flex items-center justify-center" style={{ border: `1px solid ${ds.primary}40`, background: `${ds.background}80` }}>
            <div className="absolute inset-1 rounded-full" style={{ border: `1px solid ${ds.primary}30` }} />
            <span className="font-serif text-xl font-bold" style={{ color: ds.primary }}>{u.v}</span>
          </div>
          <span className="text-[9px] tracking-[0.2em] uppercase mt-2" style={{ color: ds.textMuted }}>{u.l}</span>
        </div>
      ))}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// STORY (timeline preview)
// ══════════════════════════════════════════════════════════════════════════════
function StoryA({ ds, couple }: { ds: DesignSystem; couple: NonNullable<DesignRendererProps['couple']> }) {
  const items = [
    { date: '2019', title: 'Première rencontre', desc: 'Le début de tout' },
    { date: '2021', title: 'Premier voyage', desc: 'Découverte ensemble' },
    { date: '2024', title: 'La demande', desc: 'Il a dit oui' },
    { date: '2025', title: 'Le mariage', desc: 'Pour la vie' },
  ]
  return (
    <div className="w-full rounded-xl p-6" style={{ background: ds.surface }}>
      <div className="relative">
        <div className="absolute left-1/2 top-0 bottom-0 w-px" style={{ background: `${ds.primary}40` }} />
        <div className="space-y-4">
          {items.map((it, i) => (
            <div key={i} className={`flex items-center gap-4 ${i % 2 === 0 ? 'flex-row' : 'flex-row-reverse'}`}>
              <div className="flex-1" />
              <div className="w-3 h-3 rounded-full relative z-10" style={{ background: ds.primary, boxShadow: `0 0 10px ${ds.primary}80` }} />
              <div className="flex-1">
                <p className="text-[10px] tracking-[0.3em] uppercase" style={{ color: ds.primary }}>{it.date}</p>
                <p className="font-serif text-sm font-semibold" style={{ color: ds.text }}>{it.title}</p>
                <p className="text-xs" style={{ color: ds.textMuted }}>{it.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// GALLERY (masonry preview)
// ══════════════════════════════════════════════════════════════════════════════
function GalleryA({ ds }: { ds: DesignSystem }) {
  return (
    <div className="w-full rounded-xl p-4 grid grid-cols-3 gap-2" style={{ background: ds.surface }}>
      {[1, 2, 3, 4, 5, 6].map((i) => (
        <div key={i} className="aspect-square rounded flex items-center justify-center relative overflow-hidden group" style={{ background: `linear-gradient(${i * 50}deg, ${ds.primary}30, ${ds.secondary}30)` }}>
          <Heart className="opacity-30 group-hover:opacity-60 transition-opacity" style={{ color: ds.text }} size={20} />
          <div className="absolute inset-0 group-hover:bg-black/20 transition-colors" />
        </div>
      ))}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// PROGRAMME
// ══════════════════════════════════════════════════════════════════════════════
function ProgrammeA({ ds }: { ds: DesignSystem }) {
  const items = [
    { time: '15:00', icon: 'church', label: 'Cérémonie religieuse', loc: 'Cathédrale' },
    { time: '17:00', icon: 'photo', label: 'Séance photos', loc: 'Jardin' },
    { time: '19:00', icon: 'party', label: 'Cocktail de bienvenue', loc: 'Salle' },
    { time: '21:00', icon: 'dinner', label: 'Dîner de gala', loc: 'Grande salle' },
  ]
  return (
    <div className="w-full rounded-xl p-4 space-y-2" style={{ background: ds.surface }}>
      {items.map((it, i) => (
        <div key={i} className="flex items-center gap-3 p-2 rounded" style={{ background: `${ds.background}60` }}>
          <div className="flex flex-col items-center w-12">
            <Clock size={12} style={{ color: ds.primary }} />
            <span className="text-[10px] font-bold" style={{ color: ds.text }}>{it.time}</span>
          </div>
          <div className="h-8 w-px" style={{ background: `${ds.primary}40` }} />
          <div className="flex-1">
            <p className="text-xs font-semibold" style={{ color: ds.text }}>{it.label}</p>
            <p className="text-[10px]" style={{ color: ds.textMuted }}>{it.loc}</p>
          </div>
        </div>
      ))}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// RSVP
// ══════════════════════════════════════════════════════════════════════════════
function RsvpA({ ds }: { ds: DesignSystem }) {
  return (
    <div className="w-full rounded-xl p-6 text-center" style={{ background: ds.surface }}>
      <Heart className="mx-auto mb-2" style={{ color: ds.primary }} size={20} />
      <p className="font-serif text-lg mb-1" style={{ color: ds.text, fontFamily: ds.fontDisplay }}>Serez-vous des nôtres ?</p>
      <p className="text-xs mb-4" style={{ color: ds.textMuted }}>Répondez avant le 1er mai 2025</p>
      <div className="flex gap-2 justify-center">
        <button className="px-4 py-1.5 rounded text-xs font-semibold" style={{ background: ds.primary, color: ds.background }}>Avec plaisir</button>
        <button className="px-4 py-1.5 rounded text-xs font-semibold" style={{ border: `1px solid ${ds.primary}60`, color: ds.textMuted }}>Désolé, absent</button>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// FOOTER / LOADER / SPLASH
// ══════════════════════════════════════════════════════════════════════════════
function FooterA({ ds, couple }: { ds: DesignSystem; couple: NonNullable<DesignRendererProps['couple']> }) {
  return (
    <div className="w-full rounded-xl p-6 text-center" style={{ background: ds.background, borderTop: `1px solid ${ds.primary}40` }}>
      <Flourish color={ds.primary} />
      <p className="font-serif text-xl mt-2" style={{ color: ds.text, fontFamily: ds.fontDisplay }}>{couple.label}</p>
      <p className="text-xs mt-1" style={{ color: ds.textMuted }}>
        {couple.hashtag ? `${couple.hashtag} · ` : ''}Heureux Mariage
      </p>
    </div>
  )
}

function LoaderA({ ds }: { ds: DesignSystem }) {
  return (
    <div className="w-full aspect-[16/9] rounded-xl flex items-center justify-center" style={{ background: ds.background }}>
      <div className="text-center">
        <motion.div animate={{ rotate: 360 }} transition={{ duration: 2, repeat: Infinity, ease: 'linear' }} className="mx-auto mb-3">
          <Crown size={32} style={{ color: ds.primary }} />
        </motion.div>
        <p className="text-xs tracking-[0.3em] uppercase" style={{ color: ds.textMuted }}>Chargement…</p>
      </div>
    </div>
  )
}

function SplashA({ ds, couple }: { ds: DesignSystem; couple: NonNullable<DesignRendererProps['couple']> }) {
  return (
    <div className="w-full aspect-[16/9] rounded-xl flex items-center justify-center relative overflow-hidden" style={{ background: ds.background }}>
      <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.8 }} className="text-center">
        <div className="inline-block p-4 rounded border" style={{ borderColor: `${ds.primary}60`, background: `${ds.surface}80` }}>
          <Mail size={20} style={{ color: ds.primary }} className="mx-auto mb-2" />
          <p className="font-serif text-lg" style={{ color: ds.text, fontFamily: ds.fontDisplay }}>{couple.label}</p>
          <p className="text-[10px] tracking-[0.3em] uppercase mt-1" style={{ color: ds.textMuted }}>Ouvrir l'invitation</p>
        </div>
      </motion.div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// INVITATIONS — STANDARD (4 variants A/B/C/D)
// ══════════════════════════════════════════════════════════════════════════════
function InvitationShell({ ds, children, ratio = '3/4' }: { ds: DesignSystem; children: React.ReactNode; ratio?: string }) {
  return (
    <div className="w-full rounded-lg overflow-hidden relative" style={{ aspectRatio: ratio, background: ds.background, border: `1px solid ${ds.primary}30` }}>
      {children}
    </div>
  )
}

function InvitationStdA({ ds, couple, guest }: { ds: DesignSystem; couple: NonNullable<DesignRendererProps['couple']>; guest: NonNullable<DesignRendererProps['guest']> }) {
  return (
    <InvitationShell ds={ds}>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-4">
        <CornerOrnament color={ds.primary} className="absolute top-2 left-2 w-6 h-6" />
        <CornerOrnament color={ds.primary} className="absolute top-2 right-2 w-6 h-6 -scale-x-100" />
        <CornerOrnament color={ds.primary} className="absolute bottom-2 left-2 w-6 h-6 -scale-y-100" />
        <CornerOrnament color={ds.primary} className="absolute bottom-2 right-2 w-6 h-6 -scale-100" />
        <p className="text-[8px] tracking-[0.4em] uppercase" style={{ color: ds.textMuted }}>Avec la bénédiction de leurs familles</p>
        <Crown className="my-1" size={16} style={{ color: ds.primary }} />
        <h3 className="font-serif text-xl font-bold leading-tight my-1" style={{ color: ds.text, fontFamily: ds.fontDisplay }}>
          {couple.groom}<br/>&amp;<br/>{couple.bride}
        </h3>
        <Flourish color={ds.primary} />
        <p className="text-[9px] tracking-[0.2em] uppercase mt-1" style={{ color: ds.textMuted }}>{couple.date}</p>
        <p className="text-[9px]" style={{ color: ds.textMuted }}>{couple.venue}</p>
        <div className="mt-2 p-1.5 rounded text-[8px]" style={{ background: `${ds.surface}80`, color: ds.text }}>
          <p>{guest.name}</p>
          <p style={{ color: ds.textMuted }}>Table {guest.table} · {guest.seats} place(s)</p>
        </div>
      </div>
    </InvitationShell>
  )
}

function InvitationStdB({ ds, couple, guest }: { ds: DesignSystem; couple: NonNullable<DesignRendererProps['couple']>; guest: NonNullable<DesignRendererProps['guest']> }) {
  return (
    <InvitationShell ds={ds}>
      <div className="absolute inset-0 grid grid-rows-[1fr_auto_1fr]">
        <div className="p-4 flex flex-col justify-end">
          <p className="text-[8px] tracking-[0.4em] uppercase" style={{ color: ds.textMuted }}>Save the date</p>
          <h3 className="font-serif text-2xl font-bold leading-none" style={{ color: ds.text, fontFamily: ds.fontDisplay }}>{couple.groom}</h3>
          <p className="text-[10px]" style={{ color: ds.primary }}>&amp;</p>
          <h3 className="font-serif text-2xl font-bold leading-none" style={{ color: ds.text, fontFamily: ds.fontDisplay }}>{couple.bride}</h3>
        </div>
        <div className="px-4">
          <div className="h-px w-full" style={{ background: ds.primary }} />
        </div>
        <div className="p-4 flex flex-col justify-start">
          <p className="text-[9px] font-semibold" style={{ color: ds.text }}>{guest.name}</p>
          <p className="text-[8px]" style={{ color: ds.textMuted }}>Table {guest.table} · {couple.date} · {couple.venue}</p>
          <div className="mt-2 inline-flex items-center gap-1 text-[7px] px-1.5 py-0.5 rounded self-start" style={{ background: `${ds.primary}20`, color: ds.primary }}>
            <QrCode size={8} /> {guest.code}
          </div>
        </div>
      </div>
    </InvitationShell>
  )
}

function InvitationStdC({ ds, couple, guest }: { ds: DesignSystem; couple: NonNullable<DesignRendererProps['couple']>; guest: NonNullable<DesignRendererProps['guest']> }) {
  return (
    <InvitationShell ds={ds}>
      <div className="absolute inset-0" style={{ background: `linear-gradient(180deg, ${ds.primary}30, ${ds.background}cc 60%, ${ds.background})` }}>
        <div className="absolute inset-0 flex flex-col items-center justify-end text-center p-4">
          <h3 className="font-serif text-2xl font-bold leading-tight" style={{ color: ds.text, fontFamily: ds.fontDisplay, textShadow: `0 2px 10px ${ds.background}` }}>
            {couple.groom} &amp; {couple.bride}
          </h3>
          <p className="text-[9px] tracking-[0.3em] uppercase mt-1" style={{ color: ds.textMuted }}>{couple.date}</p>
          <div className="mt-2 w-full p-1.5 rounded text-[8px] backdrop-blur-sm" style={{ background: `${ds.background}80`, border: `1px solid ${ds.primary}40` }}>
            <p style={{ color: ds.text }}>{guest.name}</p>
            <p style={{ color: ds.textMuted }}>Table {guest.table}</p>
          </div>
        </div>
      </div>
    </InvitationShell>
  )
}

function InvitationStdD({ ds, couple, guest }: { ds: DesignSystem; couple: NonNullable<DesignRendererProps['couple']>; guest: NonNullable<DesignRendererProps['guest']> }) {
  return (
    <InvitationShell ds={ds}>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-6">
        <Sparkles size={14} style={{ color: ds.primary }} className="mb-4" />
        <h3 className="font-serif text-lg font-light tracking-wide mb-1" style={{ color: ds.text, fontFamily: ds.fontDisplay }}>
          {couple.groom} &amp; {couple.bride}
        </h3>
        <div className="h-px w-8 my-2" style={{ background: ds.primary }} />
        <p className="text-[8px] tracking-[0.3em] uppercase" style={{ color: ds.textMuted }}>{couple.date}</p>
        <p className="text-[8px] mt-4" style={{ color: ds.text }}>{guest.name}</p>
        <p className="text-[7px]" style={{ color: ds.textMuted }}>Table {guest.table}</p>
      </div>
    </InvitationShell>
  )
}

// ─── VIP (2 variants) ──────────────────────────────────────────────────────────
function InvitationVipA({ ds, couple, guest }: { ds: DesignSystem; couple: NonNullable<DesignRendererProps['couple']>; guest: NonNullable<DesignRendererProps['guest']> }) {
  return (
    <InvitationShell ds={ds}>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-4" style={{ background: `linear-gradient(135deg, ${ds.background}, ${ds.surface})` }}>
        <div className="absolute inset-1 rounded border" style={{ borderColor: `${ds.primary}40` }} />
        <div className="absolute inset-2 rounded border" style={{ borderColor: `${ds.primary}60` }} />
        <div className="relative z-10">
          <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full mb-2 text-[7px] font-bold tracking-[0.2em]" style={{ background: ds.primary, color: ds.background }}>
            <Gem size={8} /> VIP
          </div>
          <Crown size={18} style={{ color: ds.primary }} className="mx-auto mb-1" />
          <h3 className="font-serif text-lg font-bold" style={{ color: ds.text, fontFamily: ds.fontDisplay }}>{couple.label}</h3>
          <Flourish color={ds.primary} />
          <p className="text-[8px] tracking-[0.2em] uppercase mt-1" style={{ color: ds.textMuted }}>{couple.date}</p>
          <div className="mt-2 p-1.5 rounded text-[8px]" style={{ background: `${ds.background}80`, border: `1px solid ${ds.primary}40` }}>
            <p style={{ color: ds.primary }} className="font-bold">{guest.name}</p>
            <p style={{ color: ds.textMuted }}>Place d'honneur · Table {guest.table}</p>
          </div>
        </div>
      </div>
    </InvitationShell>
  )
}

function InvitationVipB({ ds, couple, guest }: { ds: DesignSystem; couple: NonNullable<DesignRendererProps['couple']>; guest: NonNullable<DesignRendererProps['guest']> }) {
  return (
    <InvitationShell ds={ds}>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-4">
        <div className="absolute inset-2 rounded border-2" style={{ borderColor: ds.primary }} />
        <div className="absolute inset-3 rounded border" style={{ borderColor: `${ds.primary}60` }} />
        <div className="relative z-10">
          <div className="w-10 h-10 rounded-full mx-auto mb-2 flex items-center justify-center" style={{ background: ds.primary }}>
            <Crown size={16} style={{ color: ds.background }} />
          </div>
          <h3 className="font-serif text-base font-bold" style={{ color: ds.text, fontFamily: ds.fontDisplay }}>{couple.label}</h3>
          <p className="text-[8px] my-1" style={{ color: ds.textMuted }}>{couple.date} · {couple.venue}</p>
          <p className="text-[8px] font-bold tracking-[0.2em] uppercase" style={{ color: ds.primary }}>Invitation VIP</p>
          <p className="text-[8px] mt-2" style={{ color: ds.text }}>{guest.name}</p>
        </div>
      </div>
    </InvitationShell>
  )
}

// ─── Generic invitation (famille, couple, sponsor, presse, numerique, impression) ──
function InvitationGeneric({ ds, couple, guest, label, icon }: { ds: DesignSystem; couple: NonNullable<DesignRendererProps['couple']>; guest: NonNullable<DesignRendererProps['guest']>; label: string; icon: React.ReactNode }) {
  return (
    <InvitationShell ds={ds}>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-4">
        <div className="mb-2">{icon}</div>
        <p className="text-[7px] tracking-[0.3em] uppercase" style={{ color: ds.primary }}>{label}</p>
        <h3 className="font-serif text-base font-bold my-1" style={{ color: ds.text, fontFamily: ds.fontDisplay }}>{couple.label}</h3>
        <Flourish color={ds.primary} />
        <p className="text-[8px] mt-1" style={{ color: ds.textMuted }}>{couple.date} · {couple.venue}</p>
        <p className="text-[8px] mt-2" style={{ color: ds.text }}>{guest.name}</p>
        <p className="text-[7px]" style={{ color: ds.textMuted }}>Table {guest.table}</p>
      </div>
    </InvitationShell>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// PRINT — Badge, QR, Table Number, Place Card
// ══════════════════════════════════════════════════════════════════════════════
function BadgeA({ ds, guest }: { ds: DesignSystem; guest: NonNullable<DesignRendererProps['guest']> }) {
  return (
    <div className="w-full rounded-lg p-4 flex items-center gap-3" style={{ background: ds.surface, aspectRatio: '3/2', border: `1px solid ${ds.primary}40` }}>
      <div className="w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: `${ds.primary}20`, border: `2px solid ${ds.primary}` }}>
        <Users size={16} style={{ color: ds.primary }} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="inline-block px-1.5 py-0.5 rounded text-[7px] font-bold tracking-wider mb-1" style={{ background: ds.primary, color: ds.background }}>{guest.category}</div>
        <p className="text-xs font-bold truncate" style={{ color: ds.text }}>{guest.name}</p>
        <p className="text-[9px]" style={{ color: ds.textMuted }}>Table {guest.table} · {guest.seats} place(s)</p>
      </div>
      <div className="w-8 h-8 rounded flex items-center justify-center" style={{ background: ds.background }}>
        <QrCode size={16} style={{ color: ds.primary }} />
      </div>
    </div>
  )
}

function QrA({ ds, guest }: { ds: DesignSystem; guest: NonNullable<DesignRendererProps['guest']> }) {
  return (
    <div className="w-full rounded-lg p-4 flex flex-col items-center text-center" style={{ background: ds.surface, aspectRatio: '3/4', border: `1px solid ${ds.primary}40` }}>
      <p className="text-[8px] tracking-[0.3em] uppercase mb-2" style={{ color: ds.primary }}>Accès invité</p>
      <div className="w-24 h-24 rounded p-2 mb-2" style={{ background: ds.text }}>
        {/* Fake QR pattern */}
        <div className="w-full h-full grid grid-cols-7 gap-px">
          {Array.from({ length: 49 }).map((_, i) => (
            <div key={i} style={{ background: Math.random() > 0.5 ? ds.text : 'transparent' }} className="rounded-[1px]" />
          ))}
        </div>
      </div>
      <p className="text-xs font-bold" style={{ color: ds.text }}>{guest.name}</p>
      <p className="text-[9px]" style={{ color: ds.textMuted }}>Code: {guest.code}</p>
      <p className="text-[8px] mt-1" style={{ color: ds.textMuted }}>Table {guest.table}</p>
    </div>
  )
}

function TableNumberA({ ds }: { ds: DesignSystem }) {
  return (
    <div className="w-full rounded-lg flex items-center justify-center relative overflow-hidden" style={{ aspectRatio: '3/4', background: ds.surface, border: `1px solid ${ds.primary}40` }}>
      <div className="absolute inset-2 rounded border" style={{ borderColor: `${ds.primary}40` }} />
      <div className="text-center relative z-10">
        <p className="text-[8px] tracking-[0.4em] uppercase mb-1" style={{ color: ds.textMuted }}>Table</p>
        <p className="font-serif text-6xl font-bold" style={{ color: ds.primary, fontFamily: ds.fontDisplay }}>07</p>
        <Flourish color={ds.primary} />
      </div>
    </div>
  )
}

function PlaceCardA({ ds, guest }: { ds: DesignSystem; guest: NonNullable<DesignRendererProps['guest']> }) {
  return (
    <div className="w-full rounded-lg p-4 flex flex-col items-center justify-center text-center" style={{ aspectRatio: '4/3', background: ds.surface, borderTop: `3px solid ${ds.primary}`, borderBottom: `1px solid ${ds.primary}40` }}>
      <Sparkles size={12} style={{ color: ds.primary }} className="mb-1" />
      <p className="font-serif text-lg font-semibold" style={{ color: ds.text, fontFamily: ds.fontDisplay }}>{guest.name}</p>
      <p className="text-[9px] tracking-[0.2em] uppercase mt-1" style={{ color: ds.textMuted }}>Table {guest.table}</p>
    </div>
  )
}

function PrintGeneric({ ds, label, icon }: { ds: DesignSystem; label: string; icon: React.ReactNode }) {
  return (
    <div className="w-full rounded-lg p-4 flex flex-col items-center justify-center text-center" style={{ aspectRatio: '3/4', background: ds.surface, border: `1px solid ${ds.primary}40` }}>
      <div className="mb-2">{icon}</div>
      <p className="text-[9px] tracking-[0.3em] uppercase" style={{ color: ds.primary }}>{label}</p>
      <p className="text-[8px] mt-2" style={{ color: ds.textMuted }}>Modèle {ds.decorative}</p>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// COMMUNICATION — Facebook, Instagram, Story, WhatsApp
// ══════════════════════════════════════════════════════════════════════════════
function FacebookA({ ds, couple }: { ds: DesignSystem; couple: NonNullable<DesignRendererProps['couple']> }) {
  return (
    <div className="w-full rounded-lg overflow-hidden relative" style={{ aspectRatio: '1200/630', background: `linear-gradient(135deg, ${ds.background}, ${ds.surface})` }}>
      <div className="absolute inset-0 flex items-center justify-between p-6">
        <div className="flex-1">
          <p className="text-[9px] tracking-[0.4em] uppercase" style={{ color: ds.primary }}>Save the date</p>
          <h3 className="font-serif text-2xl font-bold leading-tight my-1" style={{ color: ds.text, fontFamily: ds.fontDisplay }}>{couple.label}</h3>
          <Flourish color={ds.primary} />
          <p className="text-[10px] mt-1" style={{ color: ds.textMuted }}>{couple.date} · {couple.venue}</p>
        </div>
        <div className="w-20 h-20 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: `${ds.primary}20`, border: `2px solid ${ds.primary}` }}>
          <Facebook size={24} style={{ color: ds.primary }} />
        </div>
      </div>
    </div>
  )
}

function InstagramA({ ds, couple }: { ds: DesignSystem; couple: NonNullable<DesignRendererProps['couple']> }) {
  return (
    <div className="w-full rounded-lg overflow-hidden relative" style={{ aspectRatio: '1/1', background: `linear-gradient(135deg, ${ds.primary}30, ${ds.secondary}30, ${ds.background})` }}>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-4">
        <Instagram size={20} style={{ color: ds.text }} className="mb-2" />
        <h3 className="font-serif text-2xl font-bold" style={{ color: ds.text, fontFamily: ds.fontDisplay }}>{couple.label}</h3>
        <Flourish color={ds.primary} />
        <p className="text-[10px] mt-1" style={{ color: ds.textMuted }}>{couple.date}</p>
      </div>
    </div>
  )
}

function StorySocialA({ ds, couple }: { ds: DesignSystem; couple: NonNullable<DesignRendererProps['couple']> }) {
  return (
    <div className="w-full rounded-lg overflow-hidden relative" style={{ aspectRatio: '9/16', background: `linear-gradient(180deg, ${ds.primary}30, ${ds.background}cc 60%, ${ds.background})` }}>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-4">
        <Sparkles size={18} style={{ color: ds.primary }} className="mb-3" />
        <p className="text-[9px] tracking-[0.4em] uppercase" style={{ color: ds.textMuted }}>À sauvegarder</p>
        <h3 className="font-serif text-3xl font-bold my-2 leading-tight" style={{ color: ds.text, fontFamily: ds.fontDisplay }}>{couple.groom}<br/>&amp;<br/>{couple.bride}</h3>
        <div className="h-px w-12 my-2" style={{ background: ds.primary }} />
        <p className="text-[10px] tracking-[0.2em] uppercase" style={{ color: ds.primary }}>{couple.date}</p>
      </div>
    </div>
  )
}

function WhatsAppA({ ds, couple }: { ds: DesignSystem; couple: NonNullable<DesignRendererProps['couple']> }) {
  return (
    <div className="w-full rounded-lg overflow-hidden relative" style={{ aspectRatio: '1/1', background: ds.surface }}>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-4">
        <div className="w-12 h-12 rounded-full flex items-center justify-center mb-2" style={{ background: ds.primary }}>
          <MessageCircle size={20} style={{ color: ds.background }} />
        </div>
        <p className="text-[8px] tracking-[0.3em] uppercase" style={{ color: ds.textMuted }}>Vous êtes invité</p>
        <h3 className="font-serif text-xl font-bold my-1" style={{ color: ds.text, fontFamily: ds.fontDisplay }}>{couple.label}</h3>
        <p className="text-[9px]" style={{ color: ds.textMuted }}>{couple.date}</p>
        <div className="mt-2 px-3 py-1 rounded-full text-[8px] font-bold" style={{ background: ds.primary, color: ds.background }}>Voir l'invitation</div>
      </div>
    </div>
  )
}

function CommunicationGeneric({ ds, label, icon }: { ds: DesignSystem; label: string; icon: React.ReactNode }) {
  return (
    <div className="w-full rounded-lg overflow-hidden flex items-center justify-center" style={{ aspectRatio: '3/2', background: ds.surface, border: `1px solid ${ds.primary}30` }}>
      <div className="text-center">
        <div className="mb-2 flex justify-center">{icon}</div>
        <p className="text-[9px] tracking-[0.3em] uppercase" style={{ color: ds.primary }}>{label}</p>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// LUXURY — Palette, Typography, Animations, Transitions, Effects
// ══════════════════════════════════════════════════════════════════════════════
function PaletteA({ ds }: { ds: DesignSystem }) {
  const swatches = [
    { name: 'Primaire', color: ds.primary },
    { name: 'Secondaire', color: ds.secondary },
    { name: 'Fond', color: ds.background },
    { name: 'Surface', color: ds.surface },
    { name: 'Texte', color: ds.text },
    { name: 'Texte muet', color: ds.textMuted },
  ]
  return (
    <div className="w-full rounded-xl p-4" style={{ background: ds.surface }}>
      <p className="text-[10px] tracking-[0.3em] uppercase mb-3" style={{ color: ds.primary }}>Palette officielle</p>
      <div className="grid grid-cols-3 gap-2">
        {swatches.map((s) => (
          <div key={s.name} className="rounded overflow-hidden">
            <div className="aspect-square" style={{ background: s.color, border: `1px solid ${ds.primary}30` }} />
            <p className="text-[8px] mt-1 font-semibold" style={{ color: ds.text }}>{s.name}</p>
            <p className="text-[7px]" style={{ color: ds.textMuted }}>{s.color}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

function TypographyA({ ds }: { ds: DesignSystem }) {
  return (
    <div className="w-full rounded-xl p-4" style={{ background: ds.surface }}>
      <p className="text-[10px] tracking-[0.3em] uppercase mb-3" style={{ color: ds.primary }}>Système typographique</p>
      <div className="space-y-3">
        <div>
          <p className="text-[8px]" style={{ color: ds.textMuted }}>Display — {ds.fontDisplay}</p>
          <p className="font-serif text-2xl" style={{ color: ds.text, fontFamily: ds.fontDisplay }}>Aa Bb Cc 123</p>
        </div>
        <div>
          <p className="text-[8px]" style={{ color: ds.textMuted }}>Body — {ds.fontBody}</p>
          <p className="text-sm" style={{ color: ds.text, fontFamily: ds.fontBody }}>L'élégance d'un jour unique</p>
        </div>
      </div>
    </div>
  )
}

function AnimationsA({ ds }: { ds: DesignSystem }) {
  return (
    <div className="w-full rounded-xl p-4 grid grid-cols-3 gap-3" style={{ background: ds.surface }}>
      {[
        { label: 'Fondu', anim: { opacity: [0.3, 1, 0.3] }, dur: 2 },
        { label: 'Pulse', anim: { scale: [1, 1.1, 1] }, dur: 1.5 },
        { label: 'Glitter', anim: { rotate: [0, 360] }, dur: 3 },
      ].map((a, i) => (
        <div key={i} className="flex flex-col items-center">
          <motion.div animate={a.anim} transition={{ duration: a.dur, repeat: Infinity, ease: 'easeInOut' }} className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: `${ds.primary}20`, border: `1px solid ${ds.primary}` }}>
            <Sparkles size={14} style={{ color: ds.primary }} />
          </motion.div>
          <p className="text-[8px] mt-1" style={{ color: ds.textMuted }}>{a.label}</p>
        </div>
      ))}
    </div>
  )
}

function TransitionsA({ ds }: { ds: DesignSystem }) {
  return (
    <div className="w-full rounded-xl p-4" style={{ background: ds.surface }}>
      <div className="h-16 rounded relative overflow-hidden" style={{ background: ds.background }}>
        <motion.div animate={{ x: ['0%', '100%'] }} transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }} className="absolute top-0 bottom-0 w-1/3 flex items-center justify-center" style={{ background: `linear-gradient(90deg, transparent, ${ds.primary}40, transparent)` }}>
          <Sparkles size={14} style={{ color: ds.primary }} />
        </motion.div>
      </div>
      <p className="text-[9px] mt-2 text-center" style={{ color: ds.textMuted }}>Transition fondu enchaîné</p>
    </div>
  )
}

function EffectsA({ ds }: { ds: DesignSystem }) {
  return (
    <div className="w-full rounded-xl p-4 relative overflow-hidden" style={{ background: ds.surface, minHeight: '100px' }}>
      {Array.from({ length: 12 }).map((_, i) => (
        <motion.div key={i} animate={{ y: [0, -20, 0], opacity: [0, 1, 0] }} transition={{ duration: 2 + (i % 3), repeat: Infinity, delay: i * 0.3, ease: 'easeInOut' }} className="absolute w-1 h-1 rounded-full" style={{ left: `${(i * 8) % 100}%`, top: `${(i * 13) % 80}%`, background: ds.primary, boxShadow: `0 0 6px ${ds.primary}` }} />
      ))}
      <p className="text-[9px] text-center relative z-10 pt-8" style={{ color: ds.textMuted }}>Particules dorées flottantes</p>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// MASTER RENDERER — dispatch by renderer key
// ══════════════════════════════════════════════════════════════════════════════

export function DesignRenderer({ renderer, ds, couple = DEFAULT_COUPLE, guest = { name: 'M. & Mme Kabongo', table: 7, seats: 2, category: 'VIP', code: 'RG-7K2A' } }: DesignRendererProps) {
  const { rest } = parseRenderer(renderer)

  // Website pack
  if (rest === 'hero-A') return <HeroA ds={ds} couple={couple} />
  if (rest === 'hero-B') return <HeroB ds={ds} couple={couple} />
  if (rest === 'hero-C') return <HeroC ds={ds} couple={couple} />
  if (rest === 'countdown-A') return <CountdownA ds={ds} />
  if (rest === 'story-A') return <StoryA ds={ds} couple={couple} />
  if (rest === 'gallery-A') return <GalleryA ds={ds} />
  if (rest === 'programme-A') return <ProgrammeA ds={ds} />
  if (rest === 'rsvp-A') return <RsvpA ds={ds} />
  if (rest === 'footer-A') return <FooterA ds={ds} couple={couple} />
  if (rest === 'loader-A') return <LoaderA ds={ds} />
  if (rest === 'splash-A') return <SplashA ds={ds} couple={couple} />

  // Invitations pack
  if (rest === 'invite-std-A') return <InvitationStdA ds={ds} couple={couple} guest={guest} />
  if (rest === 'invite-std-B') return <InvitationStdB ds={ds} couple={couple} guest={guest} />
  if (rest === 'invite-std-C') return <InvitationStdC ds={ds} couple={couple} guest={guest} />
  if (rest === 'invite-std-D') return <InvitationStdD ds={ds} couple={couple} guest={guest} />
  if (rest === 'invite-vip-A') return <InvitationVipA ds={ds} couple={couple} guest={guest} />
  if (rest === 'invite-vip-B') return <InvitationVipB ds={ds} couple={couple} guest={guest} />
  if (rest === 'invite-famille-A') return <InvitationGeneric ds={ds} couple={couple} guest={guest} label="Invitation Famille" icon={<Heart size={16} style={{ color: ds.primary }} />} />
  if (rest === 'invite-couple-A') return <InvitationGeneric ds={ds} couple={couple} guest={guest} label="Invitation Couple" icon={<Users size={16} style={{ color: ds.primary }} />} />
  if (rest === 'invite-sponsor-A') return <InvitationGeneric ds={ds} couple={couple} guest={guest} label="Invitation Sponsor" icon={<Gem size={16} style={{ color: ds.primary }} />} />
  if (rest === 'invite-presse-A') return <InvitationGeneric ds={ds} couple={couple} guest={guest} label="Invitation Presse" icon={<Ticket size={16} style={{ color: ds.primary }} />} />
  if (rest === 'invite-num-A') return <InvitationGeneric ds={ds} couple={couple} guest={guest} label="Invitation Numérique" icon={<MessageCircle size={16} style={{ color: ds.primary }} />} />
  if (rest === 'invite-print-A') return <InvitationGeneric ds={ds} couple={couple} guest={guest} label="Invitation Impression" icon={<Hash size={16} style={{ color: ds.primary }} />} />

  // Print pack
  if (rest === 'badge-A') return <BadgeA ds={ds} guest={guest} />
  if (rest === 'qr-A') return <QrA ds={ds} guest={guest} />
  if (rest === 'table-A') return <TableNumberA ds={ds} />
  if (rest === 'placecard-A') return <PlaceCardA ds={ds} guest={guest} />
  if (rest === 'parking-A') return <PrintGeneric ds={ds} label="Carte Parking" icon={<Hash size={16} style={{ color: ds.primary }} />} />
  if (rest === 'menu-A') return <PrintGeneric ds={ds} label="Carte Menu" icon={<Sparkles size={16} style={{ color: ds.primary }} />} />
  if (rest === 'gift-A') return <PrintGeneric ds={ds} label="Liste Cadeaux" icon={<Heart size={16} style={{ color: ds.primary }} />} />
  if (rest === 'thanks-A') return <PrintGeneric ds={ds} label="Remerciement" icon={<Mail size={16} style={{ color: ds.primary }} />} />

  // Communication pack
  if (rest === 'fb-A') return <FacebookA ds={ds} couple={couple} />
  if (rest === 'ig-A') return <InstagramA ds={ds} couple={couple} />
  if (rest === 'cstory-A') return <StorySocialA ds={ds} couple={couple} />
  if (rest === 'wa-A') return <WhatsAppA ds={ds} couple={couple} />
  if (rest === 'email-A') return <CommunicationGeneric ds={ds} label="Email HTML" icon={<Mail size={20} style={{ color: ds.primary }} />} />
  if (rest === 'banner-A') return <CommunicationGeneric ds={ds} label="Bannière" icon={<Sparkles size={20} style={{ color: ds.primary }} />} />
  if (rest === 'affiche-A') return <CommunicationGeneric ds={ds} label="Affiche A3" icon={<Calendar size={20} style={{ color: ds.primary }} />} />
  if (rest === 'rollup-A') return <CommunicationGeneric ds={ds} label="Roll-up" icon={<Sparkles size={20} style={{ color: ds.primary }} />} />

  // Luxury pack
  if (rest === 'anim-A') return <AnimationsA ds={ds} />
  if (rest === 'trans-A') return <TransitionsA ds={ds} />
  if (rest === 'palette-A') return <PaletteA ds={ds} />
  if (rest === 'typo-A') return <TypographyA ds={ds} />
  if (rest === 'effects-A') return <EffectsA ds={ds} />

  // Fallback
  return (
    <div className="w-full aspect-[16/9] rounded-xl flex items-center justify-center" style={{ background: ds.surface, border: `1px dashed ${ds.primary}40` }}>
      <p className="text-xs" style={{ color: ds.textMuted }}>Aperçu non disponible</p>
    </div>
  )
}
