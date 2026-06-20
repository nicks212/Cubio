-- Migration 016: Add the 'beauty_salon' service-business profile.
--
-- Extends the companies.business_type CHECK constraint to allow a third profile.
-- The constraint was defined inline in 001 (auto-named companies_business_type_check),
-- so we drop and recreate it. Idempotent and non-destructive to existing rows.

ALTER TABLE companies DROP CONSTRAINT IF EXISTS companies_business_type_check;

ALTER TABLE companies
  ADD CONSTRAINT companies_business_type_check
  CHECK (business_type IN ('real_estate', 'craft_shop', 'beauty_salon'));
