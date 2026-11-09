import { extractText } from "unpdf";
import mammoth from "mammoth";
import { cleanExtractedText, stripRepeatedHeadersFooters } from "../clean";
import { AllowedMime } from "../magic";

export interface ParsedPage {
  pageNumber: number;
  text: string;
}

export interface ParseResult {
  pages: ParsedPage[];
  pageCount: number;
  totalCharacters: number;
}

export async function parseDocumentBuffer(
  buffer: Buffer,
  mime: AllowedMime,
  filename: string
): Promise<ParseResult> {
  if (mime === "application/pdf") {
    return parsePdf(buffer);
  } else if (
    mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    filename.endsWith(".docx")
  ) {
    return parseDocx(buffer);
  } else {
    return parsePlainText(buffer);
  }
}

async function parsePdf(buffer: Buffer): Promise<ParseResult> {
  try {
    const uint8 = new Uint8Array(buffer);
    const result = await extractText(uint8, { mergePages: false });

    const totalPages = result.totalPages || (Array.isArray(result.text) ? result.text.length : 1);
    let rawPageTexts: string[] = [];

    if (Array.isArray(result.text)) {
      rawPageTexts = result.text.map((t) => (typeof t === "string" ? t : ""));
    } else if (typeof result.text === "string") {
      rawPageTexts = [result.text];
    }

    // Strip repeated running headers & footers across pages
    const cleanedPages = stripRepeatedHeadersFooters(rawPageTexts);

    const pages: ParsedPage[] = [];
    let totalChars = 0;

    cleanedPages.forEach((pageContent, idx) => {
      const cleaned = cleanExtractedText(pageContent);
      if (cleaned.length > 0) {
        pages.push({
          pageNumber: idx + 1,
          text: cleaned,
        });
        totalChars += cleaned.length;
      }
    });

    if (totalChars === 0 || pages.length === 0) {
      throw new Error(
        "PDF contains no extractable text (it may be scanned or image-only). OCR is not supported in v1."
      );
    }

    return {
      pages,
      pageCount: totalPages,
      totalCharacters: totalChars,
    };
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes("OCR")) {
      throw err;
    }
    throw new Error(
      `Failed to parse PDF document: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

async function parseDocx(buffer: Buffer): Promise<ParseResult> {
  try {
    const result = await mammoth.extractRawText({ buffer });
    const rawText = result.value || "";
    const cleaned = cleanExtractedText(rawText);

    if (!cleaned.trim()) {
      throw new Error("DOCX document contains no readable text.");
    }

    return {
      pages: [
        {
          pageNumber: 1,
          text: cleaned,
        },
      ],
      pageCount: 1,
      totalCharacters: cleaned.length,
    };
  } catch (err: unknown) {
    throw new Error(
      `Failed to parse DOCX document: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

async function parsePlainText(buffer: Buffer): Promise<ParseResult> {
  const rawText = buffer.toString("utf-8");
  const cleaned = cleanExtractedText(rawText);

  if (!cleaned.trim()) {
    throw new Error("Text document is empty or contains only whitespace.");
  }

  return {
    pages: [
      {
        pageNumber: 1,
        text: cleaned,
      },
    ],
    pageCount: 1,
    totalCharacters: cleaned.length,
  };
}

