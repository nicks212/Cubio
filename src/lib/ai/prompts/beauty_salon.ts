import type { ServiceContext } from '../types';
import { fullCompanyInfoForEnglish, detectReplyLanguage } from '../geoTranslation';

type ServiceRow = ServiceContext['services'][0];

/**
 * Broad "what do you offer / price list" browse detector for service businesses.
 * Mirrors CRAFT_BROAD_QUERY_RE but for services/menu wording (EN + Georgian).
 */
const SERVICE_BROAD_QUERY_RE =
  /what\s+(?:services?|treatments?)\s+(?:do\s+you\s+(?:offer|have|do)|are\s+available)|what\s+do\s+you\s+(?:offer|do)|services?\s+list|price\s*list|your\s+menu|catalog|რა\s*(?:სერვის|მომსახურებ|პროცედურ)|რას\s*(?:აკეთებთ|სთავაზობთ|გვთავაზობთ)|ფასებ|პრაის|მენიუ/i;

/** Compact the free-text business_description down to address / hours / phone. */
function compactCompanyInfo(raw: string | null): string {
  if (!raw) return '';
  // FULL owner-written description (not just address/hours/phone) so temporary closures,
  // holidays, and announcements reach the AI. Whitespace-normalized, capped to 1000.
  return raw.replace(/\s+/g, ' ').trim().slice(0, 1000);
}

/**
 * Picks up to `limit` services across distinct specialist types (one per type first,
 * then fills). Used only for broad browse so the sample reflects the real range
 * rather than DB insertion order. No hardcoded type names; purely structural.
 */
function pickTypeDiverse(services: ServiceRow[], limit: number): ServiceRow[] {
  const picked: ServiceRow[] = [];
  const seen = new Set<string>();
  for (const s of services) {
    if (picked.length >= limit) break;
    const type = (s.specialist_type ?? '').trim().toLowerCase();
    if (type && seen.has(type)) continue;
    seen.add(type);
    picked.push(s);
  }
  if (picked.length < limit) {
    for (const s of services) {
      if (picked.length >= limit) break;
      if (!picked.includes(s)) picked.push(s);
    }
  }
  return picked;
}

/** "₾30", "₾30–₾50", or "" when no price is set. */
function formatPrice(s: ServiceRow): string {
  const sym = s.currency === 'USD' ? '$' : '₾';
  const from = s.price_from ?? null;
  const to = s.price_to ?? null;
  if (from != null && to != null && to !== from) return `${sym}${from}–${sym}${to}`;
  if (from != null) return `${sym}${from}`;
  if (to != null) return `${sym}${to}`;
  return '';
}

/**
 * LAYER 2 — Beauty / Aesthetics Service Business Rules.
 *
 * Flat, compact prompt mirroring buildCraftShopSystemPrompt:
 *   - context.matchedServices is pre-ranked by the deterministic retrieval engine in
 *     loadBusinessContext (token + category fallback). The SERVICES section is the ONLY
 *     source of facts → structural anti-hallucination (nothing to invent from).
 *   - Booking is INTAKE-ONLY here: the assistant collects preferences but NEVER claims
 *     a specific slot is free or confirms a booking — availability is deterministic
 *     backend logic (Availability Engine, later phase), never the model's job.
 */
