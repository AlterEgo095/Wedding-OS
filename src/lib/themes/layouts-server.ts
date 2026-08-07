// ══════════════════════════════════════════════════════════════════════════════
// src/lib/themes/layouts-server.ts — P3.2 DB-backed layout options (SERVER ONLY)
// ══════════════════════════════════════════════════════════════════════════════
// This file contains the async DB-backed getLayoutOptions() function.
// It is SEPARATE from templates.ts because templates.ts is imported by client
// components (ThemeInjector, ThemeCustomizer) and must not pull in @/lib/db
// (which uses node:async_hooks — incompatible with the client bundle).
//
// Server components and API routes that need the DB-backed layout list should
// import { getLayoutOptions } from '@/lib/themes/layouts-server'.
// Client components should import { LAYOUT_OPTIONS } from '@/lib/themes/templates'
// (the hardcoded fallback).

import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { LAYOUT_OPTIONS, type LayoutOption } from './templates';

export async function getLayoutOptions(): Promise<LayoutOption[]> {
  try {
    const rows = await db.layout.findMany({
      where: { status: 'PUBLISHED' },
      select: { slug: true, name: true, description: true },
      orderBy: [{ isBuiltIn: 'desc' }, { name: 'asc' }],
    });
    if (rows.length === 0) {
      return LAYOUT_OPTIONS;
    }
    return rows.map((r) => ({
      id: r.slug,
      label: r.name,
      description: r.description || '',
    }));
  } catch (error) {
    logger.warn('getLayoutOptions: DB query failed, using hardcoded LAYOUT_OPTIONS', {
      errMessage: error instanceof Error ? error.message : String(error),
    });
    return LAYOUT_OPTIONS;
  }
}
