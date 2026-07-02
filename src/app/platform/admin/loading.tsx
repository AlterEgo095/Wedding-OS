/**
 * Loading UI for /platform/admin/* routes (P2-PERF-18).
 *
 * Next.js App Router shows this fallback while the route segment's server
 * component (the 2453-line platform admin shell) is loading.
 */
export default function Loading() {
  return (
    <div
      className="flex min-h-[50vh] w-full items-center justify-center"
      role="status"
      aria-live="polite"
      aria-label="Chargement en cours"
    >
      <div
        className="h-8 w-8 animate-spin rounded-full border-2 border-muted border-t-primary"
        aria-hidden="true"
      />
    </div>
  );
}
