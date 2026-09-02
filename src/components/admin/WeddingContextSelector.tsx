'use client'

// ══════════════════════════════════════════════════════════════════════════════
// WeddingContextSelector — P4-FUSION (audit ADMIN-MAP §2, question opérateur
// « What wedding am I managing ? » → réponse ❌ côté platform).
// ══════════════════════════════════════════════════════════════════════════════
// Pinned wedding context for the platform console top bar:
//   - Answers "sur quel mariage suis-je ?" with a persistent selector
//     (localStorage key `platform-wedding-context` = slug).
//   - One lazy fetch of /api/platform/weddings on first open (limit 200),
//     cached in component state for the session.
//   - Per-wedding quick actions: open the wedding console (/w/[slug]/admin)
//     and the Preview Lab (/platform/admin/preview/[slug]).
//
// Scope guard: the selector is a CONTEXT + NAVIGATION affordance. It does not
// rewire platform tabs (no fetch param injection) — zero behavioral coupling
// with WeddingsTab / DiagnosticCenterTab internals.

import { useState, useRef, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Heart,
  ChevronDown,
  Search,
  ExternalLink,
  Loader2,
  Crown,
} from 'lucide-react'

const STORAGE_KEY = 'platform-wedding-context'

interface ContextWedding {
  id: string
  slug: string
  coupleLabel: string | null
  status: string
}

interface WeddingContextSelectorProps {
  fetchWithAuth: (url: string, init?: RequestInit) => Promise<Response | null>
}

function statusBadgeClass(status: string): string {
  const s = (status || '').toUpperCase()
  if (s === 'PUBLISHED') return 'text-emerald-400'
  if (s === 'DRAFT') return 'text-amber-400'
  if (s === 'ARCHIVED') return 'text-rose-400'
  return 'text-muted-foreground'
}

function statusLabel(status: string): string {
  const s = (status || '').toUpperCase()
  if (s === 'PUBLISHED') return 'Publié'
  if (s === 'DRAFT') return 'Brouillon'
  if (s === 'UNPUBLISHED') return 'Dépublié'
  if (s === 'COMPLETED') return 'Terminé'
  if (s === 'ARCHIVED') return 'Archivé'
  if (s === 'SUSPENDED') return 'Suspendu'
  return status || '—'
}

