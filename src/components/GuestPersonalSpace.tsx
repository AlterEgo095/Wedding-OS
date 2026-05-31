'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import Image from 'next/image'
import {
  LogOut, MapPin, Clock, Users, Hash,
  Armchair, Heart, Sparkles, ShieldCheck, Lock, QrCode,
  Calendar, MessageSquareHeart, Copy, Check,
  Crown, Star, Gem, Share2, Link2, Eye, ShieldAlert,
  PartyPopper, CircleDot
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'

/* ══════════════════════════════════════════════════════════════
   TYPES
   ══════════════════════════════════════════════════════════════ */
interface GuestData {
  id: string
  firstName: string
  lastName: string
  invitationCode: string
  seats: number
  category: string
  status: string
  personalMessage: string | null
  checkedIn: boolean
  table: { id: string; name: string; number: number } | null
  invitationViewed: boolean
  invitationViewCount: number
  lastAccessAt: string | null
  encryptedLink?: string
}

interface Settings {
  [key: string]: string | undefined
}

interface GuestPersonalSpaceProps {
  guest: GuestData
  settings: Settings
  onLogout: () => void
}

/* ══════════════════════════════════════════════════════════════
   CATEGORY CONFIG
   ══════════════════════════════════════════════════════════════ */
const categoryConfig: Record<
  string,
  { label: string; icon: typeof Crown; gradient: string; bg: string; ring: string; iconColor: string }
> = {
  VIP: {
    label: 'VIP',
    icon: Crown,
    gradient: 'from-amber-500 to-yellow-600',
    bg: 'bg-amber-50 dark:bg-amber-900/20',
    ring: 'ring-amber-400/30',
    iconColor: 'text-amber-500',
  },
  FAMILLE: {
    label: 'Famille',
    icon: Heart,
    gradient: 'from-rose-500 to-pink-600',
    bg: 'bg-rose-50 dark:bg-rose-900/20',
    ring: 'ring-rose-400/30',
    iconColor: 'text-rose-500',
  },
  AMIS: {
    label: 'Amis',
    icon: Star,
    gradient: 'from-emerald-500 to-teal-600',
    bg: 'bg-emerald-50 dark:bg-emerald-900/20',
    ring: 'ring-emerald-400/30',
    iconColor: 'text-emerald-500',
  },
  SPONSORS: {
    label: 'Sponsor',
    icon: Gem,
    gradient: 'from-purple-500 to-indigo-600',
    bg: 'bg-purple-50 dark:bg-purple-900/20',
    ring: 'ring-purple-400/30',
    iconColor: 'text-purple-500',
  },
  COLLEGUES: {
    label: 'Collègues',
    icon: Users,
    gradient: 'from-blue-500 to-cyan-600',
    bg: 'bg-blue-50 dark:bg-blue-900/20',
    ring: 'ring-cyan-400/30',
    iconColor: 'text-cyan-500',
  },
}

/* ══════════════════════════════════════════════════════════════
   STATUS CONFIG
   ══════════════════════════════════════════════════════════════ */
const statusConfig: Record<string, { label: string; emoji: string; className: string }> = {
  CONFIRMED: {
    label: 'Confirmé',
    emoji: '✓',
    className: 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
  },
  PENDING: {
    label: 'En attente',
    emoji: '⏳',
    className: 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800',
  },
  DECLINED: {
    label: 'Décliné',
    emoji: '✗',
    className: 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800',
  },
}

/* ══════════════════════════════════════════════════════════════
   ANIMATION VARIANTS
   ══════════════════════════════════════════════════════════════ */
const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.1, delayChildren: 0.1 },
  },
}

const itemVariants = {
  hidden: { opacity: 0, y: 24, scale: 0.97 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.6, ease: "easeOut" },
  },
}

const fadeUpVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: "easeOut" },
  },
}

const scaleInVariants = {
  hidden: { opacity: 0, scale: 0.85 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: { type: 'spring', stiffness: 200, damping: 20 },
  },
}

