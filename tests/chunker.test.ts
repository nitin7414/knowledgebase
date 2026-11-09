import { chunkPages } from "../lib/ingestion/chunker";
import { validateFileMagic } from "../lib/ingestion/magic";

async function runTests() {
  console.log("🧪 Testing Magic Byte Validation...");

  // 1. PDF Magic Bytes
  const validPdfHeader = Buffer.from("%PDF-1.7 sample content");
  const pdfRes = validateFileMagic(validPdfHeader, "test.pdf");
  if (!pdfRes.valid || pdfRes.detectedMime !== "application/pdf") {
    throw new Error(`PDF magic test failed: ${JSON.stringify(pdfRes)}`);
  }
  console.log("  ✓ PDF magic bytes validated");

  // 2. DOCX Magic Bytes (ZIP header)
  const validDocxHeader = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00]);
  const docxRes = validateFileMagic(validDocxHeader, "document.docx");
  if (!docxRes.valid || docxRes.detectedMime !== "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
    throw new Error(`DOCX magic test failed: ${JSON.stringify(docxRes)}`);
  }
  console.log("  ✓ DOCX magic bytes validated");

  // 3. Invalid file magic
  const invalidBuf = Buffer.from([0x00, 0x01, 0x02, 0x03]);
  const invalidRes = validateFileMagic(invalidBuf, "test.pdf");
  if (invalidRes.valid) {
    throw new Error("Invalid buffer should have failed magic validation");
  }
  console.log("  ✓ Invalid file format correctly rejected");

  console.log("\n🧪 Testing Structure-Aware Chunker...");
  const samplePages = [
    {
      pageNumber: 1,
      text: `# Executive Overview\n\nRevenue for the fiscal quarter climbed by 34.2% YoY. Growth was driven by enterprise expansions.\n\n# Operational Results\n\nOperating costs fell by 12% across North American facilities. Gross margins remained resilient at 78.5%.`,
    },
    {
      pageNumber: 2,
      text: `### Compliance Matrix\n\nAll servers adhere to SOC2 Type II controls. Data is encrypted using AES-256 at rest.\n\nTLS 1.3 is enforced on all ingress endpoints. Keys are rotated annually.`,
    },
  ];

  const chunks = chunkPages(samplePages, { targetTokens: 30, overlapTokens: 5, minTokens: 5 });

  if (chunks.length === 0) {
    throw new Error("Chunker returned zero chunks");
  }

  console.log(`  ✓ Produced ${chunks.length} chunks from ${samplePages.length} pages`);

  // Verify structure metadata
  const chunk1 = chunks[0];
  if (!chunk1.contentHash || !chunk1.pageNumber || !chunk1.sectionTitle) {
    throw new Error(`Chunk missing metadata: ${JSON.stringify(chunk1)}`);
  }
  console.log(`  ✓ Metadata preserved: page ${chunk1.pageNumber}, section '${chunk1.sectionTitle}', tokens: ${chunk1.tokenCount}`);

  // Test exact duplicate dropping
  const duplicatePages = [
    { pageNumber: 1, text: "Exact same duplicate paragraph text here for testing." },
    { pageNumber: 2, text: "Exact same duplicate paragraph text here for testing." },
  ];
  const dedupChunks = chunkPages(duplicatePages, { targetTokens: 100, minTokens: 3 });
  if (dedupChunks.length !== 1) {
    throw new Error(`Expected 1 unique chunk from duplicate text, got ${dedupChunks.length}`);
  }
  console.log("  ✓ Duplicate chunk content successfully deduplicated by content_hash");

  console.log("\n🎉 All Phase 2 Ingestion & Chunker tests passed!\n");
}

runTests().catch((err) => {
  console.error("❌ Test failed:", err);
  process.exit(1);
});

