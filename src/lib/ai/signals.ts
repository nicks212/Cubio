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
  /^[\s!.,?👍👋🙏💙❤️✅]*(?:hello|hi|hey|ok|okay|good|great|perfect|sure|yes|no|yep|nope|got\s*it|understood|thanks|thank\s*you|thx|ty|bye|goodbye|see\s*you|take\s*care|good\s*morning|good\s*afternoon|good\s*evening|good\s*night|madloba|gmadlob|naxvamdis|kargi|gamarjoba|salami|bodishi|გამარჯობა|მოგესალმებით|სალამი|ბოდიში|კარგი|მადლობა|გმადლობ|ნახვამდის|კი|არა|მიხვდი|მიხვდა|გასაგებია|გასაგები|ალბათ|ok!)[\s!.,?👍👋🙏💙❤️✅]*$/i;

/** Message contains a photo/image request anywhere.
 *  Covers Georgian script, romanized Georgian (latin chars), English, Russian. */
export const PHOTO_RE =
  /photo|picture|image|სურათ|ფოტო|show\s*me|send\s*(me\s*)?image|can\s*i\s*see|let\s*me\s*see|ნახე|ნახვა|ნახეთ|surat|manaxe|manax|chamiyar|vnaxo|vnax|foto|фото|покажи/i;

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
  /\b(?:want\s+to\s+(?:buy|visit|see|reserve|purchase)|i(?:'m|\s+am)\s+interested\s+in\s+(?:buy|purchas|reserv)|how\s+(?:can|do)\s+i\s+(?:buy|purchase|reserve|order)|please\s+contact|call\s+me|i\s+want\s+(?:this|consultation|a\s+consult)|can\s+(?:i|your|the)\s+(?:visit|see\s+it|operator|agent|rep))|(?:მინდა(?:\s*(?:ვნახო|შევიძინო|ვიზიტი|შეძენ|დაჯავშნ|კონსულტ))?|გთხოვ\s*(?:დამიკავშირდ|დარეკ|შეგ(?:ატყობინ|ახსენ))|კონსულტაცია\s*მინდა|ოპერატორ(?:ი|მა)\s*დამიკავშირდ|ვიყიდი|დაჯავშნ|ვიზიტ(?:ი|ზე)|შეძენ(?:ა|ას)|(?:შე)?ვნახ(?:ავ|ო)\s*(?:ბინ|ბუნ)|хочу\s*(?:купить|посмотреть|записаться|эту|этот)|позвоните\s*мне|как\s*(?:купить|приобрести|заказать)|хочу\s*консультацию|\bminda(?:a)?\b|\bviqidi?\b|\b(?:moval|movide|movdivar|movalt|vnaxav|vnaxot)\b|adgilze\s+moval|sad\s+movide|xval\s+movide|movida\s+sheidzleba|momwon[ts]?\b|momtond\b)/i;

/** Phone number — Georgian mobile, international, or bare 9–12 digit run. */
export const PHONE_RE =
  /(?:\+995[\s-]?)?(?:\(?\d{3}\)?[\s-]?)?\d{2,3}[\s-]?\d{2,3}[\s-]?\d{2,4}|\+\d{7,15}|\b\d{9,12}\b/;

/**
 * Broad gate used to decide whether to run the AI frustration scorer.
 * Intentionally wider than strict anger detection — false positives are OK here
 * (the AI will rate them 1–2 and skip). What matters is not missing true frustration.
 * Covers: Georgian script, romanized Georgian, English, Russian.
 */
export const FRUSTRATION_GATE_RE =
  /\b(?:terrible|awful|horrible|unacceptable|ridiculous|useless|scam|fraud|furious|angry|disgusting|outrage|worst|never\s+again|nobody\s*(?:answers?|responds?|replies?))|(?:საშინელ|კატასტროფ|სამარცხვინ|თაღლით|გაბრაზ|ვერ\s*(?:გავიგ|ვიგ)|ვეღარ|არავინ\s*(?:მიპასუხ|პასუხ|გვიპასუხ)|უბედ|შეუძლებელ|ვერ\s*მიპასუხ)|(?:sashinele|ubedur|aravin\s*mipasux|ver\s*gavig|ver\s*mipasux|katastrofa)|(?:менеджер|жалоба|мошенничество|обман|ужасно|отвратительно)/i;

/** @deprecated Use HUMAN_REQUEST_RE for explicit operator demands and FRUSTRATION_GATE_RE + AI scoring for anger detection. */
export const ANGER_RE =
  /\b(?:ridiculous|unacceptable|terrible|disgusting|useless|awful|horrible|scam|fraud|furious|angry|worst|never\s+again|talk\s+to\s+(?:a\s+)?human|speak\s+to\s+(?:a\s+)?(?:person|human|manager|supervisor|agent)|get\s+me\s+(?:a\s+)?(?:manager|supervisor|human)|real\s+person\s+please)|(?:სასაცილოა|სამარცხვინოა|კატასტროფა|თაღლითი|გაბრაზებ|საშინელება|უბედურება|ვერ\s*(?:გავიგე|მიპასუხ)|არავინ\s*(?:მიპასუხ|გიპასუხ|გვიპასუხ|პასუხ)|ადამიანი\s*მინდა|ოპერატორი\s*(?:გამომიძახ|დამიკავშირ)|менеджер|жалоба|мошенничество|обман|ужасно|отвратительно|поговорить\s+с\s+человеком)|(?:\bsashinele|\bubedure|\baravin\s*mipasux|\baravin\s*ar\s*pasux)/i;

/** Qualification signals — budget, room count, floor, m². */
export const QUALIFICATION_RE =
  /\b(?:\d[\d\s,]*(?:₾|\$|usd|gel|lari|ლარ|dollar|k\b)|(?:\d+)\s*(?:room|bed|ოთახ(?:ი|იანი)?|комнат)|(?:\d+)\s*(?:floor|სართ(?:ულ|ული)?|этаж)|\d+\s*m[²2]|\d+\s*(?:sq|sqm|square))/i;

/** Customer cancels a meeting, apartment, or request. */
export const CANCEL_RE =
  /გაუქმ|cancel(?:led|lation)?|შეცვლ|ar\s*minda|აღარ\s*მინდა|მოხსნ|refuse|nevermind|never\s*mind|changed?\s*my\s*mind|i(?:'m)?\s*not\s*(?:interested|sure)|meeting\s*cancel|appointment\s*cancel|don'?t\s*want|არ\s*მინდა/i;

/** Customer wants to see a different apartment — resets confirmed selection. */
export const BROWSE_AGAIN_RE =
  /სხვა\s*ბინ|კიდ(?:ე|ევ)?\s*(?:ბინ|სურათ|ნახ)|show\s*(?:me\s*)?another|another\s*(?:apartment|option|one)|different\s*(?:apartment|floor|room|option)|other\s*(?:apartment|option|one)|more\s*(?:apartment|option)|meore|sxva\s*(?:bina|variant|sartu)|სხვა\s*(?:ვარი|სართ|ოთახ|პრო)|სხვ(?:ა|ებ).*(?:ბინ|სართ|ოთახ|ვარ)|can\s*i\s*see\s*(?:another|more|other)|მაჩვენ(?:ე|ეთ)\s*სხვ|ვნახ(?:ო|ავ)\s*სხვ/i;

/**
 * Non-angry request for a human agent / representative.
 * ANGER_RE already covers furious demands — this catches polite requests.
 */
export const HUMAN_REQUEST_RE =
  /connect\s+me|speak\s+to\s+(?:a\s+)?(?:human|person|agent|rep(?:resentative)?|someone)|talk\s+to\s+(?:a\s+)?(?:human|person|agent|rep(?:resentative)?|someone)|live\s+(?:agent|support|chat)|customer\s+(?:service|support)|ოპერატორ(?:ი|ს)?(?:\s*(?:მინდა|გამომიძახ|დამიკავშირ))?|წარმომადგენ(?:ელ(?:ი|ს|თ))?(?:\s*(?:მინდა|გამომიძახ|დამიკავშირ))?|ადამიანი\s*(?:მინდა|გამომიძახ)|ადამიანთან\s*(?:საუბარ|კავშირ)/i;

/**
 * Craft shop: customer has seen products but is not satisfied / wants something else.
 * Only meaningful AFTER the AI has already listed products (checked in state.ts).
 * Covers English, Georgian script, romanized Georgian.
 */
export const PRODUCT_DISSATISFIED_RE =
  /\b(?:not\s+(?:what\s+i|quite\s+right|satisfied|happy|quite)|nothing\s+(?:match|suit|work)|looking\s+for\s+something\s+(?:else|different|other)|don'?t\s+(?:have|see)\s+what\s+i|something\s+(?:else|different|other|more\s+unique)|different\s+(?:style|design|type|option)|doesn'?t\s+(?:match|suit|work)|can'?t\s+find|not\s+finding\s+it|none\s+of\s+(?:these|them)|not\s+in\s+stock|out\s+of\s+stock|don'?t\s+like\s+(?:any|these|those))|(?:არ\s*(?:მომწონს|მაქვს\s*სასურველი|მიხდება)|ეს\s*(?:არ\s*არის|არ\s*ვარგა)|ვეძებ\s*სხვ|სხვ(?:ა|ანაირ)\s*(?:რამ|დიზაინ|სტილ|ვარიანტ|ნიმუშ)|სხვა\s*(?:მინდა|მჭირდება|ვეძებ)|ვეძებ\s*(?:სხვა|განსხვავებულ|უნიკალ)|ვერ\s*ვპოულობ|ვერ\s*ვხედავ\s*(?:სასურველს|სასურ)|არ\s*მომდის|ასეთი\s*(?:არ|ვერ))|(?:ar\s+momwons|ar\s+maq?vs\s*sasurv|es\s+ar\s+aris|vedzieb\s+sxva|sxva\s+(?:ram|diz|stil|varia|nimu)|sxva\s+minda|sxva\s+mchirdeba|ver\s+vpoulob|ar\s+momdia)/i;

/**
 * Customer requests a custom deal, price negotiation, or off-plan arrangement
 * that the AI cannot resolve alone.
 */
export const CUSTOM_REQUEST_RE =
  /\b(?:custom|bespoke|negotiat|special\s*(?:price|deal|offer|request|discount)|off[\s-]?plan|personaliz|different\s*price|price\s*(?:negotia|reduc|discuss)|discount\b)|(?:სპეციალ(?:ური|ი)\s*(?:ფასი?|შეთავაზ)|ფასდათმობ|მოლაპარაკ(?:ება)?|ინდივიდ(?:ურ(?:ი|ი))?|ნეგოცი)/i;

/**
 * Customer confirms they want to be connected with a representative.
 * Only matched when an escalation offer was previously made (checked via Redis key).
 * Requires the ENTIRE message to be a confirmation — prevents partial matches.
 */
export const ESCALATION_CONFIRM_RE =
  /^[\s]*(?:yes\s+please|yes\s+sure|ok\s+please|yes|yep|yeah|yup|sure|ok|okay|please|connect|go\s+ahead|do\s+it|absolutely|sounds\s+good|alright|will\s+do|aha|კი|კარგი|გთხოვ|სიამოვნებით|დიახ|да|конечно|хорошо|ладно)[\s!.,?]*$/i;

// ─────────────────────────────────────────────────────────────────────────────
// 3. SKIP / SUPPRESS PATTERNS
// ─────────────────────────────────────────────────────────────────────────────

/** Guaranteed-non-lead social messages — skip Gemini entirely. */
export const SKIP_INTENTS_RE =
  /^[\s!.,?👍👋🙏💙❤️✅]*(?:hello|hi|hey|ok|okay|good|great|perfect|sure|yes|no|yep|nope|got\s*it|understood|thanks|thank\s*you|thx|ty|bye|goodbye|see\s*you|madloba|gmadlob|naxvamdis|kargi|gamarjoba|salami|გამარჯობა|სალამი|კარგი|მადლობა|გმადლობ|ნახვამდის|კი|არა|გასაგებია|ok)[\s!.,?👍👋🙏💙❤️✅]*$/i;

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
