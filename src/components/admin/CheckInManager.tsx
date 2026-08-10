'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  QrCode, Search, CheckCircle2, XCircle, AlertCircle, Clock,
  Users, TrendingUp, RotateCcw, Camera,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { triggerHaptic, playSuccessSound } from '@/lib/haptics/feedback'

/**
 * CheckInManager — Mission 4.7 Phase 3
 *
 * Day-of-event check-in interface for reception staff.
 * Accessible from /w/[slug]/admin → Check-in tab.
 *
 * Features:
 *   - Manual code entry (always available — REAL)
 *   - QR camera scan (DEFER_EXTERNAL — requires getUserMedia + barcode library;
 *     classified honestly, not simulated)
 *   - Guest search fallback (REAL — searches by name within tenant)
 *   - Check-in result: CHECKED_IN / ALREADY_CHECKED_IN / REJECTED / UNKNOWN
 *   - Reception dashboard: total, arrived, remaining, arrival rate
 *   - Recent check-ins list (real DB data)
 *
 * Tenant isolation: all API calls include X-Wedding-Slug header. The check-in
 * API (POST /api/check-in) is tenant-scoped via AsyncLocalStorage — a code
 * from another wedding is REJECTED with 404 (no leak).
 */

interface CheckInResult {
  status: 'CHECKED_IN' | 'ALREADY_CHECKED_IN' | 'REJECTED' | 'UNKNOWN'
  guest?: {
    id: string
    firstName: string
    lastName: string
    category: string
    seats: number
    invitationType: string
  }
  table?: { name: string; number: number } | null
  checkedInAt?: string
  message: string
}

interface GuestSearchResult {
  id: string
  firstName: string
  lastName: string
  invitationCode: string
  category: string
  checkedIn: boolean
  table?: { name: string; number: number } | null
}

interface DashboardStats {
  total: number
  arrived: number
  remaining: number
  arrivalRate: number
}

interface RecentCheckIn {
  id: string
  firstName: string
  lastName: string
  checkedInAt: string
  category: string
}

interface Props {
  weddingSlug: string
  csrfToken: string
}