/* ══════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ══════════════════════════════════════════════════════════════ */
export default function GuestPersonalSpace({ guest, settings, onLogout }: GuestPersonalSpaceProps) {
  const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null)
  const [qrLoading, setQrLoading] = useState(true)
  const [copiedCode, setCopiedCode] = useState(false)
  const [copiedLink, setCopiedLink] = useState(false)

  const catConfig = categoryConfig[guest.category] || categoryConfig.AMIS
  const CategoryIcon = catConfig.icon
  const statConfig = statusConfig[guest.status] || statusConfig.PENDING

  const groomName = settings.groom_name || 'Josué'
  const brideName = settings.bride_name || 'Hornella'
  const dateDisplay = settings.site_subtitle || 'Vendredi 26 Juin 2026'
  const venueName = settings.venue_name || 'Salle Polyvalente – Grand Palais Kinshasa'
  const venueAddress = settings.venue_address || '21/22 Avenue Bobozo'
  const venueCity = settings.venue_city || 'Kinshasa'
  const venueTime = settings.venue_time || '14h00'
  const venueReference = settings.venue_reference || ''
  const welcomeMessage = settings.welcome_message || 'Bienvenue sur la plateforme du mariage'
  const hashtag = settings.hashtag || '#JosueEtHornella2026'

  const encryptedLinkUrl = guest.encryptedLink
    ? `${typeof window !== 'undefined' ? window.location.origin : ''}?invite=${guest.encryptedLink}`
    : ''

  // Fetch QR code
  useEffect(() => {
    let cancelled = false
    async function fetchQR() {
      try {
        const res = await fetch(`/api/guests/qrcode/${guest.invitationCode}`)
        if (res.ok && !cancelled) {
          const data = await res.json()
          setQrCodeUrl(data.qrCode)
        }
      } catch {
        // QR code is optional
      } finally {
        if (!cancelled) setQrLoading(false)
      }
    }
    fetchQR()
    return () => { cancelled = true }
  }, [guest.invitationCode])

  const handleCopy = useCallback(async (text: string, type: 'code' | 'link') => {
    try {
      await navigator.clipboard.writeText(text)
      if (type === 'code') {
        setCopiedCode(true)
        setTimeout(() => setCopiedCode(false), 2500)
      } else {
        setCopiedLink(true)
        setTimeout(() => setCopiedLink(false), 2500)
      }
    } catch {
      // Fallback: use execCommand
      const textarea = document.createElement('textarea')
      textarea.value = text
      textarea.style.position = 'fixed'
      textarea.style.opacity = '0'
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
      if (type === 'code') {
        setCopiedCode(true)
        setTimeout(() => setCopiedCode(false), 2500)
      } else {
        setCopiedLink(true)
        setTimeout(() => setCopiedLink(false), 2500)
      }
    }
  }, [])

  return (
    <section className="relative overflow-hidden min-h-screen pb-8">
      {/* ═══ Multi-layered Background ═══ */}
      <div className="absolute inset-0 bg-gradient-to-b from-champagne/8 via-background to-champagne/4" />
      <div
        className="absolute inset-0 opacity-[0.015]"
        style={{
          backgroundImage: `
            radial-gradient(circle at 20% 20%, oklch(0.68 0.12 85 / 30%) 0%, transparent 50%),
            radial-gradient(circle at 80% 80%, oklch(0.72 0.08 30 / 20%) 0%, transparent 50%)
          `,
        }}
      />

      {/* Animated floating particles */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {[...Array(6)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute w-1 h-1 rounded-full bg-gold/20"
            style={{
              left: `${15 + i * 15}%`,
              top: `${10 + i * 14}%`,
            }}
            animate={{
              y: [0, -30, 0],
              opacity: [0.2, 0.5, 0.2],
            }}
            transition={{
              duration: 4 + i,
              repeat: Infinity,
              ease: 'easeInOut',
              delay: i * 0.8,
            }}
          />
        ))}
      </div>

      <motion.div
        className="max-w-4xl mx-auto px-4 sm:px-6 relative z-10 py-6 md:py-14"
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        {/* ═══════════════════════════════════════════════════
            SECURITY BANNER
            ═══════════════════════════════════════════════════ */}
        <motion.div variants={itemVariants} className="flex items-center justify-center gap-2 mb-6 md:mb-10">
          <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-gold/5 border border-gold/10 backdrop-blur-sm">
            <ShieldCheck className="size-3.5 text-gold/60" />
            <span className="text-[10px] sm:text-[11px] font-display tracking-[0.2em] uppercase text-gold/60 font-bold">
              Espace personnel sécurisé
            </span>
            <Lock className="size-3 text-gold/40" />
          </div>
        </motion.div>

        {/* ═══════════════════════════════════════════════════
            RSVP STATUS PILL
            ═══════════════════════════════════════════════════ */}
        <motion.div variants={fadeUpVariants} className="flex justify-center mb-6">
          <Badge
            className={`px-4 py-1.5 text-xs font-display font-bold tracking-wider border ${statConfig.className} rounded-full shadow-sm`}
          >
            <CircleDot className="size-3 mr-1.5" />
            {statConfig.emoji} {statConfig.label}
          </Badge>
        </motion.div>

        {/* ═══════════════════════════════════════════════════
            MAIN INVITATION CARD
            ═══════════════════════════════════════════════════ */}
        <motion.div
          variants={itemVariants}
          className="relative rounded-3xl overflow-hidden shadow-2xl shadow-gold/10 gold-border"
        >
          {/* Animated gold border glow */}
          <motion.div
            className="absolute inset-0 rounded-3xl pointer-events-none z-20"
            style={{
              boxShadow: 'inset 0 0 30px oklch(0.68 0.12 85 / 8%), 0 0 40px oklch(0.68 0.12 85 / 6%)',
            }}
            animate={{
              boxShadow: [
                'inset 0 0 30px oklch(0.68 0.12 85 / 8%), 0 0 40px oklch(0.68 0.12 85 / 6%)',
                'inset 0 0 40px oklch(0.68 0.12 85 / 12%), 0 0 60px oklch(0.68 0.12 85 / 10%)',
                'inset 0 0 30px oklch(0.68 0.12 85 / 8%), 0 0 40px oklch(0.68 0.12 85 / 6%)',
              ],
            }}
            transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
          />

          {/* ═══ Card Header — Dark cinematic hero ═══ */}
          <div className="relative bg-gradient-to-br from-[oklch(0.10_0.02_270)] via-[oklch(0.12_0.03_270)] to-[oklch(0.08_0.02_270)] px-5 pt-8 pb-10 sm:px-10 sm:pt-12 sm:pb-14 text-center overflow-hidden">
            {/* Paper texture overlay */}
            <div
              className="absolute inset-0 opacity-[0.04]"
              style={{
                backgroundImage: `
                  radial-gradient(circle at 1px 1px, oklch(0.82 0.08 85 / 40%) 1px, transparent 0),
                  radial-gradient(circle at 3px 3px, oklch(0.72 0.08 30 / 20%) 0.5px, transparent 0)
                `,
                backgroundSize: '40px 40px, 60px 60px',
              }}
            />

            {/* Subtle vignette */}
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_40%,oklch(0.08_0.02_270/60%))]" />

            {/* Top ornamental line */}
            <motion.div
              initial={{ scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{ delay: 0.4, duration: 0.8, ease: "easeOut" }}
              className="relative z-10 flex items-center justify-center gap-3 mb-8"
            >
              <div className="w-16 sm:w-28 h-px bg-gradient-to-r from-transparent via-gold/40 to-transparent" />
              <Sparkles className="size-4 text-gold/50" />
              <div className="w-16 sm:w-28 h-px bg-gradient-to-r from-transparent via-gold/40 to-transparent" />
            </motion.div>

            {/* Couple photos */}
            <div className="relative z-10 flex items-center justify-center gap-3 sm:gap-6 mb-8">
              <motion.div
                initial={{ opacity: 0, x: -30, scale: 0.9 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                transition={{ delay: 0.5, duration: 0.7, ease: "easeOut" }}
                className="flex flex-col items-center"
              >
                <div className="relative">
                  {/* Gold ring glow */}
                  <div className="absolute -inset-1 rounded-full bg-gradient-to-br from-gold/40 via-gold-light/20 to-rose-gold/30 blur-sm" />
                  <div className="relative w-20 h-20 sm:w-28 sm:h-28 rounded-full overflow-hidden ring-2 ring-gold/40 shadow-xl shadow-black/40">
                    <Image
                      src="/upload/couple-photo-1.jpeg"
                      alt={groomName}
                      width={112}
                      height={112}
                      className="w-full h-full object-cover"
                    />
                  </div>
                </div>
                <span className="mt-3 font-display text-[10px] sm:text-xs tracking-[0.2em] text-white/50 uppercase font-bold">
                  {groomName}
                </span>
              </motion.div>

              {/* Ampersand */}
              <motion.div
                initial={{ opacity: 0, scale: 0, rotate: -180 }}
                animate={{ opacity: 1, scale: 1, rotate: 0 }}
                transition={{ delay: 0.7, type: 'spring', stiffness: 180, damping: 15 }}
                className="flex flex-col items-center"
              >
                <div className="relative">
                  <div className="absolute -inset-2 rounded-full bg-gradient-to-br from-gold/20 via-gold-light/10 to-rose-gold/20 blur-md" />
                  <div className="relative w-11 h-11 sm:w-14 sm:h-14 rounded-full bg-gradient-to-br from-gold via-gold-light to-rose-gold flex items-center justify-center shadow-xl shadow-gold/30 ring-1 ring-white/10">
                    <span className="font-serif text-xl sm:text-2xl font-bold text-[oklch(0.12_0.03_270)]">&</span>
                  </div>
                </div>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, x: 30, scale: 0.9 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                transition={{ delay: 0.5, duration: 0.7, ease: "easeOut" }}
                className="flex flex-col items-center"
              >
                <div className="relative">
                  <div className="absolute -inset-1 rounded-full bg-gradient-to-br from-rose-gold/40 via-gold-light/20 to-gold/30 blur-sm" />
                  <div className="relative w-20 h-20 sm:w-28 sm:h-28 rounded-full overflow-hidden ring-2 ring-rose-gold/40 shadow-xl shadow-black/40">
                    <Image
                      src="/upload/couple-photo-2.png"
                      alt={brideName}
                      width={112}
                      height={112}
                      className="w-full h-full object-cover"
                    />
                  </div>
                </div>
                <span className="mt-3 font-display text-[10px] sm:text-xs tracking-[0.2em] text-white/50 uppercase font-bold">
                  {brideName}
                </span>
              </motion.div>
            </div>

            {/* Welcome text */}
            <motion.p
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.8, duration: 0.5 }}
              className="relative z-10 font-display text-[11px] sm:text-sm tracking-[0.25em] uppercase text-white/35 mb-4 font-bold"
            >
              {welcomeMessage}
            </motion.p>

            {/* Guest name — Hero element */}
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.9, duration: 0.8, ease: "easeOut" }}
              className="relative z-10"
            >
              <p className="font-display text-[11px] sm:text-xs tracking-[0.3em] uppercase text-gold/40 mb-3 font-bold">
                Invitation exclusive pour
              </p>
              <h1 className="font-serif text-3xl sm:text-4xl md:text-5xl font-bold gold-gradient leading-tight pb-1">
                {guest.firstName} {guest.lastName}
              </h1>
            </motion.div>

            {/* Category badge */}
            <motion.div
              initial={{ opacity: 0, scale: 0.8, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ delay: 1.1, type: 'spring', stiffness: 200, damping: 18 }}
              className="relative z-10 mt-6 inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/[0.06] border border-white/[0.08] backdrop-blur-sm"
            >
              <CategoryIcon className={`size-4 ${catConfig.iconColor}`} />
              <span className="text-[11px] font-display font-bold tracking-[0.2em] uppercase text-white/70">
                {catConfig.label}
              </span>
              <div className={`w-1.5 h-1.5 rounded-full bg-gradient-to-r ${catConfig.gradient}`} />
            </motion.div>
          </div>

          {/* ═══ Card Body ═══ */}
          <div className="relative glass-card rounded-t-none border-t-0 px-5 py-8 sm:px-10 sm:py-10 space-y-6">
            {/* ─── Personal message ─── */}
            {guest.personalMessage && (
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 1.2, duration: 0.6 }}
                className="relative p-5 sm:p-6 rounded-2xl bg-gradient-to-br from-gold/[0.06] to-rose-gold/[0.04] border border-gold/[0.12]"
              >
                {/* Decorative quote mark */}
                <div className="absolute -top-2 left-5 text-3xl font-serif text-gold/20 leading-none select-none">&ldquo;</div>
                <div className="flex items-start gap-3">
                  <MessageSquareHeart className="size-5 text-gold/60 shrink-0 mt-0.5" />
                  <p className="font-display text-sm sm:text-base text-foreground/80 italic leading-relaxed">
                    {guest.personalMessage}
                  </p>
                </div>
                <div className="absolute -bottom-2 right-5 text-3xl font-serif text-gold/20 leading-none select-none">&rdquo;</div>
              </motion.div>
            )}

            {/* ─── Info Grid ─── */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1.3, duration: 0.6 }}
              className="grid grid-cols-2 gap-3 sm:gap-4"
            >
              {[
                {
                  icon: Calendar,
                  label: 'Date',
                  value: dateDisplay,
                  sublabel: '',
                },
                {
                  icon: Clock,
                  label: 'Heure',
                  value: venueTime,
                  sublabel: '',
                },
                {
                  icon: Hash,
                  label: 'Table',
                  value: guest.table ? `Table ${guest.table.number}` : 'À confirmer',
                  sublabel: guest.table?.name || '',
                },
                {
                  icon: Armchair,
                  label: 'Places',
                  value: `${guest.seats} ${guest.seats > 1 ? 'places' : 'place'}`,
                  sublabel: '',
                },
              ].map((item) => (
                <motion.div
                  key={item.label}
                  whileHover={{ y: -4, scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                  className="glass-card p-4 rounded-xl text-center cursor-default group hover:shadow-lg hover:shadow-gold/[0.06] transition-shadow duration-300"
                >
                  <item.icon className="size-5 text-gold mx-auto mb-2 group-hover:scale-110 transition-transform duration-300" />
                  <p className="text-[9px] sm:text-[10px] font-display font-bold tracking-[0.2em] uppercase text-muted-foreground mb-1">
                    {item.label}
                  </p>
                  <p className="font-serif text-sm sm:text-base font-bold text-foreground">{item.value}</p>
                  {item.sublabel && (
                    <p className="text-[9px] font-display text-muted-foreground/70 mt-0.5">{item.sublabel}</p>
                  )}
                </motion.div>
              ))}
            </motion.div>

            {/* ─── Venue Section ─── */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1.4, duration: 0.6 }}
              whileHover={{ scale: 1.005 }}
              className="relative p-5 sm:p-6 rounded-2xl bg-gradient-to-br from-champagne/10 to-gold/[0.05] border border-gold/[0.1]"
            >
              <div className="flex items-start gap-4">
                <div className="shrink-0 w-10 h-10 rounded-xl bg-gold/[0.08] border border-gold/[0.12] flex items-center justify-center">
                  <MapPin className="size-5 text-gold" />
                </div>
                <div className="min-w-0">
                  <p className="font-display text-sm font-bold text-foreground">{venueName}</p>
                  <p className="font-display text-xs text-muted-foreground mt-1">{venueAddress}, {venueCity}</p>
                  {venueReference && (
                    <p className="font-display text-[11px] text-muted-foreground/60 mt-0.5 flex items-center gap-1">
                      <span className="inline-block w-1 h-1 rounded-full bg-gold/40" />
                      {venueReference}
                    </p>
                  )}
                </div>
              </div>
            </motion.div>

            {/* ─── QR Code Section ─── */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1.5, duration: 0.6 }}
              className="text-center space-y-4"
            >
              <p className="font-display text-[10px] sm:text-xs tracking-[0.2em] uppercase text-muted-foreground font-bold">
                Présentez ce QR code à l&apos;entrée
              </p>
              <div className="inline-block relative">
                {/* QR code container with animated border */}
                <div className="relative p-1 rounded-2xl bg-gradient-to-br from-gold/20 via-gold-light/10 to-rose-gold/20">
                  <div className="p-4 bg-white rounded-xl shadow-xl">
                    <AnimatePresence mode="wait">
                      {qrLoading ? (
                        <motion.div
                          key="loading"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          className="w-36 h-36 sm:w-40 sm:h-40 flex items-center justify-center"
                        >
                          <motion.div
                            animate={{ rotate: 360 }}
                            transition={{ duration: 1.2, repeat: Infinity, ease: 'linear' }}
                            className="size-10 border-[3px] border-gold/20 border-t-gold rounded-full"
                          />
                        </motion.div>
                      ) : qrCodeUrl ? (
                        <motion.div
                          key="qr"
                          initial={{ opacity: 0, scale: 0.8 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ type: 'spring', stiffness: 200, damping: 20 }}
                        >
                          <img
                            src={qrCodeUrl}
                            alt={`QR Code - ${guest.firstName} ${guest.lastName}`}
                            className="w-36 h-36 sm:w-40 sm:h-40"
                          />
                        </motion.div>
                      ) : (
                        <motion.div
                          key="fallback"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          className="w-36 h-36 sm:w-40 sm:h-40 flex items-center justify-center text-muted-foreground/40"
                        >
                          <QrCode className="size-14" />
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>
              </div>

              {/* Invitation code with copy */}
              <div className="flex items-center justify-center gap-2">
                <span className="font-display text-xs text-muted-foreground">Code :</span>
                <code className="font-mono text-sm font-bold text-foreground tracking-wider bg-muted/50 px-3 py-1 rounded-lg border border-border/50">
                  {guest.invitationCode}
                </code>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleCopy(guest.invitationCode, 'code')}
                  className="h-7 w-7 p-0 rounded-full hover:bg-gold/10"
                >
                  <AnimatePresence mode="wait">
                    {copiedCode ? (
                      <motion.div
                        key="check"
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        exit={{ scale: 0 }}
                      >
                        <Check className="size-3.5 text-emerald-500" />
                      </motion.div>
                    ) : (
                      <motion.div
                        key="copy"
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        exit={{ scale: 0 }}
                      >
                        <Copy className="size-3.5 text-gold/50" />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </Button>
              </div>
            </motion.div>

            {/* ─── Encrypted Invitation Link ─── */}
            {guest.encryptedLink && (
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 1.6, duration: 0.6 }}
                className="p-4 sm:p-5 rounded-2xl bg-gradient-to-br from-champagne/8 to-gold/[0.04] border border-gold/[0.1] space-y-3"
              >
                <div className="flex items-center gap-2">
                  <Link2 className="size-4 text-gold/60" />
                  <span className="font-display text-[10px] sm:text-[11px] tracking-[0.15em] uppercase text-muted-foreground font-bold">
                    Votre lien d&apos;invitation personnel
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    readOnly
                    value={encryptedLinkUrl}
                    className="h-9 text-xs font-mono bg-background/60 border-gold/10 text-foreground/70 truncate cursor-default select-all"
                    onClick={(e) => (e.target as HTMLInputElement).select()}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleCopy(encryptedLinkUrl, 'link')}
                    className="shrink-0 h-9 gap-1.5 border-gold/15 hover:bg-gold/10 hover:border-gold/25 text-foreground/70 hover:text-foreground"
                  >
                    <AnimatePresence mode="wait">
                      {copiedLink ? (
                        <motion.div
                          key="check"
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          exit={{ scale: 0 }}
                          className="flex items-center gap-1.5"
                        >
                          <Check className="size-3.5 text-emerald-500" />
                          <span className="text-[11px] text-emerald-600 dark:text-emerald-400">Copié !</span>
                        </motion.div>
                      ) : (
                        <motion.div
                          key="share"
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          exit={{ scale: 0 }}
                          className="flex items-center gap-1.5"
                        >
                          <Share2 className="size-3.5" />
                          <span className="text-[11px]">Partager mon lien</span>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </Button>
                </div>
              </motion.div>
            )}

            {/* ─── Hashtag Display ─── */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1.7, duration: 0.5 }}
              className="flex items-center justify-center gap-2.5 py-3"
            >
              <Heart className="size-3 text-gold/40 fill-gold/15" />
              <span className="font-display text-sm text-gold/50 tracking-wider font-bold">
                {hashtag}
              </span>
              <Heart className="size-3 text-gold/40 fill-gold/15" />
            </motion.div>
          </div>

          {/* ═══ Card Footer — Security ═══ */}
          <div className="px-5 py-4 sm:px-10 sm:py-5 bg-gradient-to-r from-champagne/[0.06] to-gold/[0.04] border-t border-gold/[0.08]">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2.5">
                <div className="flex items-center gap-1.5">
                  <Lock className="size-3 text-gold/30" />
                  <span className="text-[10px] font-display text-muted-foreground/40 tracking-wide font-bold">
                    Espace personnel sécurisé
                  </span>
                </div>
                <div className="w-px h-3 bg-gold/10" />
                <div className="flex items-center gap-1.5">
                  <Eye className="size-3 text-gold/25" />
                  <span className="text-[10px] font-display text-muted-foreground/40 tracking-wide font-bold">
                    Invitation privée
                  </span>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={onLogout}
                className="h-7 gap-1.5 text-[11px] font-display text-muted-foreground/60 hover:text-foreground hover:bg-foreground/5 px-2.5"
              >
                <LogOut className="size-3" />
                Quitter
              </Button>
            </div>
          </div>
        </motion.div>

        {/* ═══════════════════════════════════════════════════
            CHECKED-IN INDICATOR
            ═══════════════════════════════════════════════════ */}
        {guest.checkedIn && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.8, duration: 0.5 }}
            className="mt-6 flex justify-center"
          >
            <div className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 shadow-sm">
              <PartyPopper className="size-4 text-emerald-500" />
              <span className="text-xs font-display font-bold tracking-wide text-emerald-700 dark:text-emerald-300">
                Vous êtes enregistré(e) ! Bienvenue 🎉
              </span>
            </div>
          </motion.div>
        )}

        {/* ═══════════════════════════════════════════════════
            VIEW STATS
            ═══════════════════════════════════════════════════ */}
        {guest.invitationViewCount > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.9, duration: 0.5 }}
            className="mt-4 flex justify-center"
          >
            <span className="text-[10px] font-display text-muted-foreground/30 tracking-wide">
              <Eye className="size-3 inline mr-1 -mt-0.5" />
              Consultée {guest.invitationViewCount} fois
            </span>
          </motion.div>
        )}

        {/* ═══════════════════════════════════════════════════
            ACCESS DENIED NOTICE
            ═══════════════════════════════════════════════════ */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 2.0, duration: 0.8 }}
          className="mt-8 sm:mt-10 text-center max-w-lg mx-auto"
        >
          <div className="flex items-center justify-center gap-2 mb-2">
            <ShieldAlert className="size-3 text-muted-foreground/20" />
            <span className="text-[9px] sm:text-[10px] font-display text-muted-foreground/25 tracking-wider uppercase font-bold">
              Avertissement de confidentialité
            </span>
          </div>
          <p className="text-[9px] sm:text-[10px] font-display text-muted-foreground/25 tracking-wide leading-relaxed">
            Cette invitation est privée et exclusivement réservée à son titulaire.
            Toute tentative d&apos;accès à l&apos;invitation d&apos;un autre invité est strictement
            interdite et surveillée.
          </p>
        </motion.div>
      </motion.div>
    </section>
  )
}
