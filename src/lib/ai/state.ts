/**
 * Structured conversation state extractor.
 *
 * Scans the full message history with regex — zero Gemini calls.
 * Used to inject a compact STATE: line into prompts, replacing verbose
 * raw history for the "what do we know about this customer" question.
 *
 * Typical output:
 *   STATE: budget:$60k | rooms:2 | phone:+995555123456 | intent:buying
 */

import {
  BUYING_INTENT_RE,
  PHOTO_RE,
  BUDGET_EXTRACT_RE,
  ROOMS_EXTRACT_RE,
  FLOOR_EXTRACT_RE,
  SIZE_EXTRACT_RE,
  PHONE_EXTRACT_RE,
} from './signals';

export interface ConversationState {
  budget: string | null;
  rooms: number | null;
  floor: number | null;
  sizeSqm: number | null;
  phone: string | null;
  buyingIntent: boolean;
  photosRequested: boolean;
  desiredProduct: string | null;  // craft shop: product name when mentioned
}

/**
 * Extracts structured state from full conversation history.
 * Only scans USER messages — AI responses are not a source of ground truth.
 */
export function extractConversationState(
  history: Array<{ role: string; content: string }>,
): ConversationState {
  const userMessages = history
    .filter(m => m.role === 'user')
    .map(m => m.content);

  const allUserText = userMessages.join('\n');

  // Budget — take the LAST mention (most recent preference wins)
  let budget: string | null = null;
  const budgetMatches = [...allUserText.matchAll(BUDGET_EXTRACT_RE)];
  if (budgetMatches.length > 0) {
    budget = budgetMatches[budgetMatches.length - 1][0].trim().replace(/\s+/g, '');
  }

  // Room count
  let rooms: number | null = null;
  const roomsMatch = ROOMS_EXTRACT_RE.exec(allUserText);
  if (roomsMatch) rooms = parseInt(roomsMatch[1]);

  // Floor preference
  let floor: number | null = null;
  const floorMatch = FLOOR_EXTRACT_RE.exec(allUserText);
  if (floorMatch) {
    const raw = floorMatch[1] ?? floorMatch[2];
    if (raw) floor = parseInt(raw);
  }

  // Size in m²
  let sizeSqm: number | null = null;
  const sizeMatch = SIZE_EXTRACT_RE.exec(allUserText);
  if (sizeMatch) sizeSqm = parseInt(sizeMatch[1]);

  // Phone (first mention is enough — they only have one number)
  let phone: string | null = null;
  const phoneMatch = PHONE_EXTRACT_RE.exec(allUserText);
  if (phoneMatch) phone = phoneMatch[1].replace(/\s/g, '');

  // Buying intent and photo request — binary flags
  const buyingIntent = BUYING_INTENT_RE.test(allUserText);
  const photosRequested = PHOTO_RE.test(allUserText);

  return {
    budget,
    rooms,
    floor,
    sizeSqm,
    phone,
    buyingIntent,
    photosRequested,
    desiredProduct: null,
  };
}

/**
 * Formats extracted state as a compact single-line string for prompt injection.
 * Empty state → "STATE: new_customer" (saves the AI guessing).
 */
export function formatStateForPrompt(state: ConversationState): string {
  const parts: string[] = [];
  if (state.budget)       parts.push(`budget:${state.budget}`);
  if (state.rooms)        parts.push(`rooms:${state.rooms}`);
  if (state.floor)        parts.push(`floor:${state.floor}`);
  if (state.sizeSqm)      parts.push(`size:${state.sizeSqm}m²`);
  if (state.phone)        parts.push(`phone:${state.phone}`);
  if (state.desiredProduct) parts.push(`product:${state.desiredProduct}`);
  if (state.buyingIntent) parts.push(`intent:BUYING`);
  if (state.photosRequested) parts.push(`photos:requested`);

  return `STATE: ${parts.length > 0 ? parts.join(' | ') : 'new_customer'}`;
}
