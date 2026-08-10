/**
 * Phase 3C (MISSION 5.9.0) — Offline fallback page.
 *
 * Server Component route at `/offline`. The Service Worker (public/sw.js)
 * precaches this route (added to CRITICAL_ASSETS in Phase 3C) and serves it
 * from cache when:
 *   - The user navigates to a page (request.mode === 'navigate')
 *   - The network fails (offline)
 *   - The requested URL is NOT in the runtime cache
 *
 * The page is intentionally a Server Component (no `'use client'`) so the
 * static HTML is cacheable and renders even with JavaScript disabled. Only the
 * "Réessayer" button needs client-side behaviour (window.location.reload) —
 * it's extracted into a tiny Client Component (RetryButton.tsx).
 *
 * URL bar note: when the SW serves this page in place of a navigation request,
 * the address bar STILL shows the URL the user originally requested (e.g.
 * `/w/josue-hornella`). Clicking "Réessayer" reloads THAT URL — the SW will
 * try the network again, succeed if back online, or fall back again.
 *
 * Design language: matches the rest of the platform — gold accent, glass card,
 * Playfair/Geist typography via the `font-display`/`font-serif` utility
 * classes exposed in `globals.css`. The background gradient uses the design
 * tokens (`--background`, `--muted`) so it adapts to light/dark themes.
 */
import Link from "next/link";
import { WifiOff, Home } from "lucide-react";
import RetryButton from "./RetryButton";

export const metadata = {
  title: "Hors ligne — Heureux Mariage",
  description: "Vous êtes hors ligne. Cette page sera disponible dès votre retour à une connexion.",
  robots: { index: false, follow: false },
};

export default function OfflinePage() {
  return (
    <main
      id="main"
      className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted p-4"
    >
      <div className="max-w-md w-full text-center space-y-6">
        {/* Icon medallion */}
        <div className="mx-auto w-20 h-20 rounded-full bg-gold/10 flex items-center justify-center">
          <WifiOff className="w-10 h-10 text-gold" aria-hidden="true" />
        </div>

        {/* Heading + body copy (French — matches platform lang) */}
        <div className="space-y-2">
          <h1 className="font-display text-3xl text-foreground">
            Vous êtes hors ligne
          </h1>
          <p className="text-muted-foreground">
            Cette page n&apos;est pas disponible sans connexion. Vos données
            sont sauvegardées et seront synchronisées dès votre retour.
          </p>
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-3">
          <RetryButton />
          <Link
            href="/"
            className="inline-flex items-center justify-center gap-2 rounded-md border border-gold/30 bg-transparent px-6 py-3 text-sm font-display font-medium tracking-wide text-foreground hover:bg-gold/5 transition-colors min-h-[44px]"
          >
            <Home className="h-4 w-4" aria-hidden="true" />
            Retour à l&apos;accueil
          </Link>
        </div>
      </div>
    </main>
  );
}
