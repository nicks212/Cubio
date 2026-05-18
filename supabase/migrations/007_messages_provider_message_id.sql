-- Migration 007: Add provider_message_id to messages for idempotency
-- Stores the provider's own message ID (e.g. Facebook mid) so duplicate
-- webhook deliveries of the same event are silently ignored.

ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS provider_message_id TEXT;

-- Unique per conversation to prevent duplicate processing.
-- Partial index — only rows where provider_message_id is not null.
CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_provider_message_id
  ON messages (conversation_id, provider_message_id)
  WHERE provider_message_id IS NOT NULL;
