/**
 * Deterministic lead + escalation detector.
 *
 * Zero AI calls — pure regex + heuristics using the same signal patterns
 * already used by leadGate.ts and state.ts.
 *
 * Replaces the Gemini-based detectLeadAndEscalation() call in the pipeline.
 */

import {
  BUYING_INTENT_RE,
  PHONE_RE,
  PHONE_EXTRACT_RE,
  ANGER_RE,
  QUALIFICATION_RE,
  CANCEL_RE,
  BROWSE_AGAIN_RE,
} from '@/lib/ai/signals';
import { extractConversationState } from '@/lib/ai/state';

export interface LeadAnalysis {
  /** True when all three conditions are met: buying intent + qualification + phone. */
  isLead: boolean;
  /** True when anger / abusive language detected in the latest message. */
  isEscalation: boolean;
  /** Customer name extracted heuristically from conversation. */
  name: string | null;
  /** Phone number extracted from full user history. */
  phone: string | null;
  /** Short Georgian-friendly summary string for the admin panel. */
  summary: string;
  /**
   * Which lifecycle updates apply to the LATEST message only.
   * Used to patch an existing open lead without recreating it.
   */
  updateType: Array<'phone' | 'name' | 'cancel' | 'apt_change'>;
  /** Timestamped cancellation note to append to meeting_notes. */
  cancellationNote: string | null;
}

/**
 * Analyses the full conversation history and the latest message to determine:
 *  - Whether a qualified lead exists (isLead)
 *  - Whether an escalation should be created (isEscalation)
 *  - Any lifecycle updates to apply to an existing lead
 *
 * @param history       Full conversation turns (user + ai)
 * @param latestMessage The raw combined message just sent by the customer
 * @param businessType  'real_estate' | 'craft_shop'
 * @param lastShownAptId Apartment last shown via SHOW_PHOTOS (from DB)
 */
export function analyzeLeadState(
  history: Array<{ role: string; content: string }>,
  latestMessage: string,
  businessType: 'real_estate' | 'craft_shop',
  lastShownAptId: string | null = null,
): LeadAnalysis {
  const userMessages = history.filter(m => m.role === 'user');
  const userText = userMessages.map(m => m.content).join('\n');

  // ── Signal extraction ──────────────────────────────────────────────────────
  const hasPhone        = PHONE_RE.test(userText);
  const hasBuyingIntent = BUYING_INTENT_RE.test(userText);
  const hasQualification =
    QUALIFICATION_RE.test(userText) ||
    !!lastShownAptId ||
    businessType === 'craft_shop'; // craft shop: product mention counts as qualification
  const isEscalation = ANGER_RE.test(latestMessage);

  // ── Phone extraction ───────────────────────────────────────────────────────
  const phoneMatch = PHONE_EXTRACT_RE.exec(userText);
  const phone = phoneMatch ? phoneMatch[1] : null;

  // ── Name heuristic ─────────────────────────────────────────────────────────
  const name = extractNameFromHistory(history);

  // ── Lead qualification ─────────────────────────────────────────────────────
  const isLead = hasPhone && hasBuyingIntent && hasQualification;

  // ── Summary ────────────────────────────────────────────────────────────────
  const state = extractConversationState(history);
  if (!state.lastShownAptId && lastShownAptId) state.lastShownAptId = lastShownAptId;

  const summaryParts: string[] = [];
  if (name)                    summaryParts.push(name);
  if (phone)                   summaryParts.push(`📞 ${phone}`);
  if (state.desiredProduct)    summaryParts.push(`🛍 ${state.desiredProduct}`);
  if (state.rooms)             summaryParts.push(`${state.rooms}-ოთახ.`);
  if (state.budget)            summaryParts.push(`ბიუჯეტი: ${state.budget}`);
  if (state.floor)             summaryParts.push(`${state.floor}-სართ.`);
  if (state.lastShownAptId)    summaryParts.push(`ბინა #${state.lastShownAptId}`);
  const summary = summaryParts.join(' | ');

  // ── Lifecycle update detection (latest message only) ──────────────────────
  const updateType: Array<'phone' | 'name' | 'cancel' | 'apt_change'> = [];

  if (CANCEL_RE.test(latestMessage))       updateType.push('cancel');
  if (PHONE_RE.test(latestMessage))         updateType.push('phone');
  if (BROWSE_AGAIN_RE.test(latestMessage)) updateType.push('apt_change');
  if (name)                                 updateType.push('name');

  const cancellationNote = updateType.includes('cancel')
    ? `[${new Date().toISOString().slice(0, 16)}] Customer cancelled: "${latestMessage.slice(0, 200)}"`
    : null;

  return { isLead, isEscalation, name, phone, summary, updateType, cancellationNote };
}

// ─────────────────────────────────────────────────────────────────────────────
// Name heuristic
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Extracts the customer's name by looking for turns where:
 *   1. The AI asked for their name
 *   2. The next user message is 2–5 words with no digits or special characters
 */
function extractNameFromHistory(
  history: Array<{ role: string; content: string }>,
): string | null {
  for (let i = 0; i < history.length - 1; i++) {
    const msg  = history[i];
    const next = history[i + 1];

    if (
      msg.role === 'ai' &&
      /სახელ|სახელი|your\s+(?:full\s+)?name|შენი\s+სახელ|ვინ\s*ხარ/i.test(msg.content)
    ) {
      if (next.role === 'user') {
        const text  = next.content.trim();
        const words = text.split(/\s+/);
        // 2–5 words, ≤50 chars, no digits/urls/symbols
        if (
          words.length >= 2 &&
          words.length <= 5 &&
          text.length  <= 50 &&
          !/\d/.test(text) &&
          !/http|@|#|\+/.test(text)
        ) {
          return text;
        }
      }
    }
  }
  return null;
}