export default function CheckInManager({ weddingSlug, csrfToken }: Props) {
  const [code, setCode] = useState('')
  const [result, setResult] = useState<CheckInResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<GuestSearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [stats, setStats] = useState<DashboardStats>({ total: 0, arrived: 0, remaining: 0, arrivalRate: 0 })
  const [recent, setRecent] = useState<RecentCheckIn[]>([])

  // Fetch dashboard stats + recent check-ins
  const fetchDashboard = useCallback(async () => {
    try {
      const [statsRes, guestsRes] = await Promise.all([
        fetch(`/api/guests?limit=1&includeTotal=true`, {
          headers: { 'X-Wedding-Slug': weddingSlug },
        }),
        fetch(`/api/guests?limit=100`, {
          headers: { 'X-Wedding-Slug': weddingSlug },
        }),
      ])
      if (statsRes.ok && guestsRes.ok) {
        const guestsData = await guestsRes.json()
        const guests = guestsData.guests || []
        const total = guestsData.pagination?.total || guests.length
        const arrived = guests.filter((g: { checkedIn: boolean }) => g.checkedIn).length
        const remaining = total - arrived
        const arrivalRate = total > 0 ? Math.round((arrived / total) * 100) : 0
        setStats({ total, arrived, remaining, arrivalRate })

        // Recent check-ins (last 5, sorted by checkedInAt desc)
        const recentArrived = guests
          .filter((g: { checkedIn: boolean; checkedInAt: string | null }) => g.checkedIn && g.checkedInAt)
          .sort((a: { checkedInAt: string }, b: { checkedInAt: string }) =>
            new Date(b.checkedInAt).getTime() - new Date(a.checkedInAt).getTime()
          )
          .slice(0, 5)
          .map((g: { id: string; firstName: string; lastName: string; checkedInAt: string; category: string }) => ({
            id: g.id,
            firstName: g.firstName,
            lastName: g.lastName,
            checkedInAt: g.checkedInAt,
            category: g.category,
          }))
        setRecent(recentArrived)
      }
    } catch (err) {
      // Silent fail — dashboard is non-critical
    }
  }, [weddingSlug])

  useEffect(() => {
    fetchDashboard()
    const interval = setInterval(fetchDashboard, 15000) // refresh every 15s
    return () => clearInterval(interval)
  }, [fetchDashboard])

  // Check-in by code
  const handleCheckIn = async (codeToCheck?: string) => {
    const finalCode = (codeToCheck || code).trim().toUpperCase()
    if (!finalCode) return

    setLoading(true)
    setResult(null)
    try {
      const res = await fetch('/api/check-in', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Wedding-Slug': weddingSlug,
          'X-CSRF-Token': csrfToken,
        },
        body: JSON.stringify({ invitationCode: finalCode }),
      })
      const data = await res.json()
      setResult(data)
      setCode('')
      fetchDashboard() // refresh stats

      // Phase 3D #6 — mobile haptic + sound feedback on a successful scan.
      // Fires only when:
      //   - The check-in succeeded (CHECKED_IN — guest just arrived) OR the
      //     guest was already checked in (ALREADY_CHECKED_IN — staff gets
      //     confirmation that the scan registered, even though no DB change).
      //   - The user's device supports navigator.vibrate (mobile-only — iOS
      //     Safari silently ignores it).
      //   - The user has NOT set prefers-reduced-motion (playSuccessSound
      //     checks this internally; triggerHaptic is NOT gated on reduced
      //     motion because vibration is a tactile cue, not a visual one).
      //   - A prior user gesture has occurred (the click on "Valider" /
      //     Enter on the input — required by the Web Audio autoplay policy).
      if (data.status === 'CHECKED_IN' || data.status === 'ALREADY_CHECKED_IN') {
        triggerHaptic(100)
        playSuccessSound()
      }
    } catch (err) {
      setResult({
        status: 'UNKNOWN',
        message: 'Erreur de connexion. Réessayez.',
      })
    } finally {
      setLoading(false)
    }
  }

  // Guest search fallback
  const handleSearch = async () => {
    if (!searchQuery.trim()) return
    setSearching(true)
    try {
      const res = await fetch(`/api/guests/search?q=${encodeURIComponent(searchQuery)}&limit=10`, {
        headers: { 'X-Wedding-Slug': weddingSlug },
      })
      if (res.ok) {
        const data = await res.json()
        setSearchResults(data.guests || [])
      }
    } catch (err) {
      // Silent fail
    } finally {
      setSearching(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Dashboard stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard icon={Users} label="Total invités" value={stats.total} color="text-foreground" />
        <StatCard icon={CheckCircle2} label="Arrivés" value={stats.arrived} color="text-emerald-600 dark:text-emerald-400" />
        <StatCard icon={Clock} label="Restants" value={stats.remaining} color="text-amber-600 dark:text-amber-400" />
        <StatCard icon={TrendingUp} label="Taux d'arrivée" value={`${stats.arrivalRate}%`} color="text-gold-dark dark:text-gold-light" />
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Check-in input */}
        <Card className="glass-card gold-border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 font-serif">
              <QrCode className="size-5 text-gold" />
              Enregistrement invité
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Code input */}
            <div className="flex gap-2">
              <Input
                type="text"
                placeholder="Code d'invitation (ex: 616CB291)"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                onKeyDown={(e) => e.key === 'Enter' && handleCheckIn()}
                className="font-mono text-lg tracking-wider h-12"
                autoFocus
              />
              <Button
                onClick={() => handleCheckIn()}
                disabled={loading || !code.trim()}
                className="h-12 px-6 bg-gradient-to-r from-gold to-gold-dark hover:from-gold-dark hover:to-gold text-white"
              >
                {loading ? '...' : 'Valider'}
              </Button>
            </div>

            {/* QR camera scan — honestly classified as DEFER_EXTERNAL */}
            <div className="p-3 rounded-lg bg-muted/30 border border-muted">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Camera className="size-4" />
                <span>Scan QR caméra : <Badge variant="outline" className="text-[10px]">DEFER_EXTERNAL</Badge></span>
                <span className="text-muted-foreground/60">— nécessite bibliothèque barcode + getUserMedia</span>
              </div>
            </div>

            {/* Result */}
            <AnimatePresence mode="wait">
              {result && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className={`p-4 rounded-xl border-2 ${
                    result.status === 'CHECKED_IN' ? 'border-emerald-500/40 bg-emerald-500/10' :
                    result.status === 'ALREADY_CHECKED_IN' ? 'border-amber-500/40 bg-amber-500/10' :
                    'border-red-500/40 bg-red-500/10'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    {result.status === 'CHECKED_IN' && <CheckCircle2 className="size-6 text-emerald-600 flex-shrink-0" />}
                    {result.status === 'ALREADY_CHECKED_IN' && <AlertCircle className="size-6 text-amber-600 flex-shrink-0" />}
                    {(result.status === 'REJECTED' || result.status === 'UNKNOWN') && <XCircle className="size-6 text-red-600 flex-shrink-0" />}
                    <div className="flex-1">
                      <div className="font-display font-bold text-sm mb-1">
                        {result.message}
                      </div>
                      {result.guest && (
                        <div className="space-y-1 text-xs text-muted-foreground">
                          <div className="font-serif text-base font-bold text-foreground">
                            {result.guest.firstName} {result.guest.lastName}
                          </div>
                          <div>Catégorie : {result.guest.category} · {result.guest.invitationType} · {result.guest.seats} place(s)</div>
                          {result.table && (
                            <div>Table : <strong>{result.table.name}</strong> (n°{result.table.number})</div>
                          )}
                          {result.checkedInAt && (
                            <div>Enregistré à : {new Date(result.checkedInAt).toLocaleTimeString('fr-FR')}</div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </CardContent>
        </Card>

        {/* Guest search fallback */}
        <Card className="glass-card gold-border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 font-serif">
              <Search className="size-5 text-gold" />
              Recherche invité (fallback)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <Input
                type="text"
                placeholder="Nom, prénom ou code..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                className="h-12"
              />
              <Button
                onClick={handleSearch}
                disabled={searching || !searchQuery.trim()}
                variant="outline"
                className="h-12 px-6"
              >
                {searching ? '...' : 'Chercher'}
              </Button>
            </div>

            <div className="space-y-2 max-h-64 overflow-y-auto">
              {searchResults.length === 0 && searchQuery && !searching && (
                <p className="text-xs text-muted-foreground text-center py-4">Aucun résultat</p>
              )}
              {searchResults.map((guest) => (
                <div
                  key={guest.id}
                  className="flex items-center justify-between p-3 rounded-lg border border-gold/10 hover:border-gold/30 transition-colors"
                >
                  <div>
                    <div className="font-serif text-sm font-bold">
                      {guest.firstName} {guest.lastName}
                    </div>
                    <div className="text-xs text-muted-foreground font-mono">
                      {guest.invitationCode} · {guest.category}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {guest.checkedIn ? (
                      <Badge variant="outline" className="text-emerald-600 border-emerald-500/30 text-[10px]">
                        <CheckCircle2 className="size-3 mr-1" /> Arrivé
                      </Badge>
                    ) : (
                      <Button
                        size="sm"
                        onClick={() => {
                          setCode(guest.invitationCode)
                          handleCheckIn(guest.invitationCode)
                        }}
                        className="h-8 text-xs bg-gold/90 hover:bg-gold text-white"
                      >
                        Enregistrer
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent check-ins */}
      <Card className="glass-card gold-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 font-serif">
            <Clock className="size-5 text-gold" />
            Derniers enregistrements
          </CardTitle>
        </CardHeader>
        <CardContent>
          {recent.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">Aucun enregistrement pour le moment</p>
          ) : (
            <div className="space-y-2">
              {recent.map((g) => (
                <div key={g.id} className="flex items-center justify-between p-2 rounded-lg hover:bg-gold/5">
                  <div className="flex items-center gap-3">
                    <CheckCircle2 className="size-4 text-emerald-600" />
                    <div>
                      <span className="font-serif text-sm font-bold">{g.firstName} {g.lastName}</span>
                      <span className="text-xs text-muted-foreground ml-2">{g.category}</span>
                    </div>
                  </div>
                  <span className="text-xs text-muted-foreground font-mono">
                    {new Date(g.checkedInAt).toLocaleTimeString('fr-FR')}
                  </span>
                </div>
              ))}
            </div>
          )}
          <Button
            onClick={fetchDashboard}
            variant="ghost"
            size="sm"
            className="mt-4 w-full"
          >
            <RotateCcw className="size-3 mr-2" /> Actualiser
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}

function StatCard({ icon: Icon, label, value, color }: { icon: React.ElementType; label: string; value: number | string; color: string }) {
  return (
    <Card className="glass-card border-gold/10">
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-1">
          <Icon className={`size-4 ${color}`} />
          <span className="font-display text-[10px] tracking-[0.15em] uppercase text-muted-foreground">{label}</span>
        </div>
        <div className={`font-serif text-2xl font-bold ${color}`}>{value}</div>
      </CardContent>
    </Card>
  )
}
