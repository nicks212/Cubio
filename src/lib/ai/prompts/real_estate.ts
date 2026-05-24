import type { ApartmentContext } from '../types';

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

LEAD COLLECTION — MANDATORY SEQUENCE when customer shows buying intent, wants to visit, or asks for the address/directions:
  Look at the STATE line. Follow the exact step that applies:
  • STATE has name_collected:NO → ask for their name NOW (one sentence, friendly). Do NOT give the address yet.
  • STATE has name_collected:[name] but phone_collected:NO → ask for their phone number NOW. Do NOT give the address yet.
  • STATE has both name and phone → confirm once: "გმადლობთ! ჩვენი წარმომადგენელი მალე დაგიკავშირდებათ." Then answer their question normally (address, schedule, etc.).
  • One question per turn — NEVER ask for name and phone in the same message.
  • NEVER say you already have their info and skip collecting it — always follow the STATE.
  • Buying intent triggers: "I want to visit", "I'll come", "when can I come", "where is your office", "how do I buy", "I want it", "I like it", "xval movide", "moval", "adgilze", "sad movide".
  • If they later say thanks/goodbye, respond warmly (e.g. "გთხოვთ, ნებისმიერ დროს მოგვმართეთ!") — do NOT repeat the rep-contact line.

ALWAYS follow what the customer is actually asking. If they want a different apartment, different floor, or more options → help them immediately. The customer decides — never say "we already selected an apartment for you".

AVAILABLE APARTMENTS${filterNote}:
${detailedList}${compactRest}

IMPORTANT: The lists above contain ALL available apartments. Never say there are no options on a specific floor or rooms count without checking every line above.
Only reference apartments listed here. For unlisted info, say you will check and follow up.`.trim();
}
