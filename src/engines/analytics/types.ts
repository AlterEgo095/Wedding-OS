// ══════════════════════════════════════════════════════════════════════════════
// ANALYTICS ENGINE — Types & Interfaces
// ══════════════════════════════════════════════════════════════════════════════
// Phase 0 ÉTAPE 6 — Foundation for the Analytics Engine.
// Prepares the architecture for future per-wedding and platform-wide
// statistics:
//   - guest engagement (views, RSVP rates, check-in times)
//   - invitation performance (open rates, click rates per channel)
//   - media consumption (gallery views, downloads)
//   - platform metrics (MRR, weddings active, churn)
//
// Current state: 14 stats per wedding computed on-demand in the dashboard
// API. Future: time-series storage + pre-aggregation + export.
// ══════════════════════════════════════════════════════════════════════════════

export type MetricType =
  | 'guest_total'
  | 'guest_confirmed'
  | 'guest_pending'
  | 'guest_declined'
  | 'guest_checked_in'
  | 'invitation_views'
  | 'qr_scans'
  | 'rsvp_rate'
  | 'media_bytes'
  | 'media_count'
  | 'admin_count'
  | 'platform_mrr'
  | 'platform_weddings_active'
  | 'platform_churn';

export type TimeSeriesGranularity = 'hour' | 'day' | 'week' | 'month';

/**
 * A single metric data point.
 */
export interface MetricPoint {
  timestamp: Date;
  value: number;
  labels?: Record<string, string>;
}

/**
 * A time series of metric points.
 */
export interface MetricSeries {
  metric: MetricType;
  granularity: TimeSeriesGranularity;
  points: MetricPoint[];
}

/**
 * Aggregated stats for a single wedding.
 */
export interface WeddingAnalytics {
  weddingId: string;
  guests: {
    total: number;
    confirmed: number;
    pending: number;
    declined: number;
    checkedIn: number;
    rsvpRate: number; // 0-1
  };
  invitations: {
    totalSent: number;
    totalOpened: number;
    openRate: number;
    views: number;
    qrScans: number;
  };
  media: {
    count: number;
    totalBytes: number;
  };
  engagement: {
    uniqueVisitors: number;
    avgSessionDuration: number; // seconds
    peakDay: Date | null;
  };
}

/**
 * Platform-wide analytics (super-admin view).
 */
export interface PlatformAnalytics {
  weddings: {
    total: number;
    active: number;
    draft: number;
    published: number;
    archived: number;
    suspended: number;
  };
  revenue: {
    mrr: number; // monthly recurring revenue in cents
    arr: number;
    currency: string;
  };
  plans: Record<string, number>; // planId → count
  growth: {
    newThisMonth: number;
    churnedThisMonth: number;
  };
}

/**
 * Analytics Engine interface — future implementation.
 */
export interface IAnalyticsEngine {
  getWeddingAnalytics(weddingId: string): Promise<WeddingAnalytics>;
  getPlatformAnalytics(): Promise<PlatformAnalytics>;
  getTimeSeries(metric: MetricType, range: { from: Date; to: Date }, granularity: TimeSeriesGranularity): Promise<MetricSeries>;
  track(event: AnalyticsEvent): Promise<void>;
}

export interface AnalyticsEvent {
  weddingId: string | null;
  type: string;
  properties?: Record<string, unknown>;
  timestamp: Date;
}
