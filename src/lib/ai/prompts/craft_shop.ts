import type { ProductContext } from '../types';
import { CRAFT_BROAD_QUERY_RE } from '../signals';
import { translateProductForEnglish, compactCompanyInfoForEnglish } from '../geoTranslation';

type ProductRow = ProductContext['products'][0];

function slugify(name: string): string {
  return name.toLowerCase().replace(/[\s-]+/g, '_').slice(0, 40);
}

function buildPhotoKeySection(products: ProductRow[], translatedNames?: Map<string, string>): string {
  const rows = products
    .map(p => ({
      displayName: translatedNames?.get(p.name) ?? p.name,
      // Key is ALWAYS derived from the original (untranslated) name so that
      // resolvePhotoUrls() can match it via slug(p.name) === slug(identifier).
      key:  slugify(p.name),
      count: p.images?.filter(u => u.startsWith('http')).length ?? 0,
    }))
    .filter(r => r.count > 0);

  if (rows.length === 0) return '';
  return `PHOTO KEYS (machine-only — never show to customer):\n${rows.map(r => `• ${r.displayName} => ${r.key}`).join('\n')}`;
}

function compactCompanyInfo(raw: string | null): string {
  if (!raw) return '';
  const n = raw.replace(/\s+/g, ' ').trim();
  const phone = /(?:\+?\d[\d\s\-()]{5,15}\d)/.exec(n)?.[0]?.trim() ?? null;
  const hours = /(?:მუშაობს|working hours?|open)\s*[^,.\n]{0,80}/i.exec(n)?.[0]?.trim() ?? null;
  const addr = /(?:მისამართი|address)\s*[:,-]?\s*[^,.\n]{3,80}/i.exec(n)?.[0]?.trim() ?? null;
  const parts = [addr, hours, phone ? `phone ${phone}` : null].filter(Boolean);
  return parts.length > 0 ? parts.join(' | ') : n.slice(0, 140);
}

/**
 * LAYER 2 — Craft Shop Business Rules
 *
 * Flat function — no internal retrieval, no ALLOWED NAMES fence, no CATALOG OVERVIEW.
 * context.products is pre-ranked by vector + token retrieval in loadBusinessContext.
 *
 * Hallucination prevention is structural:
 *   - Gemini only receives the top retrieved products — nothing to hallucinate from.
 *   - No full catalog name list → no world-knowledge leakage via name recognition.
 *   - History window is 2 turns → stale prices can't contaminate more than one cycle.
 *   - Price must match the listed value exactly — there is no other price in the prompt.
 */
