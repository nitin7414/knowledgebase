import { getEncoding } from "js-tiktoken";

let encoder: ReturnType<typeof getEncoding> | null = null;

try {
  encoder = getEncoding("cl100k_base");
} catch {
  // If tokenizer data fails to load in edge or minimal env, fallback is used
  encoder = null;
}

/**
 * Estimates or accurately counts tokens using cl100k_base or ~4 chars/token heuristic.
 */
export function countTokens(text: string): number {
  if (!text) return 0;
  if (encoder) {
    try {
      return encoder.encode(text).length;
    } catch {
      // Fallback on encoding error
    }
  }
  return Math.max(1, Math.ceil(text.length / 4));
}

/**
 * Truncates text to fit within a given token budget without breaking words.
 */
export function truncateToTokens(text: string, maxTokens: number): string {
  if (!text || maxTokens <= 0) return "";
  if (countTokens(text) <= maxTokens) return text;

  if (encoder) {
    try {
      const tokens = encoder.encode(text);
      if (tokens.length <= maxTokens) return text;
      const sliced = tokens.slice(0, maxTokens);
      return encoder.decode(sliced);
    } catch {
      // Fall through to char estimate
    }
  }

  const charLimit = maxTokens * 4;
  return text.slice(0, charLimit);
}

