import { NextRequest, NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';

const ALLOWED_BUCKETS = new Set(['project-images', 'apartment-images', 'product-images']);
const ALLOWED_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const MAX_FILE_BYTES = 15 * 1024 * 1024; // 15 MB — pre-compression limit

/**
 * POST /api/upload
 * FormData: { file: File (should already be WebP-compressed), bucket: string }
 * Returns: { url: string }
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('profiles')
    .select('company_id')
    .eq('id', user.id)
    .single();
  const companyId = profile?.company_id as string | null;
  if (!companyId) return NextResponse.json({ error: 'No company' }, { status: 400 });

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 });
  }

  const file = formData.get('file') as File | null;
  const bucket = formData.get('bucket') as string | null;

  if (!file || !bucket) {
    return NextResponse.json({ error: 'Missing file or bucket' }, { status: 400 });
  }

  if (!ALLOWED_BUCKETS.has(bucket)) {
    return NextResponse.json({ error: 'Invalid bucket' }, { status: 400 });
  }

  // After client-side compression the file should be webp, but also accept input formats
  if (!ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json({ error: 'Invalid file type. Allowed: PNG, JPG, WEBP' }, { status: 400 });
  }

  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json({ error: 'File too large. Max 15 MB.' }, { status: 400 });
  }

  const ext = file.type === 'image/webp' ? 'webp' : file.type.split('/')[1];
  const uniqueId = crypto.randomUUID();
  const storagePath = `${companyId}/${uniqueId}.${ext}`;

  const arrayBuffer = await file.arrayBuffer();

  // Use admin client so upload works regardless of RLS storage policies
  const admin = createAdminClient();
  const { error: uploadError } = await admin.storage
    .from(bucket)
    .upload(storagePath, arrayBuffer, { contentType: file.type, upsert: false });

  if (uploadError) {
    console.error('[upload] Storage error:', uploadError.message);
    return NextResponse.json({ error: uploadError.message }, { status: 500 });
  }

  const { data: { publicUrl } } = admin.storage.from(bucket).getPublicUrl(storagePath);

  return NextResponse.json({ url: publicUrl });
}

/**
 * DELETE /api/upload
 * Body JSON: { bucket: string, path: string }
 * Validates that path belongs to the authenticated user's company.
 */
export async function DELETE(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('profiles')
    .select('company_id')
    .eq('id', user.id)
    .single();
  const companyId = profile?.company_id as string | null;
  if (!companyId) return NextResponse.json({ error: 'No company' }, { status: 400 });

  let body: { bucket?: string; path?: string };
  try {
    body = await request.json() as { bucket?: string; path?: string };
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { bucket, path } = body;
  if (!bucket || !path) {
    return NextResponse.json({ error: 'Missing bucket or path' }, { status: 400 });
  }

  if (!ALLOWED_BUCKETS.has(bucket)) {
    return NextResponse.json({ error: 'Invalid bucket' }, { status: 400 });
  }

  // Security: path must start with the user's company_id — prevents deleting other companies' images
  if (!path.startsWith(`${companyId}/`)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const admin = createAdminClient();
  const { error } = await admin.storage.from(bucket).remove([path]);
  if (error) {
    console.error('[upload DELETE] Storage error:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
