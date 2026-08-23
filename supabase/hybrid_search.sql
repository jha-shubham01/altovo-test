-- Altovo DocQA — hybrid retrieval RPC
-- Reciprocal Rank Fusion (RRF) over pgvector cosine + Postgres FTS.
-- Run after schema.sql. Re-run to update the function definition.
--
-- Returns, per matched chunk: identifying columns + both source ranks, the
-- fused RRF score, and the RAW cosine similarity (needed for the SIM_FLOOR
-- gate in the ask pipeline, D10). The optional filter_document_ids param is
-- deliberate pre-wiring: the app passes NULL (all docs, D14), but per-document
-- scoping becomes a UI-only change, not a live migration.

create or replace function hybrid_search(
  query_embedding     vector(768),
  query_text          text,
  match_count         int default 8,
  filter_document_ids uuid[] default null
)
returns table (
  id           bigint,
  document_id  uuid,
  chunk_index  int,
  page         int,
  section      text,
  char_start   int,
  char_end     int,
  content      text,
  token_count  int,
  similarity   float,        -- raw cosine similarity (1 - cosine distance)
  vector_rank  int,
  fts_rank     int,
  rrf_score    float
)
language sql
stable
as $$
  with
  vector_matches as (
    select
      c.id,
      c.embedding <=> query_embedding as distance,
      row_number() over (order by c.embedding <=> query_embedding) as rank
    from chunks c
    where filter_document_ids is null
       or c.document_id = any (filter_document_ids)
    order by c.embedding <=> query_embedding
    limit 20
  ),
  fts_matches as (
    select
      c.id,
      row_number() over (
        order by ts_rank(c.fts, websearch_to_tsquery('english', query_text)) desc
      ) as rank
    from chunks c
    where (filter_document_ids is null
           or c.document_id = any (filter_document_ids))
      and c.fts @@ websearch_to_tsquery('english', query_text)
    order by ts_rank(c.fts, websearch_to_tsquery('english', query_text)) desc
    limit 20
  ),
  fused as (
    select
      coalesce(v.id, f.id) as id,
      v.rank               as vector_rank,
      f.rank               as fts_rank,
      coalesce(1.0 / (60 + v.rank), 0.0)
        + coalesce(1.0 / (60 + f.rank), 0.0) as rrf_score
    from vector_matches v
    full outer join fts_matches f on v.id = f.id
  )
  select
    c.id,
    c.document_id,
    c.chunk_index,
    c.page,
    c.section,
    c.char_start,
    c.char_end,
    c.content,
    c.token_count,
    (1 - (c.embedding <=> query_embedding))::float as similarity,
    fused.vector_rank::int,
    fused.fts_rank::int,
    fused.rrf_score::float
  from fused
  join chunks c on c.id = fused.id
  order by fused.rrf_score desc
  limit match_count;
$$;
