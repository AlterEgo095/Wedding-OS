/**
 * Per-wedding 404 page (P5.0 CB-1).
 *
 * Rendered when `notFound()` is called from /w/[slug]/layout.tsx or any
 * /w/[slug]/* page — covers two cases:
 *   1. Unknown slug (wedding doesn't exist)
 *   2. DRAFT wedding accessed via a public (non-admin) route
 *
 * In Next.js 16, having a segment-level not-found.tsx ensures the HTTP
 * response status is 404 (not 200) when notFound() is invoked, which fixes
 * the soft-404 bug identified in PRE-P5.X-AUDIT-F (CB-1).
 */
import Link from 'next/link';
import { Home, Search } from 'lucide-react';

export const dynamic = 'force-static';

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-warm p-6">
      <div className="max-w-md w-full text-center space-y-6">
        <p
          className="text-8xl font-serif text-foreground/15"
          aria-hidden="true"
        >
          404
        </p>
        <div className="space-y-2">
          <h1 className="text-3xl font-serif text-foreground">
            Mariage introuvable
          </h1>
          <p className="text-sm text-muted-foreground">
            Ce mariage n&apos;existe pas, n&apos;est pas encore publié, ou a été
            retiré. Si vous pensez qu&apos;il s&apos;agit d&apos;une erreur,
            vérifiez l&apos;adresse ou contactez les organisateurs.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/"
            className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors min-h-[44px]"
          >
            <Home className="h-4 w-4" aria-hidden="true" />
            Retour à l&apos;accueil
          </Link>
          <Link
            href="/platform/login"
            className="inline-flex items-center justify-center gap-2 rounded-md border border-input bg-background px-5 py-2.5 text-sm font-medium text-foreground hover:bg-accent hover:text-accent-foreground transition-colors min-h-[44px]"
          >
            <Search className="h-4 w-4" aria-hidden="true" />
            Espace organisateur
          </Link>
        </div>
      </div>
    </div>
  );
}
