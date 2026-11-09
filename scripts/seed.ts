import { readFileSync, existsSync } from "fs";
import { join } from "path";
import prisma, { withDbRetry } from "../lib/db";
import { ingestDocumentFile } from "../lib/ingestion/pipeline";

const DEMO_SESSION_ID = process.env.DEMO_SESSION_ID || "demo-default-session";

async function main() {
  console.log("==================================================================");
  console.log("🌱 Khabri RAG Production Database Seed Suite");
  console.log("==================================================================\n");

  // 1. Probe database connectivity
  console.log("🔌 Checking Neon Postgres connectivity...");
  await withDbRetry(() => prisma.$queryRaw`SELECT 1`);
  console.log("  ✓ Database connection established.\n");

  // 2. Ingest sample corpus documents
  const corpusDir = join(process.cwd(), "eval", "corpus");
  const seedFiles = [
    "financial_audit.txt",
    "security_architecture.txt",
    "support_runbook.txt",
    "q2_financial_preliminary.txt",
    "developer_security_guidelines.txt",
    "internal_sla_handbook.txt",
  ];

  console.log(`📦 Ingesting sample corpus into session "${DEMO_SESSION_ID}"...`);
  for (const filename of seedFiles) {
    const filePath = join(corpusDir, filename);
    if (!existsSync(filePath)) {
      console.warn(`  ⚠️ Warning: File not found: ${filePath}, skipping.`);
      continue;
    }

    const buffer = readFileSync(filePath);
    try {
      const result = await ingestDocumentFile(buffer, filename, DEMO_SESSION_ID);
      console.log(
        `  ✓ Ingested "${filename}": ${result.chunkCount} chunks, status: ${result.status} (reused: ${result.reused})`
      );
    } catch (err: unknown) {
      console.error(`  ✗ Failed to ingest "${filename}":`, err instanceof Error ? err.message : err);
    }
  }

  // 3. Create starter conversation if none exists
  const existingConv = await withDbRetry(() =>
    prisma.conversation.findFirst({
      where: { sessionId: DEMO_SESSION_ID },
    })
  );

  if (!existingConv) {
    console.log("\n💬 Creating sample demonstration conversation...");
    const conv = await withDbRetry(() =>
      prisma.conversation.create({
        data: {
          sessionId: DEMO_SESSION_ID,
          title: "Q3 Financials & Security Overview",
          messages: {
            create: [
              {
                role: "user",
                content: "What was our total consolidated revenue and gross profit margin in Q3 2026?",
              },
              {
                role: "assistant",
                content:
                  "According to the Q3 2026 Financial Audit [1], the consolidated gross revenue was **$83.4 million** (representing +34.2% YoY growth), and the gross profit margin reached **77.4%** ($64.5 million).",
                sources: [
                  {
                    citationNumber: 1,
                    documentName: "financial_audit.txt",
                    sectionTitle: "Section 1: Executive Summary",
                    pageNumber: 1,
                    snippet: "Total consolidated gross revenue for Q3 2026 was $83.4M...",
                  },
                ],
                usage: {
                  promptTokens: 420,
                  completionTokens: 52,
                  totalTokens: 472,
                  model: "openrouter/free",
                },
              },
            ],
          },
        },
      })
    );
    console.log(`  ✓ Sample conversation created with ID: ${conv.id}`);
  } else {
    console.log(`\n💬 Starter conversation already exists (${existingConv.id}).`);
  }

  console.log("\n==================================================================");
  console.log("✨ Seed completed successfully! Khabri is ready for instant demo.");
  console.log("==================================================================");
}

main()
  .catch((e) => {
    console.error("Seed script failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

