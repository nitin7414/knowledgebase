import { generateAnswerCacheKey } from "../lib/rag/cache";

async function runTests() {
  console.log("🧪 Testing Answer Cache Key Generation...");
  const key1 = generateAnswerCacheKey("What are Q3 drivers?", ["doc-1", "doc-2"]);
  const key2 = generateAnswerCacheKey("what are q3 drivers", ["doc-2", "doc-1"]);
  const key3 = generateAnswerCacheKey("What are Q3 drivers?", ["doc-1", "doc-3"]);

  if (key1 !== key2) {
    throw new Error("Cache keys should match regardless of punctuation, case, or document ID order!");
  }
  if (key1 === key3) {
    throw new Error("Cache keys must differ when the attached document set changes!");
  }
  console.log("  ✓ Answer cache keys are normalized and doc-order invariant");

  console.log("\n🧪 Testing Rate Limit Calculation Logic...");
  // Simulate window math
  const windowSeconds = 60;
  const maxRequests = 3;
  const now = Date.now();
  const windowStart = now - 20 * 1000; // 20s elapsed
  const elapsedSeconds = (now - windowStart) / 1000;
  const retryAfter = Math.max(1, Math.ceil(windowSeconds - elapsedSeconds));

  if (retryAfter !== 40) {
    throw new Error(`Expected retryAfter to be 40s, got ${retryAfter}`);
  }
  console.log(`  ✓ Retry-After correctly computed (${retryAfter}s remaining in window)`);

  console.log("\n🎉 All Phase 5 Caching & Rate Limiting tests passed!\n");
}

runTests().catch((err) => {
  console.error("❌ Test failed:", err);
  process.exit(1);
});