export function buildCraftShopSystemPrompt(
  context: ProductContext,
  userQuery = '',
  opts: { buyingIntent?: boolean; productDissatisfied?: boolean; photoIntent?: boolean } = {},
): string {

  // ── Language detection (done first — affects preprocessing of all data below) ──
  // True when customer message has Latin letters but no Georgian script.
  // Covers English and romanized European languages (all routed to English output).
  const isEnglishQuery = userQuery.length > 0 &&
    !/[\u10D0-\u10FF]/.test(userQuery) &&
    /[a-zA-Z]/.test(userQuery);

  // Show top N products — category fallback narrows the slice to same-category products
  // only, so unrelated products (e.g. tarot) cannot bleed into candle/stone responses.
  const available = context.products.filter(p => p.in_stock);
  const catFallbackHits = context.categoryFallbackHits ?? 0;
  const productSliceCount = catFallbackHits > 0 ? Math.min(catFallbackHits, 6) : 6;
  const products = available.slice(0, productSliceCount);

  // ── Translation preprocessing — architecture-level fix for Bug 1 ─────────
  // When the customer writes in English, all Georgian text fields are translated
  // to English BEFORE injection into the prompt.  Gemini copies structured data
  // verbatim (it is a data quoter, not a translator for structured facts).  The
  // only reliable fix is to ensure the PRODUCTS section contains English text.
  //
  // Photo keys use the ORIGINAL Georgian-derived slug so resolvePhotoUrls() still
  // matches (slug comparison: slug(p.name) === slug(identifier emitted by Gemini)).
  const displayProducts = isEnglishQuery
    ? products.map(translateProductForEnglish)
    : products;
  const photoNameMap: Map<string, string> | undefined = isEnglishQuery
    ? new Map(products.map(p => [p.name, translateProductForEnglish(p).name]))
    : undefined;
  // hasProducts: true only when the products in context are query-RELEVANT.
  // A signal is present when:
  //   • token retrieval found specific matches (tokenRetrievalHits > 0)
  //   • vector search found semantic matches   (vectorHits > 0)
  //   • category fallback found same-category alternatives (categoryFallbackHits > 0)
  //   • customer sent a product image          (imageSearchQuery != null)
  //   • query is a broad catalog browse        ("what do you sell?", "catalog")
  //     → broad queries always show top products; no specific category is implied.
  const hasRetrievalSignal =
    CRAFT_BROAD_QUERY_RE.test(userQuery) ||
    (context.tokenRetrievalHits  ?? 0) > 0 ||
    (context.vectorHits          ?? 0) > 0 ||
    catFallbackHits > 0 ||
    context.imageSearchQuery != null;
  const hasProducts = displayProducts.length > 0 && hasRetrievalSignal;

  const productLines = hasProducts
    ? displayProducts.map(p => {
        const sym = p.currency === 'USD' ? '$' : '₾';
        const parts: string[] = [`• ${p.name}: ${sym}${p.price}`];
        if (p.category) parts.push(p.category);
        if (p.description) parts.push((p.description as string).slice(0, 120));
        return parts.join(' | ');
      }).join('\n')
    : '(no products matched this message)';

  // Budget gap: customer stated a budget below the cheapest in-stock product
  const budgetRaw = /(\d[\d,\s]*)\s*(?:₾|\$|gel|lari|ლარ)/i.exec(userQuery);
  const customerBudget = budgetRaw ? parseFloat(budgetRaw[1].replace(/[,\s]/g, '')) : null;
  const allPrices = available.map(p => p.price);
  const minPrice = allPrices.length > 0 ? Math.min(...allPrices) : null;
  const maxPrice = allPrices.length > 0 ? Math.max(...allPrices) : null;
  const hasBudgetGap = customerBudget !== null && minPrice !== null && customerBudget < minPrice * 0.95;

  // Photo keys: all in-stock products that have images.
  // Always inject on photo-intent turns so AI can emit SHOW_PHOTOS even when retrieval
  // returned 0 results (e.g. bare "ფოტო?" with no product keyword in the message).
  // Hidden on non-photo turns when retrieval found nothing — prevents SHOW_PHOTOS on
  // vague queries like "რა ღირს" (price question with no specific product in context).
  const photoKeys = (hasProducts || opts.photoIntent) ? buildPhotoKeySection(products, photoNameMap) : '';

  // ── Conditional instruction blocks ──────────────────────────────────────────
  const modeLines: string[] = [];

  if (hasProducts && products.length >= 2) {
    modeLines.push(`PRESENT ALL: ${products.length} products matched. List every one individually with its name and price — do not omit, group, or summarize any.`);
  }

  // Category alternatives — fires when category fallback promoted same-category products
  // but no specific token/vector match existed.  The PRODUCTS section at this point
  // contains ONLY same-category items (slice capped at catFallbackHits above), making it
  // structurally impossible for Gemini to suggest unrelated categories.
  if (catFallbackHits > 0 && (context.tokenRetrievalHits ?? 0) === 0 && (context.vectorHits ?? 0) === 0) {
    modeLines.push(
      `CATEGORY ALTERNATIVES: The specific item requested is not in stock. ` +
      `The PRODUCTS listed below are same-category alternatives only. ` +
      `Acknowledge the requested item is unavailable, then present ONLY these alternatives. ` +
      `FORBIDDEN: Do not name or suggest products from any other category.`,
    );
  }

  if (opts.photoIntent) {
    modeLines.push(
      hasProducts
        ? `PHOTO REQUEST: Your ENTIRE reply must be exactly one line — SHOW_PHOTOS: <key> — copying the key verbatim from PHOTO KEYS below. No other text before or after.`
        : `PHOTO REQUEST: No product matched. Ask the customer which product they want photos of.`,
    );
  } else if (!hasProducts) {
    modeLines.push(`NO MATCH: Ask exactly one short clarifying question — type, material, zodiac sign, or budget. Do NOT name or price any specific product.`);
  }

  if (opts.buyingIntent) {
    modeLines.push(
      `BUYING INTENT: Share COMPANY INFO (address, hours, phone) so the customer knows where/how to buy. ` +
      `Do NOT ask for personal data unless the customer explicitly requests a callback. ` +
      `CALLBACK ONLY (customer says "call me", "გთხოვ დამიკავშირდე", "დამირეკეთ"): ask for name and phone in one natural sentence.`,
    );
  }

  if (opts.productDissatisfied) {
    modeLines.push(`DISSATISFIED: Customer found nothing suitable. Warmly invite to the physical shop. Share COMPANY INFO (address, hours, phone).`);
  }

  if (hasBudgetGap) {
    modeLines.push(`BUDGET GAP: Customer budget (₾${customerBudget}) is below our lowest price (₾${minPrice}–₾${maxPrice}). Acknowledge honestly, state our price range, warmly invite to visit the shop.`);
  }

  if (context.imageSearchQuery) {
    modeLines.push(`IMAGE MATCH: Customer sent a photo. The products listed below are the closest visual catalog matches.`);
  }

  // ── Assemble sections ────────────────────────────────────────────────────────
  const sections: string[] = [
    'CRAFT SHOP SALES ASSISTANT',
  ];

  if (context.businessDescription) {
    // Use English-formatted company info when customer writes English.
    // compactCompanyInfoForEnglish() deterministically translates address/hours patterns.
    const infoText = isEnglishQuery
      ? compactCompanyInfoForEnglish(context.businessDescription)
      : compactCompanyInfo(context.businessDescription);
    sections.push(`COMPANY INFO: ${infoText}`);
  }

  sections.push(
    `ROLE: Warm, knowledgeable sales assistant. Use all product attributes — material, zodiac, stones, description — to connect each product to the customer's needs personally.`,
    `DOMAIN: Only discuss this shop's products and store info. Never mention real estate, apartments, or unrelated topics.`,
    [
      `CATALOG RULE: The PRODUCTS section below is your ONLY source of facts for this message.`,
      `  • Quote prices exactly as listed — never recall a price from conversation history.`,
      `  • Only name products in the PRODUCTS list — never invent or recall a product not listed here.`,
      `  • If PRODUCTS shows "(no products matched this message)" — ask one clarifying question before naming any product or price.`,
      `CATEGORY FALLBACK: If the customer asked for a specific item that is not present in PRODUCTS:`,
      `  • Identify the semantic category of what they requested (e.g. stone → crystals/minerals; candle → candles; tarot → tarot decks).`,
      `  • Suggest ONLY alternatives from that same category found in PRODUCTS.`,
      `  • Never suggest products from an unrelated category as a substitute.`,
      `  • If no same-category products exist in PRODUCTS, briefly acknowledge the item is unavailable and ask if the customer would like to see other categories.`,
    ].join('\n'),
  );

  if (isEnglishQuery) {
    sections.push(
      [
        `DATA LANGUAGE (this turn): All product data above has been pre-translated to English.`,
        `  • Do NOT output any raw Georgian script characters in your reply.`,
        `  • If any Georgian text remains in the data, translate it naturally (e.g. "შივას ქანდაკება" → "Shiva Statue").`,
        `  • Branded English titles like "The Wild Wood Tarot" or "I am not a Doll" stay unchanged.`,
        `  • Transliterate proper names: "Ia Kargareteli" stays as-is (do not translate the meaning).`,
      ].join('\n'),
    );
  }

  if (modeLines.length > 0) {
    sections.push(modeLines.join('\n'));
  }

  sections.push(`PRODUCTS:\n${productLines}`);

  if (photoKeys) {
    sections.push(photoKeys);
  }

  return sections.join('\n\n').trim();
}
