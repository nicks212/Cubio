/**
 * Centralized signal engine — single source of truth for every regex pattern
 * used across the AI pipeline.
 *
 * Covers: Georgian (U+10D0–U+10FF), English, Russian.
 * Imported by: intentDetector.ts, leadGate.ts, state.ts
 *
 * Organized into four groups:
 *   1. Intent classification  (chat / photos / search)
 *   2. Lead scoring           (buying intent, phone, qualification)
 *   3. Skip / suppress        (non-lead messages)
 *   4. State extraction       (budget, rooms, floor, m², phone)
 */

// ─────────────────────────────────────────────────────────────────────────────
// 1. INTENT CLASSIFICATION
// ─────────────────────────────────────────────────────────────────────────────

/** Pure greeting / farewell / acknowledgement — nothing of business value. */
export const CHAT_ONLY_RE =
  /^[\s!.,?👍👋🙏💙❤️✅]*(?:hello|hi|hey|ok|okay|good|great|perfect|sure|yes|no|yep|nope|got\s*it|understood|thanks|thank\s*you|thx|ty|bye|goodbye|see\s*you|take\s*care|good\s*morning|good\s*afternoon|good\s*evening|good\s*night|გამარჯობა|მოგესალმებით|სალამი|ბოდიში|კარგი|მადლობა|გმადლობ|ნახვამდის|კი|არა|მიხვდი|მიხვდა|გასაგებია|გასაგები|ალბათ|ok!)[\s!.,?👍👋🙏💙❤️✅]*$/i;

/** Message contains a photo/image request anywhere. */
export const PHOTO_RE =
  /photo|picture|image|სურათ|ფოტო|show\s*me|send\s*(me\s*)?image|can\s*i\s*see|let\s*me\s*see|ნახე|ნახვა|ნახეთ/i;

/** Apartment-unit specific photo request (not project/building). */
export const APT_PHOTO_RE =
  /apartment\s*photo|flat\s*photo|unit\s*photo|this\s*apartment.*photo|photo.*this\s*apartment|ბინის\s*ფოტო|ბინის\s*სურათ|ამ\s*ბინ.*ფოტო|ამ\s*ბინ.*სურათ|квартир.*фото|фото.*квартир/i;

/** Project / building / complex photo request. */
export const PROJ_PHOTO_RE =
  /project\s*photo|complex\s*photo|building\s*photo|project.*image|exterior|common\s*area|პროექტის\s*ფოტო|პროექტის\s*სურათ|კომპლექს.*ფოტო|კომპლექს.*სურათ|проект.*фото|фото.*проект|здани.*фото/i;

// ─────────────────────────────────────────────────────────────────────────────
// 2. LEAD SCORING
// ─────────────────────────────────────────────────────────────────────────────

