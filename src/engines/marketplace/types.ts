// ══════════════════════════════════════════════════════════════════════════════
// MARKETPLACE ENGINE — Types & Interfaces
// ══════════════════════════════════════════════════════════════════════════════
// Phase 0 ÉTAPE 6 — Foundation for the Marketplace Engine.
// Prepares the future marketplace for reusable themes, invitation
// templates, and components.
//
// Marketplace items are created by AENEWS (first-party) or third-party
// designers, and can be applied to any wedding.
// ══════════════════════════════════════════════════════════════════════════════

export type MarketplaceItemType = 'theme' | 'invitation_template' | 'component' | 'font_pack' | 'icon_set' | 'effect_pack';

/**
 * A marketplace item — a reusable design asset.
 */
export interface MarketplaceItemEntity {
  id: string;
  type: MarketplaceItemType;
  name: string;
  slug: string;
  description: string;
  author: string;
  preview: string; // image URL
  gallery: string[]; // additional screenshots
  price: number; // in cents, 0 = free
  currency: string;
  isPremium: boolean;
  isFeatured: boolean;
  rating: number; // 0-5
  installCount: number;
  tags: string[];
  metadata: Record<string, unknown>; // type-specific payload
  status: 'published' | 'pending_review' | 'rejected' | 'archived';
  createdAt: Date;
  updatedAt: Date;
}

/**
 * A purchase/install record.
 */
export interface MarketplaceInstall {
  id: string;
  itemId: string;
  weddingId: string;
  installedAt: Date;
  installedBy: string; // admin user id
  configuration?: Record<string, unknown>;
}

/**
 * Marketplace Engine interface — future implementation.
 */
export interface IMarketplaceEngine {
  listItems(filter?: { type?: MarketplaceItemType; premium?: boolean; featured?: boolean; tag?: string }): Promise<MarketplaceItemEntity[]>;
  getItem(slug: string): Promise<MarketplaceItemEntity | null>;
  install(itemId: string, weddingId: string): Promise<MarketplaceInstall>;
  uninstall(installId: string): Promise<void>;
  listInstalled(weddingId: string): Promise<MarketplaceInstall[]>;
  rate(itemId: string, rating: number, review?: string): Promise<void>;
}

/**
 * Brand Kit — a couple's reusable design assets (logo, colors, fonts).
 * Future: synced with Penpot.
 */
export interface BrandKit {
  id: string;
  weddingId: string;
  logoUrl: string | null;
  monogramUrl: string | null;
  primaryColor: string;
  accentColor: string;
  fontDisplay: string;
  fontBody: string;
  hashtag: string | null;
  createdAt: Date;
  updatedAt: Date;
}
