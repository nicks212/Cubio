-- ============================================================
-- 005: Leads/Escalations + Business Description
-- Apply in Supabase Dashboard → SQL Editor
-- ============================================================

-- 1. Business description on companies
ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS business_description TEXT;

-- 2. Expand existing leads table with missing columns
--    (status, ai_handled, provider_nickname, summary, meeting_date, meeting_notes)
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'new'
    CHECK (status IN ('new', 'contacted', 'scheduled', 'closed')),
  ADD COLUMN IF NOT EXISTS ai_handled BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS provider_nickname TEXT,
  ADD COLUMN IF NOT EXISTS summary TEXT,
  ADD COLUMN IF NOT EXISTS meeting_date TEXT,
  ADD COLUMN IF NOT EXISTS meeting_notes TEXT;

-- Rename interested_in → interest for consistency with TypeScript type
-- (safe: interested_in may not be present in older rows, rename is idempotent)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'leads' AND column_name = 'interested_in'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'leads' AND column_name = 'interest'
  ) THEN
    ALTER TABLE leads RENAME COLUMN interested_in TO interest;
  END IF;
END;
$$;

-- 3. Escalations table
CREATE TABLE IF NOT EXISTS escalations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
  contact_name TEXT,
  contact_phone TEXT,
  contact_email TEXT,
  provider_nickname TEXT,
  summary TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'resolved', 'ignored')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index
CREATE INDEX IF NOT EXISTS idx_escalations_company ON escalations(company_id);
CREATE INDEX IF NOT EXISTS idx_leads_company_status ON leads(company_id, status);

-- updated_at trigger for escalations
DROP TRIGGER IF EXISTS trg_escalations_updated_at ON escalations;
CREATE TRIGGER trg_escalations_updated_at
  BEFORE UPDATE ON escalations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 4. RLS for escalations
ALTER TABLE escalations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "escl_select" ON escalations;
CREATE POLICY "escl_select" ON escalations
  FOR SELECT USING (company_id = my_company_id() OR is_admin());

DROP POLICY IF EXISTS "escl_insert" ON escalations;
CREATE POLICY "escl_insert" ON escalations
  FOR INSERT WITH CHECK (company_id = my_company_id() OR is_admin());

DROP POLICY IF EXISTS "escl_update" ON escalations;
CREATE POLICY "escl_update" ON escalations
  FOR UPDATE USING (company_id = my_company_id() OR is_admin());

DROP POLICY IF EXISTS "escl_delete" ON escalations;
CREATE POLICY "escl_delete" ON escalations
  FOR DELETE USING (company_id = my_company_id() OR is_admin());

-- 5. Ensure service-role (used by AI webhook pipeline) can write to leads + escalations
--    The admin client bypasses RLS, so no extra policy needed — but adding explicit
--    BYPASSRLS is not needed since createAdminClient uses service_role which already bypasses.

-- 6. RLS for leads — add insert/update policies for service-role path
--    (select already exists from 001; add insert/update/delete explicitly)
DROP POLICY IF EXISTS "leads_insert" ON leads;
CREATE POLICY "leads_insert" ON leads
  FOR INSERT WITH CHECK (company_id = my_company_id() OR is_admin());

DROP POLICY IF EXISTS "leads_update" ON leads;
CREATE POLICY "leads_update" ON leads
  FOR UPDATE USING (company_id = my_company_id() OR is_admin());

DROP POLICY IF EXISTS "leads_delete" ON leads;
CREATE POLICY "leads_delete" ON leads
  FOR DELETE USING (company_id = my_company_id() OR is_admin());
