import type { ProductContext } from '../types';

type ProductRow = ProductContext['products'][0];

function scoreProduct(p: ProductRow, q: string, customerBudget: number | null): number {
  let score = 0;
  // Keyword relevance
  if (q) {
    const text = `${p.name} ${p.category ?? ''} ${p.material ?? ''} ${(p.zodiac_compatibility ?? []).join(' ')} ${p.birthstones ?? ''}`.toLowerCase();
    if (text.includes(q.substring(0, 8))) score += 2;
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
export function buildCraftShopSystemPrompt(context: ProductContext, userQuery = ''): string {
  const available = context.products.filter(p => p.in_stock);
  const q = userQuery.toLowerCase();

  // Extract customer budget from userQuery (e.g. "7 gel", "₾25", "50 lari")
  const budgetRaw = /(\d[\d,\s]*)\s*(?:₾|\$|gel|lari|ლარ)/i.exec(userQuery);
  const customerBudget = budgetRaw ? parseFloat(budgetRaw[1].replace(/[,\s]/g, '')) : null;

  // Sort by combined score: keyword relevance + price proximity to budget.
  // Products within budget always appear before more expensive ones.
  const sorted = [...available].sort((a, b) => scoreProduct(b, q, customerBudget) - scoreProduct(a, q, customerBudget));
  const top3 = sorted.slice(0, 3);
  const rest = sorted.slice(3);

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
        const idSlug = p.name.toLowerCase().replace(/\s+/g, '_').slice(0, 40);
        const parts: string[] = [`• ${p.name} [id:${idSlug}]: ${sym}${p.price}`];
        if (p.category) parts.push(p.category);
        if (p.material) parts.push(p.material);
        if (p.zodiac_compatibility?.length) parts.push(`zodiac: ${p.zodiac_compatibility.join(', ')}`);
        if (p.birthstones) parts.push(`stones: ${p.birthstones}`);
        if (p.description) parts.push(`desc: ${p.description.slice(0, 80)}`);
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
  const overflowNote = rest.length > 0
    ? `\n+${rest.length} more available — ask for details or describe what you're looking for.`
    : '';

  // Backend grouping: group products sharing the same category + similar price to avoid verbose lists
  type ProdGroupKey = string;
  const prodGroups = new Map<ProdGroupKey, ProductRow[]>();
  for (const p of available) {
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
        `GROUP: ${members.length}× ${first.category ?? 'item'}${first.material ? ` (${first.material})` : ''} — ${priceStr} [${members.map(p => p.name).join(', ')}]`
      );
    }
  }
  const groupSection = groupSummaries.length > 0
    ? `\nSIMILAR GROUPS (summarize these; do NOT list each item individually):\n${groupSummaries.join('\n')}\n`
    : '';

  const businessInfo = context.businessDescription
    ? `COMPANY INFO: ${context.businessDescription}\n\n`
    : '';

  // Image match section — injected ONLY when this turn follows a customer photo upload.
  // Zero token cost on all text-only turns.
  const imageMatchSection = context.imageSearchQuery
    ? `IMAGE MATCH (this turn only): Customer sent a photo. The TOP PRODUCTS below are the closest visual matches from the catalog.
Present them as: "Based on your photo, here are the closest matches:" followed by a short list (max 3 items with price and key feature).
If the customer says it's not what they want → ask exactly ONE clarifying question about material / color / stone / style / budget. Do NOT list all products again until they answer.
NEVER suggest products that are not in the TOP PRODUCTS list below.\n\n`
    : '';

  return `CRAFT SHOP SALES ASSISTANT

${businessInfo}ROLE: Warm, creative sales assistant for a craft jewelry shop. Recommend based on zodiac, birthstones, materials, style, budget, and gift intent. Focus on meaning and beauty.
${imageMatchSection}
LEAD COLLECTION — when customer selects a product or shows buying intent (minda, I want it, I'll take this, etc.):
  Check the STATE line:
  • phone_collected:NO → ask for full name + phone/email in ONE message. Example: "სიამოვნებით! გთხოვთ გვაცნობოთ თქვენი სახელი და საკონტაქტო ნომერი." / "Happy to help! Could you share your full name and phone number?"
  • STATE shows phone:[number] → confirm ONCE: "გმადლობთ! ჩვენი წარმომადგენელი მალე დაგიკავშირდებათ." then share address/contact only if explicitly present in COMPANY INFO — never invent or assume location, hours, or phone.
  • Emoji / "yes" / thanks / single word WITHOUT a phone number → they have NOT answered — ask again politely.
  • NEVER output the confirmation line unless STATE shows an actual phone number.
  • If they say thanks/goodbye after confirmation → respond warmly, do NOT repeat the rep-contact line.

DISSATISFIED CUSTOMER — when STATE shows dissatisfied:YES:
  The customer has seen our catalog and nothing matched their needs. Do NOT list products again.
  Warmly acknowledge and invite them to the physical shop where the full collection is available.
  If COMPANY INFO contains address, working hours, or phone — share them naturally. If not present, do NOT mention or invent them.
  Example: "სამწუხაროდ, ჩვენი ონლაინ კატალოგი სრული კოლექციის მხოლოდ ნაწილია — მაღაზიაში გაცილებით მეტი არჩევანია!"
  ALSO collect their contact: if phone_collected:NO → ask for full name + phone in the SAME message so a representative can personally help them find what they need.
  If phone:[number] is already in STATE → confirm a rep will be in touch and wish them a pleasant visit.
${groupSection}
${budgetGapNote}TOP PRODUCTS${context.imageSearchQuery ? ' (closest visual matches to customer photo)' : q ? ' (matched to your message)' : ''}:
${detailedList}${overflowNote}

Only reference products listed here. Do not invent products, prices, or availability.`.trim();
}