export function WeddingContextSelector({ fetchWithAuth }: WeddingContextSelectorProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [loading, setLoading] = useState(false)
  const [weddings, setWeddings] = useState<ContextWedding[]>([])
  const [search, setSearch] = useState('')
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  // Restore the persisted context on mount (no fetch — display only).
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY)
      if (saved) setSelectedSlug(saved)
    } catch {
      /* private mode — context simply not restored */
    }
  }, [])

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const loadWeddings = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetchWithAuth('/api/platform/weddings?limit=200')
      if (res && res.ok) {
        const json = (await res.json()) as { weddings?: ContextWedding[] }
        setWeddings(json.weddings || [])
      }
    } catch {
      /* dropdown shows the error-free empty state */
    } finally {
      setLoading(false)
      setLoaded(true)
    }
  }, [fetchWithAuth])

  const handleOpen = useCallback(() => {
    const next = !open
    setOpen(next)
    if (next && !loaded && !loading) {
      loadWeddings()
      // Focus the search once the dropdown is mounted.
      setTimeout(() => searchRef.current?.focus(), 120)
    }
  }, [open, loaded, loading, loadWeddings])

  const select = useCallback((slug: string) => {
    setSelectedSlug(slug)
    try {
      window.localStorage.setItem(STORAGE_KEY, slug)
    } catch {
      /* non-persistent context is acceptable */
    }
    setOpen(false)
  }, [])

  const selected = weddings.find((w) => w.slug === selectedSlug) || null
  const filtered = weddings.filter((w) => {
    const q = search.trim().toLowerCase()
    if (!q) return true
    return (
      (w.coupleLabel || '').toLowerCase().includes(q) ||
      w.slug.toLowerCase().includes(q)
    )
  })

  return (
    <div ref={rootRef} className="relative hidden sm:block">
      <button
        type="button"
        onClick={handleOpen}
        aria-expanded={open}
        className={`flex items-center gap-2 h-9 px-3 rounded-full border text-xs transition-colors ${
          open
            ? 'border-gold/40 bg-gold/10 text-foreground'
            : 'border-white/10 bg-white/[0.03] text-muted-foreground hover:text-foreground hover:border-gold/30'
        }`}
      >
        <Heart className={`w-3.5 h-3.5 shrink-0 ${selected ? 'text-gold' : ''}`} />
        <span className="max-w-[160px] truncate font-medium">
          {selected ? selected.coupleLabel || selected.slug : 'Contexte mariage'}
        </span>
        <ChevronDown className={`w-3.5 h-3.5 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.16 }}
            className="absolute right-0 top-11 z-50 w-80 rounded-2xl border border-gold/15 bg-[#161616]/[0.98] backdrop-blur-xl shadow-2xl overflow-hidden"
          >
            {/* Search */}
            <div className="p-3 border-b border-white/[0.06]">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <input
                  ref={searchRef}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Rechercher un mariage…"
                  className="w-full h-9 pl-8 pr-3 rounded-lg bg-white/[0.04] border border-white/10 text-xs text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-gold/40"
                />
              </div>
            </div>

            {/* List */}
            <div className="max-h-72 overflow-y-auto custom-scrollbar">
              {loading && (
                <div className="flex items-center justify-center gap-2 py-8 text-xs text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Chargement des mariages…
                </div>
              )}
              {!loading && filtered.length === 0 && (
                <div className="py-8 text-center text-xs text-muted-foreground">
                  {loaded ? 'Aucun mariage trouvé' : 'Ouvrez pour charger la liste'}
                </div>
              )}
              {!loading &&
                filtered.map((w) => {
                  const isSelected = w.slug === selectedSlug
                  return (
                    <div
                      key={w.id}
                      className={`group px-3 py-2.5 border-b border-white/[0.04] last:border-0 cursor-pointer transition-colors ${
                        isSelected ? 'bg-gold/[0.07]' : 'hover:bg-white/[0.04]'
                      }`}
                      onClick={() => select(w.slug)}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        {isSelected && <Crown className="w-3.5 h-3.5 text-gold shrink-0" />}
                        <span className="flex-1 min-w-0 truncate text-xs font-medium text-foreground">
                          {w.coupleLabel || w.slug}
                        </span>
                        <span className={`shrink-0 text-[10px] uppercase tracking-wider ${statusBadgeClass(w.status)}`}>
                          {statusLabel(w.status)}
                        </span>
                      </div>
                      {/* Quick actions — stop propagation so they don't just select */}
                      <div className="flex items-center gap-2 mt-1.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                        <Link
                          href={`/w/${w.slug}/admin`}
                          className="inline-flex items-center gap-1 text-[10px] text-gold/80 hover:text-gold transition-colors"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <ExternalLink className="w-3 h-3" />
                          Console mariage
                        </Link>
                        <Link
                          href={`/platform/admin/preview/${w.slug}`}
                          className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <ExternalLink className="w-3 h-3" />
                          Preview Lab
                        </Link>
                      </div>
                    </div>
                  )
                })}
            </div>

            {/* Footer — jump to the full management list */}
            <button
              type="button"
              onClick={() => {
                router.push('/platform/admin')
                try {
                  window.dispatchEvent(new CustomEvent('platform:navigate', { detail: 'weddings' }))
                } catch {
                  /* no-op */
                }
                setOpen(false)
              }}
              className="w-full px-3 py-2.5 text-left text-[11px] text-muted-foreground hover:text-foreground border-t border-white/[0.06] transition-colors"
            >
              Gérer tous les mariages → section Mariages
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
