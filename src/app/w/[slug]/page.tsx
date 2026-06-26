// ══════════════════════════════════════════════════════════════════════════════
// /w/[slug]/page.tsx — Phase 2 Public Wedding Landing Page
// ══════════════════════════════════════════════════════════════════════════════
// Renders the public-facing page for any wedding by slug. Proves multi-tenant
// routing works — each /w/{slug} URL serves only that wedding's data via
// tenant-scoped API calls (X-Wedding-Slug header).
//
// This is the Phase 2 MVP. Phase 4 will add the full per-wedding UX
// (Hero/Story/Timeline/Gallery/Music per wedding).

'use client';

import { useState, useEffect, FormEvent } from 'react';
import Link from 'next/link';
import { Search, MapPin, Calendar, Users, Clock, Sparkles, ArrowRight, AlertCircle } from 'lucide-react';
import { useWedding, useTenantFetch } from './wedding-context';
import LuxuryVisualEngine from '@/components/luxury/LuxuryVisualEngine';
import { Button } from '@/components/ui/button';

interface WeddingSettings {
  site_title?: string;
  site_subtitle?: string;
  wedding_date?: string;
  wedding_time?: string;
  venue_name?: string;
  venue_address?: string;
  venue_city?: string;
  venue_time?: string;
  welcome_message?: string;
  hashtag?: string;
  couple_story?: string;
  [k: string]: string | undefined;
}

interface TimelineEvent {
  id: string;
  time: string;
  activity: string;
  location?: string | null;
  description?: string | null;
  icon?: string | null;
  order: number;
}

interface GuestLookupResult {
  name: string;
  firstName: string;
  lastName: string;
  isCouple: boolean;
  greeting: string;
  table: string | null;
  tableNumber: number | null;
  seats: number;
  category: string;
  lookupToken: string;
}

