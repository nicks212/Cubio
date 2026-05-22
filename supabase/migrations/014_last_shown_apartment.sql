-- Migration 014: Track the last apartment shown to a customer (for context-aware lead collection)
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS last_shown_apt TEXT DEFAULT NULL;
