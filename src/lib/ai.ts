/**
 * Backward-compatibility shim.
 * All AI logic lives in src/lib/ai/ (layered architecture).
 * Existing imports of '@/lib/ai' continue to work via this re-export.
 */
export type { BusinessContext, ApartmentContext, ProductContext, ServiceContext, LeadDetection, EscalationDetection, ConversationState } from './ai/index';
export { generateReply, detectLead, detectEscalation, detectLeadAndEscalation, extractConversationState, formatStateForPrompt } from './ai/index';
