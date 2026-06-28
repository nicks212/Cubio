import type { ProductContext } from '../types';
import { CRAFT_BROAD_QUERY_RE } from '../signals';
import { translateProductForEnglish, compactCompanyInfoForEnglish, translateToEnglish, detectReplyLanguage } from '../geoTranslation';

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
  opts: { buyingIntent?: boolean; productDissatisfied?: boolean; photoIntent?: boolean; transactional?: boolean; replyLanguage?: 'ka' | 'en'; businessType?: 'craft_shop' | 'shop' } = {},
): string {

  // Birthstone/zodiac attributes only exist for the craft_shop niche. The generic
  // `shop` type reuses this whole builder but its products never carry those fields,
  // so we omit zodiac/stone wording from the ROLE and NO MATCH lines for it.
  const hasSpecialtyAttrs = (opts.businessType ?? 'craft_shop') === 'craft_shop';

  // ── Language detection (done first — affects preprocessing of all data below) ──
  // replyLanguage is computed once upstream from the CURRENT customer message and
  // threaded in via opts; never re-derived from history. Controls product-data
  // translation and the DATA LANGUAGE block below. Falls back to the shared detector
  // if a caller omits it (still one detection implementation).
  const isEnglishQuery = (opts.replyLanguage ?? detectReplyLanguage(userQuery)) === 'en';

  const available = context.products.filter(p => p.in_stock);
  const catFallbackHits = context.categoryFallbackHits ?? 0;

  // PRODUCTS are sourced ONLY from the explicitly matched list (vector + token +
  // category fallback), already ranked best-first by loadBusinessContext. We cap at
  // 6 for token budget, but every entry is a genuine match — the list is NEVER padded
  // with arbitrary catalog rows, which is what previously let insertion-order deity
  // statues fill the empty slots on weak/ambiguous queries.
  const matched = (context.matchedProducts ?? []).filter(p => p.in_stock);

  // ONLY genuinely-matched products are ever named in a reply. A broad browse
  // ("what do you sell?") has no specific match, so we surface the shop's CATEGORY NAMES
  // (below) and ask the customer to narrow — we never dump a sample of specific products,
  // which is how the catalog's populous categories (e.g. deity statues) used to leak in.
  const isBroadBrowse = matched.length === 0 && CRAFT_BROAD_QUERY_RE.test(userQuery);
  const products = matched.slice(0, 6);

  // Distinct category names for the broad-browse overview (deduped, capped, non-empty).
  const browseCategories: string[] = [];
  if (isBroadBrowse) {
    const seenCat = new Set<string>();
    for (const p of available) {
      const cat = (p.category ?? '').trim();
      const key = cat.toLowerCase();
      if (cat && !seenCat.has(key)) { seenCat.add(key); browseCategories.push(cat); }
      if (browseCategories.length >= 8) break;
    }
  }

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
  // `products` is now empty unless there were genuine matches (or a broad browse),
  // so its non-emptiness IS the retrieval signal — no separate guard needed.
  const hasProducts = displayProducts.length > 0;

  // Product line WITHOUT the category label — the assistant must refer to products by
  // their own names, not announce/repeat the category for each item.
  const fmtLine = (p: typeof displayProducts[number]) => {
    const sym = p.currency === 'USD' ? '$' : '₾';
    const parts: string[] = [`• ${p.name}: ${sym}${p.price}`];
    if (p.description) parts.push((p.description as string).slice(0, 120));
    return parts.join(' | ');
  };

  // Split into directly-REQUESTED product(s) vs SIMILAR side-suggestions so the reply
  // can emphasize what was asked for and offer a couple of extras (set by retrieval).
  const primaryCount = Math.min(context.primaryMatchCount ?? 0, displayProducts.length);
  const hasSimilars = primaryCount >= 1 && displayProducts.length > primaryCount;

  const productLines = hasProducts
    ? displayProducts.map(fmtLine).join('\n')
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

  // Transactional turns (order/quantity/reservation/delivery/payment) must NOT lead with
  // a product dump — handled by the ORDER & LOGISTICS block below. Suppress the forced
  // "present all" listing in that case.
  if (hasProducts && !opts.transactional) {
    if (hasSimilars) {
      modeLines.push(
        `RECOMMEND: First confirm and highlight the REQUESTED product(s) by name with the exact price — this is what the customer asked about. ` +
        `Then, in your own natural words, briefly offer the SIMILAR OPTIONS as one or two extra suggestions. ` +
        `Keep it conversational — do NOT dump a flat list, and never repeat the product category for each item.`,
      );
    } else if (products.length >= 2) {
      modeLines.push(
        `PRESENT: Present each matched product by name with its exact price, naturally and conversationally. ` +
        `Refer to products by their own names; do NOT repeat the product category for each item.`,
      );
    }
  }

  // Transactional / purchase-logistics intent: the customer is discussing HOW to buy
  // (pre-order, quantity, reservation, bulk, delivery, payment), not just browsing.
  // Address that first; products are secondary context, not the lead.
  if (opts.transactional) {
    modeLines.push(
      `ORDER & LOGISTICS: The customer is discussing the purchase itself — ordering, quantity, ` +
      `pre-order, reservation, bulk, or delivery — not just browsing. Acknowledge their request ` +
      `warmly and address the ordering/quantity/logistics question FIRST, in your own words ` +
      `(confirm what's possible and ask the single most useful clarifying detail, e.g. how many or when). ` +
      `You MAY briefly mention that relevant options exist in PRODUCTS, but do NOT open with or dump a product list. ` +
      `Treat this as a serious buyer.`,
    );
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
  } else if (isBroadBrowse && browseCategories.length > 0) {
    modeLines.push(
      `CATALOG OVERVIEW: The customer is browsing broadly and named no specific item. ` +
      `Do NOT list or invent specific products. In one warm, natural sentence, mention the ` +
      `kinds of things we carry (see CATEGORIES WE CARRY below) and ask which type interests them.`,
    );
  } else if (!hasProducts) {
    modeLines.push(
      `NO MATCH (we do NOT carry the requested item): ` +
      `(1) Honestly and warmly acknowledge we don't currently have that specific item. ` +
      `(2) NEVER name, price, substitute, or hint at an unrelated product — there is genuinely no relevant product to show. ` +
      `(3) Continue the sale naturally: in one short sentence, ask what TYPE or category they're interested in ` +
      `${hasSpecialtyAttrs ? '(e.g. type, material, zodiac, occasion, or budget)' : '(e.g. type, material, occasion, or budget)'} ` +
      `and offer to show what we do have. Keep it to ~2 short, friendly sentences.`,
    );
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
    modeLines.push(
      `IMAGE: The customer sent a photo of a product. Based on what it shows, the PRODUCTS below ` +
      `are the most similar items we actually carry. Open by naturally acknowledging the kind of ` +
      `thing they're looking for, then present these as similar options from our collection and ` +
      `invite them to see photos or details. If none is an exact match, say so honestly ` +
      `("we don't have that exact piece, but here are similar ones"). ` +
      `Never claim a product is the same as the one in the photo, and never name an item not in PRODUCTS.`,
    );
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
    hasSpecialtyAttrs
      ? `ROLE: Warm, knowledgeable sales assistant. Use all product attributes — material, zodiac, stones, description — to connect each product to the customer's needs personally.`
      : `ROLE: Warm, knowledgeable sales assistant. Use all product attributes — material, description — to connect each product to the customer's needs personally.`,
    `DOMAIN: Only discuss this shop's products and store info. Never mention real estate, apartments, or unrelated topics.`,
    [
      `CATALOG RULE: The PRODUCTS section below is your ONLY source of facts for this message.`,
      `  • Quote prices exactly as listed — never recall a price from conversation history.`,
      `  • Only name products in the PRODUCTS list — never invent or recall a product not listed here.`,
      `  • If PRODUCTS shows "(no products matched this message)" — ask one clarifying question before naming any product or price.`,
      `PRESENTATION: Refer to every product by its own name with its exact price. NEVER announce or repeat the product category for each item (avoid patterns like "tarot card X tarot, tarot card Y tarot"). Sound natural and conversational — not a mechanical list.`,
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

  if (hasSimilars) {
    const requested = displayProducts.slice(0, primaryCount).map(fmtLine).join('\n');
    const similar = displayProducts.slice(primaryCount).map(fmtLine).join('\n');
    sections.push(
      `REQUESTED — what the customer asked about (confirm & highlight these, with exact price):\n${requested}\n\n` +
      `SIMILAR OPTIONS — offer briefly as a couple of extra suggestions:\n${similar}`,
    );
  } else if (isBroadBrowse && browseCategories.length > 0) {
    // Broad browse: surface category NAMES only (no specific products) so populous
    // categories can't leak specific items the customer never asked for.
    const cats = isEnglishQuery ? browseCategories.map(c => translateToEnglish(c)) : browseCategories;
    sections.push(`CATEGORIES WE CARRY (mention these naturally; do NOT name specific products):\n${cats.join(', ')}`);
  } else {
    sections.push(`PRODUCTS:\n${productLines}`);
  }

  if (photoKeys) {
    sections.push(photoKeys);
  }

  return sections.join('\n\n').trim();
}
