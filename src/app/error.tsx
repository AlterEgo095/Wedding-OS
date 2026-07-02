"use client";

/**
 * Default error boundary (P1-UX-1).
 *
 * Catches uncaught errors in any server or client component below the root
 * layout. Renders a friendly error UI with a retry button instead of a
 * blank page or a stack trace.
 *
 * Per Next.js convention, this MUST be a client component.
 */
import { useEffect } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log to the server console (in production, this is where you'd forward
    // to Sentry/Bugsnag — see P1-PROD-6).
    console.error("[app/error]", error);
  }, [error]);

  return (
    <div
      className="min-h-[60vh] w-full flex items-center justify-center p-6"
      role="alert"
      aria-live="assertive"
    >
      <div className="max-w-md w-full rounded-lg border border-destructive/30 bg-destructive/5 p-6 flex flex-col items-center gap-4 text-center">
        <AlertTriangle
          className="h-10 w-10 text-destructive"
          aria-hidden="true"
        />
        <div className="space-y-1">
          <h2 className="text-lg font-semibold text-foreground">
            Une erreur est survenue
          </h2>
          <p className="text-sm text-muted-foreground">
            Nous n&apos;avons pas pu terminer cette action. Veuillez réessayer.
            Si le problème persiste, contactez l&apos;organisateur du mariage.
          </p>
        </div>
        {error.digest ? (
          <p className="text-[10px] font-mono text-muted-foreground/70">
            Réf. {error.digest}
          </p>
        ) : null}
        <button
          type="button"
          onClick={reset}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors min-h-[44px]"
        >
          <RotateCcw className="h-4 w-4" aria-hidden="true" />
          Réessayer
        </button>
      </div>
    </div>
  );
}
