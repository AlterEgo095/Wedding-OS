// Sprint P1 (P1-1) : shim de compat — la route vit désormais sous
// /api/platform/credits/consume/route.ts. Ce fichier ne fait que ré-exporter pour que les
// appelants historiques (scripts, bookmarks) continuent de fonctionner.
export { POST, dynamic } from '@/app/api/platform/credits/consume/route.ts';
