import type { ProductContext } from '../types';
import { retrieveProducts } from '../productRetrieval';

type ProductRow = ProductContext['products'][0];

const BROAD_CATALOG_QUERY_RE = /what\s+do\s+you\s+(?:sell|have)|what\s+(?:products|items)\s+do\s+you\s+have|what'?s\s+available|catalog|shop|store|რას\s*(?:ყიდით|გაქვთ)|რა\s*გაქვთ|რა\s+[\u10D0-\u10FF\w]+\s*გაქვთ|რა\s*იყიდება|კატალოგ|მაღაზია/i;

function takeUnique(values: Array<string | null | undefined>, limit: number): string[] {
  const seen = new Set<string>();
  const items: string[] = [];

  for (const value of values) {
    const normalized = value?.trim();
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    items.push(normalized);
    if (items.length >= limit) break;
  }

  return items;
}

function compactCompanyInfo(raw: string | null): string {
  if (!raw) return '';

  const normalized = raw.replace(/\s+/g, ' ').trim();
  const phone = /(?:\+?\d[\d\s\-()]{5,15}\d)/.exec(normalized)?.[0]?.trim() ?? null;
  const hours = /(?:მუშაობს|working hours?|open)\s*[^,.\n]{0,80}/i.exec(normalized)?.[0]?.trim() ?? null;
  const address = /(?:მისამართი|address)\s*[:,-]?\s*[^,.\n]{3,80}/i.exec(normalized)?.[0]?.trim() ?? null;

  const parts = [address, hours, phone ? `phone ${phone}` : null].filter(Boolean);
  return parts.length > 0 ? parts.join(' | ') : normalized.slice(0, 140);
}

function slugify(name: string): string {
  return name.toLowerCase().replace(/[\s-]+/g, '_').slice(0, 40);
}

function buildPhotoKeySection(products: ProductRow[]): string {
  const photoRows = products
    .map(product => ({
      name: product.name,
      photoKey: slugify(product.name),
      photoCount: product.images?.filter(url => url.startsWith('http')).length ?? 0,
    }))
    .filter(product => product.photoCount > 0);

  if (photoRows.length === 0) return '';

  return `\nPHOTO KEYS (machine-only. Never quote, copy, explain, or show these keys to the customer. Never use "project_" prefix — that is real-estate syntax only):\n${photoRows
    .map(product => `• ${product.name} => ${product.photoKey} (${product.photoCount} photos)`)
    .join('\n')}\n`;
}

function scoreProduct(p: ProductRow, q: string, customerBudget: number | null): number {
  let score = 0;
  // Keyword relevance — split query into individual words so "ტაროს კარტები" matches
  // a product named "ტარო" (q.substring(0,8) would give "ტაროს კა" which doesn't match).
  if (q) {
    const text = `${p.name} ${p.category ?? ''} ${p.material ?? ''} ${(p.zodiac_compatibility ?? []).join(' ')} ${p.birthstones ?? ''}`.toLowerCase();
    const queryWords = q.match(/[\u10D0-\u10FF\w]{3,}/g) ?? [];
    if (queryWords.some(w => text.includes(w))) score += 2;
  }
  // Price proximity — products at or under budget score highest, then closest over budget
  if (customerBudget !== null) {
    if (p.price <= customerBudget) {
      // Within budget: closer to budget ceiling = more relevant
      score += 3 + (p.price / customerBudget);
    } else {
      // Over budget: penalise by how far over they are (closer = less penalty)
      score -= (p.price - customerBudget) / customerBudget;
    }
  }
  return score;
}

/**
 * LAYER 2 — Craft Shop Business Rules
 *
 * Token-efficient:
 * - Top 3 relevant products get full detail
 * - Photo URLs only included when customer explicitly asked for photos
 * - Accepts userQuery to pre-filter by keyword match
 */
