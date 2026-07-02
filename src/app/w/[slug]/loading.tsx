/**
 * Loading UI for /w/[slug]/* routes (P2-PERF-18).
 *
 * Next.js App Router shows this fallback while the wedding public page
 * (and the wedding admin shell) is loading. Kept consistent with the
 * platform loading UI.
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
