// ── Business Context Types ─────────────────────────────────────────────────

export interface ApartmentContext {
  apartments: Array<{
    apartment_number: string;
    size_sq_m: number;
    floor: number;
    rooms_quantity: number;
    price_per_sq_m: number;
    total_price: number;
    currency?: string | null;
    status: string;
    images?: string[];
    project?: { name: string; location?: string | null; description?: string | null; completion_date?: string | null; images?: string[] } | null;
  }>;
  businessDescription: string | null;
  /** Non-null when context was loaded after an image similarity search. */
  imageSearchQuery?: string | null;
}

export interface ProductContext {
  products: Array<{
    name: string;
    price: number;
    currency?: string | null;
    category?: string | null;
    zodiac_compatibility?: string[] | null;
    birthstones?: string | null;
    material?: string | null;
    in_stock: boolean;
    images?: string[];
    description?: string | null;
  }>;
  businessDescription: string | null;
  /** Non-null when context was loaded after an image similarity search. */
  imageSearchQuery?: string | null;
  /**
   * The ONLY products the prompt builder may surface for this turn — the genuinely
   * relevant matches (vector + strong token retrieval + category-level alternatives),
   * already ranked best-first. NEVER padded with arbitrary catalog rows.
   *
   * `products` above remains the full catalog (used only for SHOW_PHOTOS resolution).
   * Keeping these two arrays separate is what prevents insertion-order deity statues
   * from leaking into responses when retrieval finds few/no matches.
   */
  matchedProducts?: ProductContext['products'];
  /**
   * Number of distinct products returned by pgvector similarity search for this turn.
   * When > 0, prompt builder shows those products even when token retrieval scored them
   * below threshold — handles Georgian product names that don't transliterate to match
   * English DB names (e.g. "ამეთვისტოს გულსაკიდი" vs DB name "Amethyst Pendant").
   */
  vectorHits?: number;
  /** Number of products matched by deterministic token retrieval for this turn. */
  tokenRetrievalHits?: number;
  /**
   * Number of products promoted by category-level fallback retrieval.
   * Set when full-text retrieval returned 0 results but a primary product category
   * was identified from the query (e.g. "square shaped candles" → category = candle).
   * When > 0, the first N entries in context.products are all same-category alternatives.
   */
  categoryFallbackHits?: number;
}

/**
 * Context for service-based businesses (beauty_salon profile: salons, clinics,
 * barbers, nail/skincare studios, pet grooming). Mirrors ProductContext so the
 * existing deterministic retrieval engine (productRetrieval.ts) and prompt-builder
 * conventions can be reused without new infrastructure. `name` holds service_name
 * so service rows satisfy ProductLike for retrieval.
 */
export interface ServiceContext {
  services: Array<{
    name: string;
    description?: string | null;
    category?: string | null;
    price_from?: number | null;
    price_to?: number | null;
    currency?: string | null;
    duration_minutes?: number | null;
    sessions_required?: number | null;
    specialist_type?: string | null;
    gender_target?: string | null;
    consultation_required?: boolean | null;
    service_target?: string | null;
    active: boolean;
  }>;
  /** Active specialists the assistant may reference (name + type + languages). */
  specialists?: Array<{ name: string; type?: string | null; languages?: string[] | null }>;
  businessDescription: string | null;
  /** Non-null when context was loaded after an image similarity search. */
  imageSearchQuery?: string | null;
  /**
   * The ONLY services the prompt builder may surface this turn — genuinely relevant
   * matches (vector + strong token retrieval + category-level alternatives), ranked
   * best-first. NEVER padded with arbitrary catalog rows. `services` above stays the
   * full active list (used for broad-browse / photo-key resolution).
   */
  matchedServices?: ServiceContext['services'];
  vectorHits?: number;
  tokenRetrievalHits?: number;
  categoryFallbackHits?: number;
}

export type BusinessContext = ApartmentContext | ProductContext | ServiceContext;

// ── Detection Result Types ─────────────────────────────────────────────────

export interface LeadDetection {
  isLead: boolean;
  summary: string;
  meetingDate: string | null;
  meetingNotes: string | null;
  name: string | null;
  phone: string | null;
  email: string | null;
}

export interface EscalationDetection {
  isEscalation: boolean;
  /**
   * 1 = calm/neutral, 2 = mildly frustrated, 3 = clearly upset,
   * 4 = angry, 5 = abusive/threatening.
   * Threshold for escalation creation: >= 3.
   * Repeated questions alone (no frustration expressed) must score 1 or 2.
   */
  frustrationLevel: number;
  summary: string;
}
