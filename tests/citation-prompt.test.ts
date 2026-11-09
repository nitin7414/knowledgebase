import { extractCitedSources, formatSourcesForPrompt, FormattedSource } from "../lib/rag/prompt";
import { routeUserQuery } from "../lib/rag/routing";
import { isModelAvailable, recordModelFailure, recordModelSuccess } from "../lib/ai/circuit-breaker";

function runTests() {
  console.log("🧪 Testing Inline Citation Parser...");
  const mockSources: FormattedSource[] = [
    {
      index: 1,
      id: "chunk-1",
      documentName: "Q3_Report.pdf",
      pageOrSection: "Page 4",
      confidence: 0.95,
      snippet: "Revenue grew 34.2% YoY...",
    },
    {
      index: 2,
      id: "chunk-2",
      documentName: "Security_Architecture.docx",
      pageOrSection: "Section 4.1",
      confidence: 0.92,
      snippet: "AES-256 is enforced at rest...",
    },
    {
      index: 3,
      id: "chunk-3",
      documentName: "Roadmap.pdf",
      pageOrSection: "Page 12",
      confidence: 0.88,
      snippet: "Vector search migration in Q4...",
    },
  ];

  // 1. Answer citing source [1] and [2]
  const responseWithCitations = `According to preliminary audits, enterprise revenue expanded by +34.2% YoY [1]. All databases enforce AES-256 [2].`;
  const cited = extractCitedSources(responseWithCitations, mockSources);

  if (cited.length !== 2) {
    throw new Error(`Expected 2 cited sources, got ${cited.length}`);
  }
  if (!cited.some((c) => c.index === 1) || !cited.some((c) => c.index === 2)) {
    throw new Error("Cited sources did not match indices [1] and [2]");
  }
  if (cited.some((c) => c.index === 3)) {
    throw new Error("Source [3] was not cited but was included in output");
  }
  console.log("  ✓ Correctly extracted only cited sources ([1] and [2]), excluded uncited [3]");

  // 2. Multi-citation like [1, 2]
  const multiCitation = `Both financial and cryptographic parameters meet criteria [1, 2].`;
  const multiCited = extractCitedSources(multiCitation, mockSources);
  if (multiCited.length !== 2) {
    throw new Error(`Multi-citation parsing failed, expected 2 sources, got ${multiCited.length}`);
  }
  console.log("  ✓ Correctly parsed multi-index inline citations like '[1, 2]'");

  console.log("\n🧪 Testing Heuristic Routing...");
  const greetingRes = routeUserQuery("Hello there!", 5);
  if (greetingRes.type !== "chitchat") {
    throw new Error("Failed to classify greeting as chitchat");
  }
  console.log("  ✓ Greetings route directly to instant response without retrieval");

  const noDocsRes = routeUserQuery("What is our revenue?", 0);
  if (noDocsRes.type !== "no_documents") {
    throw new Error("Failed to identify zero documents state");
  }
  console.log("  ✓ Zero document state identified and guided without retrieval");

  const standardQueryRes = routeUserQuery("What were our primary revenue growth drivers?", 3);
  if (standardQueryRes.type !== "retrieval") {
    throw new Error("Valid query was not routed to retrieval");
  }
  console.log("  ✓ Standard domain queries correctly routed to retrieval");

  console.log("\n🧪 Testing Circuit Breaker...");
  const testModel = "test/flaky-model";
  recordModelSuccess(testModel);
  if (!isModelAvailable(testModel)) {
    throw new Error("Model should be available initially");
  }

  // Record 2 failures to trip circuit breaker
  recordModelFailure(testModel, new Error("503 Service Unavailable"));
  recordModelFailure(testModel, new Error("503 Service Unavailable"));

  if (isModelAvailable(testModel)) {
    throw new Error("Circuit breaker failed to trip after consecutive failures");
  }
  console.log("  ✓ Circuit breaker tripped and placed model into cooldown upon consecutive failures");

  console.log("\n🎉 All Phase 4 Streaming & Citation tests passed!\n");
}

runTests();

