'use client'

import { useState, useRef, useEffect } from 'react'
import { motion } from 'framer-motion'
import Image from 'next/image'
import {
  LogOut, Download, Share2, MapPin, Clock, Users, Hash,
  Armchair, Heart, Sparkles, ShieldCheck, Lock, QrCode,
  Calendar, MessageSquareHeart, ChevronDown, Copy, Check,
  Crown, Star, Gem
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

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
}

interface Settings {
  [key: string]: string | undefined
}

interface GuestPersonalSpaceProps {
  guest: GuestData
  settings: Settings
  onLogout: () => void
}

const categoryConfig: Record<string, { label: string; icon: typeof Crown; gradient: string; bg: string }> = {
  VIP: { label: 'VIP', icon: Crown, gradient: 'from-amber-500 to-yellow-600', bg: 'bg-amber-50 dark:bg-amber-900/20' },
  FAMILLE: { label: 'Famille', icon: Heart, gradient: 'from-rose-500 to-pink-600', bg: 'bg-rose-50 dark:bg-rose-900/20' },
  AMIS: { label: 'Amis', icon: Star, gradient: 'from-emerald-500 to-teal-600', bg: 'bg-emerald-50 dark:bg-emerald-900/20' },
  SPONSORS: { label: 'Sponsor', icon: Gem, gradient: 'from-purple-500 to-indigo-600', bg: 'bg-purple-50 dark:bg-purple-900/20' },
  COLLEGUES: { label: 'Collègues', icon: Users, gradient: 'from-blue-500 to-cyan-600', bg: 'bg-blue-50 dark:bg-blue-900/20' },
}

