'use client'

import { motion } from 'framer-motion'
import { X, Heart, Gem, Users, Hash, Armchair, Ticket, Quote } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import Image from 'next/image'

interface InvitationCardProps {
  guestName: string
  tableName: string
  tableNumber: number
  seats: number
  category: string
  invitationCode: string
  personalMessage?: string | null
  qrCodeUrl?: string
  onClose?: () => void
}

const categoryConfig: Record<string, { bg: string; text: string; border: string; icon: React.ReactNode; label: string }> = {
  VIP: {
    bg: 'bg-amber-50 dark:bg-amber-950/40',
    text: 'text-amber-700 dark:text-amber-300',
    border: 'border-amber-300/50 dark:border-amber-600/30',
    icon: <Gem className="size-3" />,
    label: 'VIP',
  },
  FAMILLE: {
    bg: 'bg-rose-50 dark:bg-rose-950/40',
    text: 'text-rose-700 dark:text-rose-300',
    border: 'border-rose-300/50 dark:border-rose-600/30',
    icon: <Heart className="size-3" />,
    label: 'Famille',
  },
  AMIS: {
    bg: 'bg-emerald-50 dark:bg-emerald-950/40',
    text: 'text-emerald-700 dark:text-emerald-300',
    border: 'border-emerald-300/50 dark:border-emerald-600/30',
    icon: <Users className="size-3" />,
    label: 'Amis',
  },
  SPONSORS: {
    bg: 'bg-purple-50 dark:bg-purple-950/40',
    text: 'text-purple-700 dark:text-purple-300',
    border: 'border-purple-300/50 dark:border-purple-600/30',
    icon: <Gem className="size-3" />,
    label: 'Sponsors',
  },
  COLLEGUES: {
    bg: 'bg-teal-50 dark:bg-teal-950/40',
    text: 'text-teal-700 dark:text-teal-300',
    border: 'border-teal-300/50 dark:border-teal-600/30',
    icon: <Users className="size-3" />,
    label: 'Collègues',
  },
}

/* Ornamental flourish SVG component */
function OrnamentalFlourish({ className = '' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 200 30"
      className={`w-40 md:w-52 ${className}`}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M5 15 Q 30 2, 55 15 T 100 15 T 145 15 T 195 15"
        stroke="currentColor"
        strokeWidth="0.8"
        fill="none"
        opacity="0.5"
      />
      <path
        d="M5 15 Q 30 28, 55 15 T 100 15 T 145 15 T 195 15"
        stroke="currentColor"
        strokeWidth="0.8"
        fill="none"
        opacity="0.5"
      />
      <circle cx="100" cy="15" r="2" fill="currentColor" opacity="0.6" />
      <circle cx="60" cy="15" r="1" fill="currentColor" opacity="0.4" />
      <circle cx="140" cy="15" r="1" fill="currentColor" opacity="0.4" />
      {/* end dots */}
      <circle cx="8" cy="15" r="1.5" fill="currentColor" opacity="0.3" />
      <circle cx="192" cy="15" r="1.5" fill="currentColor" opacity="0.3" />
    </svg>
  )
}

/* Small ornamental divider */
function SmallDivider() {
  return (
    <div className="flex items-center justify-center gap-3 py-1">
      <div className="h-px w-8 bg-gradient-to-r from-transparent to-gold/40" />
      <span className="text-gold/50 text-xs">✦</span>
      <div className="h-px w-8 bg-gradient-to-l from-transparent to-gold/40" />
    </div>
  )
}

