/**
 * Single Source of Truth for RAG Configuration, Parameters & Tuned Thresholds
 * All pipeline stages, sweeps, evaluation suites, and reports must reference these constants.
 */

export const RAG_CONFIG = {
  // Embedding model and vector dimensionality
  embedding: {
    // Current recommended Google Gemini embedding model (replaces retired text-embedding-004)
    model: "gemini-embedding-001",
    dimension: 768,
    retiredModels: ["text-embedding-004"],
  },

  // Document ingestion and structure-aware chunking
  chunking: {
    targetTokens: 400,
    overlapPercent: 0.12, // 12% chunk overlap (~48 tokens)
    maxFileSizeMB: 4.0, // Strict Vercel serverless request body boundary
  },

  // Retrieval, ranking, and context packing
  retrieval: {
    topK: 5, // Top-K retrieval depth
    rrfK: 60, // Reciprocal Rank Fusion constant
    refusalCosineFloor: 0.68, // Hard semantic floor below which chunks are rejected
    similarityThreshold: 0.015, // RRF combined ranking threshold
    contextTokenBudget: 2500, // Maximum prompt context ceiling in tokens
    maxHistoryTurns: 4, // Number of conversational turns packed into prompt
    dedupOverlapThreshold: 0.75, // Jaccard token-set similarity threshold for pruning near-duplicates
  },

  // Storage and rate limiting boundaries
  limits: {
    maxDocsPerSession: 15,
    maxStoragePerSessionMB: 20.0,
    chatRatePerMinute: 10,
    chatRatePerDay: 100,
    uploadRatePerHour: 5,
    dataRetentionDays: 7,
  },
} as const;

/**
 * Validates the embedding model and vector dimension at runtime.
 * Fails fast if a retired model is forced or if the dimension does not match PostgreSQL column schema (768).
 */
export function validateEmbeddingConfig(envModel?: string, customDimension?: number): {
  model: string;
  dimension: number;
} {
  const configuredModel = envModel || process.env.GEMINI_EMBEDDING_MODEL || RAG_CONFIG.embedding.model;
  const dimension = customDimension || RAG_CONFIG.embedding.dimension;

  if ((RAG_CONFIG.embedding.retiredModels as readonly string[]).includes(configuredModel)) {
    console.warn(
      `[EmbeddingConfigWarning] Configured model "${configuredModel}" was shut down by Google on 2026-01-14. Migrating to "${RAG_CONFIG.embedding.model}".`
    );
    return {
      model: RAG_CONFIG.embedding.model,
      dimension,
    };
  }

  if (dimension !== 768) {
    throw new Error(
      `[EmbeddingConfigError] Database pgvector column requires dimension 768, but ${dimension} was specified.`
    );
  }

  console.log(`[EmbeddingConfig] Active model: "${configuredModel}", vector dimension: ${dimension}`);
  return {
    model: configuredModel,
    dimension,
  };
}

