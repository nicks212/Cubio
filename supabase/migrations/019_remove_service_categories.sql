-- Migration 019: Remove the redundant service-category taxonomy.
--
-- `services` previously carried TWO groupings: category_id (-> service_categories)
-- and specialist_type_id (-> specialist_types). Only specialist_type is load-bearing
-- (it gates which staff can perform a service and drives the calendar + availability
-- engine). service_categories only fed a dashboard column, a broad-browse sample
-- heuristic, and one prompt label — nothing in booking/availability/routing. Services
-- are now organized by specialist type only.
--
-- Destructive: drops the FK column then the table (CASCADE also removes the table's
-- index, updated_at trigger, and RLS policies created in 017). Salon-only — product
-- shops use the separate product_categories table (011), which is untouched.

ALTER TABLE services DROP COLUMN IF EXISTS category_id;
DROP TABLE IF EXISTS service_categories CASCADE;
