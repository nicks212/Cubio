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

// Matches messages that are ONLY a greeting/farewell/acknowledgement
// with optional punctuation/emoji — nothing of business value.
const CHAT_ONLY_RE =
  /^[\s!.,?👍👋🙏💙❤️✅]*(?:hello|hi|hey|ok|okay|good|great|perfect|sure|yes|no|yep|nope|got\s*it|understood|thanks|thank\s*you|thx|ty|bye|goodbye|see\s*you|take\s*care|good\s*morning|good\s*afternoon|good\s*evening|good\s*night|გამარჯობა|მოგესალმებით|გამარჯობა!|სალამი|ბოდიში|კარგი|მადლობა|გმადლობ|ნახვამდის|ნახვამდის!|კი|არა|კარგი|მიხვდი|მიხვდა|გასაგებია|გასაგები|ალბათ|ok!)[\s!.,?👍👋🙏💙❤️✅]*$/i;

// Matches messages that contain a photo/image request anywhere
const PHOTO_RE =
  /photo|picture|image|სურათ|ფოტო|show\s*me|send\s*(me\s*)?image|can\s*i\s*see|let\s*me\s*see|ნახე|ნახვა|ნახეთ/i;

export function detectIntent(message: string): MessageIntent {
  const text = message.trim();
  if (!text) return 'chat';
  if (CHAT_ONLY_RE.test(text)) return 'chat';
  if (PHOTO_RE.test(text)) return 'photos';
  return 'search';
}
