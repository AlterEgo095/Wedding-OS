import { db } from '@/lib/db'
import { SETTING_KEYS } from '@/lib/constants'
import { listCollections } from '@/lib/collections'
import { logger } from '@/lib/logger'
import type { Plan } from '@/lib/types'
import type { FeaturedStats } from '@/components/FeaturedShowcase'

/**
 * Server-side data fetcher for the homepage.
 *
 * P1-PERF: Previously the homepage fetched 4 APIs in cascade (stories,
 * timeline, settings, music) on the client, causing a loading shimmer and
 * poor LCP. Now the Server Component fetches everything in parallel via
 * Prisma and passes the data as props — zero client-side fetches for the
 * initial render, instant content.
 *
 * All fetches target the DEFAULT wedding (the public showcase wedding).
 * If the default wedding doesn't exist, we return nulls and the client
 * falls back to its own fetching (graceful degradation).
 */

export interface HomeInitialData {
  settings: Record<string, string> | null
  stories: Array<{
    id: string
    title: string
    description: string
    date: string | null
    imageUrl: string | null
    order: number
  }> | null
  timeline: Array<{
    id: string
    time: string
    activity: string
    location: string | null
    description: string | null
    icon: string | null
    order: number
  }> | null
  music: {
    url: string
    title: string | null
    volume: number
    enabled: boolean
  } | null
  featuredStats: FeaturedStats | null
}

/**
 * Fetch all homepage data for the default wedding in a single parallel batch.
 * Returns nulls on failure so the client can degrade gracefully.
 */
export async function getHomeData(): Promise<HomeInitialData> {
  try {
    // Resolve the default wedding first — all other queries depend on its id.
    const defaultWedding = await db.wedding.findFirst({
      where: { isDefault: true },
      select: {
        id: true,
        slug: true,
        coupleLabel: true,
        weddingDate: true,
        venueName: true,
        plan: true,
      },
    })

    if (!defaultWedding) {
      logger.warn('No default wedding found for homepage SSR', {})
      return {
        settings: null,
        stories: null,
        timeline: null,
        music: null,
        featuredStats: null,
      }
    }

    // Parallel fetch — all scoped to the default wedding id.
    const [settingsRows, stories, timeline, musicRow, guestCount, photoCount, collectionCount] =
      await Promise.all([
        db.settings.findMany({
          where: { weddingId: defaultWedding.id },
          select: { key: true, value: true },
        }),
        db.coupleStory.findMany({
          where: { weddingId: defaultWedding.id },
          orderBy: { order: 'asc' },
          select: {
            id: true,
            title: true,
            description: true,
            date: true,
            imageUrl: true,
            order: true,
          },
        }),
        db.eventTimeline.findMany({
          where: { weddingId: defaultWedding.id },
          orderBy: { order: 'asc' },
          select: {
            id: true,
            time: true,
            activity: true,
            location: true,
            description: true,
            icon: true,
            order: true,
          },
        }),
        db.musicTrack.findFirst({
          where: { weddingId: defaultWedding.id },
          select: {
            url: true,
            title: true,
            volume: true,
            enabled: true,
          },
        }),
        db.guest.count({ where: { weddingId: defaultWedding.id } }),
        db.media.count({
          where: { weddingId: defaultWedding.id, type: 'PHOTO' },
        }),
        listCollections(defaultWedding.plan as Plan).then((cols) => cols.length),
      ])

    // Build settings map
    const settingsMap: Record<string, string> = {}
    for (const s of settingsRows) settingsMap[s.key] = s.value

    // Build featured stats
    const coupleLabel =
      `${settingsMap[SETTING_KEYS.GROOM_NAME] || ''} & ${settingsMap[SETTING_KEYS.BRIDE_NAME] || ''}`.trim() ||
      defaultWedding.coupleLabel ||
      'Josué & Hornella'
    const weddingDate =
      settingsMap[SETTING_KEYS.SITE_SUBTITLE] || 'Vendredi 26 Juin 2026'
    const hashtag =
      settingsMap[SETTING_KEYS.HASHTAG] || '#JosueEtHornella2026'
    const venueName =
      settingsMap[SETTING_KEYS.VENUE_NAME] || defaultWedding.venueName || ''

    const featuredStats: FeaturedStats = {
      guestCount,
      photoCount,
      timelineEventCount: timeline.length,
      collectionCount,
      coupleLabel,
      weddingDate,
      hashtag,
      venueName,
    }

    // Build music object
    const music = musicRow
      ? {
          url: musicRow.url || '',
          title: musicRow.title,
          volume: typeof musicRow.volume === 'number' ? musicRow.volume : 0.25,
          enabled: musicRow.enabled,
        }
      : null

    return {
      settings: settingsMap,
      stories,
      timeline,
      music,
      featuredStats,
    }
  } catch (error) {
    logger.error('Homepage SSR data fetch failed', {
      errMessage: error instanceof Error ? error.message : String(error),
      errName: error instanceof Error ? error.name : 'Unknown',
    })
    return {
      settings: null,
      stories: null,
      timeline: null,
      music: null,
      featuredStats: null,
    }
  }
}
