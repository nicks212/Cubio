// ── Business Context Types ─────────────────────────────────────────────────

export interface ApartmentContext {
  apartments: Array<{
    apartment_number: string;
    size_sq_m: number;
    floor: number;
    rooms_quantity: number;
    price_per_sq_m: number;
    total_price: number;
    status: string;
    project?: { name: string } | null;
  }>;
  businessDescription: string | null;
}

export interface ProductContext {
  products: Array<{
    name: string;
    price: number;
    category?: string | null;
    zodiac_compatibility?: string[] | null;
    birthstones?: string | null;
    material?: string | null;
    in_stock: boolean;
    images?: string[];
  }>;
  businessDescription: string | null;
}

export type BusinessContext = ApartmentContext | ProductContext;

// ── Detection Result Types ─────────────────────────────────────────────────

export interface LeadDetection {
  isLead: boolean;
  summary: string;
  meetingDate: string | null;
  meetingNotes: string | null;
}

export interface EscalationDetection {
  isEscalation: boolean;
  summary: string;
}
