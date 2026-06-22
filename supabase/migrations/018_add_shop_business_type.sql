-- Migration 018: Add the generic 'shop' business profile.
--
-- Additive only. Extends the companies.business_type CHECK constraint to allow a
-- fourth profile that reuses the existing products pipeline (same `products` table)
-- but without the birthstone/zodiac surface. The constraint was defined inline in
-- 001 and recreated in 016 (auto-named companies_business_type_check), so we drop
-- and recreate it. Idempotent and non-destructive to existing rows — no data
-- backfill and no column changes (craft_shop still uses birthstones/zodiac_compatibility).

ALTER TABLE companies DROP CONSTRAINT IF EXISTS companies_business_type_check;

ALTER TABLE companies
  ADD CONSTRAINT companies_business_type_check
  CHECK (business_type IN ('real_estate', 'craft_shop', 'beauty_salon', 'shop'));