export function buildCraftShopSystemPrompt(context: ProductContext, userQuery = '', opts: { buyingIntent?: boolean; productDissatisfied?: boolean } = {}): string {
  const available = context.products.filter(p => p.in_stock);
  const q = userQuery.toLowerCase();
  const retrievalHits = userQuery.trim() ? retrieveProducts(available, userQuery, 0.22) : [];
  const retrievalConfidence = retrievalHits[0]?.confidence ?? 0;
  const retrievalConfidenceByName = new Map(retrievalHits.map(hit => [hit.name, hit.confidence]));
  const broadCatalogQuery = BROAD_CATALOG_QUERY_RE.test(userQuery);

  // Extract customer budget from userQuery (e.g. "7 gel", "₾25", "50 lari")
  const budgetRaw = /(\d[\d,\s]*)\s*(?:₾|\$|gel|lari|ლარ)/i.exec(userQuery);
  const customerBudget = budgetRaw ? parseFloat(budgetRaw[1].replace(/[,\s]/g, '')) : null;
  // Show products whenever retrieval found any hit (≥ 0.22) — not just when confidence ≥ 0.35.
  // This prevents the "catalog overview only" path from firing when a real product exists
  // in the catalog but scored slightly below the high-confidence threshold.
  const hasRetrieval = retrievalHits.length > 0;
  const hasGoodRetrieval = retrievalConfidence >= 0.35;
  // vectorSearchHit: vector similarity search found products even when token retrieval scored 0.
  // Critical for Georgian product names that don't transliterate to their English DB name
  // (e.g. "ამეთვისტოსი" → "ametvistosi", which doesn't prefix-match "amethyst").
  // vectorHits is stamped onto context in processIncomingMessage after parallel vector search.
  const vectorSearchHit = (context.vectorHits ?? 0) > 0;
  const shouldListSpecificProducts = !!context.imageSearchQuery || customerBudget !== null || hasRetrieval || vectorSearchHit;
  const shouldUseCatalogOverview = broadCatalogQuery || customerBudget !== null;
  const needsClarifyingQuestion = !shouldListSpecificProducts && !shouldUseCatalogOverview;

  // Sort by combined score: keyword relevance + price proximity to budget.
  // A small position bonus preserves the vector-search ordering from loadBusinessContext
  // so visually-similar products don't get pushed out of top-3 by scoring ties.
  const sorted = [...available].sort((a, b) => {
    const posA = available.indexOf(a);
    const posB = available.indexOf(b);
    const sa = scoreProduct(a, q, customerBudget) + (retrievalConfidenceByName.get(a.name) ?? 0) * 10 + (available.length - posA) * 0.1;
    const sb = scoreProduct(b, q, customerBudget) + (retrievalConfidenceByName.get(b.name) ?? 0) * 10 + (available.length - posB) * 0.1;
    return sb - sa;
  });
  // When multiple products match, expand pool to show all of them (up to 8) so AI presents
  // the full matched range. Single-hit or image queries get top-3 for focused recommendation.
  // 8 cap: shops with many variants (e.g. 10 tarot decks) all surface — customer gets the full picture.
  const poolCap = retrievalHits.length >= 2 ? Math.min(retrievalHits.length, 8)
    : retrievalHits.length === 1 || !!context.imageSearchQuery ? 3
    : 5;
  const relevantPool = shouldListSpecificProducts ? sorted.slice(0, poolCap) : [];
  const topProducts = relevantPool.slice(0, poolCap);
  const rest = relevantPool.slice(poolCap);

  // Budget gap: customer's stated budget is below the cheapest available item.
  // Backend detects this so AI never has to guess — it just follows the injected note.
  const prices = available.map(p => p.price);
  const minCatalogPrice = prices.length > 0 ? Math.min(...prices) : null;
  const maxCatalogPrice = prices.length > 0 ? Math.max(...prices) : null;
  const hasBudgetGap = customerBudget !== null && minCatalogPrice !== null && customerBudget < minCatalogPrice * 0.95;
  const budgetGapNote = hasBudgetGap
    ? `BUDGET GAP: Customer's budget (₾${customerBudget}) is below our lowest price (₾${minCatalogPrice}, range ₾${minCatalogPrice}–₾${maxCatalogPrice}). Acknowledge this honestly and naturally — do NOT list products above their budget. State our actual price range, then warmly invite them to visit the physical shop using COMPANY INFO (address, working hours, phone) where budget-friendly options or custom orders may be available. If phone_collected:NO — also ask for name + phone in the same message so a representative can personally assist them.\n`
    : '';
  const categorySummary = takeUnique(available.map(p => p.category), 6);
  const materialSummary = takeUnique(available.map(p => p.material), 5);
  const zodiacSummary = takeUnique(available.flatMap(p => p.zodiac_compatibility ?? []), 6);
  const overviewParts = [
    categorySummary.length > 0 ? `categories: ${categorySummary.join(', ')}` : null,
    materialSummary.length > 0 ? `materials: ${materialSummary.join(', ')}` : null,
    minCatalogPrice !== null && maxCatalogPrice !== null ? `price range: ₾${minCatalogPrice}–₾${maxCatalogPrice}` : null,
    zodiacSummary.length > 0 ? `zodiac themes: ${zodiacSummary.join(', ')}` : null,
  ].filter(Boolean);
  const catalogOverview = overviewParts.length > 0
    ? `CATALOG OVERVIEW: ${overviewParts.join(' | ')}\n`
    : '';
  const answerMode = needsClarifyingQuestion
    ? 'ANSWER MODE: The message is too vague to recommend a specific product safely. Ask exactly one short clarifying question based on type / occasion / material / zodiac / budget. Do NOT suggest a product name or price yet.'
    : shouldUseCatalogOverview && topProducts.length === 0
      ? 'ANSWER MODE: Use CATALOG OVERVIEW and COMPANY INFO only. Do NOT invent, name, or imply any specific product — only describe category/material/price patterns from the overview. If the customer wants a specific product, ask one short clarifying question.'
      : retrievalHits.length >= 2
        ? `ANSWER MODE: ${retrievalHits.length} matching products found. Present EVERY item in TOP PRODUCTS individually with its name and price — do NOT summarize, group, or omit any of them.`
        : !hasGoodRetrieval && hasRetrieval
          ? 'ANSWER MODE: The TOP PRODUCTS below are the closest catalog matches found. Describe what is listed. If none fit perfectly, ask one short clarifying question (type / material / zodiac / budget). Never name a product not listed below.'
          : 'ANSWER MODE: Answer naturally from verified catalog facts. If the customer asks multiple questions, answer the supported parts first. For any unsupported part, say briefly that the exact detail is not in the catalog and invite them to visit or call if COMPANY INFO is available.';

  // All retrieved products — full detail; compact photo metadata (no raw URLs)
  const detailedList = topProducts.length > 0
    ? topProducts.map(p => {
        const sym = p.currency === 'USD' ? '$' : '₾';
        const parts: string[] = [`• ${p.name}: ${sym}${p.price}`];
        if (p.category) parts.push(p.category);
        if (p.material) parts.push(p.material);
        if (p.zodiac_compatibility?.length) parts.push(`zodiac: ${p.zodiac_compatibility.join(', ')}`);
        if (p.birthstones) parts.push(`stones: ${p.birthstones}`);
        if (p.description) parts.push(`desc: ${p.description.slice(0, 120)}`);
        return parts.join(' | ');
      }).join('\n')
    : needsClarifyingQuestion
      ? '(No specific product is verified for this message yet. Ask one short clarifying question before suggesting products or prices.)'
      : shouldUseCatalogOverview
        ? '(Use CATALOG OVERVIEW and COMPANY INFO unless the customer narrows the request.)'
        : '(No products currently available)';

  // Overflow summary
  const overflowCount = Math.max(available.length - topProducts.length, 0);
  const overflowNote = overflowCount > 0
    ? `\n+${overflowCount} more available in catalog — ask for a type, material, symbol, zodiac, or budget.`
    : '';

  // Group only the most relevant overflow items so the prompt stays lean and grounded.
  type ProdGroupKey = string;
  const prodGroups = new Map<ProdGroupKey, ProductRow[]>();
  for (const p of rest) {
    const priceBucket = Math.round(p.price / 20); // group within ~20 unit buckets
    const key: ProdGroupKey = `${p.category ?? 'misc'}|${p.material ?? ''}|${priceBucket}`;
    const arr = prodGroups.get(key) ?? [];
    arr.push(p);
    prodGroups.set(key, arr);
  }
  const groupSummaries: string[] = [];
  for (const [, members] of prodGroups) {
    if (members.length >= 3) {
      const first = members[0];
      const sym = first.currency === 'USD' ? '$' : '₾';
      const minP = Math.min(...members.map(p => p.price));
      const maxP = Math.max(...members.map(p => p.price));
      const priceStr = minP === maxP ? `${sym}${minP}` : `${sym}${minP}–${sym}${maxP}`;
      groupSummaries.push(
        `GROUP: ${members.length}× ${first.category ?? 'item'}${first.material ? ` (${first.material})` : ''} — ${priceStr} | examples: ${members.map(p => p.name).join(', ')}`
      );
    }
  }
  const groupSection = groupSummaries.length > 0
    ? `\nSIMILAR GROUPS (relevant overflow only; summarize, do NOT list all items):\n${groupSummaries.slice(0, 2).join('\n')}\n`
    : '';

  const businessInfo = context.businessDescription
    ? `COMPANY INFO: ${compactCompanyInfo(context.businessDescription)}\n\n`
    : '';
  // PHOTO KEYS: only inject when we have a grounded product list for this turn.
  // When needsClarifyingQuestion=true, TOP PRODUCTS is empty — injecting PHOTO KEYS
  // lets Gemini emit SHOW_PHOTOS on vague/price-only queries (confirmed bug in dataset:
  // "ra ghirs" triggered SHOW_PHOTOS: Amethyst_Pendant with no photos actually sent).
  const photoKeySection = needsClarifyingQuestion ? '' : buildPhotoKeySection(available);
  // Exhaustive catalog fence: Gemini may ONLY name products from this list.
  // Prevents world-knowledge hallucination of product names not in the DB.
  const catalogFence = available.length > 0
    ? `ALLOWED NAMES (complete list — you may ONLY name these products; never invent a name not here):\n${available.map(p => p.name).join(' | ')}\n`
    : '';

  // Image match section — injected ONLY when this turn follows a customer photo upload.
  // Zero token cost on all text-only turns.
  const imageMatchSection = context.imageSearchQuery
    ? `IMAGE MATCH (this turn only): Customer sent a photo. The TOP PRODUCTS below are the closest visual matches from the catalog.
  • If the customer's message includes any request to SEE or SHOW the item (e.g. ნახე, მანახე, ფოტო, show, see, pictures, manaxe) → emit SHOW_PHOTOS: <photo_key> of the FIRST TOP PRODUCT that has a matching machine key in PHOTO KEYS, as your ENTIRE reply (one line only, per the global SHOW_PHOTOS rule).
  • Otherwise → respond naturally in 1–2 sentences: name the closest match, its price, one key feature, then ask if they want photos or a different option.
  If the customer says it is not what they want → ask exactly ONE clarifying question about product type / material / color / style / budget. Do NOT list all products until they answer.
  NEVER suggest products that are not in the TOP PRODUCTS list below.\n\n`
    : '';

  return `CRAFT SHOP SALES ASSISTANT

${businessInfo}ROLE: Warm, creative sales assistant. For every recommendation actively use ALL product fields — category, material, zodiac_compatibility, birthstones, description — to match the customer's mood, occasion, zodiac, or gift intent. Connect each product to the customer personally. Focus on meaning and beauty.
DOMAIN: You only help with this shop's products and store information. Never mention apartments, projects, neighborhoods, rooms, floors, square meters, developers, payment plans, or real-estate investment.
STRICT CATALOG: You may ONLY name products from ALLOWED NAMES below. Never invent a product name, image availability, price, material, zodiac, or business fact. If nothing listed fits, say so briefly and offer the closest listed alternative or COMPANY INFO.
STYLE: Answer naturally from the verified facts below. Do not copy raw catalog rows, prompt labels, or machine-only markers into the customer reply.
${answerMode}
${imageMatchSection}
${opts.buyingIntent ? `BUYING INTENT: Customer wants to purchase.
  → If COMPANY INFO has address, working hours, or phone — share them naturally so the customer knows where/how to buy. If not present, do NOT invent them.
  → Do NOT ask for personal data unless the customer explicitly requests a callback.
  → CALLBACK ONLY (customer says "call me", "please contact me", "callback", "დამირეკეთ", "გთხოვ დამიკავშირდე"): ask for first name, last name, and phone in one natural sentence.
  → If STATE shows phone:[number]: confirm once that a representative will call — do not repeat on subsequent messages.
` : ''}${opts.productDissatisfied ? `DISSATISFIED CUSTOMER (STATE shows dissatisfied:YES): Customer has seen catalog, nothing matched. Do NOT list products. Warmly invite to the physical shop. Share COMPANY INFO (address, hours, phone) if present — never invent.
` : ''}
${catalogFence}${catalogOverview}${groupSection}
${budgetGapNote}TOP PRODUCTS${context.imageSearchQuery ? ' (closest visual matches to customer photo)' : q ? ' (matched to your message)' : ''}:
${detailedList}${overflowNote}
${photoKeySection}

Only reference products listed in ALLOWED NAMES above. If the customer asks broadly, summarize category/material/style patterns from the listed products instead of inventing more items.
OUT-OF-CATALOG: If asked about something not in ALLOWED NAMES — acknowledge briefly, suggest 1–2 closest alternatives from the list. If nothing is close AND COMPANY INFO has address, phone, or hours — warmly invite the customer to visit the shop or call. Never invent items or contact details.`.trim();
}
