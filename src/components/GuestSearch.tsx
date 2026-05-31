'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { motion, AnimatePresence, useInView } from 'framer-motion'
import { Search, QrCode, X, Users, Hash, Armchair, MessageSquareHeart } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'

interface GuestResult {
  id: string
  firstName: string
  lastName: string
  phone?: string | null
  email?: string | null
  seats: number
  category: string
  status: string
  invitationCode: string
  personalMessage?: string | null
  table: {
    id: string
    name: string
    number: number
  } | null
}

interface QRData {
  guest: {
    id: string
    firstName: string
    lastName: string
    invitationCode: string
    status: string
    category: string
    seats: number
    table: { id: string; name: string; number: number } | null
  }
  qrCode: string
  qrUrl: string
}

const categoryStyles: Record<string, { bg: string; text: string; label: string }> = {
  VIP: { bg: 'bg-amber-100 dark:bg-amber-900/30', text: 'text-amber-700 dark:text-amber-300', label: 'VIP' },
  FAMILLE: { bg: 'bg-rose-100 dark:bg-rose-900/30', text: 'text-rose-700 dark:text-rose-300', label: 'Famille' },
  AMIS: { bg: 'bg-emerald-100 dark:bg-emerald-900/30', text: 'text-emerald-700 dark:text-emerald-300', label: 'Amis' },
  SPONSORS: { bg: 'bg-purple-100 dark:bg-purple-900/30', text: 'text-purple-700 dark:text-purple-300', label: 'Sponsors' },
  COLLEGUES: { bg: 'bg-teal-100 dark:bg-teal-900/30', text: 'text-teal-700 dark:text-teal-300', label: 'Collègues' },
}

const statusStyles: Record<string, { bg: string; text: string; label: string }> = {
  CONFIRMED: { bg: 'bg-green-100 dark:bg-green-900/30', text: 'text-green-700 dark:text-green-300', label: 'Confirmé' },
  PENDING: { bg: 'bg-amber-100 dark:bg-amber-900/30', text: 'text-amber-700 dark:text-amber-300', label: 'En attente' },
  DECLINED: { bg: 'bg-red-100 dark:bg-red-900/30', text: 'text-red-700 dark:text-red-300', label: 'Décliné' },
}

