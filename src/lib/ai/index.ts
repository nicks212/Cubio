/**
 * Public API for the AI module.
 *
 * Architecture:
 *   src/lib/ai/
 *     model.ts          — Gemini model singleton
 *     types.ts          — Shared types (BusinessContext, LeadDetection, etc.)
 *     generate.ts       — generateReply() — combines Layer 1 + Layer 2 prompts
 *     detect.ts         — detectLead(), detectEscalation()
 *     prompts/
 *       global.ts       — Layer 1: universal rules (language, tone, escalation, takeover)
 *       real_estate.ts  — Layer 2: real estate rules + data injection
 *       craft_shop.ts   — Layer 2: craft shop rules + data injection
 */

export type { BusinessContext, ApartmentContext, ProductContext, LeadDetection, EscalationDetection } from './types';
export { generateReply } from './generate';
export { detectLead, detectEscalation } from './detect';
