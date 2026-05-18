-- Migration 008: Add provider column to leads and escalations
-- Required for showing colored provider badges (Facebook/Instagram/Telegram) in the dashboard

ALTER TABLE leads ADD COLUMN IF NOT EXISTS provider TEXT;
ALTER TABLE escalations ADD COLUMN IF NOT EXISTS provider TEXT;
