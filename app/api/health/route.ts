import { NextResponse } from "next/server";
import prisma, { withDbRetry } from "@/lib/db";
import { RAG_CONFIG } from "@/lib/rag/config";
import { getEmbeddingProvider } from "@/lib/ai/gemini-embeddings";
import { getValidModelChain } from "@/lib/ai/openrouter";

export const maxDuration = 30;

export async function GET() {
  const startTime = Date.now();
  const checks: Record<string, { ok: boolean; message?: string; latencyMs?: number }> = {};

  // 1. Check Postgres Connectivity
  const dbStart = Date.now();
  try {
    await withDbRetry(() => prisma.$queryRaw`SELECT 1 as ping`);
    checks.database = { ok: true, latencyMs: Date.now() - dbStart };
  } catch (err: unknown) {
    checks.database = {
      ok: false,
      message: err instanceof Error ? err.message : String(err),
      latencyMs: Date.now() - dbStart,
    };
  }

  // 2. Check pgvector extension
  try {
    const extRows = await withDbRetry(() =>
      prisma.$queryRaw<{ extname: string }[]>`
        SELECT extname FROM pg_extension WHERE extname = 'vector'
      `
    );
    checks.pgvectorExtension = {
      ok: extRows.length > 0,
      message: extRows.length > 0 ? "vector extension active" : "extension 'vector' not found",
    };
  } catch (err: unknown) {
    checks.pgvectorExtension = {
      ok: false,
      message: err instanceof Error ? err.message : String(err),
    };
  }

  // 3. Check Required Production Indexes (HNSW & GIN)
  try {
    const indexRows = await withDbRetry(() =>
      prisma.$queryRaw<{ indexname: string }[]>`
        SELECT indexname FROM pg_indexes 
        WHERE tablename = 'chunks'
      `
    );
    const existingIndices = new Set(indexRows.map((r) => r.indexname));
    const hasHnsw = existingIndices.has("idx_chunks_embedding_hnsw");
    const hasGin = existingIndices.has("idx_chunks_tsv_gin");

    checks.hnswCosineIndex = {
      ok: hasHnsw,
      message: hasHnsw ? "idx_chunks_embedding_hnsw present" : "HNSW index missing",
    };
    checks.ginTsvectorIndex = {
      ok: hasGin,
      message: hasGin ? "idx_chunks_tsv_gin present" : "GIN tsvector index missing",
    };
  } catch (err: unknown) {
    checks.indexes = {
      ok: false,
      message: err instanceof Error ? err.message : String(err),
    };
  }

  // 4. Actively Probe Embedding Provider & Dimension
  const hasGeminiKey = Boolean(process.env.GEMINI_API_KEY);
  const hasOpenRouterKey = Boolean(process.env.OPENROUTER_API_KEY);
  const embedStart = Date.now();

  if (hasGeminiKey) {
    try {
      const provider = getEmbeddingProvider();
      const vector = await Promise.race([
        provider.embedQuery("health-check"),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("Embedding probe timed out after 5000ms")), 5000)
        ),
      ]);
      const dim = vector.length;
      const isDimOk = dim === RAG_CONFIG.embedding.dimension;
      checks.embeddingProvider = {
        ok: isDimOk,
        message: isDimOk
          ? `Active: ${RAG_CONFIG.embedding.model} (Dimension: ${dim})`
          : `Dimension mismatch: expected ${RAG_CONFIG.embedding.dimension}, received ${dim}`,
        latencyMs: Date.now() - embedStart,
      };
    } catch (err: unknown) {
      checks.embeddingProvider = {
        ok: false,
        message: err instanceof Error ? err.message : String(err),
        latencyMs: Date.now() - embedStart,
      };
    }
  } else {
    checks.embeddingProvider = {
      ok: false,
      message: "GEMINI_API_KEY is not configured",
      latencyMs: 0,
    };
  }

  checks.environmentKeys = {
    ok: hasGeminiKey && hasOpenRouterKey,
    message: `Gemini: ${hasGeminiKey ? "configured" : "MISSING"}, OpenRouter: ${hasOpenRouterKey ? "configured" : "MISSING"}`,
  };

  // 5. Check OpenRouter Model Reachability and Active Model Chain
  const modelStart = Date.now();
  if (hasOpenRouterKey) {
    try {
      const modelChain = await getValidModelChain();
      const openRouterRes = await fetch("https://openrouter.ai/api/v1/models", {
        headers: { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}` },
        signal: AbortSignal.timeout(3500),
      });
      const hasReachableModel = openRouterRes.ok && modelChain.length > 0;
      checks.openRouterReachability = {
        ok: hasReachableModel,
        message: hasReachableModel
          ? `OpenRouter reachable. Active fallback models: ${modelChain.join(", ")}`
          : `OpenRouter returned status ${openRouterRes.status}`,
        latencyMs: Date.now() - modelStart,
      };
    } catch (err: unknown) {
      checks.openRouterReachability = {
        ok: false,
        message: err instanceof Error ? err.message : String(err),
        latencyMs: Date.now() - modelStart,
      };
    }
  } else {
    checks.openRouterReachability = {
      ok: false,
      message: "OPENROUTER_API_KEY not configured",
    };
  }

  const isHealthy =
    checks.database.ok &&
    checks.pgvectorExtension?.ok &&
    checks.hnswCosineIndex?.ok &&
    checks.ginTsvectorIndex?.ok &&
    Boolean(checks.embeddingProvider?.ok);

  const status = isHealthy ? "ok" : "degraded";

  return NextResponse.json(
    {
      status,
      timestamp: new Date().toISOString(),
      totalLatencyMs: Date.now() - startTime,
      checks,
    },
    { status: isHealthy ? 200 : 503 }
  );
}

