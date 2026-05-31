-- Migration 014: add keywords column to products
--
-- Businesses can populate this free-text field with additional search terms in
-- any language or script (e.g. "incense, aromatic, საკმეველი, chxiri, meditation").
-- The column feeds both the pgvector embedding and the token-based retrieval engine,
-- so retrieval quality improves automatically when the field is populated — with
-- no code changes required per business type.

