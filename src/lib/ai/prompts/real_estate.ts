import type { ApartmentContext } from '../types';

type ApartmentRow = ApartmentContext['apartments'][0];

function scoreApartment(a: ApartmentRow, wantRooms: number | null, maxPrice: number | null): number {
  let s = 0;
  if (wantRooms !== null && a.rooms_quantity === wantRooms) s += 3;
  if (maxPrice !== null) {
    if (a.total_price <= maxPrice) {
      // Within budget: closer to ceiling = more relevant
      s += 2 + (a.total_price / maxPrice);
    } else {
      // Over budget: penalise proportionally — further over = ranked lower
      s -= (a.total_price - maxPrice) / maxPrice;
    }
  }
  return s;
}

/**
 * LAYER 2 — Real Estate Business Rules
 *
 * Photos are represented as compact metadata only — no URLs in prompt.
 * AI emits SHOW_PHOTOS: <apartment_number> and backend resolves + sends images.
 */
export function buildRealEstateSystemPrompt(
  context: ApartmentContext,
  userQuery = '',
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

  // Top 3 — full detail; apartment_number hidden as internal [id:] tag at end of line.
  // AI uses [id:XXXX] only for SHOW_PHOTOS marker — never mentions it to customers.
  const detailedList = top3.length > 0
    ? top3.map(a => {
        const proj = a.project as { name: string; location?: string | null; description?: string | null; completion_date?: string | null; images?: string[] } | null;
        const sym = a.currency === 'GEL' ? '₾' : '$';
        let line = `• ${a.rooms_quantity}rm, ${a.size_sq_m}m², fl.${a.floor}, ${sym}${a.total_price.toLocaleString()}${proj?.name ? ` — ${proj.name}` : ''}`;
        if (proj?.location) line += ` | ${proj.location}`;
        if (proj?.completion_date) line += ` | ${proj.completion_date}`;
        const aptPhotoCount  = a.images?.filter(u => u.startsWith('http')).length ?? 0;
        const projPhotoCount = (proj?.images?.filter(u => u.startsWith('http')) ?? []).length;
        const totalPhotos    = aptPhotoCount + projPhotoCount;
        if (totalPhotos > 0) line += ` [has_photos:true count:${totalPhotos}]`;
        // Internal tag — backend uses this; AI must NEVER say this to customers
        line += ` [id:${a.apartment_number}]`;
        return line;
      }).join('\n')
    : '(No apartments currently available)';

  // Remaining apartments — compact but COMPLETE so AI can answer floor/rooms/price questions.
  // CRITICAL: AI must know about ALL available apartments, not just top 3.
  // Each line: fl.X, Nrm, $price — ProjectName [id:XXXX]
  const compactRest = rest.length > 0
    ? `\nALSO AVAILABLE (compact — full detail on request):\n` + rest.map(a => {
        const proj = a.project as { name?: string } | null;
        const sym = a.currency === 'GEL' ? '₾' : '$';
        return `  fl.${a.floor}, ${a.rooms_quantity}rm, ${sym}${a.total_price.toLocaleString()}${proj?.name ? ` — ${proj.name}` : ''} [id:${a.apartment_number}]`;
      }).join('\n')
    : '';

  // Budget gap: customer's stated budget is below the cheapest available apartment.
  // Detected here so AI never guesses — it just follows the injected note naturally.
  const prices = vacant.map(a => a.total_price);
  const minCatalogPrice = prices.length > 0 ? Math.min(...prices) : null;
  const maxCatalogPrice = prices.length > 0 ? Math.max(...prices) : null;
  const hasBudgetGap = maxPrice !== null && minCatalogPrice !== null && maxPrice < minCatalogPrice * 0.95;
  const budgetGapNote = hasBudgetGap
    ? `BUDGET GAP: Customer's budget (₾${maxPrice.toLocaleString()}) is below our lowest apartment price (₾${minCatalogPrice.toLocaleString()}, range ₾${minCatalogPrice.toLocaleString()}–₾${maxCatalogPrice?.toLocaleString()}). Acknowledge this honestly and naturally — do NOT recommend apartments above their budget. State our actual price range, then warmly invite them to discuss payment plans, installment options, or upcoming projects that may fit their budget. If phone_collected:NO — ask for name + phone in the same message so a sales rep can follow up personally.\n`
    : '';

  const businessInfo = context.businessDescription
    ? `COMPANY INFO: ${context.businessDescription}\n\n`
    : '';

  const filterNote = (wantRooms ?? maxPrice)
    ? ' (sorted by your preferences)'
    : ' (tell me your preferences — rooms, budget, floor — for better matches)';

  return `REAL ESTATE SALES ASSISTANT

${businessInfo}ROLE: Sales agent. Recommend by budget/rooms/floor/project. Guide toward scheduling a visit.
NEVER mention internal codes like [id:...] or [ids:...] to customers — they are machine tags only.

GOAL: Help the customer find their ideal apartment and guide them naturally toward a purchase.

LEAD COLLECTION — MANDATORY when customer shows buying intent, wants to visit, or asks for address/directions:
  Check the STATE line:
  • If STATE shows phone_collected:NO (no phone yet) → ask for BOTH full name AND phone number in ONE message.
    Example: "სიამოვნებით! გთხოვთ გვაცნობოთ თქვენი სრული სახელი და საკონტაქტო ნომერი (ტელეფონი ან ელ.ფოსტა)."
    Example EN: "Happy to help! Could you please share your full name and phone number?"
  • ONLY when STATE shows phone:[number] → output the confirmation once: "გმადლობთ! ჩვენი წარმომადგენელი მალე დაგიკავშირდებათ." then answer their question. Share address/directions only if present in COMPANY INFO — never invent or assume them.
  • If customer sends emoji/thanks/one word but NO phone → they have not answered — ask again: "გთხოვთ, გვაცნობოთ თქვენი სახელი და ნომერი — ჩვენი წარმომადგენელი დაგიკავშირდებათ!"
  • NEVER output the rep-confirmation line unless STATE shows phone:[number]. Not for emoji. Not for yes. Not for anything — only for an actual phone number.
  • If they later say thanks/goodbye after confirmation, respond warmly — do NOT repeat the rep-contact line.

ALWAYS follow what the customer is actually asking. If they want a different apartment, different floor, or more options → help them immediately. The customer decides — never say "we already selected an apartment for you".

AVAILABLE APARTMENTS${filterNote}:
${budgetGapNote}${detailedList}${compactRest}

IMPORTANT: The lists above contain ALL available apartments. Never say there are no options on a specific floor or rooms count without checking every line above.
Only reference apartments listed here. For unlisted info, say you will check and follow up.`.trim();
}
