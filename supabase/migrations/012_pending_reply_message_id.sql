-- Migration 012: Add pending_reply_message_id to conversations
-- Used for last-writer-wins debounce: each webhook handler writes its own message UUID
-- here immediately after saving the message. The last handler to write wins.
-- After the 5s sleep, only the handler whose UUID still matches will respond.
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS pending_reply_message_id UUID;
