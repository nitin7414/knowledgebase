import prisma, { withDbRetry } from "../db";

export interface HybridSearchResult {
  id: string;
  documentId: string;
  chunkIndex: number;
  content: string;
  tokenCount: number;
  pageNumber: number | null;
  sectionTitle: string | null;
  metadata: Record<string, unknown> | null;
  contentHash: string;
  filename: string;
  vectorSimilarity: number;
  vectorRank: number | null;
  textScore: number;
  textRank: number | null;
  rrfScore: number;
}

export interface HybridSearchOptions {
  sessionId: string;
  query: string;
  queryVector: number[];
  documentIds?: string[];
  limit?: number; // default 25
}

/**
 * Executes vector cosine similarity + Postgres full-text BM25 in ONE SQL query
 * and merges the ranked lists via Reciprocal Rank Fusion (RRF, k=60).
 */
export async function executeHybridSearch(
  options: HybridSearchOptions
): Promise<HybridSearchResult[]> {
  const { sessionId, query, queryVector, documentIds, limit = 25 } = options;

  const vectorStr = `[${queryVector.join(",")}]`;
  const sanitizedQuery = query.replace(/[^\w\s]/g, " ").trim() || "document";
  const docIdsParam = documentIds && documentIds.length > 0 ? documentIds : null;

  type RawRow = {
    id: string;
    document_id: string;
    chunk_index: number;
    content: string;
    token_count: number;
    page_number: number | null;
    section_title: string | null;
    metadata: Record<string, unknown> | null;
    content_hash: string;
    filename: string;
    vector_similarity: number;
    vector_rank: number | null;
    text_score: number;
    text_rank: number | null;
    rrf_score: number;
  };

  const rows: RawRow[] = await withDbRetry(() => prisma.$queryRaw<RawRow[]>`
    WITH vector_search AS (
      SELECT 
        c.id,
        c.document_id,
        c.chunk_index,
        c.content,
        c.token_count,
        c.page_number,
        c.section_title,
        c.metadata,
        c.content_hash,
        d.filename,
        (1 - (c.embedding <=> ${vectorStr}::vector))::float AS vector_similarity,
        ROW_NUMBER() OVER (ORDER BY c.embedding <=> ${vectorStr}::vector ASC) AS vector_rank
      FROM chunks c
      JOIN documents d ON d.id = c.document_id
      WHERE d.session_id = ${sessionId}
        AND (${docIdsParam}::text[] IS NULL OR c.document_id = ANY(${docIdsParam}::text[]))
        AND c.embedding IS NOT NULL
      ORDER BY c.embedding <=> ${vectorStr}::vector ASC
      LIMIT 20
    ),
    text_search AS (
      SELECT 
        c.id,
        c.document_id,
        c.chunk_index,
        c.content,
        c.token_count,
        c.page_number,
        c.section_title,
        c.metadata,
        c.content_hash,
        d.filename,
        ts_rank_cd(c.tsv, plainto_tsquery('english', ${sanitizedQuery}))::float AS text_score,
        ROW_NUMBER() OVER (ORDER BY ts_rank_cd(c.tsv, plainto_tsquery('english', ${sanitizedQuery})) DESC) AS text_rank
      FROM chunks c
      JOIN documents d ON d.id = c.document_id
      WHERE d.session_id = ${sessionId}
        AND (${docIdsParam}::text[] IS NULL OR c.document_id = ANY(${docIdsParam}::text[]))
        AND c.tsv @@ plainto_tsquery('english', ${sanitizedQuery})
      ORDER BY text_score DESC
      LIMIT 20
    )
    SELECT 
      COALESCE(v.id, t.id) AS id,
      COALESCE(v.document_id, t.document_id) AS document_id,
      COALESCE(v.chunk_index, t.chunk_index) AS chunk_index,
      COALESCE(v.content, t.content) AS content,
      COALESCE(v.token_count, t.token_count) AS token_count,
      COALESCE(v.page_number, t.page_number) AS page_number,
      COALESCE(v.section_title, t.section_title) AS section_title,
      COALESCE(v.metadata, t.metadata) AS metadata,
      COALESCE(v.content_hash, t.content_hash) AS content_hash,
      COALESCE(v.filename, t.filename) AS filename,
      COALESCE(v.vector_similarity, 0.0)::float AS vector_similarity,
      v.vector_rank::int AS vector_rank,
      COALESCE(t.text_score, 0.0)::float AS text_score,
      t.text_rank::int AS text_rank,
      (
        COALESCE(1.0 / (60.0 + v.vector_rank), 0.0) +
        COALESCE(1.0 / (60.0 + t.text_rank), 0.0)
      )::float AS rrf_score
    FROM vector_search v
    FULL OUTER JOIN text_search t ON v.id = t.id
    ORDER BY rrf_score DESC
    LIMIT ${limit};
  `);

  return rows.map((r) => ({
    id: r.id,
    documentId: r.document_id,
    chunkIndex: r.chunk_index,
    content: r.content,
    tokenCount: r.token_count,
    pageNumber: r.page_number,
    sectionTitle: r.section_title,
    metadata: r.metadata,
    contentHash: r.content_hash,
    filename: r.filename,
    vectorSimilarity: Number(r.vector_similarity || 0),
    vectorRank: r.vector_rank ? Number(r.vector_rank) : null,
    textScore: Number(r.text_score || 0),
    textRank: r.text_rank ? Number(r.text_rank) : null,
    rrfScore: Number(r.rrf_score || 0),
  }));
}

