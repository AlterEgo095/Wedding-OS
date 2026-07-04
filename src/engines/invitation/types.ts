// ══════════════════════════════════════════════════════════════════════════════
// INVITATION ENGINE — Types & Interfaces
// ══════════════════════════════════════════════════════════════════════════════
// Phase 0 ÉTAPE 6 — Foundation for the Invitation Engine.
// Manages: invitation templates, PDF generation, QR codes, variants,
// and AI personalization.
//
// Current state: 1 monolithic InvitationCard.tsx component.
// Future: template library (Royal, Luxury, Modern, Minimal, Floral, Premium,
// Classic, Glass, Gold, Black Edition) + parameterized renderer.
//
// Penpot integration (Phase 8 prep) will export invitation designs as SVG
// that the renderer can consume.
// ══════════════════════════════════════════════════════════════════════════════

/**
 * An invitation template — a reusable design for a wedding invitation.
 */
export interface InvitationTemplateEntity {
  id: string;
  name: string;
  slug: string;
  description: string;
  preview: string; // image URL
  category: InvitationCategory;
  isPremium: boolean;
  fields: InvitationField[];
  layout: InvitationLayout;
  tokens?: Record<string, string>; // color/font tokens (Penpot export)
}

export type InvitationCategory =
  | 'royal'
  | 'luxury'
  | 'modern'
  | 'minimal'
  | 'floral'
  | 'premium'
  | 'classic'
  | 'glass'
  | 'gold'
  | 'black-edition';

export type InvitationLayout = 'portrait' | 'landscape' | 'square' | 'card';

export interface InvitationField {
  key: string;
  label: string;
  type: 'text' | 'image' | 'color' | 'date';
  required: boolean;
  defaultValue?: string;
}

/**
 * The data that fills an invitation template for a specific guest.
 */
export interface InvitationData {
  weddingId: string;
  guestId: string;
  coupleLabel: string;
  brideName: string;
  groomName: string;
  weddingDate: Date | null;
  venueName: string | null;
  venueCity: string | null;
  guestDisplayName: string;
  guestCategory: string;
  tableNumber: number | null;
  tableName: string | null;
  personalMessage: string | null;
  invitationCode: string;
  qrCodeUrl: string;
  hashtag: string | null;
}

/**
 * Render output formats for an invitation.
 */
export type InvitationRenderFormat = 'html' | 'png' | 'jpeg' | 'pdf';

/**
 * Invitation Engine interface — future implementation.
 */
export interface IInvitationEngine {
  listTemplates(filter?: { category?: InvitationCategory; premium?: boolean }): Promise<InvitationTemplateEntity[]>;
  getTemplate(slug: string): Promise<InvitationTemplateEntity | null>;
  render(data: InvitationData, templateSlug: string, format: InvitationRenderFormat): Promise<Blob | string>;
  generateQrCode(invitationCode: string, weddingSlug: string): Promise<string>;
  batchGeneratePdf(weddingId: string): Promise<{ url: string; count: number }>;
}

/**
 * Penpot bridge for invitation templates (Phase 8 prep).
 */
export interface IPenpotInvitationBridge {
  importTemplate(penpotFileId: string): Promise<Partial<InvitationTemplateEntity>>;
  exportTemplate(templateId: string): Promise<Record<string, unknown>>;
}
