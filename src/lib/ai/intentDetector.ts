/**
 * Lightweight regex-based intent classifier.
 *
 * Runs in <1ms before any DB or context loading so we can skip expensive
 * business-context fetches for messages that don't need them.
 *
 *   'chat'   — greeting / thanks / confirmation / one-word reply
 *              → skip loadBusinessContext entirely; use micro-prompt
 *   'photos' — customer wants to see images
 *              → include [photos:...] URLs in context
 *   'search' — apartment/product queries, pricing, availability, etc.
 *              → normal flow, no photos in context
 */
export type MessageIntent = 'chat' | 'photos' | 'search';

/**
 * For photo requests, whether they want apartment-specific photos,
 * project/building photos, or either.
 */
export type PhotoType = 'apartment' | 'project' | 'any';

// Matches messages that are ONLY a greeting/farewell/acknowledgement
// with optional punctuation/emoji — nothing of business value.
const CHAT_ONLY_RE =
  /^[\s!.,?👍👋🙏💙❤️✅]*(?:hello|hi|hey|ok|okay|good|great|perfect|sure|yes|no|yep|nope|got\s*it|understood|thanks|thank\s*you|thx|ty|bye|goodbye|see\s*you|take\s*care|good\s*morning|good\s*afternoon|good\s*evening|good\s*night|გამარჯობა|მოგესალმებით|გამარჯობა!|სალამი|ბოდიში|კარგი|მადლობა|გმადლობ|ნახვამდის|ნახვამდის!|კი|არა|კარგი|მიხვდი|მიხვდა|გასაგებია|გასაგები|ალბათ|ok!)[\s!.,?👍👋🙏💙❤️✅]*$/i;

// Matches messages that contain a photo/image request anywhere
const PHOTO_RE =
  /photo|picture|image|სურათ|ფოტო|show\s*me|send\s*(me\s*)?image|can\s*i\s*see|let\s*me\s*see|ნახე|ნახვა|ნახეთ/i;

// Apartment-specific photo request (flat/unit photos, not project/building)
const APT_PHOTO_RE =
  /apartment\s*photo|flat\s*photo|unit\s*photo|this\s*apartment.*photo|photo.*this\s*apartment|ბინის\s*ფოტო|ბინის\s*სურათ|ამ\s*ბინ.*ფოტო|ამ\s*ბინ.*სურათ|квартир.*фото|фото.*квартир/i;

// Project/building/complex photo request
const PROJ_PHOTO_RE =
  /project\s*photo|complex\s*photo|building\s*photo|project.*image|exterior|common\s*area|პროექტის\s*ფოტო|პროექტის\s*სურათ|კომპლექს.*ფოტო|კომპლექს.*სურათ|проект.*фото|фото.*проект|здани.*фото/i;

export function detectIntent(message: string): MessageIntent {
  const text = message.trim();
  if (!text) return 'chat';
  if (CHAT_ONLY_RE.test(text)) return 'chat';
  if (PHOTO_RE.test(text)) return 'photos';
  return 'search';
}

/**
 * For photo-intent messages, determines whether the customer wants
 * apartment-unit photos, project/building photos, or either.
 * Only meaningful when detectIntent() returned 'photos'.
 */
export function detectPhotoType(message: string): PhotoType {
  if (APT_PHOTO_RE.test(message)) return 'apartment';
  if (PROJ_PHOTO_RE.test(message)) return 'project';
  return 'any';
}
