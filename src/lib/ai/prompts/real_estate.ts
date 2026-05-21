import type { ApartmentContext } from '../types';
import type { PhotoType } from '../intentDetector';

type ApartmentRow = ApartmentContext['apartments'][0];

function scoreApartment(a: ApartmentRow, wantRooms: number | null, maxPrice: number | null): number {
  let s = 0;
  if (wantRooms !== null && a.rooms_quantity === wantRooms) s += 3;
  if (maxPrice !== null && a.total_price <= maxPrice) s += 2;
  return s;
}

/**
 * LAYER 2 — Real Estate Business Rules
 *
 * @param includePhotos - true when customer explicitly asked for photos
 * @param photoType     - whether to include apartment photos, project photos, or both
 */
export function buildRealEstateSystemPrompt(
  context: ApartmentContext,
  userQuery = '',
  includePhotos = false,
  photoType: PhotoType = 'any',
): string {
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
  const top3 = sorted.slice(0, 3);
  const rest = sorted.slice(3);

  // Top 3 — full detail; photo URLs only when customer asked for them
  const detailedList = top3.length > 0
    ? top3.map(a => {
        const proj = a.project as { name: string; location?: string | null; description?: string | null; completion_date?: string | null; images?: string[] } | null;
        const sym = a.currency === 'GEL' ? '₾' : '$';
        let line = `• Apt ${a.apartment_number}: ${a.rooms_quantity}rm, ${a.size_sq_m}m², fl.${a.floor}, ${sym}${a.total_price.toLocaleString()}${proj?.name ? ` — ${proj.name}` : ''}`;
        if (proj?.location) line += ` | ${proj.location}`;
        if (proj?.completion_date) line += ` | ${proj.completion_date}`;
        if (includePhotos) {
          const aptPhotos = a.images?.filter(u => u.startsWith('http')) ?? [];
          const projPhotos = proj?.images?.filter(u => u.startsWith('http')) ?? [];
          const photos =
            photoType === 'apartment' ? aptPhotos :
            photoType === 'project'   ? projPhotos :
            [...aptPhotos, ...projPhotos];
          const deduped = [...new Set(photos)].slice(0, 3);
          if (deduped.length) line += `\n  [photos: ${deduped.join(' ')}]`;
        }
        return line;
      }).join('\n')
    : '(No apartments currently available)';

  // Overflow summary — save tokens vs listing individually
  const overflowNote = rest.length > 0
    ? `\n+${rest.length} more available — ask for details or share preferences (rooms/budget) to narrow down.`
    : '';

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

${businessInfo}ROLE: Sales agent. Recommend by budget/rooms/floor/project. Guide toward scheduling a visit.

LEAD COLLECTION (critical): When a customer shows buying intent ("I want to visit", "I want to buy", "please contact me", "I want consultation", equivalent in Georgian/Russian), DO NOT immediately say a rep will contact them. First collect these details naturally — one question at a time, only asking what hasn't been provided yet:
  1. Budget
  2. Preferred size (m²)
  3. Preferred floor
  4. Room count
  5. Phone number
ONLY after collecting phone number AND at least budget or room count, confirm: "ჩვენი წარმომადგენელი მალე დაგიკავშირდებათ." / "Our representative will contact you shortly."
${groupSection}
AVAILABLE APARTMENTS${filterNote}:
${detailedList}${overflowNote}

Only reference apartments listed here. For unlisted info, say you will check and follow up.`.trim();
}