export default function GuestPersonalSpace({ guest, settings, onLogout }: GuestPersonalSpaceProps) {
  const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null)
  const [qrLoading, setQrLoading] = useState(true)
  const [copied, setCopied] = useState(false)
  const [showDetails, setShowDetails] = useState(false)
  const detailsRef = useRef<HTMLDivElement>(null)

  const catConfig = categoryConfig[guest.category] || categoryConfig.AMIS
  const CategoryIcon = catConfig.icon

  const groomName = settings.groom_name || 'Josué'
  const brideName = settings.bride_name || 'Hornella'
  const dateDisplay = settings.site_subtitle || 'Vendredi 26 Juin 2026'
  const venueName = settings.venue_name || 'Salle Polyvalente – Grand Palais Kinshasa'
  const venueAddress = settings.venue_address || '21/22 Avenue Bobozo'
  const venueCity = settings.venue_city || 'Kinshasa'
  const venueTime = settings.venue_time || '14h00'
  const venueReference = settings.venue_reference || ''
  const welcomeMessage = settings.welcome_message || 'Bienvenue sur la plateforme du mariage'

  // Fetch QR code
  useEffect(() => {
    async function fetchQR() {
      try {
        const res = await fetch(`/api/guests/qrcode/${guest.invitationCode}`)
        if (res.ok) {
          const data = await res.json()
          setQrCodeUrl(data.qrCode)
        }
      } catch {
        // QR code is optional
      } finally {
        setQrLoading(false)
      }
    }
    fetchQR()
  }, [guest.invitationCode])

  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(guest.invitationCode)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Fallback
    }
  }

  return (
    <section className="py-8 md:py-16 relative overflow-hidden min-h-screen">
      {/* Background */}
      <div className="absolute inset-0 bg-gradient-to-b from-champagne/5 via-background to-champagne/3" />

      <div className="max-w-4xl mx-auto px-4 sm:px-6 relative z-10">
        {/* ─── Security Banner ─── */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="flex items-center justify-center gap-2 mb-8"
        >
          <ShieldCheck className="size-4 text-gold/60" />
          <span className="text-[11px] font-display tracking-[0.2em] uppercase text-gold/60 font-bold">
            Espace personnel sécurisé — Accès exclusif
          </span>
          <Lock className="size-3.5 text-gold/60" />
        </motion.div>

        {/* ─── Main Invitation Card ─── */}
        <motion.div
          initial={{ opacity: 0, y: 30, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
          className="glass-card gold-border rounded-3xl overflow-hidden shadow-2xl shadow-gold/10"
        >
          {/* ─── Card Header with Couple Photos ─── */}
          <div className="relative bg-gradient-to-br from-[oklch(0.10_0.02_270)] via-[oklch(0.12_0.03_270)] to-[oklch(0.08_0.02_270)] px-6 py-10 sm:px-10 sm:py-14 text-center overflow-hidden">
            {/* Background pattern */}
            <div className="absolute inset-0 opacity-[0.03]"
              style={{
                backgroundImage: `radial-gradient(circle at 1px 1px, oklch(0.82 0.08 85 / 40%) 1px, transparent 0)`,
                backgroundSize: '40px 40px',
              }}
            />

            {/* Ornamental top */}
            <div className="relative z-10 flex items-center justify-center gap-3 mb-8">
              <div className="w-16 sm:w-28 h-px bg-gradient-to-r from-transparent via-gold/40 to-transparent" />
              <Sparkles className="size-4 text-gold/50" />
              <div className="w-16 sm:w-28 h-px bg-gradient-to-r from-transparent via-gold/40 to-transparent" />
            </div>

            {/* Couple photos */}
            <div className="relative z-10 flex items-center justify-center gap-4 sm:gap-6 mb-8">
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.3, duration: 0.6 }}
                className="flex flex-col items-center"
              >
                <div className="w-20 h-20 sm:w-28 sm:h-28 rounded-full overflow-hidden border-2 border-gold/30 shadow-xl shadow-black/40">
                  <Image
                    src="/upload/couple-photo-1.jpeg"
                    alt={groomName}
                    width={112}
                    height={112}
                    className="w-full h-full object-cover"
                  />
                </div>
                <span className="mt-2 font-display text-xs sm:text-sm tracking-[0.15em] text-white/60 uppercase font-semibold">
                  {groomName}
                </span>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, scale: 0 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.5, type: 'spring', stiffness: 200 }}
                className="flex flex-col items-center"
              >
                <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-gradient-to-br from-gold via-gold-light to-rose-gold flex items-center justify-center shadow-xl shadow-gold/30">
                  <span className="font-display text-xl sm:text-2xl font-semibold text-background">&</span>
                </div>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.3, duration: 0.6 }}
                className="flex flex-col items-center"
              >
                <div className="w-20 h-20 sm:w-28 sm:h-28 rounded-full overflow-hidden border-2 border-rose-gold/30 shadow-xl shadow-black/40">
                  <Image
                    src="/upload/couple-photo-2.png"
                    alt={brideName}
                    width={112}
                    height={112}
                    className="w-full h-full object-cover"
                  />
                </div>
                <span className="mt-2 font-display text-xs sm:text-sm tracking-[0.15em] text-white/60 uppercase font-semibold">
                  {brideName}
                </span>
              </motion.div>
            </div>

            {/* Welcome text */}
            <motion.p
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6 }}
              className="font-display text-sm sm:text-base tracking-[0.2em] uppercase text-white/40 mb-4 font-semibold"
            >
              {welcomeMessage}
            </motion.p>

            {/* Guest name — THE key personal element */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.7, duration: 0.8 }}
            >
              <p className="font-display text-sm sm:text-base tracking-[0.3em] uppercase text-gold/50 mb-2 font-bold">
                Invitation exclusive pour
              </p>
              <h1 className="font-serif text-3xl sm:text-4xl md:text-5xl font-bold gold-gradient leading-tight">
                {guest.firstName} {guest.lastName}
              </h1>
            </motion.div>

            {/* Category badge */}
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.9 }}
              className="mt-6 inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10"
            >
              <CategoryIcon className="size-4 text-gold/70" />
              <span className="text-xs font-display font-bold tracking-[0.2em] uppercase text-gold/70">
                {catConfig.label}
              </span>
            </motion.div>
          </div>

          {/* ─── Card Body ─── */}
          <div className="px-6 py-8 sm:px-10 sm:py-10 space-y-8">
            {/* Personal message */}
            {guest.personalMessage && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 1.0 }}
                className="p-5 rounded-2xl bg-gradient-to-br from-gold/5 to-rose-gold/5 border border-gold/10"
              >
                <div className="flex items-start gap-3">
                  <MessageSquareHeart className="size-5 text-gold shrink-0 mt-0.5" />
                  <p className="font-display text-sm sm:text-base text-foreground/80 italic leading-relaxed">
                    &ldquo;{guest.personalMessage}&rdquo;
                  </p>
                </div>
              </motion.div>
            )}

            {/* Key information grid */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1.1 }}
              className="grid grid-cols-2 gap-3 sm:gap-4"
            >
              {/* Date */}
              <div className="glass-card p-4 rounded-xl text-center group hover:shadow-md hover:shadow-gold/5 transition-all">
                <Calendar className="size-5 text-gold mx-auto mb-2 group-hover:scale-110 transition-transform" />
                <p className="text-[10px] font-display font-bold tracking-[0.2em] uppercase text-muted-foreground mb-1">Date</p>
                <p className="font-serif text-sm sm:text-base font-bold text-foreground">{dateDisplay}</p>
              </div>

              {/* Time */}
              <div className="glass-card p-4 rounded-xl text-center group hover:shadow-md hover:shadow-gold/5 transition-all">
                <Clock className="size-5 text-gold mx-auto mb-2 group-hover:scale-110 transition-transform" />
                <p className="text-[10px] font-display font-bold tracking-[0.2em] uppercase text-muted-foreground mb-1">Heure</p>
                <p className="font-serif text-sm sm:text-base font-bold text-foreground">{venueTime}</p>
              </div>

              {/* Table */}
              <div className="glass-card p-4 rounded-xl text-center group hover:shadow-md hover:shadow-gold/5 transition-all">
                <Hash className="size-5 text-gold mx-auto mb-2 group-hover:scale-110 transition-transform" />
                <p className="text-[10px] font-display font-bold tracking-[0.2em] uppercase text-muted-foreground mb-1">Table</p>
                <p className="font-serif text-sm sm:text-base font-bold text-foreground">
                  {guest.table ? `Table ${guest.table.number}` : 'À confirmer'}
                </p>
                {guest.table && (
                  <p className="text-[10px] font-display text-muted-foreground mt-0.5">{guest.table.name}</p>
                )}
              </div>

              {/* Seats */}
              <div className="glass-card p-4 rounded-xl text-center group hover:shadow-md hover:shadow-gold/5 transition-all">
                <Armchair className="size-5 text-gold mx-auto mb-2 group-hover:scale-110 transition-transform" />
                <p className="text-[10px] font-display font-bold tracking-[0.2em] uppercase text-muted-foreground mb-1">Places</p>
                <p className="font-serif text-sm sm:text-base font-bold text-foreground">
                  {guest.seats} {guest.seats > 1 ? 'places' : 'place'}
                </p>
              </div>
            </motion.div>

            {/* Venue info */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1.2 }}
              className="p-5 rounded-2xl bg-gradient-to-br from-champagne/10 to-gold/5 border border-gold/10"
            >
              <div className="flex items-start gap-3">
                <MapPin className="size-5 text-gold shrink-0 mt-0.5" />
                <div>
                  <p className="font-display text-sm font-bold text-foreground">{venueName}</p>
                  <p className="font-display text-xs text-muted-foreground mt-1">{venueAddress}, {venueCity}</p>
                  {venueReference && (
                    <p className="font-display text-xs text-muted-foreground/70 mt-0.5">{venueReference}</p>
                  )}
                </div>
              </div>
            </motion.div>

            {/* QR Code section */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1.3 }}
              className="text-center"
            >
              <p className="font-display text-xs tracking-[0.2em] uppercase text-muted-foreground font-bold mb-4">
                Présentez ce QR code à l&apos;entrée
              </p>
              <div className="inline-block p-4 bg-white rounded-2xl shadow-xl">
                {qrLoading ? (
                  <div className="w-40 h-40 flex items-center justify-center">
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                      className="size-8 border-2 border-gold/30 border-t-gold rounded-full"
                    />
                  </div>
                ) : qrCodeUrl ? (
                  <img
                    src={qrCodeUrl}
                    alt={`QR Code - ${guest.firstName} ${guest.lastName}`}
                    className="w-40 h-40"
                  />
                ) : (
                  <div className="w-40 h-40 flex items-center justify-center text-muted-foreground">
                    <QrCode className="size-12" />
                  </div>
                )}
              </div>
              <p className="font-display text-xs text-muted-foreground mt-3">
                Code : <span className="font-bold text-foreground tracking-wider">{guest.invitationCode}</span>
              </p>
            </motion.div>

            {/* Invitation code copy */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1.4 }}
              className="flex items-center justify-center"
            >
              <button
                onClick={handleCopyCode}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gold/5 border border-gold/10 hover:bg-gold/10 transition-all text-sm font-display"
              >
                {copied ? (
                  <>
                    <Check className="size-3.5 text-green-500" />
                    <span className="text-green-600">Copié !</span>
                  </>
                ) : (
                  <>
                    <Copy className="size-3.5 text-gold/60" />
                    <span className="text-muted-foreground">Copier le code</span>
                  </>
                )}
              </button>
            </motion.div>

            {/* Show more details toggle */}
            <div className="text-center">
              <button
                onClick={() => setShowDetails(!showDetails)}
                className="inline-flex items-center gap-2 text-xs font-display text-muted-foreground hover:text-foreground transition-colors"
              >
                <span>{showDetails ? 'Masquer les détails' : 'Plus de détails'}</span>
                <motion.div
                  animate={{ rotate: showDetails ? 180 : 0 }}
                  transition={{ duration: 0.3 }}
                >
                  <ChevronDown className="size-3.5" />
                </motion.div>
              </button>
            </div>

            {/* Expandable details */}
            <motion.div
              ref={detailsRef}
              initial={false}
              animate={{
                height: showDetails ? 'auto' : 0,
                opacity: showDetails ? 1 : 0,
              }}
              transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
              className="overflow-hidden"
            >
              <div className="space-y-4 pt-4 border-t border-gold/10">
                {/* Status */}
                <div className="flex items-center justify-between py-2">
                  <span className="text-xs font-display tracking-wide uppercase text-muted-foreground font-bold">Statut</span>
                  <Badge
                    variant="outline"
                    className={`${
                      guest.status === 'CONFIRMED'
                        ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 border-0'
                        : guest.status === 'DECLINED'
                        ? 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 border-0'
                        : 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 border-0'
                    } text-xs font-display font-bold`}
                  >
                    {guest.status === 'CONFIRMED' ? '✓ Confirmé' : guest.status === 'DECLINED' ? '✗ Décliné' : '⏳ En attente'}
                  </Badge>
                </div>

                {/* Category */}
                <div className="flex items-center justify-between py-2">
                  <span className="text-xs font-display tracking-wide uppercase text-muted-foreground font-bold">Catégorie</span>
                  <Badge variant="outline" className={`${catConfig.bg} ${catConfig.gradient} bg-clip-text text-xs font-display font-bold border-0`}>
                    <CategoryIcon className="size-3 mr-1" />
                    {catConfig.label}
                  </Badge>
                </div>

                {/* Hashtag */}
                <div className="flex items-center justify-center gap-2 py-4">
                  <Heart className="size-3 text-gold fill-gold/20" />
                  <span className="font-display text-sm text-gold/60 tracking-wider">
                    {settings.hashtag || '#JosueEtHornella2026'}
                  </span>
                  <Heart className="size-3 text-gold fill-gold/20" />
                </div>
              </div>
            </motion.div>
          </div>

          {/* ─── Card Footer ─── */}
          <div className="px-6 py-5 sm:px-10 bg-gradient-to-r from-champagne/5 to-gold/5 border-t border-gold/10">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Lock className="size-3 text-gold/30" />
                <span className="text-[10px] font-display text-muted-foreground/40 tracking-wide">
                  Invitation privée — {guest.firstName} {guest.lastName}
                </span>
              </div>
              <button
                onClick={onLogout}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-display text-muted-foreground hover:text-foreground hover:bg-foreground/5 transition-all"
              >
                <LogOut className="size-3" />
                Quitter
              </button>
            </div>
          </div>
        </motion.div>

        {/* Bottom security note */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.5 }}
          className="mt-8 text-center"
        >
          <p className="text-[10px] font-display text-muted-foreground/30 tracking-wide max-w-md mx-auto leading-relaxed">
            Cette invitation est privée et exclusivement réservée à son titulaire.
            Toute tentative d&apos;accès à l&apos;invitation d&apos;un autre invité est strictement interdite et surveillée.
          </p>
        </motion.div>
      </div>
    </section>
  )
}
