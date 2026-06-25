import { createAdminClient } from '@/lib/supabase/server';
import type { BusinessContext, ServiceContext } from '@/lib/ai';
import { retrieveProducts, extractCategoryKeywords, retrieveProductsByCategory } from '@/lib/ai/productRetrieval';
import type { BusinessType } from '@/types/database';
import { generateAvailableSlots } from '@/lib/services/availability';
import { parseRequestedDate } from '@/lib/services/dateParse';

/** Options for context loading — used when vector similarity search pre-filtered results. */
export interface LoadContextOptions {
  /** Apartment numbers from vector search — these will be sorted to the top. */
  priorityApartmentNumbers?: string[];
  /** Product names from vector search — these will be sorted to the top. */
  priorityProductNames?: string[];
  /** Text query from image description — used for tighter text-based pre-filter fallback. */
  imageSearchQuery?: string;
  /**
   * Raw user message text — fed into deterministic product retrieval to catch
   * script-variant queries (e.g. romanized Georgian "taro" vs Georgian "ტარო").
   * Only used for product shops (craft_shop + shop); ignored for real_estate.
   */
  textQuery?: string;
}

/**
 * Loads the appropriate business context data for the AI
 * based on the company's business type, including the optional
 * business_description the company owner wrote during onboarding/settings.
 *
 * When vector similarity results are provided via `options`, those items
 * are placed at the front of the list so the prompt builder surfaces them
 * as the top-3 recommendations.
 */
