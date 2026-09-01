// Sprint P1 (P1-1) : shim de compat — la route vit désormais sous
// /api/platform/pricing/compute/route. Ce fichier ne fait que ré-exporter les handlers
// pour que les appelants historiques (scripts, bookmarks) fonctionnent.
// NB: la config de segment (dynamic) doit être déclarée LOCALEMENT —
// Next.js interdit de la ré-exporter (route-segment-config).
export { POST } from '@/app/api/platform/pricing/compute/route';
export const dynamic = 'force-dynamic';
