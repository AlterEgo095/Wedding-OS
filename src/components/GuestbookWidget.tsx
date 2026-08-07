'use client';

// ══════════════════════════════════════════════════════════════════════════════
// GuestbookWidget — Public Livre d'Or widget for /w/[slug] wedding page (P4.1)
// ══════════════════════════════════════════════════════════════════════════════
//
// Props: { weddingId, slug }
//
// Renders:
//   1. A vertically-stacked list of APPROVED entries (newest first), each
//      showing an avatar circle with the author's initial, the author name,
//      the message (pre-wrap), optional 1-5 star rating, and a relative
//      timestamp ("il y a 3 jours").
//   2. A submission form: authorName input, message textarea, optional
//      1-5 star rating picker, submit button.
//   3. On submit: POST /api/weddings/{weddingId}/guestbook, show a success
//      toast "Message soumis ! En attente de modération." and reset the form.
//      The submitted entry does NOT appear in the list (it's pending
//      moderation — only visible after an organizer approves it).
//   4. "Charger plus" button when `hasMore=true` (paginated fetch).
//
// The widget is read-only from the public's perspective: only APPROVED
// entries are shown. New submissions are queued for moderation.
//
// CSRF: the POST is not subject to CSRF protection (no admin auth, and
// guest_sessions use sameSite=strict cookies so cross-site abuse is already
// mitigated). The route itself is rate-limited at 5/min per IP.
// ══════════════════════════════════════════════════════════════════════════════

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import {
  BookOpen,
  Loader2,
  Send,
  Star,
  ChevronDown,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';

interface GuestbookEntry {
  id: string;
  authorName: string;
  message: string;
  rating: number | null;
  createdAt: string;
}

interface GuestbookWidgetProps {
  weddingId: string;
  slug: string;
}

const PAGE_SIZE = 20;

function relativeTime(iso: string): string {
  try {
    const d = new Date(iso).getTime();
    const now = Date.now();
    const diff = Math.max(0, now - d);
    const minute = 60_000;
    const hour = 60 * minute;
    const day = 24 * hour;
    const week = 7 * day;
    const month = 30 * day;
    const year = 365 * day;
    if (diff < minute) return "à l'instant";
    if (diff < hour) {
      const m = Math.floor(diff / minute);
      return `il y a ${m} min`;
    }
    if (diff < day) {
      const h = Math.floor(diff / hour);
      return `il y a ${h} h`;
    }
    if (diff < week) {
      const dd = Math.floor(diff / day);
      return `il y a ${dd} jour${dd > 1 ? 's' : ''}`;
    }
    if (diff < month) {
      const w = Math.floor(diff / week);
      return `il y a ${w} semaine${w > 1 ? 's' : ''}`;
    }
    if (diff < year) {
      const mo = Math.floor(diff / month);
      return `il y a ${mo} mois`;
    }
    const y = Math.floor(diff / year);
    return `il y a ${y} an${y > 1 ? 's' : ''}`;
  } catch {
    return iso;
  }
}

function initial(name: string): string {
  if (!name) return '?';
  return name.trim().charAt(0).toUpperCase();
}

// Deterministic pastel gradient per author name (avoids flashy colors).
function avatarGradient(name: string): string {
  const palettes = [
    'from-amber-400/30 to-rose-400/30',
    'from-sky-400/30 to-indigo-400/30',
    'from-emerald-400/30 to-teal-400/30',
    'from-fuchsia-400/30 to-purple-400/30',
    'from-yellow-400/30 to-orange-400/30',
    'from-rose-400/30 to-pink-400/30',
    'from-cyan-400/30 to-blue-400/30',
    'from-lime-400/30 to-green-400/30',
  ];
  let h = 0;
  for (let i = 0; i < name.length; i++) {
    h = (h * 31 + name.charCodeAt(i)) >>> 0;
  }
  return palettes[h % palettes.length];
}

export function GuestbookWidget({ weddingId, slug: _slug }: GuestbookWidgetProps) {
  const [entries, setEntries] = useState<GuestbookEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const [authorName, setAuthorName] = useState('');
  const [message, setMessage] = useState('');
  const [rating, setRating] = useState<number | null>(null);
  const [hoverRating, setHoverRating] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(
    async (targetPage: number, append: boolean) => {
      if (append) setLoadingMore(true);
      else setLoading(true);
      try {
        const params = new URLSearchParams({
          page: String(targetPage),
          limit: String(PAGE_SIZE),
        });
        const res = await fetch(
          `/api/weddings/${weddingId}/guestbook?${params}`,
          { credentials: 'include' }
        );
        if (!res.ok) throw new Error('fetch failed');
        const json = await res.json();
        const next = (json.entries || []) as GuestbookEntry[];
        setEntries((prev) => (append ? [...prev, ...next] : next));
        setTotal(json.total || 0);
        setHasMore(Boolean(json.hasMore));
        setPage(targetPage);
      } catch {
        if (!append) toast.error("Impossible de charger le livre d'or");
        // Silent fail on "load more" — keep existing entries visible.
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [weddingId]
  );

  useEffect(() => {
    load(1, false);
  }, [load]);

  const loadMore = () => {
    if (!hasMore || loadingMore) return;
    load(page + 1, true);
  };

  const submit = async () => {
    if (!authorName.trim()) {
      toast.error('Veuillez indiquer votre nom');
      return;
    }
    if (!message.trim()) {
      toast.error('Veuillez écrire un message');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/weddings/${weddingId}/guestbook`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          authorName: authorName.trim(),
          message: message.trim(),
          rating: rating ?? null,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || 'Erreur serveur');
      }
      toast.success('Message soumis ! En attente de modération.');
      // Reset the form.
      setAuthorName('');
      setMessage('');
      setRating(null);
      setHoverRating(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section
      id="guestbook"
      className="w-full max-w-3xl mx-auto px-4 py-12 md:py-16"
      aria-labelledby="guestbook-title"
    >
      <div className="text-center mb-8">
        <div className="inline-flex items-center gap-2 text-amber-400 mb-2">
          <BookOpen className="w-5 h-5" />
          <span className="text-[10px] uppercase tracking-[0.2em] font-medium">
            Livre d&apos;Or
          </span>
        </div>
        <h2
          id="guestbook-title"
          className="font-serif text-3xl md:text-4xl text-white"
        >
          Laissez un mot aux mariés
        </h2>
        <p className="text-sm text-zinc-400 mt-2 max-w-xl mx-auto">
          Vos messages sont publiés après validation par les organisateurs.
          Partagez un souvenir, un vœu ou une pensée pour le couple.
        </p>
      </div>

      {/* Submission form */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.02] backdrop-blur-sm p-5 md:p-6 mb-8">
        <div className="space-y-3">
          <div>
            <label htmlFor="gb-author" className="sr-only">
              Votre nom
            </label>
            <Input
              id="gb-author"
              placeholder="Votre nom"
              value={authorName}
              maxLength={80}
              onChange={(e) => setAuthorName(e.target.value)}
              className="bg-white/5 border-white/10"
            />
          </div>
          <div>
            <label htmlFor="gb-message" className="sr-only">
              Votre message
            </label>
            <Textarea
              id="gb-message"
              placeholder="Votre message aux mariés…"
              value={message}
              maxLength={2000}
              rows={4}
              onChange={(e) => setMessage(e.target.value)}
              className="bg-white/5 border-white/10 resize-y min-h-[100px]"
            />
            <div className="flex justify-between items-center mt-1">
              <span className="text-[10px] text-zinc-500">
                {message.length}/2000
              </span>
              {/* Rating picker */}
              <div className="flex items-center gap-1">
                <span className="text-[10px] text-zinc-500 mr-1">Note :</span>
                {[1, 2, 3, 4, 5].map((n) => {
                  const active =
                    (hoverRating ?? rating ?? 0) >= n;
                  return (
                    <button
                      key={n}
                      type="button"
                      aria-label={`${n} étoile${n > 1 ? 's' : ''}`}
                      onMouseEnter={() => setHoverRating(n)}
                      onMouseLeave={() => setHoverRating(null)}
                      onClick={() =>
                        setRating((prev) => (prev === n ? null : n))
                      }
                      className="p-0.5"
                    >
                      <Star
                        className={
                          active
                            ? 'w-4 h-4 fill-amber-400 text-amber-400'
                            : 'w-4 h-4 text-zinc-600 hover:text-amber-300'
                        }
                      />
                    </button>
                  );
                })}
                {rating !== null && (
                  <button
                    type="button"
                    onClick={() => {
                      setRating(null);
                      setHoverRating(null);
                    }}
                    className="ml-1 text-[10px] text-zinc-500 hover:text-zinc-300 underline"
                  >
                    effacer
                  </button>
                )}
              </div>
            </div>
          </div>
          <div className="flex justify-end">
            <Button
              onClick={submit}
              disabled={submitting}
              className="bg-amber-500/20 text-amber-300 border border-amber-500/30 hover:bg-amber-500/30"
            >
              {submitting ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Send className="w-4 h-4 mr-2" />
              )}
              Envoyer
            </Button>
          </div>
        </div>
      </div>

      {/* Entries list */}
      <div className="space-y-4">
        <div className="flex items-baseline justify-between">
          <h3 className="text-sm font-medium text-zinc-300">
            {total} message{total > 1 ? 's' : ''}
          </h3>
        </div>

        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-24 rounded-xl" />
            ))}
          </div>
        ) : entries.length === 0 ? (
          <div className="text-center py-12 text-sm text-zinc-500">
            <BookOpen className="w-10 h-10 mx-auto mb-3 opacity-40" />
            Aucun message pour le moment.
            <br />
            Soyez le premier à écrire un mot !
          </div>
        ) : (
          <ul className="space-y-3">
            {entries.map((e) => (
              <li
                key={e.id}
                className="rounded-xl border border-white/10 bg-white/[0.02] p-4 md:p-5"
              >
                <div className="flex items-start gap-3">
                  <div
                    className={`flex-shrink-0 w-10 h-10 rounded-full bg-gradient-to-br ${avatarGradient(
                      e.authorName
                    )} flex items-center justify-center text-amber-200 font-semibold text-sm border border-white/10`}
                    aria-hidden="true"
                  >
                    {initial(e.authorName)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-white text-sm">
                        {e.authorName}
                      </span>
                      {e.rating !== null && e.rating !== undefined && (
                        <div className="flex items-center gap-0.5">
                          {Array.from({ length: 5 }).map((_, i) => (
                            <Star
                              key={i}
                              className={
                                i < e.rating!
                                  ? 'w-3 h-3 fill-amber-400 text-amber-400'
                                  : 'w-3 h-3 text-zinc-700'
                              }
                            />
                          ))}
                        </div>
                      )}
                      <span className="text-[10px] text-zinc-500 ml-auto">
                        {relativeTime(e.createdAt)}
                      </span>
                    </div>
                    <p className="text-sm text-zinc-300 mt-1 whitespace-pre-wrap break-words">
                      {e.message}
                    </p>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}

        {hasMore && !loading && (
          <div className="flex justify-center pt-2">
            <Button
              variant="outline"
              onClick={loadMore}
              disabled={loadingMore}
              className="border-white/10 text-zinc-300 hover:bg-white/5"
            >
              {loadingMore && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {!loadingMore && <ChevronDown className="w-4 h-4 mr-2" />}
              Charger plus de messages
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}