export async function loadBusinessContext(
  companyId: string,
  businessType: BusinessType,
  options: LoadContextOptions = {},
): Promise<BusinessContext> {
  const supabase = createAdminClient();

  // Fetch business description alongside inventory
  const { data: company } = await supabase
    .from('companies')
    .select('business_description')
    .eq('id', companyId)
    .single();

  const businessDescription = (company?.business_description as string | null) ?? null;

  if (businessType === 'real_estate') {
    const { data: apartments, error: aptError } = await supabase
      .from('apartments')
      .select('apartment_number, size_sq_m, floor, rooms_quantity, price_per_sq_m, total_price, currency, status, images, project:projects(name, location, description, completion_date, images)')
      .eq('company_id', companyId)
      .eq('status', 'vacant')
      .is('deleted_at', null)
      .order('floor', { ascending: true })
      .limit(30);

    // Fallback: if `currency` column doesn't exist yet (migration pending), retry without it
    let finalApartments = apartments;
    if (aptError) {
      console.warn('[loadBusinessContext] apartment query failed, retrying without currency:', aptError.message);
      const { data: aptFallback } = await supabase
        .from('apartments')
        .select('apartment_number, size_sq_m, floor, rooms_quantity, price_per_sq_m, total_price, status, images, project:projects(name, location, description, completion_date, images)')
        .eq('company_id', companyId)
        .eq('status', 'vacant')
        .is('deleted_at', null)
        .order('floor', { ascending: true })
        .limit(30);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      finalApartments = aptFallback as any;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let allApartments: any[] = (finalApartments ?? []) as any[];

    // If vector search found similar apartments, bubble them to the front.
    // The prompt builder picks top-3 from the array — so these appear first.
    if (options.priorityApartmentNumbers && options.priorityApartmentNumbers.length > 0) {
      const prioritySet = new Set(options.priorityApartmentNumbers);
      const prioritized = allApartments.filter((a: { apartment_number: string }) => prioritySet.has(a.apartment_number));
      const rest        = allApartments.filter((a: { apartment_number: string }) => !prioritySet.has(a.apartment_number));
      allApartments = [...prioritized, ...rest];
      console.info(`[loadBusinessContext] ${prioritized.length} priority apartments from vector search surfaced to top`);
    }

    return { apartments: allApartments, businessDescription };
  }

  // ── Beauty salon / service business ─────────────────────────────────────────
  // Loads the company's active SERVICES (+ specialists) and runs the SAME deterministic
  // retrieval engine used for products (token + category fallback). Fully isolated from
  // the product/apartment paths — beauty_salon never touches the catalog code below.
  if (businessType === 'beauty_salon') {
    return loadServiceContext(supabase, companyId, businessDescription, options);
  }

  // Fetch up to 20 products — enough for retrieval ranking without loading the entire catalog.
  // Vector/token retrieval promotes the best matches to the front; prompt builder slices to 6.
  // Load up to 200 products without an alphabetical ordering bias.
  // ORDER BY name ASC caused Latin-script products (tarot, crystals) to always precede
  // Georgian-script products (jewelry, candles) in the 20-item window, silently
  // excluding entire categories before retrieval even started.
  const { data: products, error: prodError } = await supabase
    .from('products')
    .select('name, price, currency, category, in_stock, images, description')
    .eq('company_id', companyId)
    .eq('in_stock', true)
    .is('deleted_at', null)
    .limit(200);

  // Fallback: if `currency` column doesn't exist yet (migration pending), retry without it
  let finalProducts = products;
  if (prodError) {
    console.warn('[loadBusinessContext] product query failed, retrying without currency:', prodError.message);
    const { data: prodFallback } = await supabase
      .from('products')
      .select('name, price, category, in_stock, images, description')
      .eq('company_id', companyId)
      .eq('in_stock', true)
      .is('deleted_at', null)
      .limit(200);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    finalProducts = prodFallback as any;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let allProducts: any[] = (finalProducts ?? []) as any[];

  // If vector search found similar products, bubble them to the front.
  if (options.priorityProductNames && options.priorityProductNames.length > 0) {
    const prioritySet = new Set(options.priorityProductNames.map(n => n.toLowerCase()));
    const prioritized = allProducts.filter((p: { name: string }) => prioritySet.has(p.name.toLowerCase()));
    const rest        = allProducts.filter((p: { name: string }) => !prioritySet.has(p.name.toLowerCase()));
    allProducts = [...prioritized, ...rest];
    console.info(`[loadBusinessContext] ${prioritized.length} priority products from vector search surfaced to top`);
  }

  // ── Build the explicit matched-products list ────────────────────────────────
  // This is the ONLY list the prompt may surface. It contains genuinely relevant
  // products in best-first order: vector matches → strong token matches → same-
  // category alternatives → (last) weak best-effort token hits. It is NEVER padded
  // with arbitrary catalog rows, so insertion-order items (e.g. the deity statues
  // created first) cannot leak into a response when retrieval finds few/no matches.
  //
  // STRONG_RETRIEVAL_SCORE tracks the scoring engine: a single category/description
  // token scores 2.5; two tokens or a full category/name match score >= 5; exact or
  // "name contains query" score 8–10. So < 5 means only a weak coincidental hit —
  // which must NOT be treated as a confident match, and must NOT suppress the
  // category fallback below.
  const STRONG_RETRIEVAL_SCORE = 5.0;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const byName = (name: string): any => allProducts.find((p: any) => p.name.toLowerCase() === name.toLowerCase());
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const matched: any[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pushUnique = (p: any) => { if (p && !matched.some(m => m.name.toLowerCase() === p.name.toLowerCase())) matched.push(p); };

  let tokenRetrievalHitCount = 0;
  let categoryFallbackHitCount = 0;
  // How many of the leading matched products are the directly-requested item(s)
  // (vector + strong token). Products after this index are "similar" side-suggestions.
  let primaryMatchCount = 0;

  // The token + category retrieval fallbacks run on the user's caption when present,
  // otherwise on the image description produced by vision. This gives an image-only
  // message the SAME vector → token → category cascade as a text query: when the image
  // vector search misses (cross-language gap, or cosine below the 0.25 threshold),
  // category retrieval can still surface same-category alternatives ("we don't have
  // that exact piece, but here are similar bracelets"). Reuses the existing retrieval
  // engine verbatim — no image-specific rules, no hardcoded categories.
  const retrievalQuery = (options.textQuery?.trim() || options.imageSearchQuery?.trim()) || undefined;
  const retrievalSource = options.textQuery?.trim() ? 'text' : (options.imageSearchQuery?.trim() ? 'image' : 'none');

  // 1. Vector priority (image similarity) — strongest signal.
  if (options.priorityProductNames?.length) {
    for (const n of options.priorityProductNames) pushUnique(byName(n));
  }

  // 2. Token retrieval — only when vector did not pre-filter. ONLY confident matches
  //    (strong score) are surfaced. A weak top score is intentionally dropped (no
  //    best-effort fallback) so it becomes NO_RELEVANT_MATCH rather than an unrelated
  //    recommendation. Same-category alternatives can still fire below (step 3).
  if (!options.priorityProductNames?.length && retrievalQuery) {
    const retrievalHits = retrieveProducts(allProducts, retrievalQuery);
    const topScore = retrievalHits[0]?.score ?? 0;
    if (retrievalHits.length > 0) {
      const t = retrievalHits[0];
      console.info(`[loadBusinessContext] retrieval[${retrievalSource}]: ${retrievalHits.length} hit(s) for "${retrievalQuery.slice(0, 40)}" — top "${t.name}" score=${topScore.toFixed(1)} conf=${t.confidence.toFixed(2)} reason=${t.reason}`);
    } else {
      console.info(`[loadBusinessContext] retrieval[${retrievalSource}]: no matches above threshold for "${retrievalQuery.slice(0, 40)}"`);
    }
    // STRICT RELEVANCE GATE: only a confident token match counts as the requested product.
    if (topScore >= STRONG_RETRIEVAL_SCORE) {
      for (const h of retrievalHits) pushUnique(byName(h.name));
      tokenRetrievalHitCount = retrievalHits.length;
    }
  }

  // Snapshot: everything matched so far (vector + strong token) is the directly
  // REQUESTED product(s). Anything appended after this point is a similar suggestion.
  primaryMatchCount = matched.length;

  // 3. Category-level fallback — now fires whenever no STRONG match exists yet
  //    (zero hits OR only weak hits). Surfaces same-category alternatives so a
  //    weak coincidental hit can no longer block "we don't have X, but here are
  //    other <category>" behaviour. Runs on the caption or, for image-only messages,
  //    on the vision description — so a photo of a bracelet still yields bracelets.
  if (matched.length === 0 && retrievalQuery) {
    const catPatterns = extractCategoryKeywords(retrievalQuery);
    if (catPatterns) {
      const catHits = retrieveProductsByCategory(allProducts, catPatterns);
      if (catHits.length > 0) {
        categoryFallbackHitCount = catHits.length;
        for (const h of catHits) pushUnique(byName(h.name));
        console.info(`[loadBusinessContext] category-fallback[${retrievalSource}]: ${catHits.length} same-category alternative(s) for "${retrievalQuery.slice(0, 40)}" patterns=[${catPatterns.slice(0, 3).join(', ')}]`);
      } else {
        console.info(`[loadBusinessContext] category-fallback[${retrievalSource}]: no products matched patterns [${catPatterns.slice(0, 3).join(', ')}]`);
      }
    }
  }

  // 4. NO_RELEVANT_MATCH — a specific item was requested but nothing confident matched
  //    (no strong vector, no strong token, no same-category alternative). We deliberately
  //    surface ZERO products so the prompt's NO MATCH recovery flow honestly says we don't
  //    carry it and asks what category the customer wants. Weak coincidental hits are NEVER
  //    passed to the model — this is what permanently prevents irrelevant recommendations.
  if (matched.length === 0 && retrievalQuery) {
    console.info(`[loadBusinessContext] NO_RELEVANT_MATCH for "${retrievalQuery.slice(0, 40)}" — surfacing 0 products (recovery flow)`);
  }

  // 5. Similar side-suggestions — when we DID find the requested product(s), append a
  //    few same-category items so the assistant can emphasize the requested one and
  //    then offer alternatives ("yes, we have the Doll Tarot — we also have …").
  //    Skipped when nothing specific was requested (broad browse / category fallback /
  //    weak best-effort already returns a set).
  if (primaryMatchCount > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const primaryCat = String((matched[0] as any)?.category ?? '').toLowerCase().trim();
    if (primaryCat) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sims = (allProducts as any[]).filter(p =>
        p.in_stock &&
        String(p.category ?? '').toLowerCase().trim() === primaryCat &&
        !matched.some(m => m.name.toLowerCase() === p.name.toLowerCase()),
      ).slice(0, 3);
      for (const s of sims) pushUnique(s);
      if (sims.length > 0) console.info(`[loadBusinessContext] appended ${sims.length} similar "${primaryCat}" suggestion(s) after ${primaryMatchCount} requested match(es)`);
    }
  }

  return {
    products: allProducts,
    matchedProducts: matched,
    businessDescription,
    imageSearchQuery: options.imageSearchQuery ?? null,
    ...(primaryMatchCount      > 0 ? { primaryMatchCount }                                : {}),
    ...(tokenRetrievalHitCount   > 0 ? { tokenRetrievalHits:   tokenRetrievalHitCount   } : {}),
    ...(categoryFallbackHitCount > 0 ? { categoryFallbackHits: categoryFallbackHitCount } : {}),
  };
}

// ── Service-business context loader ───────────────────────────────────────────
type ServiceRow = ServiceContext['services'][number];

/** Postgrest embeds a to-one relation as either an object or a single-element array. */
function relName(rel: unknown): string | null {
  if (Array.isArray(rel)) return (rel[0] as { name?: string } | undefined)?.name ?? null;
  return (rel as { name?: string } | null)?.name ?? null;
}

/**
 * Loads active services + specialists for a beauty_salon company and ranks the
 * services with the SAME deterministic retrieval engine used for products
 * (token retrieval → category fallback → weak best-effort). Returns a ServiceContext.
 *
 * Degrades gracefully (empty services) if the service tables aren't migrated yet,
 * so deploying the code before applying migration 017 cannot break the pipeline.
 */
async function loadServiceContext(
  supabase: ReturnType<typeof createAdminClient>,
  companyId: string,
  businessDescription: string | null,
  options: LoadContextOptions,
): Promise<ServiceContext> {
  const empty: ServiceContext = {
    services: [],
    specialists: [],
    matchedServices: [],
    businessDescription,
    imageSearchQuery: options.imageSearchQuery ?? null,
  };

  const { data: serviceRows, error: svcErr } = await supabase
    .from('services')
    .select('service_name, description, price_from, price_to, currency, duration_minutes, sessions_required, gender_target, consultation_required, service_target, active, specialist_type_id, specialist_type:specialist_types(name)')
    .eq('company_id', companyId)
    .eq('active', true)
    .is('deleted_at', null)
    .limit(200);

  if (svcErr) {
    console.warn('[loadBusinessContext] beauty_salon services query failed (tables may be unmigrated):', svcErr.message);
    return empty;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const services: ServiceRow[] = ((serviceRows ?? []) as any[]).map(r => ({
    name: r.service_name,
    description: r.description ?? null,
    price_from: r.price_from ?? null,
    price_to: r.price_to ?? null,
    currency: r.currency ?? null,
    duration_minutes: r.duration_minutes ?? null,
    sessions_required: r.sessions_required ?? null,
    specialist_type: relName(r.specialist_type),
    gender_target: r.gender_target ?? null,
    consultation_required: r.consultation_required ?? null,
    service_target: r.service_target ?? null,
    active: r.active ?? true,
  }));

  // Raw lookup (name → duration + specialist_type_id) for the availability engine.
  const rawByName = new Map<string, { duration: number | null; typeId: string | null }>(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ((serviceRows ?? []) as any[]).map(r => [String(r.service_name).toLowerCase(), { duration: r.duration_minutes ?? null, typeId: r.specialist_type_id ?? null }]),
  );

  const { data: specRows } = await supabase
    .from('specialists')
    .select('id, specialist_name, languages, specialist_type:specialist_types(name)')
    .eq('company_id', companyId)
    .eq('active', true)
    .is('deleted_at', null)
    .limit(100);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const specRowsArr = (specRows ?? []) as any[];
  const specialists = specRowsArr.map(r => ({
    name: r.specialist_name,
    type: relName(r.specialist_type),
    languages: (r.languages ?? null) as string[] | null,
  }));

  // Rank services with the existing deterministic engine. Image-vector priority for
  // services is deferred to Phase 5; for now the engine runs on the caption or the
  // image description (token retrieval → category fallback → weak best-effort).
  const STRONG = 5.0;
  const retrievalQuery = (options.textQuery?.trim() || options.imageSearchQuery?.trim()) || undefined;
  const matched: ServiceRow[] = [];
  const byName = (name: string) => services.find(s => s.name.toLowerCase() === name.toLowerCase());
  const pushUnique = (s?: ServiceRow) => { if (s && !matched.some(m => m.name.toLowerCase() === s.name.toLowerCase())) matched.push(s); };
  let tokenHits = 0;
  let catHits = 0;

  if (retrievalQuery) {
    const hits = retrieveProducts(services, retrievalQuery);
    const topScore = hits[0]?.score ?? 0;
    if (topScore >= STRONG) {
      for (const h of hits) pushUnique(byName(h.name));
      tokenHits = hits.length;
    }
    if (matched.length === 0) {
      const pats = extractCategoryKeywords(retrievalQuery);
      if (pats) {
        const ch = retrieveProductsByCategory(services, pats);
        if (ch.length > 0) {
          catHits = ch.length;
          for (const h of ch) pushUnique(byName(h.name));
        }
      }
    }
    if (matched.length === 0 && hits.length > 0) {
      for (const h of hits) pushUnique(byName(h.name));
      tokenHits = hits.length;
    }
  }

  // ── Schedule summary (working days/hours + vacations) so the assistant can reason
  //    about WHEN the business is open — it never computes this itself. ──
  let scheduleSummary: string | null = null;
  try {
    const idToName = new Map<string, string>(specRowsArr.map(r => [r.id as string, r.specialist_name as string]));
    const specIds = specRowsArr.map(r => r.id as string);
    if (specIds.length > 0) {
      const [{ data: sched }, { data: vac }] = await Promise.all([
        supabase.from('specialist_schedules').select('specialist_id, weekday, start_time, end_time').eq('company_id', companyId).in('specialist_id', specIds),
        supabase.from('specialist_vacations').select('specialist_id, start_date, end_date').eq('company_id', companyId).in('specialist_id', specIds).gte('end_date', new Date().toISOString().slice(0, 10)),
      ]);
      scheduleSummary = buildScheduleSummary(sched ?? [], vac ?? [], idToName) || null;
    }
  } catch (err) {
    console.warn('[loadBusinessContext] schedule summary failed (non-fatal):', err);
  }

  // ── Backend-computed open slots when the customer referenced a date + a service. ──
  let availableSlots: ServiceContext['availableSlots'] = null;
  let requestedDate: string | null = null;
  try {
    const date = parseRequestedDate(options.textQuery ?? '');
    const targetSvc = matched[0];
    if (date && targetSvc) {
      const raw = rawByName.get(targetSvc.name.toLowerCase());
      if (raw?.duration) {
        requestedDate = date;
        const slots = await generateAvailableSlots({
          companyId, date, durationMin: raw.duration, specialistTypeId: raw.typeId ?? null, maxSlots: 10,
        });
        availableSlots = slots.map(s => ({ specialistName: s.specialistName, start: s.start, end: s.end }));
      }
    }
  } catch (err) {
    console.warn('[loadBusinessContext] availability computation failed (non-fatal):', err);
  }

  return {
    services,
    specialists,
    matchedServices: matched,
    scheduleSummary,
    availableSlots,
    requestedDate,
    businessDescription,
    imageSearchQuery: options.imageSearchQuery ?? null,
    ...(tokenHits > 0 ? { tokenRetrievalHits: tokenHits } : {}),
    ...(catHits > 0 ? { categoryFallbackHits: catHits } : {}),
  };
}

const WD_ABBR = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WD_ORDER = [1, 2, 3, 4, 5, 6, 0]; // Monday-first

/** Compact per-specialist working-hours + vacation summary for the prompt. */
function buildScheduleSummary(
  schedules: Array<{ specialist_id: string; weekday: number; start_time: string; end_time: string }>,
  vacations: Array<{ specialist_id: string; start_date: string; end_date: string }>,
  idToName: Map<string, string>,
): string {
  const bySpec = new Map<string, Array<{ weekday: number; start: string; end: string }>>();
  for (const s of schedules) {
    const arr = bySpec.get(s.specialist_id) ?? [];
    arr.push({ weekday: s.weekday, start: s.start_time.slice(0, 5), end: s.end_time.slice(0, 5) });
    bySpec.set(s.specialist_id, arr);
  }
  const vacBySpec = new Map<string, Array<{ start: string; end: string }>>();
  for (const v of vacations) {
    const arr = vacBySpec.get(v.specialist_id) ?? [];
    arr.push({ start: v.start_date, end: v.end_date });
    vacBySpec.set(v.specialist_id, arr);
  }

  const lines: string[] = [];
  for (const [id, name] of idToName) {
    const rows = bySpec.get(id);
    if (!rows || rows.length === 0) continue;
    // Group weekdays sharing the same window.
    const byWindow = new Map<string, number[]>();
    for (const r of rows) {
      const key = `${r.start}-${r.end}`;
      const arr = byWindow.get(key) ?? [];
      arr.push(r.weekday);
      byWindow.set(key, arr);
    }
    const parts: string[] = [];
    for (const [win, wds] of byWindow) {
      const days = WD_ORDER.filter(d => wds.includes(d)).map(d => WD_ABBR[d]).join(',');
      parts.push(`${days} ${win}`);
    }
    let line = `${name}: ${parts.join('; ')}`;
    const vacs = vacBySpec.get(id);
    if (vacs && vacs.length > 0) line += ` (off: ${vacs.map(v => v.start === v.end ? v.start : `${v.start}→${v.end}`).join(', ')})`;
    lines.push(line);
  }
  return lines.join('\n');
}
