import { model } from './model';
import type { LeadDetection, EscalationDetection } from './types';

const EMPTY_LEAD: LeadDetection = {
  isLead: false, summary: '', meetingDate: null, meetingNotes: null, name: null, phone: null, email: null,
};
const EMPTY_ESCALATION: EscalationDetection = { isEscalation: false, frustrationLevel: 1, summary: '' };

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
 *
 * @param checkLead       Whether to evaluate lead conditions (pre-filtered by leadGate)
 * @param checkEscalation Whether to evaluate escalation conditions
 */
export async function detectLeadAndEscalation(
  conversationHistory: Array<{ role: string; content: string }>,
  businessType: 'real_estate' | 'craft_shop',
  checkLead = true,
  checkEscalation = true,
): Promise<{ lead: LeadDetection; escalation: EscalationDetection }> {
  // Fast-path: nothing to check
  if (!checkLead && !checkEscalation) {
    return { lead: EMPTY_LEAD, escalation: EMPTY_ESCALATION };
  }

  const historyStr = conversationHistory
    .map(m => `${m.role}: ${m.content}`)
    .join('\n');

  const qualificationFields = businessType === 'real_estate'
    ? 'budget, preferred m², preferred floor, room count (at least budget OR room count must be present)'
    : 'desired product name (must be present)';

  // ── Escalation-only prompt (shorter = fewer tokens when lead check skipped) ──
  if (!checkLead && checkEscalation) {
    const escalationPrompt = `Analyze this conversation for customer frustration only. Respond with JSON only, no markdown.

Conversation:
${historyStr}

Return exactly:
{
  "frustrationLevel": integer 1–5 where:
    1 = calm or neutral,
    2 = mildly impatient (e.g. asking the same question twice, no emotional tone),
    3 = clearly frustrated or upset — words or tone expressing disappointment, feeling ignored, or dissatisfaction,
    4 = angry — strong complaints, feeling deceived, raising their voice in text,
    5 = abusive or threatening language.
  IMPORTANT: Repeated questions alone without any expressed frustration or negative emotion must score 1 or 2, never 3+.
  "escalationSummary": "One sentence: what upset them and what they need. Empty string if frustrationLevel is 1 or 2."
}`;
    try {
      const result = await model.generateContent(escalationPrompt);
      const raw = result.response.text().trim().replace(/```json\n?|\n?```/g, '');
      const p = JSON.parse(raw) as { frustrationLevel: number; escalationSummary: string };
      const level = typeof p.frustrationLevel === 'number' ? p.frustrationLevel : 1;
      return {
        lead: EMPTY_LEAD,
        escalation: { isEscalation: level >= 3, frustrationLevel: level, summary: p.escalationSummary ?? '' },
      };
    } catch {
      return { lead: EMPTY_LEAD, escalation: EMPTY_ESCALATION };
    }
  }

  // ── Full combined prompt ──────────────────────────────────────────────────
  const prompt = `Analyze this conversation. Respond with JSON only, no markdown fences.

Conversation:
${historyStr}

TASK: Determine if this is a QUALIFIED LEAD. ALL THREE conditions must be true:

1. BUYING INTENT — customer uses an explicit purchase/inquiry phrase (NOT just browsing, asking prices, or general curiosity):
   English: "I want", "I'm interested in buying", "I would like to buy/visit/reserve", "Can I visit?", "How can I buy?", "I want this apartment", "Please contact me", "I want a consultation"
   Georgian: "მინდა" (I want), "ვიყიდი" (I will buy), "შეძენა" (purchase), "დაჯავშნა" (reservation), "ვიზიტი" (visit), "გთხოვ დამიკავშირდეს" (please contact me)
   Romanized Georgian: "minda", "mindaa", "viqidi" — these mean "I want" / "I will buy"
   Russian: "хочу купить", "хочу посмотреть", "позвоните мне"
   NOT qualifying: asking prices, general curiosity, exploratory questions

2. QUALIFICATION — EITHER of these satisfies condition 2:
   (a) Customer stated at least one preference: ${qualificationFields}
   (b) OR a specific apartment was shown to the customer — look for a line like "SHOW_PHOTOS: <id>" in the AI messages, AND the customer reacted positively to it (any of: minda, mindaa, magaria, I want, I like, 👍, ✅, that one, perfect, etc.)

3. PHONE NUMBER — customer explicitly shared their phone number somewhere in the conversation

isLead must be FALSE if ANY of the three conditions is missing.

Return exactly:
{
  "isLead": true ONLY when all three conditions above are met — otherwise false,
  "summary": "2-3 sentence Georgian (ქართული) summary of customer needs + contact info. Empty string if not a lead.",
  "meetingDate": null or "date/time mentioned by customer",
  "meetingNotes": null or "specific requests about meeting/visit",
  "name": null or "customer's full name if they explicitly shared it in conversation",
  "phone": null or "phone number if explicitly mentioned anywhere",
  "email": null or "email if explicitly mentioned",
  "frustrationLevel": integer 1–5 where:
    1 = calm or neutral,
    2 = mildly impatient (e.g. asking the same question twice, no emotional tone),
    3 = clearly frustrated or upset — words or tone expressing disappointment, feeling ignored, or dissatisfaction,
    4 = angry — strong complaints, feeling deceived, raising their voice in text,
    5 = abusive or threatening language.
  IMPORTANT: Repeated questions alone without any expressed frustration or negative emotion must score 1 or 2, never 3+.
  "escalationSummary": "One sentence: what upset them and what they need. Empty string if frustrationLevel is 1 or 2."
}`;

  try {
    const result = await model.generateContent(prompt);
    const raw = result.response.text().trim().replace(/```json\n?|\n?```/g, '');
    const p = JSON.parse(raw) as {
      isLead: boolean; summary: string; meetingDate: string | null;
      meetingNotes: string | null; name: string | null; phone: string | null; email: string | null;
      isEscalation: boolean; escalationSummary: string; frustrationLevel: number;
    };
      const level = typeof p.frustrationLevel === 'number' ? p.frustrationLevel : (p.isEscalation ? 4 : 1);
      return {
        lead: {
          isLead: p.isLead,
          summary: p.summary ?? '',
          meetingDate: p.meetingDate ?? null,
          meetingNotes: p.meetingNotes ?? null,
          name: p.name ?? null,
          phone: p.phone ?? null,
          email: p.email ?? null,
        },
        escalation: {
          isEscalation: level >= 3,
          frustrationLevel: level,
          summary: p.escalationSummary ?? '',
        },
      };
  } catch {
    return { lead: EMPTY_LEAD, escalation: EMPTY_ESCALATION };
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
