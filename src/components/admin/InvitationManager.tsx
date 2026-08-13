'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Mail, QrCode, Copy, Check, AlertCircle, Loader2, Users,
  RefreshCw, Link2, Eye, EyeOff,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'

/**
 * InvitationManager — Mission 4.7 Phase 2
 *
 * Invitation operations UI for event organizers.
 * Accessible from /w/[slug]/admin → Invitations tab.
 *
 * Features:
 *   - Statistics: total guests, without invitation, generated, sent, error
 *   - Individual invitation generation (POST /api/guests/[id]/invitation)
 *   - Bulk generation (POST /api/weddings/[id]/invitations/bulk)
 *     - For all eligible guests (no invitation yet)
 *     - For selected guests (checkbox)
 *   - View invitation URL + QR code URL per guest
 *   - Copy link to clipboard
 *   - Regenerate (idempotent — upserts existing Invitation row)
 *   - Filters: all / generated / not-generated
 *   - Tenant isolation: all calls include X-Wedding-Slug header
 *
 * Idempotence: re-running bulk generation does NOT duplicate invitations.
 * The API upserts on (guestId, channel=QR) — existing rows are reset to
 * PENDING, new rows are created. Codes do NOT change (Guest.invitationCode
 * is immutable after creation).
 *
 * P0/P1 FIXES (5.8.11-FIX):
 *   - P0-1 (CSRF): read csrf_token cookie FRESH inside each handler rather
 *     than relying on the csrfToken prop captured at render time (which can
 *     be stale/empty if the page rendered before login or if the token was
 *     rotated). Falls back to the prop if the cookie is unavailable.
 *   - P0-2 (URL display): do NOT pre-compute invitationUrl/qrCodeUrl from
 *     the RAW invitationCode. Show a placeholder until the invitation is
 *     actually generated via the API (which returns the encrypted token URL).
 *   - P0-3 (QR preview): the QR endpoint returns JSON { qrCode: dataUrl },
 *     NOT a PNG. Fetch the JSON on demand and render the dataUrl — don't
 *     use the URL directly as an <img src>.
 *   - P1-3 (stat count): fetch /api/weddings/{id}/stats for the real
 *     invitation count (DB has 243, UI used to show 0 because invitation
 *     status was never fetched per-guest).
 */

interface Guest {
  id: string
  firstName: string
  lastName: string
  invitationCode: string
  category: string
  email: string | null
  phone: string | null
  status: string
}

interface InvitationInfo {
  id: string
  status: string
  channel: string
}

interface GuestWithInvitation extends Guest {
  invitation?: InvitationInfo | null
  invitationUrl?: string
  qrCodeUrl?: string
  qrDataUrl?: string
  loading?: boolean
  qrLoading?: boolean
}

interface BulkResult {
  generated: Array<{ guest: { id: string; firstName: string; lastName: string; invitationCode: string }; invitationUrl: string; qrCodeUrl: string }>
  errors: Array<{ guestId: string; error: string }>
  summary: { total: number; success: number; failed: number }
}

interface Props {
  weddingId: string
  weddingSlug: string
  csrfToken: string
}

/**
 * Read the csrf_token cookie FRESH from document.cookie.
 *
 * The wedding admin page's global fetch interceptor already does this, but
 * InvitationManager sets the X-CSRF-Token header EXPLICITLY (which prevents
 * the interceptor from overriding it). If the csrfToken prop is stale/empty,
 * the explicit header would be empty → 403. This helper reads the cookie at
 * CALL TIME (inside the fetch handler) so we always send the current token.
 */
function getFreshCsrfToken(fallback: string): string {
  if (typeof document === 'undefined') return fallback
  const match = document.cookie
    .split('; ')
    .find((row) => row.startsWith('csrf_token='))
  return match ? match.split('=').slice(1).join('=') : fallback
}

