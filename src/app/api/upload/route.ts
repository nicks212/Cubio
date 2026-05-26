import { NextRequest, NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import sharp from 'sharp';

const ALLOWED_BUCKETS = new Set(['project-images', 'apartment-images', 'product-images']);
const ALLOWED_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/heic', 'image/heif']);
const MAX_FILE_BYTES = 15 * 1024 * 1024; // 15 MB — pre-compression limit
const MAX_OUTPUT_BYTES = 350 * 1024;     // 350 KB after server-side compression

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

  // iOS sometimes sends HEIC with empty or wrong MIME — detect by extension as fallback
  const fileName = file.name ?? '';
  const isHeicByExt = /\.hei[cf]$/i.test(fileName);
  const effectiveMime = (file.type === '' || file.type === 'application/octet-stream') && isHeicByExt
    ? 'image/heic'
    : file.type;

  if (!ALLOWED_TYPES.has(effectiveMime)) {
    return NextResponse.json({ error: 'Invalid file type. Allowed: PNG, JPG, WEBP, HEIC' }, { status: 400 });
  }

  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json({ error: 'File too large. Max 15 MB.' }, { status: 400 });
  }

  const arrayBuffer = await file.arrayBuffer();
  const inputBuffer = Buffer.from(arrayBuffer);

  // Server-side conversion: HEIC/HEIF → WebP, and also compress oversized normal images
  let finalBuffer: Buffer;
  let storageMime: string;
  const isHeic = effectiveMime === 'image/heic' || effectiveMime === 'image/heif';
  const needsProcessing = isHeic || file.size > MAX_OUTPUT_BYTES;

  if (needsProcessing) {
    try {
      let pipeline = sharp(inputBuffer).rotate(); // auto-rotate via EXIF
      pipeline = pipeline.resize(2000, 2000, { fit: 'inside', withoutEnlargement: true });
      let quality = 82;
      finalBuffer = await pipeline.webp({ quality }).toBuffer();
      if (finalBuffer.byteLength > MAX_OUTPUT_BYTES) {
        let lo = 20, hi = 80;
        while (hi - lo > 5) {
          const mid = Math.round((lo + hi) / 2);
          const candidate = await sharp(inputBuffer).rotate()
            .resize(2000, 2000, { fit: 'inside', withoutEnlargement: true })
            .webp({ quality: mid }).toBuffer();
          if (candidate.byteLength <= MAX_OUTPUT_BYTES) { lo = mid; finalBuffer = candidate; }
          else hi = mid;
        }
      }
      storageMime = 'image/webp';
    } catch (err) {
      console.error('[upload] sharp processing error:', err);
      return NextResponse.json({ error: 'Failed to process image. Please try a JPEG or PNG instead.' }, { status: 422 });
    }
  } else {
    finalBuffer = inputBuffer;
    storageMime = effectiveMime;
  }

  const ext = storageMime === 'image/webp' ? 'webp' : storageMime.split('/')[1];

  const uniqueId = crypto.randomUUID();
  const storagePath = `${companyId}/${uniqueId}.${ext}`;

  // Use admin client so upload works regardless of RLS storage policies
  const admin = createAdminClient();
  const { error: uploadError } = await admin.storage
    .from(bucket)
    .upload(storagePath, finalBuffer, { contentType: storageMime, upsert: false });

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
