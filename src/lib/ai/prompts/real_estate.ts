import type { ApartmentContext } from '../types';

type ApartmentRow = ApartmentContext['apartments'][0];

function shortPrice(price: number, currency?: string | null): string {
  const sym = currency === 'GEL' ? '₾' : '$';
  return price >= 1000 ? `${sym}${Math.round(price / 1000)}k` : `${sym}${price}`;
}

function scoreApartment(a: ApartmentRow, wantRooms: number | null, maxPrice: number | null): number {
  let s = 0;
  if (wantRooms !== null && a.rooms_quantity === wantRooms) s += 3;
  if (maxPrice !== null && a.total_price <= maxPrice) s += 2;
  return s;
}

/**
 * LAYER 2 — Real Estate Business Rules
 *
 * Injected after global rules. Governs apartment recommendations,
 * lead qualification flow, and real estate sales behavior.
 */
export function buildRealEstateSystemPrompt(context: ApartmentContext, userQuery = ''): string {
  const vacant = context.apartments.filter(a => a.status === 'vacant');

  // Simple preference extraction from the current user message
  const q = userQuery.toLowerCase();
  const roomsMatch = q.match(/(\d)\s*(?:room|bed|ოთახ)/);
  const priceMatch = q.match(/([\d\s]{2,10})\s*(?:₾|lari|ლარ)/);
  const wantRooms = roomsMatch ? parseInt(roomsMatch[1]) : null;
  const maxPrice = priceMatch ? parseInt(priceMatch[1].replace(/\s/g, '')) : null;

  // Sort by preference match — best matches first
  const sorted = [...vacant].sort(
    (a, b) => scoreApartment(b, wantRooms, maxPrice) - scoreApartment(a, wantRooms, maxPrice)
  );
  const top5 = sorted.slice(0, 5);
  const rest = sorted.slice(5);

  // Top 5 — full detail with [photos:...] metadata tag (not inline text)
  const detailedList = top5.length > 0
    ? top5.map(a => {
        const proj = a.project as { name: string; location?: string | null; description?: string | null; completion_date?: string | null; images?: string[] } | null;
        const sym = a.currency === 'GEL' ? '₾' : '$';
        let line = `• Apt ${a.apartment_number}: ${a.rooms_quantity} rooms, ${a.size_sq_m}m², floor ${a.floor}, ${sym}${a.total_price.toLocaleString()}${proj?.name ? ` — ${proj.name}` : ''}`;
        if (proj?.location) line += ` | 📍 ${proj.location}`;
        if (proj?.completion_date) line += ` | completion: ${proj.completion_date}`;
        if (proj?.description) line += `\n  info: ${proj.description.slice(0, 80)}${proj.description.length > 80 ? '…' : ''}`;
        const photos = [
          ...(a.images?.filter(u => u.startsWith('http')) ?? []),
          ...(proj?.images?.filter(u => u.startsWith('http')) ?? []),
        ];
        const deduped = [...new Set(photos)].slice(0, 3);
        if (deduped.length) line += `\n  [photos: ${deduped.join(' ')}]`;
        return line;
      }).join('\n')
    : '(No apartments currently available)';

  // Rest — ultra-compact, no photo URLs (saves ~60 tokens per apartment)
  const compactRest = rest.slice(0, 15).map(a => {
    const proj = a.project as { name: string; location?: string | null } | null;
    return `A${a.apartment_number}:${a.rooms_quantity}br/${a.size_sq_m}m²/fl${a.floor}/${shortPrice(a.total_price, a.currency)}${
      proj?.name ? `/${proj.name}` : ''
    }${proj?.location ? `@${proj.location}` : ''}`;
  }).join(' | ');

  const businessInfo = context.businessDescription
    ? `COMPANY INFO: ${context.businessDescription}\n\n`
    : '';

  const filterNote = (wantRooms ?? maxPrice)
    ? ' (sorted by your preferences)'
    : ' (tell me your preferences — rooms, budget, floor — for better matches)';

  // Backend grouping: detect sets of highly-similar apartments to save AI tokens + avoid verbose lists
  type GroupKey = string;
  const groups = new Map<GroupKey, ApartmentRow[]>();
  for (const a of sorted) {
    const proj = a.project as { name?: string } | null;
    const priceBucket = Math.round(a.total_price / 10000); // group within $10k buckets
    const key: GroupKey = `${a.rooms_quantity}r|${priceBucket}|${proj?.name ?? ''}`;
    const arr = groups.get(key) ?? [];
    arr.push(a);
    groups.set(key, arr);
  }
  // Build a compact group-summary line for groups with 3+ similar units
  const groupSummaries: string[] = [];
  for (const [, members] of groups) {
    if (members.length >= 3) {
      const first = members[0];
      const proj = first.project as { name?: string; location?: string | null } | null;
      const sym = first.currency === 'GEL' ? '₾' : '$';
      const minPrice = Math.min(...members.map(a => a.total_price));
      const maxPrice = Math.max(...members.map(a => a.total_price));
      const priceStr = minPrice === maxPrice
        ? `${sym}${minPrice.toLocaleString()}`
        : `${sym}${minPrice.toLocaleString()}–${sym}${maxPrice.toLocaleString()}`;
      groupSummaries.push(
        `GROUP: ${members.length}× ${first.rooms_quantity}-room${proj?.name ? ` (${proj.name})` : ''}${proj?.location ? ` @${proj.location}` : ''} — ${priceStr} [apt numbers: ${members.map(a => a.apartment_number).join(', ')}]`
      );
    }
  }

  const groupSection = groupSummaries.length > 0
    ? `\nSIMILAR GROUPS (summarize these; do NOT list each unit individually):\n${groupSummaries.join('\n')}\n`
    : '';

  return `REAL ESTATE SALES ASSISTANT

${businessInfo}ROLE: Professional real estate sales agent. Recommend based on budget, room count, floor, size, project. Guide high-intent buyers toward scheduling a visit.

LEAD FLOW: When customer wants to visit/schedule/reserve — collect one at a time: preferred date → phone number → which apartment(s). Confirm a sales rep will follow up.
${groupSection}
TOP APARTMENTS${filterNote}:
${detailedList}${
    compactRest ? `\n\nMORE AVAILABLE (compact — ask for details on any):\n${compactRest}` : ''
  }

Only reference apartments listed here. For anything not listed, say you will check and follow up.`.trim();
}
