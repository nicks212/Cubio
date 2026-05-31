/**
 * Embedding generation and vector similarity search.
 *
 * Provides:
 *   describeImageForSearch()      — Gemini vision → text description for search
 *   generateTextEmbedding()       — text-embedding-004 → 768-dim vector
 *   generateApartmentEmbedding()  — apartment metadata → embedding
 *   generateProductEmbedding()    — product metadata → embedding
 *   searchSimilarApartments()     — pgvector cosine similarity search
 *   searchSimilarProducts()       — pgvector cosine similarity search
 *
 * REQUIREMENTS (Supabase):
 *   - pgvector extension enabled
 *   - apartments.embedding vector(768) column
 *   - products.embedding vector(768) column
 *   - match_apartments() RPC function (see migration 013_pgvector.sql)
 *   - match_products()   RPC function
 *
 * All functions degrade gracefully: if the DB columns / RPC don't exist yet,
 * or if embedding generation fails, they return null / empty arrays with a
 * console.warn — never throwing, never blocking the main reply pipeline.
 */

import { GoogleGenerativeAI, TaskType } from '@google/generative-ai';
import { createAdminClient } from '@/lib/supabase/server';
import { persistAIUsage, type AIUsageContext } from './usage';
import type { ApartmentContext, ProductContext } from './types';

// ─── Embedding Model Health Check (Startup) ───────────────────────────────
let embeddingModelHealthy = false;
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY ?? '');
let embeddingModel: ReturnType<GoogleGenerativeAI['getGenerativeModel']> | undefined;
try {
  embeddingModel = genAI.getGenerativeModel({ model: 'models/embedding-001' });
  // Run a test embedding call at startup
  (async () => {
    try {
      const result = await embeddingModel!.embedContent({
        content: { parts: [{ text: 'health check' }], role: 'user' },
        taskType: TaskType.RETRIEVAL_QUERY,
      });
      if (result && result.embedding && Array.isArray(result.embedding.values)) {
        embeddingModelHealthy = true;
        console.info('[embeddings] Embedding model health check: OK');
      } else {
        embeddingModelHealthy = false;
        console.error('[embeddings] Embedding model health check: Unexpected result structure', result);
      }
    } catch (err) {
      embeddingModelHealthy = false;
      console.error('[embeddings] Embedding model health check failed:', err);
    }
  })();
} catch (err) {
  embeddingModelHealthy = false;
  console.error('[embeddings] Failed to initialize embedding model:', err);
}

// (moved above)

// ─── Image description ────────────────────────────────────────────────────────

/**
 * Uses Gemini 2.5 Flash (vision) to describe a customer-uploaded image
 * as a compact search query.
 *
 * Real estate example:  "2-room apartment, modern open kitchen, mountain view,
 *                        light walls, floor-to-ceiling windows"
 * Craft shop example:   "tarot card deck, illustrated, box packaging, esoteric symbols"
 *
 * Accepts the already-downloaded base64 bytes + mimeType to avoid re-fetching
 * the URL (Meta CDN URLs are signed and expire within seconds of the first fetch).
 *
 * Returns null if description fails.
 */
export async function describeImageForSearch(
  base64: string,
  mimeType: string,
  businessType: 'real_estate' | 'craft_shop',
  usageContext?: Omit<AIUsageContext, 'feature' | 'model'>,
): Promise<string | null> {
  try {
    const visionModel = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

    const searchContext = businessType === 'real_estate'
      ? 'Describe key visual features of this apartment or building that would help match it to similar properties: layout feel, natural light, finishes, view, style. Be concise (under 40 words).'
      : 'Describe this product for catalog similarity matching. What type of product is it? Include: product category, style, material, color, any symbols or text visible, and distinguishing features. Be concise (under 30 words).';

    const result = await visionModel.generateContent([
      { text: searchContext },
      { inlineData: { data: base64, mimeType } },
    ]);
    await persistAIUsage(
      usageContext ? { ...usageContext, feature: 'image_describe', model: 'gemini-2.5-flash' } : null,
      result.response.usageMetadata,
    );

    const description = result.response.text().trim();
    if (!description) return null;

    console.info(`[embeddings] Image described for ${businessType}: "${description.slice(0, 80)}..."`);
    return description;
  } catch (err) {
    console.warn('[embeddings] describeImageForSearch failed (non-fatal):', err);
    return null;
  }
}

// ─── Text embedding ───────────────────────────────────────────────────────────

/**
 * Generates a 768-dimensional text embedding using Google's embedding-001.
 * Returns null on failure. Logs detailed errors.
 */
export async function generateTextEmbedding(
  text: string,
  taskType: TaskType = TaskType.RETRIEVAL_QUERY,
): Promise<number[] | null> {
  if (!embeddingModelHealthy || !embeddingModel) {
    console.error('[embeddings] generateTextEmbedding: Embedding model is not healthy. Check API key, quota, or model availability.');
    return null;
  }
  try {
    const result = await embeddingModel.embedContent({
      content: { parts: [{ text }], role: 'user' },
      taskType,
    });
    if (!result || !result.embedding || !Array.isArray(result.embedding.values)) {
      console.error('[embeddings] generateTextEmbedding: Unexpected result structure', result);
      return null;
    }
    return result.embedding.values;
  } catch (err) {
    if (err && typeof err === 'object' && 'message' in err) {
      console.error('[embeddings] generateTextEmbedding failed:', err.message, err);
    } else {
      console.error('[embeddings] generateTextEmbedding failed:', err);
    }
    return null;
  }
}

