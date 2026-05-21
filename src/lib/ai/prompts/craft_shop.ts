import type { ProductContext } from '../types';

type ProductRow = ProductContext['products'][0];

function scoreProduct(p: ProductRow, q: string): number {
  if (!q) return 0;
  const text = `${p.name} ${p.category ?? ''} ${p.material ?? ''} ${(p.zodiac_compatibility ?? []).join(' ')} ${p.birthstones ?? ''}`.toLowerCase();
  return text.includes(q.substring(0, 8)) ? 2 : 0;
}

/**
 * LAYER 2 — Craft Shop Business Rules
 *
 * Token-efficient:
 * - Top 3 relevant products get full detail
 * - Photo URLs only included when customer explicitly asked for photos
 * - Accepts userQuery to pre-filter by keyword match
 */
export function buildCraftShopSystemPrompt(context: ProductContext, userQuery = '', includePhotos = false): string {
  const available = context.products.filter(p => p.in_stock);
  const q = userQuery.toLowerCase();

  const sorted = [...available].sort((a, b) => scoreProduct(b, q) - scoreProduct(a, q));
  const top3 = sorted.slice(0, 3);
  const rest = sorted.slice(3);

  // Top 3 — full detail; photo URLs only when customer asked for them
  const detailedList = top3.length > 0
    ? top3.map(p => {
        const sym = p.currency === 'USD' ? '$' : '₾';
        const parts: string[] = [`• ${p.name}: ${sym}${p.price}`];
        if (p.category) parts.push(p.category);
        if (p.material) parts.push(p.material);
        if (p.zodiac_compatibility?.length) parts.push(`zodiac: ${p.zodiac_compatibility.join(', ')}`);
        if (p.birthstones) parts.push(`stones: ${p.birthstones}`);
        let line = parts.join(' | ');
        if (includePhotos) {
          const photos = p.images?.filter(u => u.startsWith('http')) ?? [];
          if (photos.length) line += `\n  [photos: ${photos.join(' ')}]`;
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

  return `CRAFT SHOP SALES ASSISTANT

${businessInfo}ROLE: Warm, creative sales assistant for a craft jewelry shop. Recommend based on zodiac, birthstones, materials, style, budget, and gift intent. Focus on meaning and beauty.

IMAGE RECOMMENDATIONS: If customer sends an image, match visual style, colors, and materials to available products.

PHOTOS FLOW: When customer asks for photos, send them immediately — do NOT wait for lead details first. After sending photos (after your PHOTOS: line), ask naturally whether they would like to order or learn more.

LEAD COLLECTION (critical): When a customer shows buying intent ("I want to buy", "I want this", "please contact me", "I want consultation", equivalent in Georgian/Russian), DO NOT immediately confirm a rep will contact them. First collect what's missing — one question at a time, only asking what hasn't been provided:
  1. Which product they want (if not clear)
  2. Any customization or special request
  3. Delivery location (if relevant)
  4. Budget (if relevant)
  5. Phone number
ONLY after collecting phone number AND the desired product, confirm: "ჩვენი წარმომადგენელი მალე დაგიკავშირდებათ." / "Our representative will contact you shortly."
${groupSection}
TOP PRODUCTS${q ? ' (matched to your message)' : ''}:
${detailedList}${overflowNote}

Only reference products listed here. Do not invent products, prices, or availability.`.trim();
}
