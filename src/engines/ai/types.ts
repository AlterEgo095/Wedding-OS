// ══════════════════════════════════════════════════════════════════════════════
// AI ENGINE — Types & Interfaces
// ══════════════════════════════════════════════════════════════════════════════
// Phase 0 ÉTAPE 6 — Foundation for the AI Assistant Engine.
// Prepares interfaces for an Admin Collaborator AI that can:
//   - analyze the platform state
//   - create weddings
//   - add guests
//   - generate QR codes
//   - detect inconsistencies
//
// NO AI logic is implemented here. This is pure architecture.
// The z-ai-web-dev-sdk is installed and will be used by the future
// implementation (backend only — never client-side).
// ══════════════════════════════════════════════════════════════════════════════

/**
 * A conversation message in the AI assistant chat.
 */
export interface AIMessage {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  timestamp: Date;
  toolCall?: AIToolCall;
  toolResult?: unknown;
}

/**
 * A conversation thread — persisted per admin user.
 */
export interface AIConversation {
  id: string;
  adminUserId: string;
  weddingId: string | null; // null = platform-wide conversation
  title: string;
  messages: AIMessage[];
  createdAt: Date;
  updatedAt: Date;
}

/**
 * AI context — the data the AI can access to answer questions.
 * Built from the current platform/wedding state.
 */
export interface AIContext {
  weddingId: string | null;
  wedding?: {
    coupleLabel: string;
    status: string;
    plan: string;
    weddingDate: Date | null;
  };
  stats?: {
    totalGuests: number;
    confirmed: number;
    pending: number;
    checkedIn: number;
  };
  recentEvents?: Array<{
    type: string;
    timestamp: Date;
    summary: string;
  }>;
}

/**
 * A tool that the AI can call (function calling).
 * Each tool maps to a Core/Theme/Invitation engine operation.
 */
export interface AITool {
  name: string;
  description: string;
  parameters: Record<string, unknown>; // JSON Schema
  handler: (params: Record<string, unknown>, ctx: AIContext) => Promise<unknown>;
}

/**
 * A tool call requested by the AI.
 */
export interface AIToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

/**
 * AI Engine interface — future implementation.
 */
export interface IAIEngine {
  chat(conversationId: string, userMessage: string, ctx: AIContext): Promise<AIMessage>;
  listConversations(adminUserId: string): Promise<AIConversation[]>;
  getConversation(id: string): Promise<AIConversation | null>;
  registerTool(tool: AITool): void;
  analyzePlatform(): Promise<{ inconsistencies: AIInconsistency[]; suggestions: string[] }>;
}

export interface AIInconsistency {
  severity: 'critical' | 'warning' | 'info';
  category: string;
  message: string;
  weddingId?: string;
  suggestedFix?: string;
}
