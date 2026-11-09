import { createHash, randomUUID } from "crypto";
import prisma, { withDbRetry } from "../db";
import { validateFileMagic } from "./magic";
import { parseDocumentBuffer } from "./parsers";
import { chunkPages } from "./chunker";
import { getEmbeddingProvider } from "../ai/gemini-embeddings";

const MAX_FILE_SIZE = 4 * 1024 * 1024; // 4.0 MB strict serverless ceiling (Vercel max payload: 4.5 MB)
const MAX_PAGES = 100;

export interface IngestionResult {
  documentId: string;
  filename: string;
  mime: string;
  size: number;
  pageCount: number;
  chunkCount: number;
  tokenCount: number;
  status: "ready" | "failed";
  reused: boolean;
  message?: string;
}

export async function ingestDocumentFile(
  buffer: Buffer,
  filename: string,
  sessionId: string
): Promise<IngestionResult> {
  // 1. File size check
  if (buffer.length > MAX_FILE_SIZE) {
    throw new Error(`File size (${(buffer.length / 1024 / 1024).toFixed(1)} MB) exceeds maximum limit of 10 MB.`);
  }

  // 2. Magic byte check
  const magicValidation = validateFileMagic(buffer, filename);
  if (!magicValidation.valid || !magicValidation.detectedMime) {
    throw new Error(magicValidation.error || "File validation failed: invalid format.");
  }
  const detectedMime = magicValidation.detectedMime;

  // 3. Compute SHA-256 file hash
  const fileHash = createHash("sha256").update(buffer).digest("hex");

  // 4. Session-level deduplication: If identical file already exists for this session
  const existingInSession = await withDbRetry(() =>
    prisma.document.findFirst({
      where: {
        sessionId,
        fileHash,
      },
      include: {
        chunks: {
          select: { id: true, tokenCount: true },
        },
      },
    })
  );

  if (existingInSession && existingInSession.status === "ready") {
    const totalTokens = existingInSession.chunks.reduce((acc, c) => acc + c.tokenCount, 0);
    return {
      documentId: existingInSession.id,
      filename: existingInSession.filename,
      mime: existingInSession.mime,
      size: existingInSession.size,
      pageCount: existingInSession.pageCount,
      chunkCount: existingInSession.chunks.length,
      tokenCount: totalTokens,
      status: "ready",
      reused: true,
      message: "Reused existing document previously uploaded in this session.",
    };
  }

  // If document exists but previously failed or was interrupted, resume cleanly
  let document: { id: string; filename: string; mime: string; size: number };

  if (existingInSession && existingInSession.status !== "ready") {
    // Resuming failed/interrupted ingestion: delete any orphan chunks before reprocessing
    await withDbRetry(() =>
      prisma.chunk.deleteMany({
        where: { documentId: existingInSession.id },
      })
    );

    document = await withDbRetry(() =>
      prisma.document.update({
        where: { id: existingInSession.id },
        data: {
          status: "processing",
          filename,
          mime: detectedMime,
          size: buffer.length,
        },
      })
    );
  } else {
    // Create new document record with 'processing' status
    document = await withDbRetry(() =>
      prisma.document.create({
        data: {
          id: randomUUID(),
          sessionId,
          filename,
          mime: detectedMime,
          size: buffer.length,
          fileHash,
          status: "processing",
          pageCount: 0,
        },
      })
    );
  }

  try {
    // 5. Parse document
    const parsed = await parseDocumentBuffer(buffer, detectedMime, filename);

    if (parsed.pageCount > MAX_PAGES) {
      throw new Error(`Document page count (${parsed.pageCount}) exceeds the maximum limit of ${MAX_PAGES} pages.`);
    }

    // 6. Structure-aware chunking
    const chunks = chunkPages(parsed.pages);

    if (chunks.length === 0) {
      throw new Error("No readable text chunks could be extracted from this document.");
    }

    // 7. Deduplicate embeddings via content_hash:
    // Check if any of these content_hashes already have embeddings stored in the DB
    const uniqueHashes = Array.from(new Set(chunks.map((c) => c.contentHash)));

    type ExistingEmbeddingRow = {
      content_hash: string;
      embedding_text: string;
    };

    const existingEmbeddingsRows: ExistingEmbeddingRow[] = await prisma.$queryRaw<ExistingEmbeddingRow[]>`
      SELECT DISTINCT ON (content_hash)
        content_hash,
        embedding::text as embedding_text
      FROM chunks
      WHERE content_hash = ANY(${uniqueHashes})
        AND embedding IS NOT NULL
    `;

    const cachedVectorMap = new Map<string, string>();
    for (const row of existingEmbeddingsRows) {
      cachedVectorMap.set(row.content_hash, row.embedding_text);
    }

    // Determine which chunks need fresh embeddings
    const chunksToEmbed = chunks.filter((c) => !cachedVectorMap.has(c.contentHash));
    const uniqueTextsToEmbed: string[] = [];
    const hashToTextMap = new Map<string, string>();

    for (const c of chunksToEmbed) {
      if (!hashToTextMap.has(c.contentHash)) {
        hashToTextMap.set(c.contentHash, c.content);
        uniqueTextsToEmbed.push(c.content);
      }
    }

    // Fetch embeddings for non-cached chunks
    if (uniqueTextsToEmbed.length > 0) {
      const provider = getEmbeddingProvider();
      const vectors = await provider.embedTexts(uniqueTextsToEmbed);

      for (let i = 0; i < uniqueTextsToEmbed.length; i++) {
        const text = uniqueTextsToEmbed[i];
        const hash = createHash("sha256").update(text.trim()).digest("hex");
        const vectorStr = `[${vectors[i].join(",")}]`;
        cachedVectorMap.set(hash, vectorStr);
      }
    }

    // 8. Insert chunks in batch with embeddings
    for (const chunk of chunks) {
      const chunkId = randomUUID();
      const vectorStr = cachedVectorMap.get(chunk.contentHash) || null;
      const metadataJson = JSON.stringify({
        filename,
        pageNumber: chunk.pageNumber,
        sectionTitle: chunk.sectionTitle,
      });

      if (vectorStr) {
        await prisma.$executeRaw`
          INSERT INTO chunks (
            id,
            document_id,
            chunk_index,
            content,
            token_count,
            page_number,
            section_title,
            metadata,
            content_hash,
            embedding
          )
          VALUES (
            ${chunkId},
            ${document.id},
            ${chunk.chunkIndex},
            ${chunk.content},
            ${chunk.tokenCount},
            ${chunk.pageNumber},
            ${chunk.sectionTitle || null},
            ${metadataJson}::jsonb,
            ${chunk.contentHash},
            ${vectorStr}::vector
          )
        `;
      } else {
        await prisma.$executeRaw`
          INSERT INTO chunks (
            id,
            document_id,
            chunk_index,
            content,
            token_count,
            page_number,
            section_title,
            metadata,
            content_hash
          )
          VALUES (
            ${chunkId},
            ${document.id},
            ${chunk.chunkIndex},
            ${chunk.content},
            ${chunk.tokenCount},
            ${chunk.pageNumber},
            ${chunk.sectionTitle || null},
            ${metadataJson}::jsonb,
            ${chunk.contentHash}
          )
        `;
      }
    }

    // 9. Update document status to ready
    const totalTokens = chunks.reduce((acc, c) => acc + c.tokenCount, 0);

    await prisma.document.update({
      where: { id: document.id },
      data: {
        status: "ready",
        pageCount: parsed.pageCount,
      },
    });

    return {
      documentId: document.id,
      filename: document.filename,
      mime: document.mime,
      size: document.size,
      pageCount: parsed.pageCount,
      chunkCount: chunks.length,
      tokenCount: totalTokens,
      status: "ready",
      reused: false,
    };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    await prisma.document.update({
      where: { id: document.id },
      data: { status: "failed" },
    });
    throw new Error(errorMsg);
  }
}

