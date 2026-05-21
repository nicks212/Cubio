/**
 * Deterministic lead-analysis gate — zero Gemini calls.
 *
 * Runs in <1ms on every message AFTER the AI has replied.
 * Returns a `ShouldAnalyse` decision that tells the pipeline
 * whether to fire the expensive Gemini detectLeadAndEscalation call.
 *
 * Design goals:
 *  - Aggressively skip obvious non-leads (greetings, casual browsing,
 *    image requests, short replies, pure question messages)
 *  - ALWAYS allow escalation analysis when anger/abuse signals present
 *  - Allow lead analysis ONLY when meaningful positive signals exist
 *  - Minimum message threshold prevents premature analysis
 */

export type ShouldAnalyse =
  | { lead: false; escalation: false }
  | { lead: true;  escalation: boolean }
  | { lead: false; escalation: true };

// ── Buying intent phrases ──────────────────────────────────────────────────
// Must match at least one to qualify for lead Gemini call.
const BUYING_INTENT_RE =
  /\b(?:want\s+to\s+(?:buy|visit|see|reserve|purchase)|i(?:'m|\s+am)\s+interested\s+in\s+(?:buy|purchas|reserv)|how\s+(?:can|do)\s+i\s+(?:buy|purchase|reserve|order)|please\s+contact|call\s+me|i\s+want\s+(?:this|consultation|a\s+consult)|can\s+(?:i|your|the)\s+(?:visit|see\s+it|operator|agent|rep))|(?:მინდა\s*(?:ვნახო|შევიძინო|ვიზიტი|შეძენ|დაჯავშნ|კონსულტ)|გთხოვ\s*(?:დამიკავშირდ|დარეკ|შეგ(?:ატყობინ|ახსენ))|კონსულტაცია\s*მინდა|ოპერატორ(?:ი|მა)\s*დამიკავშირდ|ვიყიდი|დაჯავშნ|ვიზიტ(?:ი|ზე)|შეძენ(?:ა|ას)|(?:შე)?ვნახ(?:ავ|ო)\s*(?:ბინ|ბუნ)|хочу\s*(?:купить|посмотреть|записаться|эту|этот)|позвоните\s*мне|как\s*(?:купить|приобрести|заказать)|хочу\s*консультацию)/i;

// ── Phone number patterns ───────────────────────────────────────────────────
// Georgian (+995 / 5xx / 0xx), international (+X...) or bare digit runs 9-15 digits
const PHONE_RE =
  /(?:\+995[\s-]?)?(?:\(?\d{3}\)?[\s-]?)?\d{2,3}[\s-]?\d{2,3}[\s-]?\d{2,4}|\+\d{7,15}|\b\d{9,12}\b/;

// ── Escalation anger signals ───────────────────────────────────────────────
// We ALWAYS run escalation check when these fire, regardless of lead state.
const ANGER_RE =
  /\b(?:ridiculous|unacceptable|terrible|disgusting|useless|awful|horrible|scam|fraud|furious|angry|worst|never\s+again|talk\s+to\s+(?:a\s+)?human|speak\s+to\s+(?:a\s+)?(?:person|human|manager|supervisor|agent)|get\s+me\s+(?:a\s+)?(?:manager|supervisor|human)|real\s+person\s+please)|(?:სასაცილოა|სამარცხვინოა|კატასტროფა|თაღლითი|გაბრაზებ|ადამიანი\s*მინდა|ოპერატორი\s*(?:გამომიძახ|დამიკავშირ)|менеджер|жалоба|мошенничество|обман|ужасно|отвратительно|поговорить\s+с\s+человеком)/i;

// ── Qualification detail indicators ───────────────────────────────────────
// Real estate: price/budget mention, room count, floor, m²
// Craft shop: product name reference, price mention
const QUALIFICATION_RE =
  /\b(?:\d[\d\s,]*(?:₾|\$|usd|gel|lari|ლარ|dollar|k\b)|(?:\d+)\s*(?:room|bed|ოთახ(?:ი|იანი)?|комнат)|(?:\d+)\s*(?:floor|სართ(?:ულ|ული)?|этаж)|\d+\s*m[²2]|\d+\s*(?:sq|sqm|square))/i;

// ── Skip patterns — guaranteed non-lead signals ───────────────────────────
// Messages that match ANY of these will never trigger Gemini (unless anger).
const SKIP_INTENTS_RE =
  /^[\s!.,?👍👋🙏💙❤️✅]*(?:hello|hi|hey|ok|okay|good|great|perfect|sure|yes|no|yep|nope|got\s*it|understood|thanks|thank\s*you|thx|ty|bye|goodbye|see\s*you|გამარჯობა|სალამი|კარგი|მადლობა|გმადლობ|ნახვამდის|კი|არა|გასაგებია|ok)[\s!.,?👍👋🙏💙❤️✅]*$/i;

// Pure question about availability/price without intent — still just browsing
const BROWSE_ONLY_RE =
  /^(?:(?:what|which|how\s+(?:much|many)|do\s+you|is\s+there|are\s+there|can\s+you\s+(?:tell|show|give)|რამდენი|რა\s*ფასი|გაქვთ|გაქვს|გვაქვს|შეგიძლიათ\s*(?:მომცეთ|გამომიგზავნ|მითხრ)|есть\s+ли|сколько\s+стоит|какая\s+цена|можете\s+(?:сказать|показать))\b.{0,120})$/i;

// Photo / image request — already handled by photo pipeline
const PHOTO_ONLY_RE =
  /^(?:[^.!?]*(?:photo|picture|image|სურათ|ფოტო|ნახე|ნახეთ)[^.!?]*)$/i;

/**
 * Decides whether to invoke Gemini lead+escalation analysis.
 *
 * @param history        Full conversation history INCLUDING the latest AI reply
 * @param latestMessage  The raw customer message just processed
 * @param businessType   'real_estate' | 'craft_shop'
 */
export function shouldRunLeadAnalysis(
  history: Array<{ role: string; content: string }>,
  latestMessage: string,
  businessType: 'real_estate' | 'craft_shop',
): ShouldAnalyse {
  const msg = latestMessage.trim();

  // ── Always check escalation when anger/abuse detected ─────────────────
  const hasAnger = ANGER_RE.test(msg);

  // ── Hard skip: empty or purely social message ──────────────────────────
  if (!msg || SKIP_INTENTS_RE.test(msg)) {
    return hasAnger
      ? { lead: false, escalation: true }
      : { lead: false, escalation: false };
  }

  // ── Hard skip: pure photo request ─────────────────────────────────────
  if (PHOTO_ONLY_RE.test(msg) && !hasAnger) {
    return { lead: false, escalation: false };
  }

  // ── Minimum conversation depth ─────────────────────────────────────────
  // Need at least 3 user messages before a lead can realistically be qualified.
  const userMessages = history.filter(m => m.role === 'user');
  if (userMessages.length < 3) {
    return hasAnger
      ? { lead: false, escalation: true }
      : { lead: false, escalation: false };
  }

  // ── Full conversation text for multi-turn signal extraction ───────────
  const fullText = history.map(m => m.content).join('\n');
  const userText  = userMessages.map(m => m.content).join('\n');

  // ── Signal scoring ─────────────────────────────────────────────────────
  const hasPhone        = PHONE_RE.test(userText);
  const hasBuyingIntent = BUYING_INTENT_RE.test(userText);
  const hasQualification = QUALIFICATION_RE.test(userText);

  // Skip if latest message is pure browsing with no other signals
  if (BROWSE_ONLY_RE.test(msg) && !hasPhone && !hasBuyingIntent) {
    return hasAnger
      ? { lead: false, escalation: true }
      : { lead: false, escalation: false };
  }

  // ── Lead gate: require at least 2 of 3 positive signals ───────────────
  // (Gemini will then apply the strict 3-condition rule for final isLead)
  const positiveSignalCount = [hasPhone, hasBuyingIntent, hasQualification].filter(Boolean).length;

  // For craft shop, product name mention counts as qualification —
  // also check for product-like nouns (name + price in same conversation)
  const craftQualified = businessType === 'craft_shop'
    ? /[₾$]\d|\d\s*(?:₾|\$)|product|item|piece|სამკაულ|ბეჭედ|ყელსაბამ|სამაჯურ|ვყიდ|хочу\s+(?:браслет|кольцо|украшени)/i.test(fullText)
    : false;

  const runLead = positiveSignalCount >= 2 || (craftQualified && hasBuyingIntent);

  if (!runLead && !hasAnger) {
    return { lead: false, escalation: false };
  }

  return { lead: runLead, escalation: hasAnger || positiveSignalCount >= 2 };
}
