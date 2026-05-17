import { model } from './model';
import type { LeadDetection, EscalationDetection } from './types';

/**
 * Analyses a conversation to determine if a sales lead should be captured.
 *
 * A lead is triggered when the customer clearly expresses intent to:
 * - (real_estate) visit an apartment, schedule a showing, or buy a unit
 * - (craft_shop) purchase a product, ask for payment/delivery, or request an order
 *
 * Runs asynchronously after the main AI reply is sent (fire-and-forget).
 * Backend is responsible for persistence and validation — AI only classifies.
 */
export async function detectLead(
  conversationHistory: Array<{ role: string; content: string }>,
  businessType: 'real_estate' | 'craft_shop',
): Promise<LeadDetection> {
  const historyStr = conversationHistory
    .map(m => `${m.role}: ${m.content}`)
    .join('\n');

  const prompt = `Analyze this conversation for sales lead signals. Respond with JSON only, no markdown fences.
Business type: ${businessType}

Conversation:
${historyStr}

A lead exists when the customer clearly expresses intent to:
${businessType === 'real_estate'
  ? '- Visit an apartment, schedule a showing, or buy a unit\n- Ask for reservation or contact with sales'
  : '- Purchase a product, ask for payment or delivery info\n- Request an order or ask how to buy'}

Return this exact JSON structure:
{
  "isLead": boolean,
  "summary": "2-3 sentence summary of what the customer wants and their key requirements. Empty string if not a lead.",
  "meetingDate": "preferred date/time mentioned by customer, or null",
  "meetingNotes": "any specific requests about the meeting/visit, or null"
}`;

  try {
    const result = await model.generateContent(prompt);
    const raw = result.response.text().trim().replace(/```json\n?|\n?```/g, '');
    return JSON.parse(raw) as LeadDetection;
  } catch {
    return { isLead: false, summary: '', meetingDate: null, meetingNotes: null };
  }
}

/**
 * Analyses a conversation to determine if escalation to a human is needed.
 *
 * Escalation triggers:
 * - Customer is angry, upset, or emotionally frustrated
 * - Aggressive or offensive language used
 * - Repeated dissatisfaction or same issue unresolved multiple times
 * - Customer explicitly asks for a human
 * - Customer complains about AI quality or misunderstanding
 *
 * When escalation is detected, the pipeline will:
 * 1. Create an escalation record in the DB
 * 2. Set ai_paused = true on the conversation (human takeover)
 *
 * Runs asynchronously after the main AI reply is sent (fire-and-forget).
 */
export async function detectEscalation(
  conversationHistory: Array<{ role: string; content: string }>,
): Promise<EscalationDetection> {
  const historyStr = conversationHistory
    .map(m => `${m.role}: ${m.content}`)
    .join('\n');

  const prompt = `Analyze this conversation for escalation signals. Respond with JSON only, no markdown fences.

Conversation:
${historyStr}

Escalation is needed when the customer is:
- Angry, emotionally upset, or repeatedly frustrated
- Using aggressive or offensive language
- Asking the same question multiple times without resolution
- Explicitly requesting a human representative
- Complaining about AI quality or misunderstanding

Return this exact JSON structure:
{
  "isEscalation": boolean,
  "summary": "2-3 sentence summary of why the customer is upset and what they need. Empty string if not an escalation."
}`;

  try {
    const result = await model.generateContent(prompt);
    const raw = result.response.text().trim().replace(/```json\n?|\n?```/g, '');
    return JSON.parse(raw) as EscalationDetection;
  } catch {
    return { isEscalation: false, summary: '' };
  }
}