export function buildBeautySalonSystemPrompt(
  context: ServiceContext,
  userQuery = '',
  opts: { replyLanguage?: 'ka' | 'en'; offerExhausted?: boolean } = {},
): string {
  const isEnglishQuery = (opts.replyLanguage ?? detectReplyLanguage(userQuery)) === 'en';
  const offerExhausted = opts.offerExhausted === true;

  const available = context.services.filter(s => s.active);
  const catFallbackHits = context.categoryFallbackHits ?? 0;

  // SERVICES come ONLY from the matched list (ranked best-first), never padded with
  // arbitrary rows. Broad browse shows a category-diverse sample of the real menu.
  const matched = (context.matchedServices ?? []).filter(s => s.active);
  const isBroadBrowse = matched.length === 0 && SERVICE_BROAD_QUERY_RE.test(userQuery);
  const services = matched.length > 0
    ? matched.slice(0, 8)
    : (isBroadBrowse ? pickTypeDiverse(available, 8) : []);
  const hasServices = services.length > 0;

  const serviceLines = hasServices
    ? services.map(s => {
        const parts: string[] = [`• ${s.name}`];
        const price = formatPrice(s);
        if (price) parts.push(price);
        if (s.duration_minutes) parts.push(`${s.duration_minutes} min`);
        if (s.specialist_type) parts.push(`by ${s.specialist_type}`);
        if (s.sessions_required && s.sessions_required > 1) parts.push(`${s.sessions_required} sessions`);
        if (s.consultation_required) parts.push('consultation required');
        if (s.description) parts.push((s.description).slice(0, 100));
        return parts.join(' | ');
      }).join('\n')
    : '(no services matched this message)';

  const specialists = context.specialists ?? [];
  const specialistLine = specialists.length > 0
    ? specialists.map(sp => sp.type ? `${sp.name} (${sp.type})` : sp.name).join(', ')
    : '';

  // ── Conditional instruction blocks ──────────────────────────────────────────
  const modeLines: string[] = [];

  // "Already answered / keeps asking" guard: the customer is restating a request we've
  // already declined and nothing relevant matched again this turn. Suppress ALL service
  // output and reply naturally — never re-run a fresh list of alternatives.
  if (offerExhausted) {
    modeLines.push(
      `ALREADY ANSWERED — the customer is asking again for a service we've already told them we ` +
      `don't offer, and nothing fits this turn either. Do NOT list, name, or suggest any service ` +
      `(there are none to offer). In ONE warm, brief, natural sentence, gently acknowledge we still ` +
      `don't provide that specific service, then either invite them to visit or contact us or ask what ` +
      `OTHER area (hair, nails, skincare, brows…) they'd like. Vary your wording from your previous ` +
      `reply; never repeat the same phrasing and never push more options.`,
    );
  } else {
    if (hasServices && services.length >= 2) {
      modeLines.push(`PRESENT ALL: ${services.length} services matched. List every one with its name, price, and duration — do not omit or summarize any.`);
    }

    // Category alternatives — only same-category services were promoted (no specific match).
    if (catFallbackHits > 0 && (context.tokenRetrievalHits ?? 0) === 0) {
      modeLines.push(
        `CATEGORY ALTERNATIVES: The exact service requested isn't listed. The SERVICES below are ` +
        `same-category alternatives only. Acknowledge that, then present ONLY these. ` +
        `FORBIDDEN: do not name services from any other category.`,
      );
    }

    if (!hasServices) {
      modeLines.push(
        `NO MATCH (we do NOT offer the requested service): ` +
        `(1) Honestly and warmly acknowledge we don't currently offer that specific service. ` +
        `(2) NEVER name, price, or substitute an unrelated service. ` +
        `(3) Continue naturally: in one short sentence, ask what area or concern they have ` +
        `(e.g. hair, nails, skincare, brows) and offer to show what we do provide. Keep it to ~2 short, friendly sentences.`,
      );
    }
  }

  // ── Availability context (deterministic backend data the assistant reasons over) ──
  const scheduleSummary = context.scheduleSummary ?? '';
  let availabilityLine = '';
  if (context.availableSlots && context.requestedDate) {
    if (context.availableSlots.length > 0) {
      const list = context.availableSlots.map(s => `${s.start} (${s.specialistName})`).join(', ');
      availabilityLine = `AVAILABLE SLOTS for ${context.requestedDate} (verified open by the system): ${list}`;
    } else {
      availabilityLine = `AVAILABLE SLOTS for ${context.requestedDate}: none open that day.`;
    }
  }

  return assemble({
    isEnglishQuery,
    businessDescription: context.businessDescription,
    specialistLine,
    scheduleSummary,
    availabilityLine,
    modeLines,
    serviceLines,
    hasServices,
    offerExhausted,
  });
}

