import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getOrCreateSessionId } from "@/lib/session";
import { getCachedQueryEmbedding } from "@/lib/rag/query-cache";
import { executeHybridSearch } from "@/lib/rag/hybrid-search";
import { selectContextChunks } from "@/lib/rag/context-selector";

const DebugRetrievalSchema = z.object({
  query: z.string().min(1).max(1000),
  documentIds: z.array(z.string()).optional(),
  tokenBudget: z.number().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const sessionId = await getOrCreateSessionId();
    const body = await req.json();
    const parsed = DebugRetrievalSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request body", details: parsed.error.issues },
        { status: 400 }
      );
    }

    const { query, documentIds, tokenBudget } = parsed.data;

    // 1. Get cached query embedding
    const { vector, normalizedQuery, cacheHit } = await getCachedQueryEmbedding(query);

    // 2. Execute Hybrid Search
    const candidates = await executeHybridSearch({
      sessionId,
      query,
      queryVector: vector,
      documentIds,
      limit: 25,
    });

    // 3. Select context with MMR and budget
    const selection = selectContextChunks(candidates, {
      tokenBudget: tokenBudget || 2500,
    });

    return NextResponse.json({
      success: true,
      diagnostics: {
        query,
        normalizedQuery,
        queryEmbeddingCacheHit: cacheHit,
        totalRawCandidates: candidates.length,
        passedThreshold: selection.passedThreshold,
        refusalMessage: selection.refusalMessage || null,
        totalSelectedTokens: selection.totalTokens,
        selectedChunksCount: selection.chunks.length,
        droppedCount: selection.droppedCount,
      },
      rawCandidates: candidates.map((c) => ({
        id: c.id,
        filename: c.filename,
        pageNumber: c.pageNumber,
        sectionTitle: c.sectionTitle,
        vectorSimilarity: Number(c.vectorSimilarity.toFixed(4)),
        vectorRank: c.vectorRank,
        textScore: Number(c.textScore.toFixed(4)),
        textRank: c.textRank,
        rrfScore: Number(c.rrfScore.toFixed(5)),
        tokenCount: c.tokenCount,
        contentSnippet: c.content.slice(0, 120) + (c.content.length > 120 ? "..." : ""),
      })),
      selectedContext: selection.chunks.map((c) => ({
        id: c.id,
        filename: c.filename,
        pageNumber: c.pageNumber,
        sectionTitle: c.sectionTitle,
        tokenCount: c.tokenCount,
        rrfScore: Number(c.rrfScore.toFixed(5)),
        content: c.content,
      })),
    });
  } catch (err: unknown) {
    console.error("POST /api/chat/debug-retrieval error:", err);
    return NextResponse.json(
      {
        error: "Retrieval debug failed",
        message: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    );
  }
}