export default function InvitationManager({ weddingId, weddingSlug, csrfToken }: Props) {
  const [guests, setGuests] = useState<GuestWithInvitation[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'generated' | 'not-generated'>('all')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkLoading, setBulkLoading] = useState(false)
  const [bulkResult, setBulkResult] = useState<BulkResult | null>(null)
  const [visibleQrs, setVisibleQrs] = useState<Set<string>>(new Set())
  const [copiedId, setCopiedId] = useState<string | null>(null)
  // P1-3: real invitation count from /api/weddings/{id}/stats
  const [invitationCount, setInvitationCount] = useState<number | null>(null)

  // P1-3: Fetch the real invitation count from the stats endpoint.
  // The stats endpoint counts ALL Invitation rows for the wedding (243),
  // broken down by status. This is the source of truth — the per-guest
  // invitation status is NOT available from the guests list endpoint.
  const fetchInvitationCount = useCallback(async () => {
    try {
      const res = await fetch(`/api/weddings/${weddingId}/stats`, {
        headers: { 'X-Wedding-Slug': weddingSlug },
      })
      if (res.ok) {
        const data = await res.json()
        const count = data?.stats?.invitations?.total
        if (typeof count === 'number') {
          setInvitationCount(count)
        }
      }
    } catch {
      /* non-fatal — stat card will fall back to per-guest count */
    }
  }, [weddingId, weddingSlug])

  // Fetch guests + their invitation status
  const fetchGuests = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/guests?limit=100', {
        headers: { 'X-Wedding-Slug': weddingSlug },
      })
      if (res.ok) {
        const data = await res.json()
        const guestList = data.guests || []
        // P0-2 FIX: do NOT pre-compute invitationUrl/qrCodeUrl from the raw
        // invitationCode. The encrypted token URL can only be computed
        // server-side (needs ENCRYPTION_KEY). Show empty values until the
        // admin clicks "Générer l'invitation" (which returns the real URL).
        // The invitation status is also unknown until generated — we mark
        // all as "unknown" (null) rather than guessing from guest.status.
        const guestsWithInvites: GuestWithInvitation[] = guestList.map((g: Guest) => ({
          ...g,
          invitationUrl: undefined,
          qrCodeUrl: undefined,
          qrDataUrl: undefined,
          invitation: null,
        }))
        setGuests(guestsWithInvites)
        // P1-3: fetch the real invitation count from the stats endpoint
        fetchInvitationCount()
      }
    } catch (err) {
      toast.error('Erreur lors du chargement des invités')
    } finally {
      setLoading(false)
    }
  }, [weddingSlug, fetchInvitationCount])

  useEffect(() => {
    fetchGuests()
  }, [fetchGuests])

  // Filtered guests
  const filteredGuests = guests.filter((g) => {
    if (filter === 'generated') return g.invitation
    if (filter === 'not-generated') return !g.invitation
    return true
  })

  // P1-3: use the real invitation count from the stats endpoint when available.
  // Fall back to the per-guest count (which is 0 if invitation status is unknown).
  const stats = {
    total: guests.length,
    generated: invitationCount !== null ? invitationCount : guests.filter((g) => g.invitation).length,
    notGenerated: invitationCount !== null
      ? Math.max(0, guests.length - invitationCount)
      : guests.filter((g) => !g.invitation).length,
  }

  // Individual invitation generation
  const handleGenerateSingle = async (guestId: string) => {
    setGuests((prev) => prev.map((g) => g.id === guestId ? { ...g, loading: true } : g))
    try {
      // P0-1 FIX: read the csrf_token cookie FRESH (the prop may be stale).
      const freshCsrf = getFreshCsrfToken(csrfToken)
      const res = await fetch(`/api/guests/${guestId}/invitation`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Wedding-Slug': weddingSlug,
          'X-CSRF-Token': freshCsrf,
        },
        body: '{}',
      })
      if (res.ok) {
        const data = await res.json()
        setGuests((prev) => prev.map((g) =>
          g.id === guestId
            ? { ...g, invitation: data.invitation, invitationUrl: data.invitationUrl, qrCodeUrl: data.qrCodeUrl, qrDataUrl: undefined, loading: false }
            : g
        ))
        toast.success(`Invitation générée pour ${data.guest.firstName} ${data.guest.lastName}`)
        // P1-3: refresh the invitation count after generation
        fetchInvitationCount()
      } else {
        const err = await res.json().catch(() => ({ error: 'Erreur lors de la génération' }))
        toast.error(err.error || 'Erreur lors de la génération')
        setGuests((prev) => prev.map((g) => g.id === guestId ? { ...g, loading: false } : g))
      }
    } catch (err) {
      toast.error('Erreur de connexion')
      setGuests((prev) => prev.map((g) => g.id === guestId ? { ...g, loading: false } : g))
    }
  }

  // Bulk generation
  const handleBulkGenerate = async (targetIds: string[]) => {
    if (targetIds.length === 0) {
      toast.error('Aucun invité sélectionné')
      return
    }
    setBulkLoading(true)
    setBulkResult(null)
    try {
      // P0-1 FIX: read the csrf_token cookie FRESH (the prop may be stale).
      const freshCsrf = getFreshCsrfToken(csrfToken)
      const res = await fetch(`/api/weddings/${weddingId}/invitations/bulk`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Wedding-Slug': weddingSlug,
          'X-CSRF-Token': freshCsrf,
        },
        body: JSON.stringify({ guestIds: targetIds, channel: 'QR' }),
      })
      const data = await res.json()
      if (res.ok) {
        setBulkResult(data)
        toast.success(`${data.summary.success} invitation(s) générée(s)${data.summary.failed > 0 ? `, ${data.summary.failed} échec(s)` : ''}`)
        // Refresh guests to show updated invitation status
        fetchGuests()
        setSelectedIds(new Set())
      } else {
        toast.error(data.error || 'Erreur lors de la génération en masse')
      }
    } catch (err) {
      toast.error('Erreur de connexion')
    } finally {
      setBulkLoading(false)
    }
  }

  // Copy link
  const handleCopyLink = async (url: string, guestId: string) => {
    if (!url) {
      toast.error("Aucun lien disponible — cliquez d'abord sur Générer")
      return
    }
    const fullUrl = `${window.location.origin}${url}`
    try {
      await navigator.clipboard.writeText(fullUrl)
      setCopiedId(guestId)
      setTimeout(() => setCopiedId(null), 2000)
      toast.success('Lien copié')
    } catch {
      toast.error('Impossible de copier le lien')
    }
  }

  // P0-3 FIX: Toggle QR visibility — fetch the QR JSON on demand.
  // The QR endpoint returns JSON { qrCode: dataUrl }, NOT a PNG image.
  // We fetch the JSON and render the dataUrl as the <img src>. This also
  // works with admin auth (the endpoint accepts auth_token cookie).
  const toggleQr = async (guestId: string) => {
    // If already visible, just hide it.
    if (visibleQrs.has(guestId)) {
      setVisibleQrs((prev) => {
        const next = new Set(prev)
        next.delete(guestId)
        return next
      })
      return
    }

    const guest = guests.find((g) => g.id === guestId)
    if (!guest) return

    // If we already have the dataUrl cached, just show it.
    if (guest.qrDataUrl) {
      setVisibleQrs((prev) => new Set(prev).add(guestId))
      return
    }

    // The QR endpoint works for ANY guest with an invitationCode — it
    // generates the encrypted token on the fly. Build the URL if not set.
    const qrCodeUrl = guest.qrCodeUrl || `/api/guests/qrcode/${guest.invitationCode}?wedding=${weddingSlug}`

    // Show the panel with a loading state.
    setGuests((prev) => prev.map((g) => g.id === guestId ? { ...g, qrLoading: true } : g))
    setVisibleQrs((prev) => new Set(prev).add(guestId))

    try {
      const res = await fetch(qrCodeUrl, {
        headers: { 'X-Wedding-Slug': weddingSlug },
      })
      if (res.ok) {
        const data = await res.json()
        if (data.qrCode) {
          setGuests((prev) => prev.map((g) =>
            g.id === guestId
              ? { ...g, qrDataUrl: data.qrCode, qrCodeUrl: qrCodeUrl, qrLoading: false }
              : g
          ))
          // P0-2: if the response includes a qrUrl (the encrypted invitation URL),
          // also populate the invitationUrl so the admin can see/copy it.
          if (data.qrUrl && !guest.invitationUrl) {
            try {
              const url = new URL(data.qrUrl)
              const pathAndQuery = url.pathname + (url.search ? '?' + url.searchParams.toString() : '')
              setGuests((prev) => prev.map((g) =>
                g.id === guestId ? { ...g, invitationUrl: pathAndQuery } : g
              ))
            } catch {
              // not a valid URL — leave invitationUrl as-is
            }
          }
        } else {
          toast.error('Format de réponse QR invalide')
          setGuests((prev) => prev.map((g) => g.id === guestId ? { ...g, qrLoading: false } : g))
        }
      } else if (res.status === 401) {
        toast.error('Authentification requise pour le QR code')
        setGuests((prev) => prev.map((g) => g.id === guestId ? { ...g, qrLoading: false } : g))
        setVisibleQrs((prev) => {
          const next = new Set(prev)
          next.delete(guestId)
          return next
        })
      } else {
        toast.error('Erreur lors du chargement du QR code')
        setGuests((prev) => prev.map((g) => g.id === guestId ? { ...g, qrLoading: false } : g))
      }
    } catch (err) {
      toast.error('Erreur de connexion')
      setGuests((prev) => prev.map((g) => g.id === guestId ? { ...g, qrLoading: false } : g))
    }
  }

  // Selection
  const toggleSelection = (guestId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(guestId)) next.delete(guestId)
      else next.add(guestId)
      return next
    })
  }

  const selectAll = () => {
    setSelectedIds(new Set(filteredGuests.map((g) => g.id)))
  }

  const selectNone = () => {
    setSelectedIds(new Set())
  }

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard icon={Users} label="Total invités" value={stats.total} />
        <StatCard icon={Mail} label="Invitations générées" value={stats.generated} color="text-emerald-600 dark:text-emerald-400" />
        <StatCard icon={AlertCircle} label="Sans invitation" value={stats.notGenerated} color="text-amber-600 dark:text-amber-400" />
        <StatCard icon={QrCode} label="QR disponibles" value={stats.generated} color="text-gold-dark dark:text-gold-light" />
      </div>

      {/* Bulk actions */}
      <Card className="glass-card gold-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 font-serif">
            <Mail className="size-5 text-gold" />
            Génération massive
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => handleBulkGenerate(Array.from(selectedIds))}
              disabled={bulkLoading || selectedIds.size === 0}
              className="bg-gradient-to-r from-gold to-gold-dark hover:from-gold-dark hover:to-gold text-white"
            >
              {bulkLoading ? <Loader2 className="size-4 mr-2 animate-spin" /> : <Mail className="size-4 mr-2" />}
              Générer pour {selectedIds.size} invité(s) sélectionné(s)
            </Button>
            <Button
              onClick={() => handleBulkGenerate(guests.filter((g) => !g.invitation).map((g) => g.id))}
              disabled={bulkLoading || stats.notGenerated === 0}
              variant="outline"
            >
              <RefreshCw className="size-4 mr-2" />
              Générer pour tous les invités sans invitation ({stats.notGenerated})
            </Button>
            <Button onClick={selectAll} variant="ghost" size="sm">Tout sélectionner</Button>
            <Button onClick={selectNone} variant="ghost" size="sm">Tout désélectionner</Button>
          </div>

          {/* Bulk result */}
          <AnimatePresence>
            {bulkResult && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="p-4 rounded-xl border border-gold/20 bg-gold/5"
              >
                <div className="font-serif font-bold text-sm mb-2">
                  Résultat: {bulkResult.summary.success} réussie(s) · {bulkResult.summary.failed} échec(s)
                </div>
                {bulkResult.errors.length > 0 && (
                  <div className="space-y-1 text-xs text-red-600">
                    {bulkResult.errors.slice(0, 5).map((e, i) => (
                      <div key={i}>· {e.guestId}: {e.error}</div>
                    ))}
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </CardContent>
      </Card>

      {/* Filter + guest list */}
      <Card className="glass-card gold-border">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="font-serif">Invités & Invitations</CardTitle>
            <div className="flex gap-1">
              {(['all', 'generated', 'not-generated'] as const).map((f) => (
                <Button
                  key={f}
                  size="sm"
                  variant={filter === f ? 'default' : 'ghost'}
                  onClick={() => setFilter(f)}
                  className="text-xs"
                >
                  {f === 'all' ? 'Tous' : f === 'generated' ? 'Générées' : 'Non générées'}
                </Button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="size-6 animate-spin text-gold" />
            </div>
          ) : filteredGuests.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">Aucun invité dans cette catégorie</p>
          ) : (
            <div className="space-y-2 max-h-[500px] overflow-y-auto">
              {filteredGuests.map((guest) => (
                <div
                  key={guest.id}
                  className={`p-3 rounded-lg border transition-all ${
                    selectedIds.has(guest.id)
                      ? 'border-gold/40 bg-gold/5'
                      : 'border-gold/10 hover:border-gold/20'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(guest.id)}
                      onChange={() => toggleSelection(guest.id)}
                      className="rounded border-gold/30"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-serif text-sm font-bold">
                          {guest.firstName} {guest.lastName}
                        </span>
                        <Badge variant="outline" className="text-[9px]">{guest.category}</Badge>
                        {guest.invitation && (
                          <Badge variant="outline" className="text-[9px] text-emerald-600 border-emerald-500/30">
                            {guest.invitation.status}
                          </Badge>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground font-mono">
                        Code: {guest.invitationCode}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleGenerateSingle(guest.id)}
                        disabled={guest.loading}
                        className="h-8 w-8 p-0"
                        title="Générer l'invitation"
                      >
                        {guest.loading ? <Loader2 className="size-4 animate-spin" /> : <Mail className="size-4" />}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => toggleQr(guest.id)}
                        className="h-8 w-8 p-0"
                        title="Voir le QR code"
                      >
                        {visibleQrs.has(guest.id) ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleCopyLink(guest.invitationUrl || '', guest.id)}
                        className="h-8 w-8 p-0"
                        title="Copier le lien"
                      >
                        {copiedId === guest.id ? <Check className="size-4 text-emerald-600" /> : <Copy className="size-4" />}
                      </Button>
                    </div>
                  </div>
                  {/* QR code display */}
                  <AnimatePresence>
                    {visibleQrs.has(guest.id) && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden"
                      >
                        <div className="mt-3 p-3 rounded-lg bg-muted/30 flex items-center gap-4">
                          {guest.qrLoading ? (
                            <div className="w-24 h-24 rounded-lg border border-gold/20 flex items-center justify-center">
                              <Loader2 className="size-6 animate-spin text-gold" />
                            </div>
                          ) : guest.qrDataUrl ? (
                            <img
                              src={guest.qrDataUrl}
                              alt="QR code"
                              className="w-24 h-24 rounded-lg border border-gold/20"
                            />
                          ) : (
                            <div className="w-24 h-24 rounded-lg border border-gold/20 flex items-center justify-center text-xs text-muted-foreground text-center p-2">
                              QR indisponible
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="text-xs text-muted-foreground mb-1">Lien d'invitation :</div>
                            {guest.invitationUrl ? (
                              <>
                                <div className="font-mono text-xs text-foreground truncate bg-background/50 p-2 rounded border border-gold/10 break-all">
                                  {guest.invitationUrl}
                                </div>
                                <a
                                  href={guest.invitationUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 text-xs text-gold hover:underline mt-2"
                                >
                                  <Link2 className="size-3" /> Ouvrir l'expérience invité
                                </a>
                              </>
                            ) : (
                              <div className="text-xs text-muted-foreground italic p-2">
                                Cliquez sur l'icône mail (Générer) pour obtenir le lien chiffré.
                              </div>
                            )}
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function StatCard({ icon: Icon, label, value, color = 'text-foreground' }: { icon: React.ElementType; label: string; value: number; color?: string }) {
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
