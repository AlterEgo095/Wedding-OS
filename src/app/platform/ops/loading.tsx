/**
 * Loading UI for /platform/ops (P6-4).
 *
 * Next.js App Router shows this fallback while the route segment's client
 * component (the ops dashboard) is loading. Mirrors the pattern from
 * /platform/admin/loading.tsx.
 */
export default function Loading() {
  return (
    <div
      className="flex min-h-[50vh] w-full items-center justify-center"
      role="status"
      aria-live="polite"
      aria-label="Chargement du tableau ops en cours"
    >
      <div
        className="h-8 w-8 animate-spin rounded-full border-2 border-muted border-t-primary"
        aria-hidden="true"
      />
    </div>
  );
}