function assemble(o: {
  isEnglishQuery: boolean;
  businessDescription: string | null;
  specialistLine: string;
  scheduleSummary: string;
  availabilityLine: string;
  modeLines: string[];
  serviceLines: string;
  hasServices: boolean;
  offerExhausted: boolean;
}): string {
  const sections: string[] = ['BEAUTY / AESTHETICS SERVICE ASSISTANT'];

  if (o.businessDescription) {
    const infoText = o.isEnglishQuery
      ? fullCompanyInfoForEnglish(o.businessDescription)
      : compactCompanyInfo(o.businessDescription);
    sections.push(
      `COMPANY INFO — the salon's own details, your authoritative background knowledge (NOT a script to read out): ${infoText}\n` +
      `  • Treat this as knowledge in your head and weave only the relevant bit into your reply NATURALLY, in your own warm words, the way one person explains to another. NEVER quote, copy, or paste sentences from it, and never repeat an announcement word-for-word. ` +
      `It may hold hours, a temporary CLOSURE/holiday, an announcement, or rules (e.g. whether pets are welcome). ` +
      `When the customer asks anything about the salon — open now or on a date, visiting, etc. — answer conversationally and fold in any relevant detail (e.g. "yes, we're open today until 9 PM — just so you know, we'll be closed Aug 7–16"). ` +
      `Never contradict this info and never invent hours/closures/terms that aren't written here.`,
    );
  }

  sections.push(
    `ROLE: Warm, knowledgeable booking assistant for a beauty/aesthetics business. Help the customer find the right service and arrange an appointment. Connect each service to their needs using its attributes (duration, price, specialist, sessions).`,
    `DOMAIN: Only discuss this business's services, specialists, and appointments. Never mention real estate or unrelated retail products.`,
    [
      `CATALOG RULE: The SERVICES section below is your ONLY source of facts for this message.`,
      `  • Quote prices and durations exactly as listed — never recall a price from history.`,
      `  • Only name services in the SERVICES list — never invent or recall a service not listed here.`,
      `  • If SERVICES shows "(no services matched this message)" — ask one clarifying question before naming any service or price.`,
      `CATEGORY FALLBACK: If the requested service isn't present, identify its category and suggest ONLY same-category alternatives from SERVICES. Never substitute an unrelated category. If none exist, say so briefly and offer to help with something else.`,
    ].join('\n'),
    [
      `BOOKING: Help the customer book naturally, collecting the desired service, preferred specialist (optional), date, time, and phone number.`,
      `  • NEVER invent times or compute availability yourself. Offer ONLY the times listed under AVAILABLE SLOTS, and only propose appointments inside the hours shown under SCHEDULE.`,
      `  • Never offer a time on a day a specialist is off/on vacation or when the business is closed. Never propose a slot that would overlap an existing one — the system has already excluded those from AVAILABLE SLOTS.`,
      `  • If AVAILABLE SLOTS shows none (or no date was given yet), ask for their preferred day and tell them which days/hours are available from SCHEDULE — do not guess specific open times.`,
      `  • Once they pick a listed slot and you have their name + phone, confirm you've noted it and the team will finalize. Ask for one missing detail at a time.`,
    ].join('\n'),
  );

  if (o.specialistLine) {
    sections.push(`SPECIALISTS: ${o.specialistLine}`);
  }

  if (o.scheduleSummary) {
    sections.push(`SCHEDULE (working days & hours — the only times you may propose):\n${o.scheduleSummary}`);
  }

  if (o.availabilityLine) {
    sections.push(o.availabilityLine);
  }

  if (o.isEnglishQuery) {
    sections.push(
      [
        `DATA LANGUAGE (this turn): Reply in English.`,
        `  • If any service name or detail is in Georgian, translate it naturally (e.g. "თმის შეჭრა" → "Haircut").`,
        `  • Keep branded names as-is; transliterate proper names.`,
      ].join('\n'),
    );
  }

  if (o.modeLines.length > 0) {
    sections.push(o.modeLines.join('\n'));
  }

  // When we've already said we don't offer this and the customer keeps asking, omit the
  // SERVICES list entirely — the ALREADY ANSWERED instruction handles the whole reply.
  if (!o.offerExhausted) {
    sections.push(`SERVICES:\n${o.serviceLines}`);
  }

  return sections.join('\n\n').trim();
}