// ─── Per-item embedding builders ─────────────────────────────────────────────

type ApartmentRow = ApartmentContext['apartments'][0];
type ProductRow   = ProductContext['products'][0];

/** Builds a searchable text representation of an apartment for embedding. */
export function buildApartmentSearchText(apt: ApartmentRow): string {
  const proj = apt.project as { name?: string; location?: string | null; description?: string | null } | null;
  const parts: string[] = [
    `${apt.rooms_quantity}-room apartment`,
    `${apt.size_sq_m} square meters`,
    `floor ${apt.floor}`,
    apt.currency === 'GEL' ? `${apt.total_price} GEL` : `$${apt.total_price}`,
  ];
  if (proj?.name)     parts.push(proj.name);
  if (proj?.location) parts.push(proj.location);
  if (proj?.description) parts.push(proj.description);
  return parts.join(', ');
}

/** Builds a searchable text representation of a product for embedding. */
export function buildProductSearchText(p: ProductRow): string {
  const parts: string[] = [p.name];
  if (p.category)    parts.push(p.category);
  if (p.material)    parts.push(p.material);
  if (p.birthstones) parts.push(`stones: ${p.birthstones}`);
  if (p.zodiac_compatibility?.length) parts.push(`zodiac: ${p.zodiac_compatibility.join(' ')}`);
  // Description gives semantic richness to the embedding — critical for
  // cross-language and synonym queries (e.g. "incense" matching "სურნელოვანი ჩხირები").
  if (p.description) parts.push(p.description);
  return parts.join(', ');
}

/**
 * Generates and stores an apartment's embedding in the DB.
 * Call when an apartment is created or updated.
 * Returns true on success, false on failure.
 */
export async function generateAndStoreApartmentEmbedding(
  apartmentId: string,
  apt: ApartmentRow,
): Promise<boolean> {
  const text = buildApartmentSearchText(apt);
  const embedding = await generateTextEmbedding(text, TaskType.RETRIEVAL_DOCUMENT);
  if (!embedding) return false;

  try {
    const supabase = createAdminClient();
    const { error } = await supabase
      .from('apartments')
      .update({ embedding })
      .eq('id', apartmentId);

    if (error) {
      console.warn('[embeddings] Failed to store apartment embedding:', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.warn('[embeddings] generateAndStoreApartmentEmbedding error (non-fatal):', err);
    return false;
  }
}

/**
 * Generates and stores a product's embedding in the DB.
 * Call when a product is created or updated.
 */
export async function generateAndStoreProductEmbedding(
  productId: string,
  product: ProductRow,
): Promise<boolean> {
  const text = buildProductSearchText(product);
  const embedding = await generateTextEmbedding(text, TaskType.RETRIEVAL_DOCUMENT);
  if (!embedding) return false;

  try {
    const supabase = createAdminClient();
    const { error } = await supabase
      .from('products')
      .update({ embedding })
      .eq('id', productId);

    if (error) {
      console.warn('[embeddings] Failed to store product embedding:', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.warn('[embeddings] generateAndStoreProductEmbedding error (non-fatal):', err);
    return false;
  }
}

// ─── Similarity search ────────────────────────────────────────────────────────

/**
 * Searches for apartments similar to a text query using pgvector cosine similarity.
 * Falls back gracefully to empty array if the embedding column / RPC doesn't exist.
 *
 * @returns array of apartment_numbers ordered by similarity (best match first)
 */
export async function searchSimilarApartments(
  companyId: string,
  queryText: string,
  limit = 5,
): Promise<string[]> {
  const embedding = await generateTextEmbedding(queryText, TaskType.RETRIEVAL_QUERY);
  if (!embedding) return [];

  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase.rpc('match_apartments', {
      query_embedding: embedding,
      company_filter: companyId,
      match_threshold: 0.25,
      match_count: limit,
    });

    if (error) {
      // RPC not yet deployed — silent fallback
      if (error.message.includes('does not exist') || error.message.includes('function')) {
        console.info('[embeddings] match_apartments RPC not available — using text search');
      } else {
        console.warn('[embeddings] searchSimilarApartments error:', error.message);
      }
      return [];
    }

    return ((data ?? []) as Array<{ apartment_number: string }>).map(r => r.apartment_number);
  } catch (err) {
    console.warn('[embeddings] searchSimilarApartments error (non-fatal):', err);
    return [];
  }
}

/**
 * Searches for products similar to a text query using pgvector cosine similarity.
 * Falls back gracefully if the embedding column / RPC doesn't exist.
 *
 * @returns array of product names ordered by similarity (best match first)
 */
export async function searchSimilarProducts(
  companyId: string,
  queryText: string,
  limit = 5,
): Promise<string[]> {
  const embedding = await generateTextEmbedding(queryText, TaskType.RETRIEVAL_QUERY);
  if (!embedding) return [];

  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase.rpc('match_products', {
      query_embedding: embedding,
      company_filter: companyId,
      match_threshold: 0.25,
      match_count: limit,
    });

    if (error) {
      if (error.message.includes('does not exist') || error.message.includes('function')) {
        console.info('[embeddings] match_products RPC not available — using text search');
      } else {
        console.warn('[embeddings] searchSimilarProducts error:', error.message);
      }
      return [];
    }

    return ((data ?? []) as Array<{ name: string }>).map(r => r.name);
  } catch (err) {
    console.warn('[embeddings] searchSimilarProducts error (non-fatal):', err);
    return [];
  }
}
