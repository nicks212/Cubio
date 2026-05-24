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
  /** Customer name extracted from the conversation (after AI asked for it). */
  name: string | null;
  buyingIntent: boolean;
  photosRequested: boolean;
  desiredProduct: string | null;  // craft shop: product name when mentioned
  /** The apartment_number last shown to the customer via SHOW_PHOTOS. */
  lastShownAptId: string | null;
  /** True when customer reacted positively after photos were shown ("Minda", "Magaria!", "how do I buy?") */
  aptConfirmed: boolean;
}

/** Positive reaction after seeing photos — customer likes / wants the apartment. */
const APT_CONFIRMED_RE =
  /magari|minda|m[ai]nd[ao]|v[i]?q[i]?d[i]?|viq[i]?d|შემიწვილ|მინდა|ჩემ[ი]შვილ|ვიყიდ|ვიყიდი|ვიყ[დ]|აიღო|საჩქა|i want|i like|i'?ll take|that one|this one|let'?s proceed|how (do|can) (i|we) (buy|purchase)|rogor shevizen|rogor\s*v?iy?id|რო[გ] ვიყ|რო[გ] შევ[ი]ძ|გაკეთი|გაკეთება|cool|perfect|great|exactly|yes please|i'?m interested|dainteresebul|daintereseb/i;

/** Customer changed mind after confirming — wants to see a different apartment. Resets aptConfirmed. */
const BROWSE_AGAIN_RE =
  /სხვა\s*ბინ|კიდ(?:ე|ევ)?\s*(?:ბინ|სურათ|ნახ)|show\s*(?:me\s*)?another|another\s*(?:apartment|option|one)|different\s*(?:apartment|floor|room|option)|other\s*(?:apartment|option|one)|more\s*(?:apartment|option)|meore|sxva\s*(?:bina|variant|sartu)|სხვა\s*(?:ვარი|სართ|ოთახ|პრო)|სხვ(?:ა|ებ).*(?:ბინ|სართ|ოთახ|ვარ)|can\s*i\s*see\s*(?:another|more|other)|მაჩვენ(?:ე|ეთ)\s*სხვ|ვნახ(?:ო|ავ)\s*სხვ/i;

/**
 * Extracts structured state from full conversation history.
 * Scans USER messages for preferences, AI messages for last shown apartment.
 */
export function extractConversationState(
  history: Array<{ role: string; content: string }>,
): ConversationState {
  const userMessages = history
    .filter(m => m.role === 'user')
    .map(m => m.content);

  const allUserText = userMessages.join('\n');

  // Extract last shown apartment from AI messages.
  // The backend saves the full AI reply (including SHOW_PHOTOS marker) to the messages table
  // before stripping it for delivery — so the marker is visible in history.
  let lastShownAptId: string | null = null;
  for (const msg of history) {
    if (msg.role === 'ai') {
      const m = msg.content.match(/SHOW_PHOTOS[:\s]+([A-Za-z0-9_]+)/i);
      if (m) lastShownAptId = m[1].trim();
    }
  }

  // Check if customer expressed positive intent AFTER photos were shown.
  // Reset if customer later asked to browse a different apartment.
  let aptConfirmed = false;
  if (lastShownAptId) {
    let seenPhotoMsg = false;
    let confirmedAtIndex = -1;
    for (let i = 0; i < history.length; i++) {
      const msg = history[i];
      if (msg.role === 'ai' && /SHOW_PHOTOS/i.test(msg.content)) seenPhotoMsg = true;
      if (seenPhotoMsg && msg.role === 'user' && APT_CONFIRMED_RE.test(msg.content)) {
        aptConfirmed = true;
        confirmedAtIndex = i;
      }
    }
    // Reset if the customer later asked to see a different apartment
    if (aptConfirmed && confirmedAtIndex >= 0) {
      for (let i = confirmedAtIndex + 1; i < history.length; i++) {
        if (history[i].role === 'user' && BROWSE_AGAIN_RE.test(history[i].content)) {
          aptConfirmed = false;
          break;
        }
      }
    }
  }

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

  // Name — look for user reply after AI asked for their name
  const name = extractNameFromHistory(history);

  // Buying intent and photo request — binary flags
  const buyingIntent = BUYING_INTENT_RE.test(allUserText) || aptConfirmed;
  const photosRequested = PHOTO_RE.test(allUserText);

  return {
    budget,
    rooms,
    floor,
    sizeSqm,
    phone,
    name,
    buyingIntent,
    photosRequested,
    desiredProduct: null,
    lastShownAptId,
    aptConfirmed,
  };
}

/**
 * Extracts the customer's name by looking for turns where:
 *   1. The AI asked for their name
 *   2. The next user message is 1–5 words with no digits or URLs
 */
function extractNameFromHistory(
  history: Array<{ role: string; content: string }>,
): string | null {
  for (let i = 0; i < history.length - 1; i++) {
    const msg  = history[i];
    const next = history[i + 1];
    if (
      (msg.role === 'ai' || msg.role === 'model') &&
      /სახელ|სახელი|your\s+(?:full\s+)?name|შენი\s+სახელ|ვინ\s*ხარ|გვარ/i.test(msg.content)
    ) {
      if (next.role === 'user') {
        const text  = next.content.trim();
        const words = text.split(/\s+/);
        if (
          words.length >= 1 &&
          words.length <= 5 &&
          text.length  <= 60 &&
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
  if (state.name)         parts.push(`name_collected:${state.name}`);
  else if (state.buyingIntent || state.aptConfirmed || state.lastShownAptId) parts.push('name_collected:NO');
  if (state.phone)        parts.push(`phone:${state.phone}`);
  else if (state.buyingIntent || state.aptConfirmed || state.lastShownAptId) parts.push('phone_collected:NO');
  if (state.desiredProduct) parts.push(`product:${state.desiredProduct}`);
  if (state.lastShownAptId) parts.push(`shown_apt:${state.lastShownAptId}`);
  if (state.aptConfirmed)   parts.push(`apt_confirmed:YES`);
  if (state.buyingIntent)   parts.push(`intent:BUYING`);
  if (state.photosRequested) parts.push(`photos:requested`);

  return `STATE: ${parts.length > 0 ? parts.join(' | ') : 'new_customer'}`;
}