export default function WeddingLandingPage() {
  const wedding = useWedding();
  const tenantFetch = useTenantFetch();
  const [settings, setSettings] = useState<WeddingSettings | null>(null);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<GuestLookupResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  // Fetch this wedding's settings + timeline (auto-scoped via X-Wedding-Slug header)
  useEffect(() => {
    async function load() {
      try {
        const [settingsRes, timelineRes] = await Promise.all([
          tenantFetch('/api/settings'),
          tenantFetch('/api/timeline'),
        ]);
        if (settingsRes.ok) {
          const data = await settingsRes.json();
          setSettings(data.settings || {});
        }
        if (timelineRes.ok) {
          const data = await timelineRes.json();
          setTimeline(data.events || []);
        }
      } catch (err) {
        console.error('Failed to load wedding data:', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [tenantFetch]);

  // Countdown to wedding date — use the string value as dependency to avoid
  // recreating the Date object on every render (which would cause infinite loop)
  const weddingDateStr = settings?.wedding_date ?? null;
  const [countdown, setCountdown] = useState<{ days: number; hours: number; minutes: number; seconds: number } | null>(null);
  useEffect(() => {
    if (!weddingDateStr) return;
    const target = new Date(weddingDateStr).getTime();
    if (isNaN(target)) return;
    const tick = () => {
      const diff = target - Date.now();
      if (diff <= 0) {
        setCountdown({ days: 0, hours: 0, minutes: 0, seconds: 0 });
        return;
      }
      const days = Math.floor(diff / 86400000);
      const hours = Math.floor((diff % 86400000) / 3600000);
      const minutes = Math.floor((diff % 3600000) / 60000);
      const seconds = Math.floor((diff % 60000) / 1000);
      setCountdown({ days, hours, minutes, seconds });
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [weddingDateStr]);

  // Compute display-ready wedding date
  const weddingDate = weddingDateStr ? new Date(weddingDateStr) : null;

  async function handleSearch(e: FormEvent) {
    e.preventDefault();
    if (!searchQuery.trim() || searchQuery.trim().length < 2) return;
    setSearching(true);
    setSearchError(null);
    setSearchResults(null);
    try {
      const res = await tenantFetch(`/api/guest/lookup?q=${encodeURIComponent(searchQuery.trim())}`);
      const data = await res.json();
      if (!res.ok) {
        setSearchError(data.error || 'Erreur lors de la recherche');
      } else {
        setSearchResults(data.results || []);
      }
    } catch {
      setSearchError('Erreur réseau. Veuillez réessayer.');
    } finally {
      setSearching(false);
    }
  }

  // Auto-authenticate via lookup token (one click — guest selects their name)
  async function selectGuest(result: GuestLookupResult) {
    try {
      const res = await tenantFetch('/api/guest/auto-auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lookupToken: result.lookupToken }),
      });
      const data = await res.json();
      if (data.success && data.guest) {
        // Reload to show guest's personal space (root path handles this for default wedding)
        // For non-default weddings, Phase 4 will render the personal space here
        if (wedding.isDefault) {
          window.location.href = `/?invite=${data.guest.encryptedLink}`;
        } else {
          window.location.reload();
        }
      } else {
        setSearchError(data.error || 'Authentification échouée');
      }
    } catch {
      setSearchError('Erreur réseau. Veuillez réessayer.');
    }
  }

  const siteTitle = settings?.site_title || wedding.coupleLabel;
  const siteSubtitle = settings?.site_subtitle || (wedding.weddingDate ? new Date(wedding.weddingDate).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : '');
  const venueName = settings?.venue_name || wedding.venueName || '';
  const venueCity = settings?.venue_city || wedding.venueCity || '';
  const venueTime = settings?.venue_time || settings?.wedding_time || '';
  const welcomeMessage = settings?.welcome_message || `Bienvenue sur la page du mariage de ${wedding.coupleLabel}`;
  const hashtag = settings?.hashtag || '';

  return (
    <div className="min-h-screen bg-gradient-to-b from-stone-50 via-amber-50/30 to-stone-100 text-stone-800">
      {/* Luxury visual engine — same as root page */}
      <LuxuryVisualEngine />

      {/* Hero Section */}
      <section className="relative min-h-[90vh] flex items-center justify-center px-4 py-16 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-amber-900/10 via-transparent to-rose-900/10 pointer-events-none" />
        <div className="relative z-10 max-w-4xl mx-auto text-center space-y-6">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-amber-100/80 backdrop-blur-sm border border-amber-200 text-amber-800 text-xs uppercase tracking-widest">
            <Sparkles className="w-3 h-3" />
            Invitation au Mariage
          </div>

          <h1 className="font-serif text-5xl sm:text-6xl md:text-7xl font-light text-stone-900 leading-tight">
            {wedding.coupleLabel}
          </h1>

          {siteSubtitle && (
            <p className="text-xl sm:text-2xl text-stone-600 font-light italic">
              {siteSubtitle}
            </p>
          )}

          {venueTime && (
            <div className="inline-flex items-center gap-2 text-stone-700 bg-white/60 backdrop-blur-sm px-4 py-2 rounded-full border border-stone-200">
              <Clock className="w-4 h-4 text-amber-700" />
              <span className="font-medium">{venueTime}</span>
            </div>
          )}

          {/* Countdown */}
          {countdown && (
            <div className="grid grid-cols-4 gap-3 max-w-md mx-auto pt-4">
              {[
                { label: 'Jours', value: countdown.days },
                { label: 'Heures', value: countdown.hours },
                { label: 'Minutes', value: countdown.minutes },
                { label: 'Secondes', value: countdown.seconds },
              ].map((unit) => (
                <div key={unit.label} className="bg-white/70 backdrop-blur-sm rounded-lg p-3 border border-amber-200/50 shadow-sm">
                  <div className="text-2xl sm:text-3xl font-serif font-light text-amber-900 tabular-nums">
                    {String(unit.value).padStart(2, '0')}
                  </div>
                  <div className="text-xs uppercase tracking-wider text-stone-500 mt-1">{unit.label}</div>
                </div>
              ))}
            </div>
          )}

          <div className="pt-6">
            <a
              href="#find-invitation"
              className="inline-flex items-center gap-2 bg-gradient-gold text-white px-8 py-3 rounded-full shadow-lg hover:shadow-xl transition-shadow font-medium"
            >
              Trouver mon invitation
              <ArrowRight className="w-4 h-4" />
            </a>
          </div>

          {hashtag && (
            <p className="text-amber-800 font-medium text-lg pt-2">{hashtag}</p>
          )}
        </div>
      </section>

      {/* Welcome Message */}
      {welcomeMessage && (
        <section className="px-4 py-12 max-w-3xl mx-auto text-center">
          <p className="text-lg sm:text-xl text-stone-700 leading-relaxed font-light">
            {welcomeMessage}
          </p>
        </section>
      )}

      {/* Venue Section */}
      {(venueName || venueCity) && (
        <section className="px-4 py-12 bg-white/60 backdrop-blur-sm">
          <div className="max-w-3xl mx-auto text-center space-y-3">
            <div className="inline-flex items-center gap-2 text-amber-700 text-xs uppercase tracking-widest">
              <MapPin className="w-4 h-4" />
              Le Lieu
            </div>
            <h2 className="font-serif text-3xl sm:text-4xl text-stone-900">
              {venueName || venueCity}
            </h2>
            {venueCity && venueName && (
              <p className="text-stone-600">{venueCity}</p>
            )}
            {settings?.venue_address && (
              <p className="text-stone-500 text-sm">{settings.venue_address}</p>
            )}
            {settings?.venue_reference && (
              <p className="text-stone-500 text-sm italic">{settings.venue_reference}</p>
            )}
          </div>
        </section>
      )}

      {/* Timeline Section */}
      {timeline.length > 0 && (
        <section className="px-4 py-16 max-w-3xl mx-auto">
          <div className="text-center mb-10">
            <div className="inline-flex items-center gap-2 text-amber-700 text-xs uppercase tracking-widest mb-3">
              <Calendar className="w-4 h-4" />
              Programme
            </div>
            <h2 className="font-serif text-3xl sm:text-4xl text-stone-900">Déroulé de la Journée</h2>
          </div>
          <div className="space-y-4">
            {timeline.map((event) => (
              <div
                key={event.id}
                className="flex gap-4 bg-white/70 backdrop-blur-sm rounded-xl p-5 border border-stone-200/60 hover:border-amber-300/60 transition-colors"
              >
                <div className="flex-shrink-0 w-20 text-right">
                  <div className="font-serif text-xl text-amber-900">{event.time}</div>
                </div>
                <div className="flex-shrink-0 w-px bg-stone-200" />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    {event.icon && <span className="text-2xl">{event.icon}</span>}
                    <h3 className="font-medium text-stone-900">{event.activity}</h3>
                  </div>
                  {event.location && (
                    <p className="text-sm text-stone-500 mt-1 flex items-center gap-1">
                      <MapPin className="w-3 h-3" /> {event.location}
                    </p>
                  )}
                  {event.description && (
                    <p className="text-sm text-stone-600 mt-2">{event.description}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Find My Invitation Section */}
      <section id="find-invitation" className="px-4 py-16 bg-gradient-to-b from-transparent to-amber-50/40">
        <div className="max-w-xl mx-auto text-center space-y-6">
          <div className="inline-flex items-center gap-2 text-amber-700 text-xs uppercase tracking-widest">
            <Search className="w-4 h-4" />
            Mon Invitation
          </div>
          <h2 className="font-serif text-3xl sm:text-4xl text-stone-900">
            Trouver mon invitation
          </h2>
          <p className="text-stone-600">
            Entrez votre nom pour retrouver votre invitation personnelle et accéder à votre espace.
          </p>

          <form onSubmit={handleSearch} className="space-y-3">
            <div className="flex gap-2">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Votre nom..."
                className="flex-1 px-4 py-3 rounded-full border border-stone-300 bg-white/80 backdrop-blur-sm focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent"
                disabled={searching}
                minLength={2}
                required
              />
              <Button
                type="submit"
                disabled={searching || searchQuery.trim().length < 2}
                className="bg-gradient-gold text-white rounded-full px-6 shadow-md hover:shadow-lg transition-shadow"
              >
                {searching ? 'Recherche...' : 'Rechercher'}
              </Button>
            </div>
          </form>

          {searchError && (
            <div className="flex items-center gap-2 text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-3 text-sm">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{searchError}</span>
            </div>
          )}

          {searchResults && searchResults.length === 0 && (
            <div className="text-stone-600 bg-stone-50 border border-stone-200 rounded-lg p-4">
              <p>Aucune invitation trouvée pour « <strong>{searchQuery}</strong> ».</p>
              <p className="text-sm mt-1">Vérifiez l'orthographe ou contactez les organisateurs.</p>
            </div>
          )}

          {searchResults && searchResults.length > 0 && (
            <div className="space-y-2 text-left">
              <p className="text-sm text-stone-600 text-center">
                {searchResults.length} résultat{searchResults.length > 1 ? 's' : ''} — cliquez sur votre nom :
              </p>
              {searchResults.map((result, idx) => (
                <button
                  key={idx}
                  onClick={() => selectGuest(result)}
                  className="w-full text-left bg-white/80 hover:bg-white border border-stone-200 hover:border-amber-300 rounded-lg p-4 transition-colors group"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium text-stone-900 group-hover:text-amber-900">
                        {result.name}
                      </div>
                      <div className="text-sm text-stone-500">
                        {result.isCouple ? 'Invitation couple' : 'Invitation individuelle'} · {result.seats} place{result.seats > 1 ? 's' : ''}
                        {result.table && ` · Table ${result.table}`}
                      </div>
                    </div>
                    <ArrowRight className="w-4 h-4 text-stone-400 group-hover:text-amber-700" />
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Footer */}
      <footer className="px-4 py-10 bg-stone-900 text-stone-300 mt-auto">
        <div className="max-w-3xl mx-auto text-center space-y-3">
          <div className="font-serif text-2xl text-amber-200">{wedding.coupleLabel}</div>
          <p className="text-sm text-stone-400">
            {siteSubtitle}
          </p>
          <div className="flex items-center justify-center gap-2 text-xs text-stone-500 pt-2">
            <span>Slug: <code className="bg-stone-800 px-1.5 py-0.5 rounded text-amber-300">{wedding.slug}</code></span>
            <span>·</span>
            <span>Statut: <span className="text-emerald-400">{wedding.status}</span></span>
            <span>·</span>
            <span>Plan: <span className="text-amber-300">{wedding.plan}</span></span>
          </div>
          {wedding.isDefault && (
            <p className="text-xs text-stone-500 pt-3">
              <Link href="/" className="underline hover:text-amber-300">
                Accéder à l'expérience complète
              </Link>
              {' '}→
            </p>
          )}
        </div>
      </footer>
    </div>
  );
}
