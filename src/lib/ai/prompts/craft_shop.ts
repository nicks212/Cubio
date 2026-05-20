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
 * - Top 5 relevant products get full detail + photo URLs
 * - Remaining products shown in ultra-compact format (no URLs)
 * - Accepts userQuery to pre-filter by keyword match
 */
export function buildCraftShopSystemPrompt(context: ProductContext, userQuery = ''): string {
  const available = context.products.filter(p => p.in_stock);
  const q = userQuery.toLowerCase();

  const sorted = [...available].sort((a, b) => scoreProduct(b, q) - scoreProduct(a, q));
  const top5 = sorted.slice(0, 5);
  const rest = sorted.slice(5);

  // Top 5 — full detail with [photos:...] metadata tag
  const detailedList = top5.length > 0
    ? top5.map(p => {
        const sym = p.currency === 'USD' ? '$' : '₾';
        const parts: string[] = [`• ${p.name}: ${sym}${p.price}`];
        if (p.category) parts.push(p.category);
        if (p.material) parts.push(p.material);
        if (p.zodiac_compatibility?.length) parts.push(`zodiac: ${p.zodiac_compatibility.join(', ')}`);
        if (p.birthstones) parts.push(`stones: ${p.birthstones}`);
        let line = parts.join(' | ');
        const photos = p.images?.filter(u => u.startsWith('http')).slice(0, 3) ?? [];
        if (photos.length) line += `\n  [photos: ${photos.join(' ')}]`;
        return line;
      }).join('\n')
    : '(No products currently available)';

  // Rest — ultra-compact, no photo URLs
  const compactRest = rest.slice(0, 15).map(p => {
    const sym = p.currency === 'USD' ? '$' : '₾';
    const parts = [`${p.name}:${sym}${p.price}`];
    if (p.category) parts.push(p.category);
    if (p.material) parts.push(p.material);
    return parts.join('/');
  }).join(' | ');

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

LEAD FLOW: When customer wants to buy — confirm product(s), provide shop contact/address, confirm inquiry received.
${groupSection}
TOP PRODUCTS${q ? ' (matched to your message)' : ''}:
${detailedList}${
    compactRest ? `\n\nMORE PRODUCTS (compact — ask for details on any):\n${compactRest}` : ''
  }

Only reference products listed here. Do not invent products, prices, or availability.`.trim();
}
