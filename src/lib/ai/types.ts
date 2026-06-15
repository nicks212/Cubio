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

export type BusinessContext = ApartmentContext | ProductContext;

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
