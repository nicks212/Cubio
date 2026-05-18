-- Migration 009: Track whether photos have been sent in a conversation
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS photos_sent BOOLEAN DEFAULT FALSE NOT NULL;
