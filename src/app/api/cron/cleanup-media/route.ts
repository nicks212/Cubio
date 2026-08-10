import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';

/**
 * Daily cron (see vercel.json). Enforces the 1-month retention on chat images:
 *   • deletes the stored copies in the `conversation-media` bucket for messages older than 30 days
 *   • clears `image_urls` on those messages so month-old conversations show no images
 *
 * Product-photo URLs (from the permanent `product-images` bucket) are only cleared from the
 * old message row — the catalog image itself is left untouched.
 *
 * Protected with CRON_SECRET: Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`.
 */
const RETENTION_DAYS = 30;
const CONV_MEDIA_MARKER = '/conversation-media/';

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createAdminClient();
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 3_600_000).toISOString();

  // Messages older than the cutoff that still carry images. `neq '{}'` targets non-empty
  // arrays so we don't scan the (far larger) set of text-only messages.
  const { data, error } = await supabase
    .from('messages')
    .select('id, image_urls')
    .lt('created_at', cutoff)
    .neq('image_urls', '{}')
    .limit(2000);

  if (error) {
    console.warn('[cron/cleanup-media] query failed:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (data ?? []).filter(m => Array.isArray(m.image_urls) && m.image_urls.length > 0);
  if (rows.length === 0) return NextResponse.json({ cleared: 0, objectsDeleted: 0 });

  // Collect storage paths for our own copies (provider/product URLs are skipped by the marker).
  const paths: string[] = [];
  for (const m of rows) {
    for (const url of m.image_urls as string[]) {
      const i = url.indexOf(CONV_MEDIA_MARKER);
      if (i >= 0) paths.push(url.slice(i + CONV_MEDIA_MARKER.length));
    }
  }

  if (paths.length > 0) {
    const { error: rmErr } = await supabase.storage.from('conversation-media').remove(paths);
    if (rmErr) console.warn('[cron/cleanup-media] storage remove failed (continuing):', rmErr.message);
  }

  const { error: updErr } = await supabase
    .from('messages')
    .update({ image_urls: [] })
    .in('id', rows.map(m => m.id));
  if (updErr) console.warn('[cron/cleanup-media] message update failed:', updErr.message);

  console.info(`[cron/cleanup-media] cleared ${rows.length} message(s), deleted ${paths.length} object(s)`);
  return NextResponse.json({ cleared: rows.length, objectsDeleted: paths.length });
}
