-- ============================================================
-- Cubio Initial Schema
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- TABLES
-- ============================================================

-- Companies
CREATE TABLE IF NOT EXISTS companies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_name TEXT NOT NULL,
  business_type TEXT CHECK (business_type IN ('real_estate', 'craft_shop')),
  ai_enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Profiles (extends auth.users)
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id UUID REFERENCES companies(id) ON DELETE SET NULL,
  full_name TEXT,
  email TEXT,
  is_admin BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Projects (real estate)
CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  location TEXT,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'planning' CHECK (status IN ('planning', 'construction', 'completed')),
  total_floors INTEGER,
  completion_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Apartments
CREATE TABLE IF NOT EXISTS apartments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  apartment_number TEXT NOT NULL,
  size_sq_m NUMERIC(10,2) NOT NULL,
  floor INTEGER NOT NULL,
  rooms_quantity INTEGER NOT NULL,
  price_per_sq_m NUMERIC(12,2) NOT NULL,
  total_price NUMERIC(14,2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'vacant' CHECK (status IN ('vacant', 'reserved', 'sold')),
  description TEXT,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Apartment images
CREATE TABLE IF NOT EXISTS apartment_images (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  apartment_id UUID NOT NULL REFERENCES apartments(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Apartment templates
CREATE TABLE IF NOT EXISTS apartment_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  size_sq_m NUMERIC(10,2) NOT NULL,
  rooms_quantity INTEGER NOT NULL,
  price_per_sq_m NUMERIC(12,2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Products (craft shop)
CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  price NUMERIC(12,2) NOT NULL,
  category TEXT,
  material TEXT,
  birthstones TEXT,
  zodiac_compatibility TEXT[] DEFAULT '{}',
  in_stock BOOLEAN NOT NULL DEFAULT true,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Product images
CREATE TABLE IF NOT EXISTS product_images (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Integrations
CREATE TABLE IF NOT EXISTS integrations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('facebook', 'instagram', 'telegram', 'whatsapp', 'viber')),
  provider_account_id TEXT NOT NULL,
  account_name TEXT NOT NULL,
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(provider, provider_account_id)
);

-- Conversations
CREATE TABLE IF NOT EXISTS conversations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  integration_id UUID REFERENCES integrations(id) ON DELETE SET NULL,
  provider TEXT NOT NULL,
  provider_conversation_id TEXT NOT NULL,
  contact_name TEXT,
  contact_phone TEXT,
  contact_email TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed', 'pending')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(company_id, provider, provider_conversation_id)
);

-- Messages
CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'agent', 'ai')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Localizations
CREATE TABLE IF NOT EXISTS localizations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  keyword TEXT NOT NULL UNIQUE,
  localization_text TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Leads
CREATE TABLE IF NOT EXISTS leads (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
  name TEXT,
  phone TEXT,
  email TEXT,
  interested_in TEXT,
  budget NUMERIC(14,2),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_profiles_company ON profiles(company_id);
CREATE INDEX IF NOT EXISTS idx_projects_company ON projects(company_id);
CREATE INDEX IF NOT EXISTS idx_apartments_company ON apartments(company_id);
CREATE INDEX IF NOT EXISTS idx_apartments_project ON apartments(project_id);
CREATE INDEX IF NOT EXISTS idx_apartments_status ON apartments(status);
CREATE INDEX IF NOT EXISTS idx_products_company ON products(company_id);
CREATE INDEX IF NOT EXISTS idx_integrations_provider_account ON integrations(provider_account_id);
CREATE INDEX IF NOT EXISTS idx_conversations_company ON conversations(company_id);
CREATE INDEX IF NOT EXISTS idx_conversations_provider ON conversations(provider, provider_conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_leads_company ON leads(company_id);

-- ============================================================
-- TRIGGERS: updated_at
-- ============================================================

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_projects_updated_at BEFORE UPDATE ON projects FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_apartments_updated_at BEFORE UPDATE ON apartments FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_products_updated_at BEFORE UPDATE ON products FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_conversations_updated_at BEFORE UPDATE ON conversations FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_localizations_updated_at BEFORE UPDATE ON localizations FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE apartments ENABLE ROW LEVEL SECURITY;
ALTER TABLE apartment_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE apartment_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE localizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;

-- Helper: get current user's company_id
CREATE OR REPLACE FUNCTION my_company_id()
RETURNS UUID AS $$
  SELECT company_id FROM profiles WHERE id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Helper: is current user admin
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
  SELECT COALESCE(is_admin, false) FROM profiles WHERE id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Companies: users see their own company; admins see all
CREATE POLICY "company_select" ON companies FOR SELECT USING (id = my_company_id() OR is_admin());
CREATE POLICY "company_update" ON companies FOR UPDATE USING (id = my_company_id() OR is_admin());

-- Profiles: users see own; admins see all
CREATE POLICY "profile_select" ON profiles FOR SELECT USING (id = auth.uid() OR is_admin());
CREATE POLICY "profile_insert" ON profiles FOR INSERT WITH CHECK (id = auth.uid());
CREATE POLICY "profile_update" ON profiles FOR UPDATE USING (id = auth.uid() OR is_admin());

-- Projects
CREATE POLICY "projects_select" ON projects FOR SELECT USING (company_id = my_company_id() OR is_admin());
CREATE POLICY "projects_insert" ON projects FOR INSERT WITH CHECK (company_id = my_company_id());
CREATE POLICY "projects_update" ON projects FOR UPDATE USING (company_id = my_company_id() OR is_admin());
CREATE POLICY "projects_delete" ON projects FOR DELETE USING (company_id = my_company_id() OR is_admin());

-- Apartments
CREATE POLICY "apartments_select" ON apartments FOR SELECT USING (company_id = my_company_id() OR is_admin());
CREATE POLICY "apartments_insert" ON apartments FOR INSERT WITH CHECK (company_id = my_company_id());
CREATE POLICY "apartments_update" ON apartments FOR UPDATE USING (company_id = my_company_id() OR is_admin());
CREATE POLICY "apartments_delete" ON apartments FOR DELETE USING (company_id = my_company_id() OR is_admin());

-- Apartment images (via apartment's company)
CREATE POLICY "apt_images_select" ON apartment_images FOR SELECT USING (
  EXISTS (SELECT 1 FROM apartments a WHERE a.id = apartment_id AND (a.company_id = my_company_id() OR is_admin()))
);
CREATE POLICY "apt_images_insert" ON apartment_images FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM apartments a WHERE a.id = apartment_id AND a.company_id = my_company_id())
);
CREATE POLICY "apt_images_delete" ON apartment_images FOR DELETE USING (
  EXISTS (SELECT 1 FROM apartments a WHERE a.id = apartment_id AND (a.company_id = my_company_id() OR is_admin()))
);

-- Apartment templates
CREATE POLICY "apt_tpl_select" ON apartment_templates FOR SELECT USING (company_id = my_company_id() OR is_admin());
CREATE POLICY "apt_tpl_insert" ON apartment_templates FOR INSERT WITH CHECK (company_id = my_company_id());
CREATE POLICY "apt_tpl_update" ON apartment_templates FOR UPDATE USING (company_id = my_company_id() OR is_admin());
CREATE POLICY "apt_tpl_delete" ON apartment_templates FOR DELETE USING (company_id = my_company_id() OR is_admin());

-- Products
CREATE POLICY "products_select" ON products FOR SELECT USING (company_id = my_company_id() OR is_admin());
CREATE POLICY "products_insert" ON products FOR INSERT WITH CHECK (company_id = my_company_id());
CREATE POLICY "products_update" ON products FOR UPDATE USING (company_id = my_company_id() OR is_admin());
CREATE POLICY "products_delete" ON products FOR DELETE USING (company_id = my_company_id() OR is_admin());

-- Product images
CREATE POLICY "prod_images_select" ON product_images FOR SELECT USING (
  EXISTS (SELECT 1 FROM products p WHERE p.id = product_id AND (p.company_id = my_company_id() OR is_admin()))
);
CREATE POLICY "prod_images_insert" ON product_images FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM products p WHERE p.id = product_id AND p.company_id = my_company_id())
);
CREATE POLICY "prod_images_delete" ON product_images FOR DELETE USING (
  EXISTS (SELECT 1 FROM products p WHERE p.id = product_id AND (p.company_id = my_company_id() OR is_admin()))
);

