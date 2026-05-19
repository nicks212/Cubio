-- ============================================================
-- Add currency support per product / apartment / company
-- Add per-company product categories table
-- ============================================================

-- currency stored on each product row (craft shop defaults to GEL)
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'GEL'
    CHECK (currency IN ('GEL', 'USD'));

-- currency stored on each apartment row (real estate defaults to USD)
ALTER TABLE apartments
  ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'USD'
    CHECK (currency IN ('GEL', 'USD'));

-- template inherits currency too
ALTER TABLE apartment_templates
  ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'USD'
    CHECK (currency IN ('GEL', 'USD'));

-- Per-company product categories
CREATE TABLE IF NOT EXISTS product_categories (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, name)
);

ALTER TABLE product_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pc_company_all" ON product_categories;
CREATE POLICY "pc_company_all" ON product_categories
  FOR ALL USING (
    company_id IN (
      SELECT company_id FROM profiles WHERE id = auth.uid()
    )
  );
