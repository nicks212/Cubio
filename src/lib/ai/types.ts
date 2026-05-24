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
  }>;
  businessDescription: string | null;
  /** Non-null when context was loaded after an image similarity search. */
  imageSearchQuery?: string | null;
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
  summary: string;
}
