-- ============================================================
-- Terms & Conditions: company agreement tracking + content
-- ============================================================

-- 1. Add terms agreement columns to companies
ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS terms_agreed BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS terms_agreed_on TIMESTAMPTZ;

-- 2. Mark all existing companies as having agreed to terms
UPDATE companies
SET terms_agreed = TRUE,
    terms_agreed_on = NOW()
WHERE terms_agreed = FALSE;

-- 3. Terms content table (one row per language)
CREATE TABLE IF NOT EXISTS terms_content (
  language CHAR(2) PRIMARY KEY,         -- 'ka' or 'en'
  content  TEXT    NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed default rows so admin can start editing immediately
INSERT INTO terms_content (language, content)
VALUES
  ('ka', ''),
  ('en', '')
ON CONFLICT (language) DO NOTHING;

-- 4. RLS
ALTER TABLE terms_content ENABLE ROW LEVEL SECURITY;

-- Public: anyone can read terms (displayed on /terms page and onboarding pullup)
CREATE POLICY "Public read terms_content"
  ON terms_content FOR SELECT
  USING (true);

-- Write handled exclusively via admin client (service role) in server actions
