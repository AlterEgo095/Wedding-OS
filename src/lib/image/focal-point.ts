// ══════════════════════════════════════════════════════════════════════════════
// src/lib/image/focal-point.ts
// Phase 3B (MISSION 5.9.0 §20.5) — Focal point → object-position helper.
// ══════════════════════════════════════════════════════════════════════════════
//
// Couples often want to choose WHERE the camera "looks" on a photo when it's
// cropped (e.g. for portrait thumbnails of two faces, they may want the focal
// point on the face in the lower-right rather than dead-center).
//
// The wedding admin will (Phase 4) let couples click on a photo to set the
// focal point. The focal point is stored as `focalPointX` / `focalPointY` in
// the photo's metadata JSON (no Prisma schema change required — media already
// has a metadata JSON column). The values are normalised to the [0, 1] range
// where (0, 0) is top-left and (1, 1) is bottom-right of the original image.
//
// This helper converts the normalised focal point to a CSS `object-position`
// percentage string that next/image applies via the `style` prop.
//
// Why `object-position` and not `object-fit`? Because next/image's `fill`
// mode already uses `object-fit: cover` to crop the image to its container.
// `object-position` then nudges the focal point within that crop — exactly
// what we want.
//
// Example:
//   focalPointToObjectPosition(0.3, 0.7) → '30% 70%'
//   focalPointToObjectPosition()         → 'center center'  (browser default)
//   focalPointToObjectPosition(-1, 2)    → '0% 100%'        (clamped)
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Convert a focal point (x, y in 0-1 range) to CSS `object-position`.
 *
 * Wedding admin will let couples click on a photo to set the focal point.
 * The focal point is stored in the photo's metadata and applied here.
 *
 * @param x Horizontal focal point, 0 (left) to 1 (right). Optional.
 * @param y Vertical focal point,   0 (top)  to 1 (bottom). Optional.
 * @returns CSS `object-position` value, e.g. `'30% 70%'` or `'center center'`.
 */
export function focalPointToObjectPosition(x?: number, y?: number): string {
  if (x == null || y == null) return 'center center';
  const xp = Math.round(Math.max(0, Math.min(1, x)) * 100);
  const yp = Math.round(Math.max(0, Math.min(1, y)) * 100);
  return `${xp}% ${yp}%`;
}

export default focalPointToObjectPosition;
