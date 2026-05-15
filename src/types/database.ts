// Database types matching Supabase schema

export type BusinessType = 'real_estate' | 'craft_shop';

export type ApartmentStatus = 'vacant' | 'reserved' | 'sold';

export type ProjectStatus = 'planning' | 'construction' | 'completed';

export type IntegrationProvider = 'facebook' | 'instagram' | 'telegram' | 'whatsapp' | 'viber';

export type ConversationStatus = 'open' | 'closed';

export const ZODIAC_SIGNS = [
  'Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo',
  'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces',
] as const;

export type ZodiacSign = typeof ZODIAC_SIGNS[number];

export interface Company {
  id: string;
  company_name: string;
  business_type: BusinessType | null;
  ai_enabled: boolean;
  terms_agreed: boolean;
  terms_agreed_on: string | null;
  created_at: string;
}

export interface TermsContent {
  language: string;
  content: string;
  updated_at: string;
}

export interface Profile {
  id: string;
  email: string;
  company_id: string | null;
  full_name: string | null;
  is_admin: boolean;
  created_at: string;
  company?: Company;
}

export interface Project {
  id: string;
  company_id: string;
  name: string;
  location: string | null;
  completion_date: string | null;
  status: ProjectStatus;
  images: string[];
  description: string | null;
  total_floors: number | null;
  created_at: string;
}

export interface Apartment {
  id: string;
  company_id: string;
  project_id: string;
  apartment_number: string;
  size_sq_m: number;
  floor: number;
  rooms_quantity: number;
  price_per_sq_m: number;
  total_price: number;
  status: ApartmentStatus;
  description: string | null;
  images: string[];
  created_at: string;
  deleted_at: string | null;
  project?: Project;
}

export interface ApartmentTemplate {
  id: string;
  company_id: string;
  name: string;
  size_sq_m: number;
  rooms_quantity: number;
  price_per_sq_m: number;
  images: string[];
  created_at: string;
}

export interface Product {
  id: string;
  company_id: string;
  name: string;
  description: string | null;
  birthstones: string | null;
  zodiac_compatibility: string[] | null;
  price: number;
  category: string | null;
  material: string | null;
  in_stock: boolean;
  images: string[];
  created_at: string;
  deleted_at: string | null;
}

export interface Integration {
  id: string;
  company_id: string;
  provider: IntegrationProvider;
  provider_account_id: string;
  account_name: string;
  access_token: string;
  refresh_token: string | null;
  is_active: boolean;
  created_at: string;
  company?: Company;
}

export interface Conversation {
  id: string;
  company_id: string;
  integration_id: string | null;
  provider: string;
  provider_conversation_id: string;
  contact_name: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  status: 'open' | 'closed' | 'pending';
  created_at: string;
  updated_at: string;
  messages?: Message[];
  integration?: Integration;
}

export interface Message {
  id: string;
  conversation_id: string;
  company_id: string;
  content: string;
  role: 'user' | 'agent' | 'ai';
  created_at: string;
}

export interface Localization {
  id: string;
  keyword: string;
  localization_text: string;
  created_at: string;
}

export interface Lead {
  id: string;
  company_id: string;
  conversation_id: string | null;
  name: string | null;
  phone: string | null;
  email: string | null;
  interest: string | null;
  status: 'new' | 'qualified' | 'pending' | 'lost';
  ai_handled: boolean;
  created_at: string;
}
