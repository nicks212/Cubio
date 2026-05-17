-- Migration 006: Add ai_paused flag to conversations
-- This enables human takeover: when true, AI skips response generation
-- but continues to receive and store incoming messages.
-- Set to true automatically when an escalation is detected.
-- Reset to false manually by an operator to resume AI handling.

ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS ai_paused BOOLEAN DEFAULT FALSE NOT NULL;

-- Index for efficient lookup (most queries filter on company_id + status + ai_paused)
CREATE INDEX IF NOT EXISTS idx_conversations_ai_paused
  ON conversations (company_id, ai_paused)
  WHERE ai_paused = true;

-- Allow operators to update ai_paused via dashboard (RLS: company members only)
-- Existing RLS policies on conversations already cover this column.
