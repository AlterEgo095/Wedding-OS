/**
 * Root 404 page (P1-UX-1).
 *
 * Rendered when no route matches. Per-wedding 404s (e.g. unknown wedding
 * slug) are handled in src/app/w/[slug]/not-found.tsx.
 */
import Link from "next/link";
import { Home } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-[60vh] w-full flex items-center justify-center p-6">
      <div className="max-w-md w-full text-center space-y-4">
        <p className="text-7xl font-serif text-foreground/20" aria-hidden="true">
          404
        </p>
        <h1 className="text-2xl font-semibold text-foreground">
          Page introuvable
        </h1>
        <p className="text-sm text-muted-foreground">
          La page que vous cherchez n&apos;existe pas ou a été déplacée.
        </p>
        <Link
          href="/"
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors min-h-[44px]"
        >
          <Home className="h-4 w-4" aria-hidden="true" />
          Retour à l&apos;accueil
        </Link>
      </div>
    </div>
  );
}
