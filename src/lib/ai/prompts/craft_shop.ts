import type { ProductContext } from '../types';

type ProductRow = ProductContext['products'][0];

function slugify(name: string): string {
  return name.toLowerCase().replace(/[\s-]+/g, '_').slice(0, 40);
}

function buildPhotoKeySection(products: ProductRow[]): string {
  const rows = products
    .map(p => ({
      name: p.name,
      key: slugify(p.name),
      count: p.images?.filter(u => u.startsWith('http')).length ?? 0,
    }))
    .filter(r => r.count > 0);

  if (rows.length === 0) return '';
  return `PHOTO KEYS (machine-only — never show to customer):\n${rows.map(r => `• ${r.name} => ${r.key}`).join('\n')}`;
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

  // Only show top 3 products, only essential fields
  const available = context.products.filter(p => p.in_stock);
  const products = available.slice(0, 3);
  const hasProducts = products.length > 0;

  const productLines = hasProducts
    ? products.map(p => {
        const sym = p.currency === 'USD' ? '$' : '₾';
        const parts: string[] = [`• ${p.name}: ${sym}${p.price}`];
        if (p.category) parts.push(p.category);
        // Only include a short description if present
        if (p.description) parts.push(`desc: ${p.description.slice(0, 200)}`);
        // Indicate image availability
        if (p.images && p.images.length > 0) parts.push('image: yes');
        else parts.push('image: no');
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
  const photoKeys = (hasProducts || opts.photoIntent) ? buildPhotoKeySection(available) : '';

  // ── Conditional instruction blocks ──────────────────────────────────────────
  const modeLines: string[] = [];

  if (hasProducts && products.length >= 2) {
    modeLines.push(`PRESENT ALL: ${products.length} products matched. List every one individually with its name and price — do not omit, group, or summarize any.`);
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
    sections.push(`COMPANY INFO: ${compactCompanyInfo(context.businessDescription)}`);
  }

  sections.push(
    `ROLE: Warm, knowledgeable sales assistant. Use all product attributes — material, zodiac, stones, description — to connect each product to the customer's needs personally.`,
    `DOMAIN: Only discuss this shop's products and store info. Never mention real estate, apartments, or unrelated topics.`,
    [
      `CATALOG RULE: The PRODUCTS section below is your ONLY source of facts for this message.`,
      `  • Quote prices exactly as listed — never recall a price from conversation history.`,
      `  • Only name products in the PRODUCTS list — never invent or recall a product not listed here.`,
      `  • If PRODUCTS shows "(no products matched this message)" — ask one clarifying question before naming any product or price.`,
    ].join('\n'),
  );

  if (modeLines.length > 0) {
    sections.push(modeLines.join('\n'));
  }

  sections.push(`PRODUCTS:\n${productLines}`);

  if (photoKeys) {
    sections.push(photoKeys);
  }

  return sections.join('\n\n').trim();
}
