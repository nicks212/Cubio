import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { generateAndStoreProductEmbedding } from '@/lib/ai/embeddings';

/**
 * GET /api/admin/reembed-products
 *
 * One-time utility: re-generates and stores embeddings for all products across all
 * companies using the current buildProductSearchText() (which now includes description
 * and keywords).
 *
 * Protected by ADMIN_API_KEY header — not accessible without the server secret.
 * Safe to re-run: embeddings are idempotent updates.
 *
 * Usage:
 *   curl -H "x-admin-key: $ADMIN_API_KEY" https://your-domain/api/admin/reembed-products
 */
export async function GET(request: Request) {
  const expectedKey = process.env.ADMIN_API_KEY;
  if (!expectedKey) {
    return NextResponse.json({ error: 'ADMIN_API_KEY not configured' }, { status: 500 });
  }
  const providedKey = request.headers.get('x-admin-key');
  if (!providedKey || providedKey !== expectedKey) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createAdminClient();

  const { data: products, error } = await supabase
    .from('products')
    .select('id, name, price, currency, category, material, birthstones, zodiac_compatibility, in_stock, images, description, keywords')
    .is('deleted_at', null);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (products ?? []) as Array<{
    id: string;
    name: string;
    price: number;
    currency: string | null;
    category: string | null;
    material: string | null;
    birthstones: string | null;
    zodiac_compatibility: string[] | null;
    in_stock: boolean;
    images: string[];
    description: string | null;
    keywords: string | null;
  }>;

  let success = 0;
  let failed = 0;

  for (const row of rows) {
    const ok = await generateAndStoreProductEmbedding(row.id, {
      name: row.name,
      price: row.price,
      currency: row.currency,
      category: row.category,
      material: row.material,
      birthstones: row.birthstones,
      zodiac_compatibility: row.zodiac_compatibility,
      in_stock: row.in_stock,
      images: row.images,
      description: row.description,
      keywords: row.keywords,
    });
    if (ok) { success++; } else { failed++; }
  }

  console.info(`[reembed-products] Done: ${success} succeeded, ${failed} failed of ${rows.length} total`);
  return NextResponse.json({ total: rows.length, success, failed });
}
