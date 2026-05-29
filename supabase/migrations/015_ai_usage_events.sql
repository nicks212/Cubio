-- Migration 015: Persist per-call AI token usage for monthly company reporting

CREATE TABLE IF NOT EXISTS ai_usage_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
  feature TEXT NOT NULL,
  model TEXT NOT NULL,
  input_tokens INTEGER,
  output_tokens INTEGER,
  total_tokens INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_usage_events_company_created_at
  ON ai_usage_events(company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_usage_events_conversation_created_at
  ON ai_usage_events(conversation_id, created_at DESC);

ALTER TABLE ai_usage_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ai_usage_events_select" ON ai_usage_events;
CREATE POLICY "ai_usage_events_select"
  ON ai_usage_events FOR SELECT
  USING (company_id = my_company_id() OR is_admin());