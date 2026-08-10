-- Migration 020: conversation media (chat images shown in the admin/company conversation view)
--
-- Adds:
--   1) messages.image_urls — public URLs of images attached to a message (customer-sent
--      images, and product photos the AI/company sent). Empty array when text-only.
--   2) A public `conversation-media` storage bucket where customer-sent images are copied
--      (their original provider links expire). Copies are auto-deleted after ~1 month by the
--      /api/cron/cleanup-media cron, which also clears image_urls on messages older than 30 days.

ALTER TABLE messages ADD COLUMN IF NOT EXISTS image_urls TEXT[] NOT NULL DEFAULT '{}';

-- Public bucket so the stored copies load via getPublicUrl() in the dashboard <img> tags.
INSERT INTO storage.buckets (id, name, public) VALUES ('conversation-media', 'conversation-media', true) ON CONFLICT DO NOTHING;

-- Storage policies (mirror product-images). Writes/deletes happen server-side with the
-- service role, which bypasses RLS; these keep parity and allow authenticated access too.
DROP POLICY IF EXISTS "conv_media_storage_select" ON storage.objects;
CREATE POLICY "conv_media_storage_select" ON storage.objects FOR SELECT USING (bucket_id = 'conversation-media');
DROP POLICY IF EXISTS "conv_media_storage_insert" ON storage.objects;
CREATE POLICY "conv_media_storage_insert" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'conversation-media' AND auth.role() = 'authenticated');
DROP POLICY IF EXISTS "conv_media_storage_delete" ON storage.objects;
CREATE POLICY "conv_media_storage_delete" ON storage.objects FOR DELETE USING (bucket_id = 'conversation-media' AND auth.role() = 'authenticated');
