-- Migration 021: integration delivery health
--
-- Why: an Instagram access token expired on 2026-08-12 and the bot kept generating replies
-- that were silently dropped for five weeks. sendProviderResponse swallowed the error, and
-- the dashboard's "Connected" badge reads `is_active` — which is only ever set true at save
-- time — so the integration showed green the entire time.
--
-- Adds:
--   1) needs_reconnect — set by the webhook pipeline when a send fails with a permanent auth
--      error (Meta OAuthException 190/102/200/10, or a 401/403 from another provider).
--      Cleared whenever a new token is saved.
--   2) last_error / last_error_at — the provider's own message and when it was last seen,
--      so whoever reconnects knows what actually broke.
--
-- Deliberately NOT `is_active = false`: identifyCompany() filters on is_active, so flipping
-- it would stop resolving the company and inbound customer messages would no longer even be
-- recorded. Delivery being broken must not also lose the incoming side of the conversation.

ALTER TABLE integrations
  ADD COLUMN IF NOT EXISTS needs_reconnect BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_error      TEXT,
  ADD COLUMN IF NOT EXISTS last_error_at   TIMESTAMPTZ;

-- Dashboard reads these per company; the company_id index from 001 already covers the lookup.
COMMENT ON COLUMN integrations.needs_reconnect IS 'Delivery failed with a permanent auth error — the token must be re-issued. Cleared on token save.';
COMMENT ON COLUMN integrations.last_error      IS 'Provider error message from the most recent permanent delivery failure.';
COMMENT ON COLUMN integrations.last_error_at   IS 'When the most recent permanent delivery failure was observed.';
