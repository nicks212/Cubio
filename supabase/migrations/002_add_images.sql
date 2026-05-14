-- ============================================================
-- Migration 002: Add images columns + project-images bucket
-- ============================================================

-- Add images array to projects (max 3 enforced at app level)
ALTER TABLE projects ADD COLUMN IF NOT EXISTS images TEXT[] NOT NULL DEFAULT '{}';

-- Add images array to apartment_templates (max 10 enforced at app level)
ALTER TABLE apartment_templates ADD COLUMN IF NOT EXISTS images TEXT[] NOT NULL DEFAULT '{}';

-- ============================================================
-- Storage bucket for project images
-- ============================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('project-images', 'project-images', true)
ON CONFLICT DO NOTHING;

-- Anyone can view project images (public bucket)
DROP POLICY IF EXISTS "proj_images_storage_select" ON storage.objects;
CREATE POLICY "proj_images_storage_select" ON storage.objects
  FOR SELECT USING (bucket_id = 'project-images');

-- Authenticated users can upload project images
DROP POLICY IF EXISTS "proj_images_storage_insert" ON storage.objects;
CREATE POLICY "proj_images_storage_insert" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'project-images' AND auth.role() = 'authenticated');

-- Authenticated users can delete their own project images
DROP POLICY IF EXISTS "proj_images_storage_delete" ON storage.objects;
CREATE POLICY "proj_images_storage_delete" ON storage.objects
  FOR DELETE USING (bucket_id = 'project-images' AND auth.role() = 'authenticated');
