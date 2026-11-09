import { createHash } from "crypto";
import { countTokens } from "../tokens";
import { ParsedPage } from "./parsers";

export interface DocumentChunk {
  chunkIndex: number;
  content: string;
  tokenCount: number;
  pageNumber: number;
  sectionTitle?: string;
  contentHash: string;
}

interface ChunkerOptions {
  targetTokens?: number; // default ~400
  overlapTokens?: number; // default ~50 (~12%)
  minTokens?: number; // default ~20 (drop near-empty)
}

const HEADING_REGEX = /^(?:#{1,6}\s+|(?:\d+\.)+\d*\s+|[A-Z0-9\s]{4,}:?$|Section\s+\d+|Chapter\s+\d+)/i;

/**
 * Splits text into sentences safely using punctuation boundaries.
 */
function splitIntoSentences(paragraph: string): string[] {
  // Regex splitting by sentence-ending punctuation followed by whitespace, keeping delimiters
  const rawSentences = paragraph
    .replace(/([.?!])\s+/g, "$1|||")
    .split("|||")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  return rawSentences.length > 0 ? rawSentences : [paragraph];
}

/**
 * Structure-aware recursive chunker:
 * - Respects page boundaries and headings
 * - Groups sentences up to target tokens (~350-500)
 * - Enforces ~12% overlap without breaking mid-sentence
 * - Tracks section titles and page numbers
 * - Drops near-empty and exact duplicate chunks (by SHA-256 content_hash)
 */
export function chunkPages(
  pages: ParsedPage[],
  options: ChunkerOptions = {}
): DocumentChunk[] {
  const targetTokens = options.targetTokens ?? 400;
  const overlapTokens = options.overlapTokens ?? 48; // ~12%
  const minTokens = options.minTokens ?? 20;

  const chunks: DocumentChunk[] = [];
  const seenContentHashes = new Set<string>();
  let currentSectionTitle = "General";
  let globalChunkIndex = 0;

  for (const page of pages) {
    const pageText = page.text;
    const lines = pageText.split("\n");

    // Reconstruct paragraphs and update section headers
    const paragraphs: { text: string; section: string }[] = [];
    let currentParaLines: string[] = [];

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) {
        if (currentParaLines.length > 0) {
          paragraphs.push({
            text: currentParaLines.join(" "),
            section: currentSectionTitle,
          });
          currentParaLines = [];
        }
        continue;
      }

      // Check if line looks like a heading
      if (HEADING_REGEX.test(line) && line.length < 90) {
        if (currentParaLines.length > 0) {
          paragraphs.push({
            text: currentParaLines.join(" "),
            section: currentSectionTitle,
          });
          currentParaLines = [];
        }
        currentSectionTitle = line.replace(/^#{1,6}\s*/, "").trim();
        continue;
      }

      currentParaLines.push(line);
    }

    if (currentParaLines.length > 0) {
      paragraphs.push({
        text: currentParaLines.join(" "),
        section: currentSectionTitle,
      });
    }

    // Now chunk paragraphs into token-bounded windows with sentence overlap
    let currentSentenceBuffer: { sentence: string; tokens: number; section: string }[] = [];
    let currentTokens = 0;

    for (const para of paragraphs) {
      const sentences = splitIntoSentences(para.text);

      for (const sentence of sentences) {
        const sentenceTokens = countTokens(sentence);

        // If adding this sentence exceeds targetTokens and we have at least 1 sentence
        if (currentTokens + sentenceTokens > targetTokens && currentSentenceBuffer.length > 0) {
          // Emit chunk
          const chunkContent = currentSentenceBuffer.map((s) => s.sentence).join(" ");
          const chunkTokenCount = countTokens(chunkContent);

          if (chunkTokenCount >= minTokens) {
            const hash = createHash("sha256").update(chunkContent.trim()).digest("hex");
            if (!seenContentHashes.has(hash)) {
              seenContentHashes.add(hash);
              chunks.push({
                chunkIndex: globalChunkIndex++,
                content: chunkContent,
                tokenCount: chunkTokenCount,
                pageNumber: page.pageNumber,
                sectionTitle: currentSentenceBuffer[0]?.section || currentSectionTitle,
                contentHash: hash,
              });
            }
          }

          // Compute overlap sentences from the end of the buffer (~12% tokens)
          let overlapAcc = 0;
          const overlapBuffer: typeof currentSentenceBuffer = [];
          for (let i = currentSentenceBuffer.length - 1; i >= 0; i--) {
            const item = currentSentenceBuffer[i];
            if (overlapAcc + item.tokens <= overlapTokens || overlapBuffer.length === 0) {
              overlapBuffer.unshift(item);
              overlapAcc += item.tokens;
            } else {
              break;
            }
          }

          currentSentenceBuffer = [...overlapBuffer, { sentence, tokens: sentenceTokens, section: para.section }];
          currentTokens = currentSentenceBuffer.reduce((acc, curr) => acc + curr.tokens, 0);
        } else {
          currentSentenceBuffer.push({
            sentence,
            tokens: sentenceTokens,
            section: para.section,
          });
          currentTokens += sentenceTokens;
        }
      }
    }

    // Flush any remaining sentences on this page
    if (currentSentenceBuffer.length > 0) {
      const chunkContent = currentSentenceBuffer.map((s) => s.sentence).join(" ");
      const chunkTokenCount = countTokens(chunkContent);

      if (chunkTokenCount >= minTokens) {
        const hash = createHash("sha256").update(chunkContent.trim()).digest("hex");
        if (!seenContentHashes.has(hash)) {
          seenContentHashes.add(hash);
          chunks.push({
            chunkIndex: globalChunkIndex++,
            content: chunkContent,
            tokenCount: chunkTokenCount,
            pageNumber: page.pageNumber,
            sectionTitle: currentSentenceBuffer[0]?.section || currentSectionTitle,
            contentHash: hash,
          });
        }
      }
    }
  }

  return chunks;
}

