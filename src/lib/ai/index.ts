/**
 * Public API for the AI module.
 *
 * Architecture:
 *   src/lib/ai/
 *     model.ts          — Gemini model singleton
 *     types.ts          — Shared types (BusinessContext, LeadDetection, etc.)
 *     signals.ts        — Centralized regex signal engine
 *     state.ts          — ConversationState extraction
 *     embeddings.ts     — Gemini embeddings + pgvector similarity search
 *     generate.ts       — generateReply() — combines Layer 1 + Layer 2 prompts
 *     detect.ts         — detectLead(), detectEscalation()
 *     intentDetector.ts — detectIntent(), detectPhotoType()
 *     leadGate.ts       — shouldRunLeadAnalysis() deterministic gate
 *     prompts/
 *       global.ts       — Layer 1: universal rules (language, tone, escalation)
 *       real_estate.ts  — Layer 2: real estate rules + compact inventory
 *       craft_shop.ts   — Layer 2: craft shop rules + compact inventory
 */

export type { BusinessContext, ApartmentContext, ProductContext, LeadDetection, EscalationDetection } from './types';
export type { ConversationState } from './state';
export { generateReply } from './generate';
export { detectLeadAndEscalation, detectLead, detectEscalation } from './detect';
export { extractConversationState, formatStateForPrompt } from './state';
