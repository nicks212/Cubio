import { model } from './model';
import type { LeadDetection, EscalationDetection } from './types';

/**
 * Detects both lead signals AND escalation signals in a single Gemini call.
 *
 * LEAD RULES — a qualified lead requires ALL THREE:
 *   1. Explicit buying-intent phrase (not just browsing or asking prices)
 *   2. Enough qualification details collected by the AI in conversation
 *   3. Customer provided their phone number
 *
 * Only when all three are present does isLead become true and a lead ticket
 * gets created. This prevents spam leads from casual browsers.
 */
export async function detectLeadAndEscalation(
  conversationHistory: Array<{ role: string; content: string }>,
  businessType: 'real_estate' | 'craft_shop',
): Promise<{ lead: LeadDetection; escalation: EscalationDetection }> {
  const historyStr = conversationHistory
    .map(m => `${m.role}: ${m.content}`)
    .join('\n');

  const qualificationFields = businessType === 'real_estate'
    ? 'budget, preferred m², preferred floor, room count (at least budget OR room count must be present)'
    : 'desired product name (must be present)';

  const prompt = `Analyze this conversation. Respond with JSON only, no markdown fences.

Conversation:
${historyStr}

TASK: Determine if this is a QUALIFIED LEAD. ALL THREE conditions must be true:

1. BUYING INTENT — customer uses an explicit purchase/inquiry phrase (NOT just browsing, asking prices, or general curiosity):
   English: "I want", "I'm interested in buying", "I would like to buy/visit/reserve", "Can I visit?", "Can I see it in real life?", "How can I buy?", "How do I reserve?", "I want this apartment/product", "Please contact me", "I want a consultation", "Can your operator/agent call me?"
   Georgian: "მინდა" (want to buy/visit), "მინდა ვნახო" (want to see it), "მინდა შევიძინო" (want to purchase), "დაჯავშნა" (reservation), "ვიზიტი" (visit), "გთხოვ დამიკავშირდეს" (please contact me), "კონსულტაცია მინდა" (want consultation), "ოპერატორი დამიკავშირდეს" (operator contact me), "ვიყიდი" (I will buy), "შეძენა" (purchase)
   Russian: "хочу купить" (want to buy), "хочу посмотреть" (want to see), "как купить?" (how to buy?), "хочу записаться" (want to schedule), "позвоните мне" (call me), "хочу эту квартиру/товар" (want this)
   NOT qualifying: asking prices, asking what's available, general curiosity, exploratory questions

2. QUALIFICATION DETAILS — customer has provided: ${qualificationFields}

3. PHONE NUMBER — customer explicitly shared their phone number somewhere in the conversation

isLead must be FALSE if ANY of the three conditions is missing.

Return exactly:
{
  "isLead": true ONLY when all three conditions above are met — otherwise false,
  "summary": "2-3 sentence Georgian (ქართული) summary of customer needs + contact info. Empty string if not a lead.",
  "meetingDate": null or "date/time mentioned by customer",
  "meetingNotes": null or "specific requests about meeting/visit",
  "phone": null or "phone number if explicitly mentioned anywhere",
  "email": null or "email if explicitly mentioned",
  "isEscalation": true ONLY if customer is clearly angry, uses offensive/abusive language, or explicitly demands a human agent. Repeated questions, mild impatience, or asking multiple times do NOT count,
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