export default function GuestSearch({ initialCode }: { initialCode?: string }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<GuestResult[]>([])
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)
  const [qrDialogOpen, setQrDialogOpen] = useState(false)
  const [qrData, setQrData] = useState<QRData | null>(null)
  const [qrLoading, setQrLoading] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const sectionRef = useRef<HTMLDivElement>(null)
  const isInView = useInView(sectionRef, { once: true, margin: '-100px' })

  // Debounced search
  const performSearch = useCallback(async (q: string) => {
    if (!q.trim()) {
      setResults([])
      setSearched(false)
      return
    }

    setLoading(true)
    try {
      const res = await fetch(`/api/guests/search?q=${encodeURIComponent(q.trim())}`)
      if (res.ok) {
        const data = await res.json()
        setResults(data.guests || [])
      }
    } catch {
      setResults([])
    } finally {
      setLoading(false)
      setSearched(true)
    }
  }, [])

  const handleInputChange = (value: string) => {
    setQuery(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      performSearch(value)
    }, 300)
  }

  // Auto-search from URL code param
  useEffect(() => {
    if (initialCode) {
      setQuery(initialCode)
      performSearch(initialCode)
    }
  }, [initialCode, performSearch])

  // QR Code dialog
  const openQRCode = async (code: string) => {
    setQrLoading(true)
    setQrDialogOpen(true)
    try {
      const res = await fetch(`/api/guests/qrcode/${code}`)
      if (res.ok) {
        const data = await res.json()
        setQrData(data)
      }
    } catch {
      // Error state
    } finally {
      setQrLoading(false)
    }
  }

  return (
    <section id="recherche" ref={sectionRef} className="py-20 md:py-32 relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Title */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.8 }}
          className="text-center mb-12"
        >
          <h2 className="font-serif text-3xl md:text-5xl font-bold mb-4">
            <span className="gold-gradient">Retrouvez Votre Place</span>
          </h2>
          <p className="font-display text-lg text-muted-foreground max-w-xl mx-auto">
            Recherchez votre invitation par nom, prénom ou code d&apos;invitation
          </p>
          <div className="section-divider max-w-xs mx-auto mt-6">
            <span className="flourish text-sm">✦</span>
          </div>
        </motion.div>

        {/* Search Input */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.8, delay: 0.2 }}
          className="max-w-2xl mx-auto mb-12"
        >
          <div className="relative group">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 size-5 text-gold/50 group-focus-within:text-gold transition-colors" />
            <Input
              type="text"
              placeholder="Nom, prénom ou code d'invitation..."
              value={query}
              onChange={(e) => handleInputChange(e.target.value)}
              className="pl-12 pr-10 h-14 text-lg glass-card gold-border rounded-xl font-display focus:border-gold focus:ring-gold/30"
            />
            {query && (
              <button
                onClick={() => {
                  setQuery('')
                  setResults([])
                  setSearched(false)
                }}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Effacer la recherche"
              >
                <X className="size-4" />
              </button>
            )}
          </div>
        </motion.div>

        {/* Loading Skeletons */}
        {loading && (
          <div className="max-w-2xl mx-auto space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="glass-card p-6 rounded-xl">
                <div className="flex items-center gap-4">
                  <Skeleton className="h-12 w-12 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-48" />
                    <Skeleton className="h-3 w-32" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Results */}
        <AnimatePresence mode="wait">
          {!loading && searched && results.length > 0 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="max-w-2xl mx-auto space-y-4"
            >
              {results.map((guest, i) => {
                const catStyle = categoryStyles[guest.category] || categoryStyles.AMIS
                const statStyle = statusStyles[guest.status] || statusStyles.PENDING

                return (
                  <motion.div
                    key={guest.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.08, duration: 0.4 }}
                    className="glass-card p-6 rounded-xl hover:shadow-lg hover:shadow-gold/5 transition-all duration-300 group"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        {/* Name */}
                        <h3 className="font-serif text-xl font-semibold text-foreground mb-2">
                          {guest.firstName} {guest.lastName}
                        </h3>

                        {/* Badges */}
                        <div className="flex flex-wrap items-center gap-2 mb-3">
                          <Badge
                            variant="outline"
                            className={`${catStyle.bg} ${catStyle.text} border-0 text-xs font-medium`}
                          >
                            {catStyle.label}
                          </Badge>
                          <Badge
                            variant="outline"
                            className={`${statStyle.bg} ${statStyle.text} border-0 text-xs font-medium`}
                          >
                            {statStyle.label}
                          </Badge>
                        </div>

                        {/* Details */}
                        <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                          {guest.table && (
                            <span className="flex items-center gap-1.5">
                              <Hash className="size-3.5" />
                              Table {guest.table.number} — {guest.table.name}
                            </span>
                          )}
                          <span className="flex items-center gap-1.5">
                            <Armchair className="size-3.5" />
                            {guest.seats} {guest.seats > 1 ? 'places' : 'place'}
                          </span>
                          <span className="flex items-center gap-1.5">
                            <Users className="size-3.5" />
                            {guest.invitationCode}
                          </span>
                        </div>

                        {/* Personal message */}
                        {guest.personalMessage && (
                          <div className="mt-3 p-3 rounded-lg bg-gold/5 dark:bg-gold/5 border border-gold/10">
                            <p className="text-sm text-foreground/80 flex items-start gap-2">
                              <MessageSquareHeart className="size-4 text-gold shrink-0 mt-0.5" />
                              <span className="italic font-display">{guest.personalMessage}</span>
                            </p>
                          </div>
                        )}
                      </div>

                      {/* QR Button */}
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => openQRCode(guest.invitationCode)}
                        className="shrink-0 border-gold/20 hover:border-gold/40 hover:bg-gold/5 text-gold/70 hover:text-gold transition-all"
                        aria-label="Voir le QR code"
                      >
                        <QrCode className="size-5" />
                      </Button>
                    </div>
                  </motion.div>
                )
              })}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Empty State */}
        {!loading && searched && results.length === 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center py-12"
          >
            <div className="flourish text-4xl mb-4">✉</div>
            <p className="font-serif text-xl text-muted-foreground mb-2">
              Aucun résultat trouvé
            </p>
            <p className="font-display text-sm text-muted-foreground/70">
              Vérifiez l&apos;orthographe ou essayez avec votre code d&apos;invitation
            </p>
          </motion.div>
        )}

        {/* Initial State */}
        {!loading && !searched && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center py-8"
          >
            <div className="flourish text-3xl mb-4">⟡</div>
            <p className="font-display text-muted-foreground">
              Entrez votre nom ou code d&apos;invitation pour retrouver vos informations
            </p>
          </motion.div>
        )}
      </div>

      {/* QR Code Dialog */}
      <Dialog open={qrDialogOpen} onOpenChange={setQrDialogOpen}>
        <DialogContent className="glass-card gold-border sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-serif text-xl gold-gradient text-center">
              Votre Invitation
            </DialogTitle>
            <DialogDescription className="text-center font-display">
              Présentez ce QR code à l&apos;entrée
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col items-center py-4">
            {qrLoading ? (
              <div className="w-64 h-64 flex items-center justify-center">
                <div className="shimmer w-64 h-64 rounded-xl" />
              </div>
            ) : qrData ? (
              <>
                <div className="p-4 bg-white rounded-xl shadow-lg mb-4">
                  <img
                    src={qrData.qrCode}
                    alt="QR Code d'invitation"
                    className="w-56 h-56"
                  />
                </div>
                <p className="font-serif text-lg font-semibold text-center">
                  {qrData.guest.firstName} {qrData.guest.lastName}
                </p>
                <p className="text-sm text-muted-foreground font-display mt-1">
                  Code : {qrData.guest.invitationCode}
                </p>
                {qrData.guest.table && (
                  <p className="text-sm text-muted-foreground font-display mt-1">
                    Table {qrData.guest.table.number} — {qrData.guest.table.name}
                  </p>
                )}
              </>
            ) : (
              <p className="text-muted-foreground">Erreur lors du chargement</p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </section>
  )
}
