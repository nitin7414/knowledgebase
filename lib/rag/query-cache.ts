import { createHash } from "crypto";
import { getEmbeddingProvider } from "../ai/gemini-embeddings";

// In-memory cache for query embeddings to save API tokens and latency
const queryEmbeddingCache = new Map<string, { vector: number[]; timestamp: number }>();
const MAX_CACHE_ENTRIES = 500;
const CACHE_TTL_MS = 1000 * 60 * 60 * 6; // 6 hours

export function normalizeQueryText(query: string): string {
  return query
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function hashQueryText(normalizedText: string): string {
  return createHash("sha256").update(normalizedText).digest("hex");
}

/**
 * Embeds a query with caching based on normalized text hash.
 * Zero token cost on cache hit.
 */
export async function getCachedQueryEmbedding(rawQuery: string): Promise<{
  vector: number[];
  normalizedQuery: string;
  cacheHit: boolean;
}> {
  const normalized = normalizeQueryText(rawQuery);
  const hash = hashQueryText(normalized);
  const now = Date.now();

  const cached = queryEmbeddingCache.get(hash);
  if (cached && now - cached.timestamp < CACHE_TTL_MS) {
    return {
      vector: cached.vector,
      normalizedQuery: normalized,
      cacheHit: true,
    };
  }

  const provider = getEmbeddingProvider();
  const vector = await provider.embedQuery(rawQuery);

  // Maintain cache size
  if (queryEmbeddingCache.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = queryEmbeddingCache.keys().next().value;
    if (oldestKey) queryEmbeddingCache.delete(oldestKey);
  }

  queryEmbeddingCache.set(hash, {
    vector,
    timestamp: now,
  });

  return {
    vector,
    normalizedQuery: normalized,
    cacheHit: false,
  };
}

