import { NextResponse } from "next/server";
import prisma, { withDbRetry } from "@/lib/db";

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

  // 4. Check Embedding & Model Configuration
  const hasGeminiKey = Boolean(process.env.GEMINI_API_KEY);
  const hasOpenRouterKey = Boolean(process.env.OPENROUTER_API_KEY);
  checks.environmentKeys = {
    ok: hasGeminiKey && hasOpenRouterKey,
    message: `Gemini: ${hasGeminiKey ? "configured" : "MISSING"}, OpenRouter: ${hasOpenRouterKey ? "configured" : "MISSING"}`,
  };

  // 5. Check OpenRouter Model Reachability
  const modelStart = Date.now();
  if (hasOpenRouterKey) {
    try {
      const openRouterRes = await fetch("https://openrouter.ai/api/v1/models", {
        headers: { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}` },
        signal: AbortSignal.timeout(3500),
      });
      checks.openRouterReachability = {
        ok: openRouterRes.ok,
        message: openRouterRes.ok ? "OpenRouter API reachable" : `OpenRouter returned status ${openRouterRes.status}`,
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
    hasGeminiKey;

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

