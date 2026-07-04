// ══════════════════════════════════════════════════════════════════════════════
// PENPOT ENGINE — Types & Interfaces
// ══════════════════════════════════════════════════════════════════════════════
// Phase 0 ÉTAPE 8 — Penpot Integration Preparation.
// Penpot is an open-source design tool (Figma alternative) with a REST API
// and SVG/CSS export capabilities.
//
// This module defines the INTERFACES for future Penpot integration:
//   - import design tokens (colors, fonts) → Theme Engine
//   - import invitation designs (SVG) → Invitation Engine
//   - export platform themes → Penpot library
//
// NO integration is implemented. The interfaces are the contract that
// Phase 2 (Penpot Integration) will fulfill.
// ══════════════════════════════════════════════════════════════════════════════

/**
 * A Penpot file/project reference.
 */
export interface PenpotFile {
  id: string;
  name: string;
  url: string;
  teamId: string;
  updatedAt: Date;
}

/**
 * Design tokens exported from Penpot (Figma-like token format).
 */
export interface PenpotDesignTokens {
  colors: Record<string, string>; // token name → hex/oklch
  typography: {
    display: { fontFamily: string; fontWeight: number };
    body: { fontFamily: string; fontWeight: number };
  };
  spacing?: Record<string, number>;
  radii?: Record<string, string>;
  shadows?: Record<string, string>;
}

/**
 * An SVG component exported from Penpot.
 */
export interface PenpotSvgExport {
  componentId: string;
  name: string;
  svg: string; // raw SVG markup
  width: number;
  height: number;
}

/**
 * Penpot integration configuration.
 */
export interface PenpotConfig {
  apiUrl: string; // e.g. https://design.penpot.app/api
  apiToken: string; // personal access token
  defaultTeamId: string;
}

/**
 * Penpot Engine interface — future implementation (Phase 2).
 */
export interface IPenpotEngine {
  // ── File operations ──
  listFiles(): Promise<PenpotFile[]>;
  getFile(fileId: string): Promise<PenpotFile | null>;

  // ── Token import/export ──
  importDesignTokens(fileId: string): Promise<PenpotDesignTokens>;
  exportDesignTokens(tokens: PenpotDesignTokens): Promise<string>; // returns Penpot library URL

  // ── SVG component export ──
  exportComponents(fileId: string): Promise<PenpotSvgExport[]>;
  exportComponent(fileId: string, componentId: string): Promise<PenpotSvgExport>;

  // ── Bridge to Theme Engine ──
  syncToTheme(weddingId: string, fileId: string): Promise<void>;

  // ── Bridge to Invitation Engine ──
  syncToInvitationTemplate(fileId: string): Promise<string>; // returns template slug
}

/**
 * Check if Penpot integration is configured (env vars present).
 */
export function isPenpotConfigured(): boolean {
  return !!(
    process.env.PENPOT_API_URL &&
    process.env.PENPOT_API_TOKEN
  );
}
