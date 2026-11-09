import { selectContextChunks } from "../lib/rag/context-selector";
import { HybridSearchResult } from "../lib/rag/hybrid-search";
import { normalizeQueryText, hashQueryText } from "../lib/rag/query-cache";

function runTests() {
  console.log("🧪 Testing Query Normalization & Caching Logic...");
  const rawQ = "  What are the Q3   revenue growth DRIVERS?? ";
  const normalized = normalizeQueryText(rawQ);
  const hash1 = hashQueryText(normalized);
  const hash2 = hashQueryText("what are the q3 revenue growth drivers");

  if (normalized !== "what are the q3 revenue growth drivers") {
    throw new Error(`Normalization mismatch: expected 'what are the q3 revenue growth drivers', got '${normalized}'`);
  }
  if (hash1 !== hash2) {
    throw new Error("Query text hashes did not match for equivalent queries");
  }
  console.log("  ✓ Query normalization and hash matching verified");

  console.log("\n🧪 Testing Context Selector & RRF Thresholding...");
  const mockCandidates: HybridSearchResult[] = [
    {
      id: "chunk-1",
      documentId: "doc-A",
      chunkIndex: 2,
      content: "Enterprise revenue grew by 34.2% YoY driven by multi-agent seat expansions.",
      tokenCount: 15,
      pageNumber: 3,
      sectionTitle: "Financials",
      metadata: null,
      contentHash: "hash-1",
      filename: "Report.pdf",
      vectorSimilarity: 0.88,
      vectorRank: 1,
      textScore: 0.75,
      textRank: 1,
      rrfScore: (1 / 61) + (1 / 61), // ~0.0328
    },
    {
      id: "chunk-2",
      documentId: "doc-A",
      chunkIndex: 1,
      content: "Overview of fiscal operations: gross margins across North America held at 78.5%.",
      tokenCount: 16,
      pageNumber: 2,
      sectionTitle: "Overview",
      metadata: null,
      contentHash: "hash-2",
      filename: "Report.pdf",
      vectorSimilarity: 0.72,
      vectorRank: 2,
      textScore: 0.40,
      textRank: 3,
      rrfScore: (1 / 62) + (1 / 63), // ~0.0320
    },
    {
      id: "chunk-3-dup",
      documentId: "doc-B",
      chunkIndex: 0,
      // Near identical duplicate of chunk-1
      content: "Enterprise revenue grew by 34.2% YoY driven by multi-agent seat expansions across quarters.",
      tokenCount: 16,
      pageNumber: 1,
      sectionTitle: "Summary",
      metadata: null,
      contentHash: "hash-3",
      filename: "Duplicate.pdf",
      vectorSimilarity: 0.87,
      vectorRank: 3,
      textScore: 0.65,
      textRank: 2,
      rrfScore: (1 / 63) + (1 / 62),
    },
    {
      id: "chunk-4-low",
      documentId: "doc-C",
      chunkIndex: 0,
      content: "Completely unrelated content about office kitchen cleaning schedules.",
      tokenCount: 10,
      pageNumber: 1,
      sectionTitle: "Kitchen",
      metadata: null,
      contentHash: "hash-4",
      filename: "Office.txt",
      vectorSimilarity: 0.12,
      vectorRank: 20,
      textScore: 0.0,
      textRank: null,
      rrfScore: (1 / 80), // 0.0125 (fails similarity and low RRF)
    },
  ];

  // 1. Test threshold and MMR diversity
  const selected = selectContextChunks(mockCandidates, {
    tokenBudget: 100,
    rrfThreshold: 0.02,
    similarityThreshold: 0.4,
  });

  if (!selected.passedThreshold) {
    throw new Error("Expected chunks to pass threshold");
  }

  // Verify near-duplicate chunk-3-dup was suppressed
  const hasDuplicate = selected.chunks.some((c) => c.id === "chunk-3-dup");
  if (hasDuplicate) {
    throw new Error("MMR failed to suppress near-duplicate chunk");
  }
  console.log("  ✓ MMR successfully suppressed near-duplicate chunk");

  // 2. Verify coherent reading order reordering (doc-A chunkIndex 1 before doc-A chunkIndex 2)
  const docAChunks = selected.chunks.filter((c) => c.documentId === "doc-A");
  if (docAChunks.length === 2) {
    if (docAChunks[0].chunkIndex !== 1 || docAChunks[1].chunkIndex !== 2) {
      throw new Error("Chunks were not sorted into coherent document reading order!");
    }
  }
  console.log("  ✓ Selected chunks reordered to preserve chronological document reading flow");

  // 3. Test refusal behavior when all chunks are below threshold
  const refusalResult = selectContextChunks(
    [
      {
        ...mockCandidates[3],
        rrfScore: 0.005,
        vectorSimilarity: 0.1,
      },
    ],
    { rrfThreshold: 0.02, similarityThreshold: 0.4 }
  );

  if (refusalResult.passedThreshold || !refusalResult.refusalMessage) {
    throw new Error("Refusal mechanism failed to trigger on below-threshold chunks");
  }
  console.log("  ✓ Refusal correctly triggered when no chunks meet relevance threshold");

  // 4. Test strict token budget constraint
  const budgeted = selectContextChunks(mockCandidates, {
    tokenBudget: 20, // Only enough room for 1 chunk
    rrfThreshold: 0.01,
  });

  if (budgeted.totalTokens > 20) {
    throw new Error(`Token budget violated: expected <= 20, got ${budgeted.totalTokens}`);
  }
  console.log(`  ✓ Token budget strictly honored (${budgeted.totalTokens} tokens <= 20 max)`);

  console.log("\n🎉 All Phase 3 Retrieval & Context Selection tests passed!\n");
}

runTests();