-- Integrations: admins manage; users read own
CREATE POLICY "integrations_select" ON integrations FOR SELECT USING (company_id = my_company_id() OR is_admin());
CREATE POLICY "integrations_all_admin" ON integrations FOR ALL USING (is_admin());

-- Conversations
CREATE POLICY "conv_select" ON conversations FOR SELECT USING (company_id = my_company_id() OR is_admin());
CREATE POLICY "conv_insert" ON conversations FOR INSERT WITH CHECK (company_id = my_company_id());
CREATE POLICY "conv_update" ON conversations FOR UPDATE USING (company_id = my_company_id() OR is_admin());

-- Messages
CREATE POLICY "msg_select" ON messages FOR SELECT USING (company_id = my_company_id() OR is_admin());
CREATE POLICY "msg_insert" ON messages FOR INSERT WITH CHECK (company_id = my_company_id());

-- Localizations: everyone reads; only admins write
CREATE POLICY "loc_select" ON localizations FOR SELECT USING (true);
CREATE POLICY "loc_all_admin" ON localizations FOR ALL USING (is_admin());

-- Leads
CREATE POLICY "leads_select" ON leads FOR SELECT USING (company_id = my_company_id() OR is_admin());
CREATE POLICY "leads_insert" ON leads FOR INSERT WITH CHECK (company_id = my_company_id());
CREATE POLICY "leads_update" ON leads FOR UPDATE USING (company_id = my_company_id() OR is_admin());

-- ============================================================
-- STORAGE BUCKETS
-- ============================================================

INSERT INTO storage.buckets (id, name, public) VALUES ('apartment-images', 'apartment-images', true) ON CONFLICT DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('product-images', 'product-images', true) ON CONFLICT DO NOTHING;

-- Storage policies
CREATE POLICY "apt_images_storage_select" ON storage.objects FOR SELECT USING (bucket_id = 'apartment-images');
CREATE POLICY "apt_images_storage_insert" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'apartment-images' AND auth.role() = 'authenticated');
CREATE POLICY "apt_images_storage_delete" ON storage.objects FOR DELETE USING (bucket_id = 'apartment-images' AND auth.role() = 'authenticated');

CREATE POLICY "prod_images_storage_select" ON storage.objects FOR SELECT USING (bucket_id = 'product-images');
CREATE POLICY "prod_images_storage_insert" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'product-images' AND auth.role() = 'authenticated');
CREATE POLICY "prod_images_storage_delete" ON storage.objects FOR DELETE USING (bucket_id = 'product-images' AND auth.role() = 'authenticated');

-- ============================================================
-- AUTH TRIGGER: auto-create profile on signup
-- ============================================================

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, email) VALUES (NEW.id, NEW.email) ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();
