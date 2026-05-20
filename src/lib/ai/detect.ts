import { model } from './model';
import type { LeadDetection, EscalationDetection } from './types';

/**
 * Detects both lead signals AND escalation signals in a single Gemini call.
 * Previously this was two separate calls (detectLead + detectEscalation) —
 * combining them halves the number of API calls per user message.
 */
export async function detectLeadAndEscalation(
  conversationHistory: Array<{ role: string; content: string }>,
  businessType: 'real_estate' | 'craft_shop',
): Promise<{ lead: LeadDetection; escalation: EscalationDetection }> {
  const historyStr = conversationHistory
    .map(m => `${m.role}: ${m.content}`)
    .join('\n');

  const leadContext = businessType === 'real_estate'
    ? 'wants to visit/schedule/reserve an apartment or buy a unit'
    : 'wants to purchase a product or asks how to order/pay/deliver';

  const prompt = `Analyze this conversation. Respond with JSON only, no markdown fences.

Conversation:
${historyStr}

Return exactly:
{
  "isLead": true if customer ${leadContext},
  "summary": "2-3 sentence Georgian (ქართული) summary of what they want. Empty string if not a lead.",
  "meetingDate": null or "date/time mentioned by customer",
  "meetingNotes": null or "specific requests about meeting/visit",
  "phone": null or "phone number if explicitly mentioned",
  "email": null or "email if explicitly mentioned",
  "isEscalation": true ONLY if customer is clearly angry, uses offensive/abusive language, or explicitly demands a human agent. Repeating a question, asking multiple times, or showing mild impatience does NOT count — return false in those cases,
  "escalationSummary": "Why upset and what they need. Empty string if not an escalation."
}`;

  try {
    const result = await model.generateContent(prompt);
    const raw = result.response.text().trim().replace(/```json\n?|\n?```/g, '');
    const p = JSON.parse(raw) as {
      isLead: boolean; summary: string; meetingDate: string | null;
      meetingNotes: string | null; phone: string | null; email: string | null;
      isEscalation: boolean; escalationSummary: string;
    };
    return {
      lead: {
        isLead: p.isLead,
        summary: p.summary ?? '',
        meetingDate: p.meetingDate ?? null,
        meetingNotes: p.meetingNotes ?? null,
        phone: p.phone ?? null,
        email: p.email ?? null,
      },
      escalation: {
        isEscalation: p.isEscalation,
        summary: p.escalationSummary ?? '',
      },
    };
  } catch {
    return {
      lead: { isLead: false, summary: '', meetingDate: null, meetingNotes: null, phone: null, email: null },
      escalation: { isEscalation: false, summary: '' },
    };
  }
}

// Legacy single-purpose exports kept for any external usage
export async function detectLead(
  conversationHistory: Array<{ role: string; content: string }>,
  businessType: 'real_estate' | 'craft_shop',
): Promise<LeadDetection> {
  const { lead } = await detectLeadAndEscalation(conversationHistory, businessType);
  return lead;
}

export async function detectEscalation(
  conversationHistory: Array<{ role: string; content: string }>,
): Promise<EscalationDetection> {
  const { escalation } = await detectLeadAndEscalation(conversationHistory, 'real_estate');
  return escalation;
}
