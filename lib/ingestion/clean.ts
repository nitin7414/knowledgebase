/**
 * Normalizes text extracted from documents:
 * - Fixes word break hyphenations (e.g. "con-\nnected" -> "connected")
 * - Cleans repetitive headers/footers across pages
 * - Normalizes Unicode spaces and control characters
 */
export function cleanExtractedText(text: string): string {
  if (!text) return "";

  // 1. Normalize line breaks to \n
  let cleaned = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  // 2. Fix hyphenation at line breaks: "trans-\naction" -> "transaction"
  cleaned = cleaned.replace(/([a-zA-Z]+)-\n\s*([a-zA-Z]+)/g, "$1$2");

  // 3. Remove non-printable control characters except standard tabs and newlines
  cleaned = cleaned.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");

  // 4. Normalize weird Unicode whitespace to standard space
  cleaned = cleaned.replace(/[\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]/g, " ");

  // 5. Collapse excessive spaces in lines (keep indentation reasonable)
  cleaned = cleaned
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .join("\n");

  // 6. Collapse 3+ newlines to 2 newlines
  cleaned = cleaned.replace(/\n{3,}/g, "\n\n");

  return cleaned.trim();
}

/**
 * Strips repeated running headers and footers across pages in multi-page documents.
 */
export function stripRepeatedHeadersFooters(pageTexts: string[]): string[] {
  if (pageTexts.length <= 1) return pageTexts;

  // Identify first lines and last lines of each page
  const firstLines: string[] = [];
  const lastLines: string[] = [];

  pageTexts.forEach((page) => {
    const lines = page.split("\n").filter((l) => l.trim().length > 0);
    if (lines.length > 0) {
      firstLines.push(lines[0]);
      lastLines.push(lines[lines.length - 1]);
    }
  });

  const countOccurrences = (arr: string[]): Record<string, number> => {
    const counts: Record<string, number> = {};
    arr.forEach((item) => {
      if (item.length > 3) {
        counts[item] = (counts[item] || 0) + 1;
      }
    });
    return counts;
  };

  const firstCounts = countOccurrences(firstLines);
  const lastCounts = countOccurrences(lastLines);

  const threshold = Math.max(2, Math.floor(pageTexts.length * 0.4));

  const repeatedHeaders = new Set(
    Object.keys(firstCounts).filter((k) => firstCounts[k] >= threshold)
  );
  const repeatedFooters = new Set(
    Object.keys(lastCounts).filter((k) => lastCounts[k] >= threshold)
  );

  return pageTexts.map((page) => {
    const lines = page.split("\n");
    const filtered = lines.filter((line) => {
      const trimmed = line.trim();
      if (repeatedHeaders.has(trimmed)) return false;
      if (repeatedFooters.has(trimmed)) return false;
      return true;
    });
    return filtered.join("\n").trim();
  });
}