export default function InvitationCard({
  guestName,
  tableName,
  tableNumber,
  seats,
  category,
  invitationCode,
  personalMessage,
  qrCodeUrl,
  onClose,
}: InvitationCardProps) {
  const catConfig = categoryConfig[category] || categoryConfig.AMIS

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.92, y: 20 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95, y: 10 }}
      transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
      className="relative flex items-center justify-center p-4 md:p-6"
    >
      {/* Close button */}
      {onClose && (
        <motion.button
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          onClick={onClose}
          className="absolute -top-2 -right-2 md:top-2 md:right-2 z-20 w-9 h-9 rounded-full bg-background/80 dark:bg-background/60 backdrop-blur-sm border border-gold/20 flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-gold/40 transition-all shadow-md"
          aria-label="Fermer l'invitation"
        >
          <X className="size-4" />
        </motion.button>
      )}

      {/* ─── THE CARD ─── */}
      <div
        className="
          relative w-full max-w-sm
          rounded-2xl md:rounded-3xl
          overflow-hidden
          shadow-2xl shadow-gold/10 dark:shadow-gold/5
        "
        style={{ aspectRatio: '3 / 4.2' }}
      >
        {/* ─── PAPER TEXTURE BACKGROUND ─── */}
        <div
          className="absolute inset-0 z-0 dark:hidden"
          style={{
            background: `
              repeating-linear-gradient(
                0deg,
                transparent,
                transparent 28px,
                oklch(0.68 0.04 85 / 3%) 28px,
                oklch(0.68 0.04 85 / 3%) 29px
              ),
              repeating-linear-gradient(
                90deg,
                transparent,
                transparent 28px,
                oklch(0.68 0.04 85 / 2%) 28px,
                oklch(0.68 0.04 85 / 2%) 29px
              ),
              linear-gradient(
                170deg,
                oklch(0.98 0.008 85) 0%,
                oklch(0.96 0.015 85) 30%,
                oklch(0.97 0.01 85) 60%,
                oklch(0.95 0.018 85) 100%
              )
            `,
          }}
        />
        {/* Dark mode paper texture */}
        <div
          className="absolute inset-0 z-0 hidden dark:block"
          style={{
            background: `
              repeating-linear-gradient(
                0deg,
                transparent,
                transparent 28px,
                oklch(0.72 0.08 85 / 4%) 28px,
                oklch(0.72 0.08 85 / 4%) 29px
              ),
              repeating-linear-gradient(
                90deg,
                transparent,
                transparent 28px,
                oklch(0.72 0.08 85 / 3%) 28px,
                oklch(0.72 0.08 85 / 3%) 29px
              ),
              linear-gradient(
                170deg,
                oklch(0.16 0.02 270) 0%,
                oklch(0.19 0.03 270) 30%,
                oklch(0.17 0.025 270) 60%,
                oklch(0.20 0.03 270) 100%
              )
            `,
          }}
        />

        {/* ─── GOLD BORDER WITH GLOW ─── */}
        <div className="absolute inset-0 z-[1] rounded-2xl md:rounded-3xl gold-border pointer-events-none" />

        {/* ─── INNER GOLDEN FRAME ─── */}
        <div className="absolute inset-3 z-[1] rounded-xl md:rounded-2xl border border-gold/15 pointer-events-none" />

        {/* ─── SHIMMER OVERLAY ─── */}
        <motion.div
          className="absolute inset-0 z-[2] pointer-events-none"
          style={{
            background:
              'linear-gradient(105deg, transparent 40%, oklch(0.82 0.08 85 / 12%) 45%, oklch(0.82 0.08 85 / 6%) 50%, transparent 55%)',
            backgroundSize: '200% 100%',
          }}
          animate={{
            backgroundPosition: ['200% 0', '-200% 0'],
          }}
          transition={{
            duration: 4,
            repeat: Infinity,
            ease: 'linear',
            repeatDelay: 3,
          }}
        />

        {/* ─── CONTENT ─── */}
        <div className="relative z-10 flex flex-col items-center h-full px-6 py-8 md:px-8 md:py-10 text-center">

          {/* ─── TOP: ORNAMENTAL FLOURISH ─── */}
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.8 }}
            className="flourish"
          >
            <OrnamentalFlourish />
          </motion.div>

          {/* ─── "VOUS ÊTES INVITÉ(E)" ─── */}
          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5, duration: 0.8 }}
            className="font-display text-sm md:text-base tracking-[0.25em] uppercase text-muted-foreground mt-3"
          >
            Vous êtes invité(e)
          </motion.p>

          {/* ─── COUPLE PHOTOS (overlapping circles) ─── */}
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.7, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            className="relative flex items-center mt-5 mb-4"
          >
            {/* Photo 1 (left, slightly behind) */}
            <motion.div
              animate={{ y: [0, -3, 0] }}
              transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut', delay: 0 }}
              className="relative z-[1] -mr-5"
            >
              <div className="w-16 h-16 md:w-20 md:h-20 rounded-full overflow-hidden ring-2 ring-gold/40 shadow-lg shadow-gold/10">
                <Image
                  src="/upload/couple-photo-1.jpeg"
                  alt="Alexandre"
                  width={80}
                  height={80}
                  className="w-full h-full object-cover"
                />
              </div>
            </motion.div>
            {/* Photo 2 (right, slightly in front) */}
            <motion.div
              animate={{ y: [0, -3, 0] }}
              transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut', delay: 1 }}
              className="relative z-[2]"
            >
              <div className="w-16 h-16 md:w-20 md:h-20 rounded-full overflow-hidden ring-2 ring-rose-gold/40 shadow-lg shadow-rose-gold/10">
                <Image
                  src="/upload/couple-photo-2.png"
                  alt="Béatrice"
                  width={80}
                  height={80}
                  className="w-full h-full object-cover"
                />
              </div>
            </motion.div>
          </motion.div>

          {/* ─── COUPLE NAMES ─── */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.9, duration: 0.8 }}
          >
            <h2 className="font-serif text-2xl md:text-3xl font-bold">
              <span className="gold-gradient">Alexandre</span>
              <span className="block my-0.5 font-display text-lg font-light text-gold/50 tracking-[0.15em]">
                &amp;
              </span>
              <span className="gold-gradient">Béatrice</span>
            </h2>
          </motion.div>

          {/* ─── ORNAMENTAL DIVIDER ─── */}
          <motion.div
            initial={{ opacity: 0, scaleX: 0 }}
            animate={{ opacity: 1, scaleX: 1 }}
            transition={{ delay: 1.1, duration: 0.6 }}
            className="w-full mt-4 mb-3"
          >
            <SmallDivider />
          </motion.div>

          {/* ─── GUEST NAME ─── */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.2, duration: 0.6 }}
            className="mb-2"
          >
            <p className="font-display text-xs tracking-[0.2em] uppercase text-muted-foreground/70 mb-1">
              Cher(e) invité(e)
            </p>
            <h3 className="font-serif text-xl md:text-2xl font-semibold text-foreground">
              {guestName}
            </h3>
          </motion.div>

          {/* ─── TABLE & SEATS INFO ─── */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.35, duration: 0.6 }}
            className="flex flex-col items-center gap-1.5 mb-3"
          >
            <div className="flex items-center gap-1.5 text-sm font-display text-foreground/80">
              <Hash className="size-3.5 text-gold/60" />
              <span>
                Table {tableNumber} — {tableName}
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-sm font-display text-muted-foreground">
              <Armchair className="size-3.5 text-gold/50" />
              <span>
                {seats} place{seats > 1 ? 's' : ''} réservée{seats > 1 ? 's' : ''}
              </span>
            </div>
          </motion.div>

          {/* ─── CATEGORY BADGE & INVITATION CODE ─── */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.5, duration: 0.6 }}
            className="flex flex-wrap items-center justify-center gap-2 mb-3"
          >
            <Badge
              variant="outline"
              className={`${catConfig.bg} ${catConfig.text} ${catConfig.border} border text-xs font-medium gap-1 px-2.5 py-0.5`}
            >
              {catConfig.icon}
              {catConfig.label}
            </Badge>
            <div className="flex items-center gap-1 text-xs text-muted-foreground/60 font-display tracking-wider">
              <Ticket className="size-3" />
              <span>{invitationCode}</span>
            </div>
          </motion.div>

          {/* ─── PERSONAL MESSAGE ─── */}
          {personalMessage && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1.65, duration: 0.6 }}
              className="w-full mt-1 mb-2"
            >
              <div className="relative px-4 py-3 rounded-lg bg-gold/[0.04] dark:bg-gold/[0.06] border border-gold/10">
                {/* Opening quote */}
                <Quote className="absolute -top-1.5 left-2 size-4 text-gold/30 rotate-180" />
                <p className="italic font-display text-sm text-foreground/75 leading-relaxed px-3">
                  {personalMessage}
                </p>
                {/* Closing quote */}
                <Quote className="absolute -bottom-1.5 right-2 size-4 text-gold/30" />
              </div>
            </motion.div>
          )}

          {/* ─── SPACER to push bottom section down ─── */}
          <div className="flex-1 min-h-4" />

          {/* ─── BOTTOM SECTION ─── */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.8, duration: 0.6 }}
            className="w-full flex flex-col items-center"
          >
            {/* Date */}
            <div className="section-divider !py-2 !gap-3 max-w-[200px]">
              <span className="flourish text-[10px]">✦</span>
            </div>
            <p className="font-display text-base md:text-lg tracking-[0.15em] text-foreground/80">
              15 Septembre 2025
            </p>

            {/* QR Code */}
            {qrCodeUrl && (
              <div className="mt-4 mb-2">
                <div className="p-2 bg-white rounded-lg shadow-md shadow-gold/5">
                  {/* Using regular img for base64 QR code data */}
                  <img
                    src={qrCodeUrl}
                    alt="QR Code d'invitation"
                    className="w-20 h-20 md:w-24 md:h-24"
                  />
                </div>
                <p className="text-[10px] font-display tracking-wider text-muted-foreground/50 mt-1.5">
                  Présentez à l&apos;entrée
                </p>
              </div>
            )}

            {/* Bottom ornamental divider */}
            <div className="mt-3 mb-2">
              <SmallDivider />
            </div>

            {/* Couple photo watermark/accent */}
            <motion.div
              animate={{ y: [0, -2, 0] }}
              transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
              className="relative opacity-30 dark:opacity-20"
            >
              <div className="w-10 h-10 rounded-full overflow-hidden ring-1 ring-gold/20">
                <Image
                  src="/upload/couple-photo-1.jpeg"
                  alt=""
                  width={40}
                  height={40}
                  className="w-full h-full object-cover"
                  aria-hidden="true"
                />
              </div>
            </motion.div>
          </motion.div>
        </div>
      </div>
    </motion.div>
  )
}