/** Explicit buying-intent phrases. Must match at least one to qualify. */
export const BUYING_INTENT_RE =
  /\b(?:want\s+to\s+(?:buy|visit|see|reserve|purchase)|i(?:'m|\s+am)\s+interested\s+in\s+(?:buy|purchas|reserv)|how\s+(?:can|do)\s+i\s+(?:buy|purchase|reserve|order)|please\s+contact|call\s+me|i\s+want\s+(?:this|consultation|a\s+consult)|can\s+(?:i|your|the)\s+(?:visit|see\s+it|operator|agent|rep))|(?:მინდა\s*(?:ვნახო|შევიძინო|ვიზიტი|შეძენ|დაჯავშნ|კონსულტ)|გთხოვ\s*(?:დამიკავშირდ|დარეკ|შეგ(?:ატყობინ|ახსენ))|კონსულტაცია\s*მინდა|ოპერატორ(?:ი|მა)\s*დამიკავშირდ|ვიყიდი|დაჯავშნ|ვიზიტ(?:ი|ზე)|შეძენ(?:ა|ას)|(?:შე)?ვნახ(?:ავ|ო)\s*(?:ბინ|ბუნ)|хочу\s*(?:купить|посмотреть|записаться|эту|этот)|позвоните\s*мне|как\s*(?:купить|приобрести|заказать)|хочу\s*консультацию)/i;

/** Phone number — Georgian mobile, international, or bare 9–12 digit run. */
export const PHONE_RE =
  /(?:\+995[\s-]?)?(?:\(?\d{3}\)?[\s-]?)?\d{2,3}[\s-]?\d{2,3}[\s-]?\d{2,4}|\+\d{7,15}|\b\d{9,12}\b/;

/** Angry / abusive language or explicit human-agent demand. */
export const ANGER_RE =
  /\b(?:ridiculous|unacceptable|terrible|disgusting|useless|awful|horrible|scam|fraud|furious|angry|worst|never\s+again|talk\s+to\s+(?:a\s+)?human|speak\s+to\s+(?:a\s+)?(?:person|human|manager|supervisor|agent)|get\s+me\s+(?:a\s+)?(?:manager|supervisor|human)|real\s+person\s+please)|(?:სასაცილოა|სამარცხვინოა|კატასტროფა|თაღლითი|გაბრაზებ|ადამიანი\s*მინდა|ოპერატორი\s*(?:გამომიძახ|დამიკავშირ)|менеджер|жалоба|мошенничество|обман|ужасно|отвратительно|поговорить\s+с\s+человеком)/i;

/** Qualification signals — budget, room count, floor, m². */
export const QUALIFICATION_RE =
  /\b(?:\d[\d\s,]*(?:₾|\$|usd|gel|lari|ლარ|dollar|k\b)|(?:\d+)\s*(?:room|bed|ოთახ(?:ი|იანი)?|комнат)|(?:\d+)\s*(?:floor|სართ(?:ულ|ული)?|этаж)|\d+\s*m[²2]|\d+\s*(?:sq|sqm|square))/i;

// ─────────────────────────────────────────────────────────────────────────────
// 3. SKIP / SUPPRESS PATTERNS
// ─────────────────────────────────────────────────────────────────────────────

/** Guaranteed-non-lead social messages — skip Gemini entirely. */
export const SKIP_INTENTS_RE =
  /^[\s!.,?👍👋🙏💙❤️✅]*(?:hello|hi|hey|ok|okay|good|great|perfect|sure|yes|no|yep|nope|got\s*it|understood|thanks|thank\s*you|thx|ty|bye|goodbye|see\s*you|გამარჯობა|სალამი|კარგი|მადლობა|გმადლობ|ნახვამდის|კი|არა|გასაგებია|ok)[\s!.,?👍👋🙏💙❤️✅]*$/i;

/** Pure information-seeking question without intent — casual browsing. */
export const BROWSE_ONLY_RE =
  /^(?:(?:what|which|how\s+(?:much|many)|do\s+you|is\s+there|are\s+there|can\s+you\s+(?:tell|show|give)|რამდენი|რა\s*ფასი|გაქვთ|გაქვს|შეგიძლიათ\s*(?:მომცეთ|გამომიგზავნ|მითხრ)|есть\s+ли|сколько\s+стоит|какая\s+цена|можете\s+(?:сказать|показать))\b.{0,120})$/i;

/** Message is purely a photo request with no other content. */
export const PHOTO_ONLY_RE =
  /^(?:[^.!?]*(?:photo|picture|image|სურათ|ფოტო|ნახე|ნახეთ)[^.!?]*)$/i;

// ─────────────────────────────────────────────────────────────────────────────
// 4. STATE EXTRACTION PATTERNS
// ─────────────────────────────────────────────────────────────────────────────

/** Budget / price mention — captured value + currency symbol. */
export const BUDGET_EXTRACT_RE =
  /(\d[\d,\s]*(?:k)?)\s*(?:₾|\$|usd|gel|lari|ლარ(?:ი)?|dollar)/gi;

/** Room count preference — captures the digit. */
export const ROOMS_EXTRACT_RE =
  /(\d)\s*[-–]?\s*(?:room|bed|ოთახ(?:ი|იანი)?|комнат)/i;

/** Floor preference — captures the floor number. */
export const FLOOR_EXTRACT_RE =
  /(?:(?:floor|სართ(?:ულ|ული)?|этаж)\s*(?:#|no\.?)?\s*(\d+))|(?:(\d+)\s*(?:st|nd|rd|th)?\s*(?:floor|სართ(?:ულ|ული)?|этаж))/i;

/** Size in square meters — captures the number. */
export const SIZE_EXTRACT_RE =
  /(\d+)\s*(?:m[²2]|sq\.?m?|sqm|square\s*m)/i;

/** Phone number capture — returns the matched number string. */
export const PHONE_EXTRACT_RE =
  /(\+995[\s-]?\d{9}|\+\d{8,15}|\b5\d{8}\b|\b0\d{9}\b|\b\d{9,12}\b)/;
