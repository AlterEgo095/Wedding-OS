// ══════════════════════════════════════════════════════════════════════════════
// AUTOMATION ENGINE — Types & Interfaces
// ══════════════════════════════════════════════════════════════════════════════
// Phase 0 ÉTAPE 6 — Foundation for the Automation Engine.
// Prepares the structure for future workflow automations:
//   - batch QR code ZIP generation
//   - batch invitation sending (SMS/Email/WhatsApp)
//   - batch PDF generation
//   - social asset generation
//   - AI wedding setup
//
// The engine subscribes to Core Engine events and can trigger chains
// of actions. NO workflow logic is implemented here yet.
// ══════════════════════════════════════════════════════════════════════════════

import type { EngineEvent } from '../core/types';

/**
 * An automation rule — "when X happens, do Y".
 */
export interface AutomationRule {
  id: string;
  weddingId: string | null; // null = platform-wide
  name: string;
  description: string;
  trigger: AutomationTrigger;
  actions: AutomationAction[];
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
  lastRunAt: Date | null;
  runCount: number;
}

export type AutomationTrigger =
  | { type: 'event'; event: EngineEvent['type'] }
  | { type: 'schedule'; cron: string }
  | { type: 'manual'; label: string }
  | { type: 'webhook'; url: string };

export interface AutomationAction {
  id: string;
  type: AutomationActionType;
  label: string;
  config: Record<string, unknown>;
}

export type AutomationActionType =
  | 'send_invitation_batch'
  | 'generate_qr_zip'
  | 'generate_pdf_batch'
  | 'generate_social_assets'
  | 'ai_setup_wedding'
  | 'send_notification'
  | 'update_setting'
  | 'call_api';

/**
 * Execution log for an automation run.
 */
export interface AutomationRun {
  id: string;
  ruleId: string;
  triggeredBy: 'event' | 'schedule' | 'manual' | 'webhook';
  triggerEvent?: EngineEvent;
  status: 'pending' | 'running' | 'success' | 'failed' | 'partial';
  startedAt: Date;
  completedAt: Date | null;
  results: AutomationActionResult[];
  error?: string;
}

export interface AutomationActionResult {
  actionId: string;
  status: 'success' | 'failed' | 'skipped';
  output?: unknown;
  error?: string;
}

/**
 * Automation Engine interface — future implementation.
 */
export interface IAutomationEngine {
  createRule(input: Omit<AutomationRule, 'id' | 'createdAt' | 'updatedAt' | 'lastRunAt' | 'runCount'>): Promise<AutomationRule>;
  listRules(weddingId?: string): Promise<AutomationRule[]>;
  runRule(ruleId: string, trigger?: EngineEvent): Promise<AutomationRun>;
  getRunHistory(ruleId: string): Promise<AutomationRun[]>;
  registerActionType(type: string, handler: (config: Record<string, unknown>) => Promise<unknown>): void;
}
