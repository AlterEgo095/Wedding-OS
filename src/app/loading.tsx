/**
 * Default loading UI (P1-UX-1).
 *
 * Shown by Next.js App Router while a route segment's server component is
 * loading. Mirrors the look of the homepage hero so the transition is
 * smooth rather than jarring.
 */
export default function Loading() {
  return (
    <div
      className="min-h-[60vh] w-full flex items-center justify-center"
      role="status"
      aria-live="polite"
      aria-label="Chargement en cours"
    >
      <div className="flex flex-col items-center gap-4">
        <div
          className="h-10 w-10 rounded-full border-2 border-foreground/20 border-t-foreground animate-spin"
          aria-hidden="true"
        />
        <p className="text-sm text-muted-foreground">Chargement…</p>
      </div>
    </div>
  );
}
