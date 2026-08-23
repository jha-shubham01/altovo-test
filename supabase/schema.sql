-- Altovo DocQA — database schema
-- Run this in the Supabase SQL editor (or `psql`) once, before first use.
-- Requires the `vector` extension (pgvector) available on Supabase free tier.

create extension if not exists vector;

-- ---------------------------------------------------------------------------
-- documents: one row per uploaded file or URL-derived document
-- ---------------------------------------------------------------------------
create table if not exists documents (
  id          uuid primary key default gen_random_uuid(),
  filename    text not null,
  source_type text not null check (source_type in ('upload', 'url')),
  source_url  text,
  storage_path text,                 -- null for url-page docs kept as text only
  mime_type   text not null,
  size_bytes  bigint,
  page_count  int,
  status      text not null default 'processing'
              check (status in ('processing', 'ready', 'failed')),
  error       text,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- chunks: retrievable units. embedding is 768-dim (Gemini, Matryoshka-768).
-- ---------------------------------------------------------------------------
create table if not exists chunks (
  id          bigint generated always as identity primary key,
  document_id uuid not null references documents(id) on delete cascade,
  chunk_index int not null,
  page        int,                   -- 1-indexed; null for docx/txt/md/url
  section     text,                  -- nearest heading (md/docx/html); null otherwise
  char_start  int,                   -- span within the page text (PDF) for highlight lookup
  char_end    int,
  content     text not null,
  token_count int not null,
  embedding   vector(768) not null,
  fts         tsvector generated always as (to_tsvector('english', content)) stored
);

-- Approximate-nearest-neighbour index for cosine distance.
create index if not exists chunks_embedding_hnsw
  on chunks using hnsw (embedding vector_cosine_ops);

-- Full-text search index.
create index if not exists chunks_fts_gin
  on chunks using gin (fts);

-- Foreign-key lookups (delete cascade, per-document scans).
create index if not exists chunks_document_id_idx
  on chunks (document_id);
