-- Migration 013: pgvector extension + embedding columns + similarity search RPCs
--
-- Requires the pgvector extension to be enabled in your Supabase project.
-- Enable it in the Supabase Dashboard → Database → Extensions → vector
-- OR run: CREATE EXTENSION IF NOT EXISTS vector;

-- ─────────────────────────────────────────────────────────────────────────────
-- Extension
-- ─────────────────────────────────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS vector;

-- ─────────────────────────────────────────────────────────────────────────────
-- Embedding columns (text-embedding-004 produces 768-dimensional vectors)
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE apartments ADD COLUMN IF NOT EXISTS embedding vector(768);
ALTER TABLE products   ADD COLUMN IF NOT EXISTS embedding vector(768);

-- ─────────────────────────────────────────────────────────────────────────────
-- IVFFlat indexes for approximate nearest-neighbor search
-- lists=50 is a good starting point; increase to 100 for > 1M rows
-- ─────────────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS apartments_embedding_idx
  ON apartments USING ivfflat (embedding vector_cosine_ops) WITH (lists = 50);

CREATE INDEX IF NOT EXISTS products_embedding_idx
  ON products USING ivfflat (embedding vector_cosine_ops) WITH (lists = 50);

-- ─────────────────────────────────────────────────────────────────────────────
-- RPC: match_apartments
-- Returns apartment numbers ordered by cosine similarity to the query vector.
-- Only considers vacant apartments for the given company.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION match_apartments(
  query_embedding  vector(768),
  company_filter   uuid,
  match_threshold  float DEFAULT 0.25,
  match_count      int   DEFAULT 5
)
RETURNS TABLE (apartment_number text, similarity float)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    a.apartment_number,
    1 - (a.embedding <=> query_embedding) AS similarity
  FROM apartments a
  WHERE a.company_id  = company_filter
    AND a.status      = 'vacant'
    AND a.embedding   IS NOT NULL
    AND a.deleted_at  IS NULL
    AND 1 - (a.embedding <=> query_embedding) > match_threshold
  ORDER BY a.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- RPC: match_products
-- Returns product names ordered by cosine similarity to the query vector.
-- Only considers in-stock products for the given company.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION match_products(
  query_embedding  vector(768),
  company_filter   uuid,
  match_threshold  float DEFAULT 0.25,
  match_count      int   DEFAULT 5
)
RETURNS TABLE (name text, similarity float)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.name,
    1 - (p.embedding <=> query_embedding) AS similarity
  FROM products p
  WHERE p.company_id = company_filter
    AND p.in_stock   = true
    AND p.embedding  IS NOT NULL
    AND p.deleted_at IS NULL
    AND 1 - (p.embedding <=> query_embedding) > match_threshold
  ORDER BY p.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
