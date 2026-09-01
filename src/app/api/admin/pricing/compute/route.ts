// Sprint P1 (P1-1) : shim de compat — la route vit désormais sous
// /api/platform/pricing/compute/route.ts. Ce fichier ne fait que ré-exporter pour que les
// appelants historiques (scripts, bookmarks) continuent de fonctionner.
export { POST, dynamic } from '@/app/api/platform/pricing/compute/route.ts';
