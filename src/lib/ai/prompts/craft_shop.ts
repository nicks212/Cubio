import type { ProductContext } from '../types';

type ProductRow = ProductContext['products'][0];

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

  // Extract customer budget from userQuery (e.g. "7 gel", "₾25", "50 lari")
  const budgetRaw = /(\d[\d,\s]*)\s*(?:₾|\$|gel|lari|ლარ)/i.exec(userQuery);
  const customerBudget = budgetRaw ? parseFloat(budgetRaw[1].replace(/[,\s]/g, '')) : null;

  // Sort by combined score: keyword relevance + price proximity to budget.
  // A small position bonus preserves the vector-search ordering from loadBusinessContext
  // so visually-similar products don't get pushed out of top-3 by scoring ties.
  const sorted = [...available].sort((a, b) => {
    const posA = available.indexOf(a);
    const posB = available.indexOf(b);
    const sa = scoreProduct(a, q, customerBudget) + (available.length - posA) * 0.1;
    const sb = scoreProduct(b, q, customerBudget) + (available.length - posB) * 0.1;
    return sb - sa;
  });
  const relevantPool = sorted.slice(0, q || context.imageSearchQuery ? 10 : 8);
  const top3 = relevantPool.slice(0, 3);
  const rest = relevantPool.slice(3);

  // Budget gap: customer's stated budget is below the cheapest available item.
  // Backend detects this so AI never has to guess — it just follows the injected note.
  const prices = available.map(p => p.price);
  const minCatalogPrice = prices.length > 0 ? Math.min(...prices) : null;
  const maxCatalogPrice = prices.length > 0 ? Math.max(...prices) : null;
  const hasBudgetGap = customerBudget !== null && minCatalogPrice !== null && customerBudget < minCatalogPrice * 0.95;
  const budgetGapNote = hasBudgetGap
    ? `BUDGET GAP: Customer's budget (₾${customerBudget}) is below our lowest price (₾${minCatalogPrice}, range ₾${minCatalogPrice}–₾${maxCatalogPrice}). Acknowledge this honestly and naturally — do NOT list products above their budget. State our actual price range, then warmly invite them to visit the physical shop using COMPANY INFO (address, working hours, phone) where budget-friendly options or custom orders may be available. If phone_collected:NO — also ask for name + phone in the same message so a representative can personally assist them.\n`
    : '';

  // Top 3 — full detail; compact photo metadata (no raw URLs)
  const detailedList = top3.length > 0
    ? top3.map(p => {
        const sym = p.currency === 'USD' ? '$' : '₾';
        const idSlug = slugify(p.name);
        const parts: string[] = [`• ${p.name} [id:${idSlug}]: ${sym}${p.price}`];
        if (p.category) parts.push(p.category);
        if (p.material) parts.push(p.material);
        if (p.zodiac_compatibility?.length) parts.push(`zodiac: ${p.zodiac_compatibility.join(', ')}`);
        if (p.birthstones) parts.push(`stones: ${p.birthstones}`);
        if (p.description) parts.push(`desc: ${p.description.slice(0, 60)}`);
        let line = parts.join(' | ');
        // Compact photo metadata — no URLs in Gemini prompt.
        // Backend resolves real URLs when AI emits SHOW_PHOTOS: <product_slug>.
        const photoCount = p.images?.filter(u => u.startsWith('http')).length ?? 0;
        if (photoCount > 0) {
          line += ` [has_photos:true count:${photoCount}]`;
        }
        return line;
      }).join('\n')
    : '(No products currently available)';

  // Overflow summary
  const overflowCount = Math.max(available.length - top3.length, 0);
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
        `GROUP: ${members.length}× ${first.category ?? 'item'}${first.material ? ` (${first.material})` : ''} — ${priceStr} [${members.map(p => `${p.name} [id:${slugify(p.name)}]`).join(', ')}]`
      );
    }
  }
  const groupSection = groupSummaries.length > 0
    ? `\nSIMILAR GROUPS (relevant overflow only; summarize, do NOT list all items):\n${groupSummaries.slice(0, 2).join('\n')}\n`
    : '';

  const businessInfo = context.businessDescription
    ? `COMPANY INFO: ${compactCompanyInfo(context.businessDescription)}\n\n`
    : '';

  // Image match section — injected ONLY when this turn follows a customer photo upload.
  // Zero token cost on all text-only turns.
  const imageMatchSection = context.imageSearchQuery
    ? `IMAGE MATCH (this turn only): Customer sent a photo. The TOP PRODUCTS below are the closest visual matches from the catalog.
  • If the customer's message includes any request to SEE or SHOW the item (e.g. ნახე, მანახე, ფოტო, show, see, pictures, manaxe) → emit SHOW_PHOTOS: <id> of the FIRST TOP PRODUCT as your ENTIRE reply (one line only, per the global SHOW_PHOTOS rule).
  • Otherwise → respond naturally in 1–2 sentences: name the closest match, its price, one key feature, then ask if they want photos or a different option.
  If the customer says it is not what they want → ask exactly ONE clarifying question about product type / material / color / style / budget. Do NOT list all products until they answer.
  NEVER suggest products that are not in the TOP PRODUCTS list below.\n\n`
    : '';

  return `CRAFT SHOP SALES ASSISTANT

${businessInfo}ROLE: Warm, creative sales assistant. For every recommendation actively use ALL product fields — category, material, zodiac_compatibility, birthstones, description — to match the customer's mood, occasion, zodiac, or gift intent. Connect each product to the customer personally. Focus on meaning and beauty.
STRICT CATALOG: Mention only products that appear below in TOP PRODUCTS or SIMILAR GROUPS. Never invent a product name, image availability, price, material, zodiac, or business fact. If nothing listed fits, say so briefly and offer the closest listed alternative or COMPANY INFO.
${imageMatchSection}
${opts.buyingIntent ? `BUYING INTENT: Customer wants to purchase.
  → If COMPANY INFO has address, working hours, or phone — share them naturally so the customer knows where/how to buy. If not present, do NOT invent them.
  → Do NOT ask for personal data unless the customer explicitly requests a callback.
  → CALLBACK ONLY (customer says "call me", "please contact me", "callback", "დამირეკეთ", "გთხოვ დამიკავშირდე"): ask for first name, last name, and phone in one natural sentence.
  → If STATE shows phone:[number]: confirm once that a representative will call — do not repeat on subsequent messages.
` : ''}${opts.productDissatisfied ? `DISSATISFIED CUSTOMER (STATE shows dissatisfied:YES): Customer has seen catalog, nothing matched. Do NOT list products. Warmly invite to the physical shop. Share COMPANY INFO (address, hours, phone) if present — never invent.
` : ''}
${groupSection}
${budgetGapNote}TOP PRODUCTS${context.imageSearchQuery ? ' (closest visual matches to customer photo)' : q ? ' (matched to your message)' : ''}:
${detailedList}${overflowNote}

Only reference products listed here. If the customer asks broadly, summarize category/material/style patterns from the listed catalog items instead of inventing more items.
OUT-OF-CATALOG: If asked about something not in TOP PRODUCTS — acknowledge briefly, suggest 1–2 closest alternatives. If nothing is close AND COMPANY INFO has address, phone, or hours — warmly invite the customer to visit the shop or call. Never invent items or contact details.`.trim();
}
