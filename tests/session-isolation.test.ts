import assert from "assert";
import { randomUUID } from "crypto";
import prisma, { withDbRetry } from "../lib/db";
import { executeHybridSearch } from "../lib/rag/hybrid-search";

async function runSessionIsolationTest() {
  console.log("==================================================================");
  console.log("🔒 Running Cross-Session Isolation & Security Test");
  console.log("==================================================================\n");

  const timestamp = Date.now();
  const sessionA = `test-session-a-${timestamp}`;
  const sessionB = `test-session-b-${timestamp}`;

  try {
    // 1. Create document & chunk for Session A
    console.log("📝 Step 1: Creating isolated test records for Session A...");
    const docA = await withDbRetry(() =>
      prisma.document.create({
        data: {
          id: randomUUID(),
          sessionId: sessionA,
          filename: "confidential_session_a.txt",
          mime: "text/plain",
          size: 1024,
          fileHash: `hash-a-${timestamp}`,
          status: "ready",
          pageCount: 1,
        },
      })
    );

    const chunkA = await withDbRetry(() =>
      prisma.chunk.create({
        data: {
          id: randomUUID(),
          documentId: docA.id,
          chunkIndex: 0,
          content: "Confidential Project Phoenix documentation for Session A authorized personnel only.",
          tokenCount: 15,
          pageNumber: 1,
          sectionTitle: "Project Phoenix",
          contentHash: `chunk-hash-a-${timestamp}`,
        },
      })
    );
    console.log(`  ✓ Created Document A (${docA.id}) and Chunk A (${chunkA.id}) in Session A.`);

    // 2. Create document & chunk for Session B
    console.log("📝 Step 2: Creating isolated test records for Session B...");
    const docB = await withDbRetry(() =>
      prisma.document.create({
        data: {
          id: randomUUID(),
          sessionId: sessionB,
          filename: "confidential_session_b.txt",
          mime: "text/plain",
          size: 2048,
          fileHash: `hash-b-${timestamp}`,
          status: "ready",
          pageCount: 1,
        },
      })
    );

    const chunkB = await withDbRetry(() =>
      prisma.chunk.create({
        data: {
          id: randomUUID(),
          documentId: docB.id,
          chunkIndex: 0,
          content: "Classified Project Pegasus documentation for Session B authorized personnel only.",
          tokenCount: 15,
          pageNumber: 1,
          sectionTitle: "Project Pegasus",
          contentHash: `chunk-hash-b-${timestamp}`,
        },
      })
    );
    console.log(`  ✓ Created Document B (${docB.id}) and Chunk B (${chunkB.id}) in Session B.`);

    // 3. Test Document query isolation
    console.log("🔍 Step 3: Verifying document list query isolation...");
    const docsForA = await withDbRetry(() =>
      prisma.document.findMany({ where: { sessionId: sessionA } })
    );
    const docsForB = await withDbRetry(() =>
      prisma.document.findMany({ where: { sessionId: sessionB } })
    );

    assert.strictEqual(docsForA.length, 1, "Session A should see exactly 1 document");
    assert.strictEqual(docsForA[0].id, docA.id, "Session A should only see its own document");
    assert.strictEqual(docsForB.length, 1, "Session B should see exactly 1 document");
    assert.strictEqual(docsForB[0].id, docB.id, "Session B should only see its own document");
    console.log("  ✓ Document isolation verified: Session A cannot list Session B documents.");

    // 4. Test Conversation isolation
    console.log("🔍 Step 4: Verifying conversation query isolation...");
    const convA = await withDbRetry(() =>
      prisma.conversation.create({
        data: {
          sessionId: sessionA,
          title: "Session A Private Conversation",
        },
      })
    );
    const convB = await withDbRetry(() =>
      prisma.conversation.create({
        data: {
          sessionId: sessionB,
          title: "Session B Private Conversation",
        },
      })
    );

    const convsForA = await withDbRetry(() =>
      prisma.conversation.findMany({ where: { sessionId: sessionA } })
    );
    assert.strictEqual(convsForA.length, 1, "Session A should see exactly 1 conversation");
    assert.strictEqual(convsForA[0].id, convA.id, "Session A should only see conversation A");

    const convsForB = await withDbRetry(() =>
      prisma.conversation.findMany({ where: { sessionId: sessionB } })
    );
    assert.strictEqual(convsForB.length, 1, "Session B should see exactly 1 conversation");
    assert.strictEqual(convsForB[0].id, convB.id, "Session B should only see conversation B");
    console.log("  ✓ Conversation isolation verified: Session A cannot access Session B conversations.");

    // 5. Test Hybrid Search isolation
    console.log("🔍 Step 5: Verifying hybrid retrieval isolation under adversary query...");
    // A dummy 768-dim zero vector for search
    const dummyVector = new Array(768).fill(0.01);

    // Session A queries for Session B's content ("Pegasus")
    const searchResultsForA = await executeHybridSearch({
      sessionId: sessionA,
      query: "Pegasus",
      queryVector: dummyVector,
      limit: 10,
    });

    const leakedFromB = searchResultsForA.filter((r) => r.documentId === docB.id);
    assert.strictEqual(
      leakedFromB.length,
      0,
      "SECURITY BREACH: Session A retrieval returned chunks from Session B!"
    );
    console.log("  ✓ Retrieval isolation verified: Search under Session A returned 0 chunks from Session B.");

    // Session B queries for Session A's content ("Phoenix")
    const searchResultsForB = await executeHybridSearch({
      sessionId: sessionB,
      query: "Phoenix",
      queryVector: dummyVector,
      limit: 10,
    });

    const leakedFromA = searchResultsForB.filter((r) => r.documentId === docA.id);
    assert.strictEqual(
      leakedFromA.length,
      0,
      "SECURITY BREACH: Session B retrieval returned chunks from Session A!"
    );
    console.log("  ✓ Retrieval isolation verified: Search under Session B returned 0 chunks from Session A.");

    console.log("\n==================================================================");
    console.log("✅ ALL SESSION ISOLATION TESTS PASSED!");
    console.log("==================================================================");
  } finally {
    // Cleanup test data
    console.log("\n🧹 Cleaning up test fixtures...");
    await withDbRetry(async () => {
      await prisma.chunk.deleteMany({
        where: { document: { sessionId: { in: [sessionA, sessionB] } } },
      });
      await prisma.document.deleteMany({
        where: { sessionId: { in: [sessionA, sessionB] } },
      });
      await prisma.conversation.deleteMany({
        where: { sessionId: { in: [sessionA, sessionB] } },
      });
    });
    console.log("  ✓ Test artifacts purged.");
  }
}

runSessionIsolationTest()
  .catch((err) => {
    console.error("❌ Session isolation test failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

