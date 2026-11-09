import { createChatCompletion, ChatMessageParam } from "../ai/openrouter";

const PRONOUN_REFERENCE_REGEX =
  /\b(?:it|its|this|that|these|those|they|them|their|former|latter|second|third|previous|above|same|what\s+about|how\s+about|why\s+so)\b/i;

export interface HistoryTurn {
  role: "user" | "assistant";
  content: string;
}

/**
 * Checks whether a query needs rewriting and executes a cheap standalone rewrite call (max ~60 tokens).
 * Skips the LLM call entirely whenever the query is already standalone.
 */
export async function rewriteQueryIfNeeded(
  rawQuery: string,
  history: HistoryTurn[]
): Promise<{ rewrittenQuery: string; rewritten: boolean }> {
  // If no conversation history, query is already standalone
  if (!history || history.length === 0) {
    return { rewrittenQuery: rawQuery, rewritten: false };
  }

  const trimmed = rawQuery.trim();
  const isShort = trimmed.length < 25;
  const hasReference = PRONOUN_REFERENCE_REGEX.test(trimmed);

  // If query is sufficiently descriptive and contains no pronouns/references, skip call
  if (!isShort && !hasReference) {
    return { rewrittenQuery: rawQuery, rewritten: false };
  }

  // Use only the last 2 turns for minimal token overhead
  const recentHistory = history.slice(-2);

  const promptMessages: ChatMessageParam[] = [
    {
      role: "system",
      content:
        "You are an expert search query reformulator. Rewrite the user's latest follow-up question into a single, self-contained standalone search query. Do NOT answer the question. Output ONLY the rewritten query with no quotes or preamble.",
    },
    ...recentHistory.map((h) => ({
      role: h.role,
      content: h.content.slice(0, 300), // Limit historical turn length
    })),
    {
      role: "user",
      content: `Latest question: "${rawQuery}"\nRewrite as standalone search query:`,
    },
  ];

  try {
    const result = await createChatCompletion(promptMessages, {
      maxTokens: 60,
      temperature: 0.1,
    });

    const candidate = result.content.replace(/^["']|["']$/g, "").trim();
    if (candidate && candidate.length > 3) {
      return { rewrittenQuery: candidate, rewritten: true };
    }
  } catch (err) {
    console.warn("Query rewriting failed, falling back to raw query:", err);
  }

  return { rewrittenQuery: rawQuery, rewritten: false };
}

