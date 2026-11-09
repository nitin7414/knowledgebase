import { parseDocumentBuffer } from "../lib/ingestion/parsers";
import { chunkPages } from "../lib/ingestion/chunker";
import { selectContextChunks } from "../lib/rag/context-selector";
import { buildSystemPrompt, formatSourcesForPrompt, extractCitedSources } from "../lib/rag/prompt";
import { HybridSearchResult } from "../lib/rag/hybrid-search";

async function runIntegrationTest() {
  console.log("==================================================================");
  console.log("🧪 Running End-to-End Ingest -> Retrieval -> Citation Integration Test");
  console.log("==================================================================\n");

  // 1. Ingest Sample Document
  const sampleDocText = `
# Engineering Cloud Compliance Guide 2026

## Section 1: Security Requirements
All Kubernetes worker clusters must strictly enforce Pod Security Standards (PSS) under the Restricted profile.
Secret injection into containers is mandated to run through Vault CSI sidecars rather than native Kubernetes Secrets.
All database partitions must use AES-256 encryption.

## Section 2: Ingress and TLS Mandates
Ingress controllers must disable TLS 1.0 and TLS 1.1 across all production ingresses.
TLS 1.3 is strictly enforced on all public domains.
Certificate renewal is handled automatically through Let's Encrypt with 90-day validity cycles.
`.trim();

  const buffer = Buffer.from(sampleDocText, "utf-8");
  const parsed = await parseDocumentBuffer(buffer, "text/plain", "compliance.txt");

  if (parsed.pages.length === 0 || !parsed.pages[0].text) {
    throw new Error("Document parsing failed to extract text");
  }
  console.log(`  ✓ Step 1: Parsed document (${parsed.totalCharacters} chars)`);

  // 2. Structure-Aware Chunking
  const chunks = chunkPages(parsed.pages, { targetTokens: 100, overlapTokens: 15 });
  if (chunks.length === 0) {
    throw new Error("Chunking produced 0 chunks");
  }
  console.log(`  ✓ Step 2: Produced ${chunks.length} structured chunks with page and section metadata`);

  // 3. Simulated Retrieval Results
  const mockCandidates: HybridSearchResult[] = chunks.map((c, idx) => ({
    id: `chunk-${idx}`,
    documentId: "doc-test-1",
    chunkIndex: c.chunkIndex,
    content: c.content,
    tokenCount: c.tokenCount,
    pageNumber: c.pageNumber,
    sectionTitle: c.sectionTitle || "General",
    metadata: null,
    contentHash: c.contentHash,
    filename: "compliance.txt",
    vectorSimilarity: 0.85 - idx * 0.1,
    vectorRank: idx + 1,
    textScore: 0.8 - idx * 0.1,
    textRank: idx + 1,
    rrfScore: 1 / (60 + idx + 1) + 1 / (60 + idx + 1),
  }));

  // 4. Context Selection
  const selection = selectContextChunks(mockCandidates, { tokenBudget: 1500 });
  if (!selection.passedThreshold || selection.chunks.length === 0) {
    throw new Error("Context selection failed to pass threshold");
  }
  console.log(`  ✓ Step 3: Selected ${selection.chunks.length} chunks within ${selection.totalTokens} token budget`);

  // 5. Prompt Assembly & Untrusted Boundary Injection
  const { promptText, sourcesList } = formatSourcesForPrompt(selection.chunks);
  const systemPrompt = buildSystemPrompt();

  if (!promptText.includes("<untrusted_content>") || sourcesList.length === 0) {
    throw new Error("Prompt formatting failed to enforce untrusted boundary tags");
  }
  console.log(`  ✓ Step 4: Prompt assembled with ${sourcesList.length} numbered sources and injection defense`);

  // 6. Citations Extraction
  const sampleLLMAnswer = `According to the cloud compliance guidelines, Kubernetes clusters must enforce Pod Security Standards under the Restricted profile [1]. All database partitions must enforce AES-256 encryption [1]. Ingress controllers mandate TLS 1.3 [2].`;
  const cited = extractCitedSources(sampleLLMAnswer, sourcesList);

  if (cited.length === 0) {
    throw new Error("Citation extraction failed to find inline references");
  }
  console.log(`  ✓ Step 5: Verified ${cited.length} cited sources extracted from inline [n] markers`);

  console.log("\n🎉 End-to-End Ingest -> Ask Integration Test passed successfully!\n");
}

runIntegrationTest().catch((err) => {
  console.error("❌ Integration test failed:", err);
  process.exit(1);
});

