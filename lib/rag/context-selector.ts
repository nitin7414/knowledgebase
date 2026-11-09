import { HybridSearchResult } from "./hybrid-search";

export interface ContextSelectorOptions {
  tokenBudget?: number; // default ~2500
  rrfThreshold?: number; // default ~0.012
  similarityThreshold?: number; // default ~0.35
  diversityLambda?: number; // 0.7 balances relevance vs diversity
}

export interface SelectedContext {
  chunks: HybridSearchResult[];
  totalTokens: number;
  droppedCount: number;
  passedThreshold: boolean;
  refusalMessage?: string;
}

/**
 * Calculates n-gram / word set Jaccard similarity between two texts
 * to detect near-duplicate ideas without an expensive LLM reranker call.
 */
function calculateTextSimilarity(a: string, b: string): number {
  const getWordSet = (text: string) => {
    return new Set(
      text
        .toLowerCase()
        .replace(/[^\w\s]/g, "")
        .split(/\s+/)
        .filter((w) => w.length > 2)
    );
  };

  const setA = getWordSet(a);
  const setB = getWordSet(b);

  if (setA.size === 0 || setB.size === 0) return 0;

  let intersection = 0;
  for (const word of setA) {
    if (setB.has(word)) intersection++;
  }

  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Selects and packs context chunks:
 * 1. Filters chunks below RRF / vector similarity threshold.
 * 2. Applies MMR-style diversity suppression on near-duplicates.
 * 3. Greedily packs up to tokenBudget.
 * 4. Reorders selected chunks by original document position (documentId + chunkIndex)
 *    so the assembled context flows coherently.
 */
export function selectContextChunks(
  candidates: HybridSearchResult[],
  options: ContextSelectorOptions = {}
): SelectedContext {
  const tokenBudget =
    options.tokenBudget ??
    Number(process.env.RAG_CONTEXT_TOKEN_BUDGET || 2500);
  const rrfThreshold =
    options.rrfThreshold ??
    Number(process.env.RAG_RRF_THRESHOLD || 0.015);
  const similarityThreshold =
    options.similarityThreshold ??
    (process.env.RAG_VECTOR_SIMILARITY_THRESHOLD
      ? Number(process.env.RAG_VECTOR_SIMILARITY_THRESHOLD)
      : 0.55);
  const diversityLambda = options.diversityLambda ?? 0.75;

  // 1. Filter below threshold
  const filtered = candidates.filter((c) => {
    // A chunk qualifies only if:
    // It has a strong semantic vector similarity (>= similarityThreshold)
    // OR it has a verified full-text keyword match (textScore > 0) with a valid RRF score
    const hasTextMatch = (c.textRank !== null && c.textScore > 0);
    const hasStrongVectorMatch = c.vectorSimilarity >= similarityThreshold;

    return hasStrongVectorMatch || (hasTextMatch && c.rrfScore >= rrfThreshold);
  });

  if (filtered.length === 0) {
    return {
      chunks: [],
      totalTokens: 0,
      droppedCount: candidates.length,
      passedThreshold: false,
      refusalMessage:
        "I couldn't find this information in your uploaded documents. Please try rephrasing or verifying that the relevant file is attached.",
    };
  }

  // 2. MMR Diversity Selection
  const selected: HybridSearchResult[] = [];
  const remaining = [...filtered];
  let accumulatedTokens = 0;

  // Normalize RRF scores across candidates for MMR calculation
  const maxRrf = Math.max(...remaining.map((r) => r.rrfScore), 0.001);

  while (remaining.length > 0 && accumulatedTokens < tokenBudget) {
    let bestIndex = -1;
    let bestMmrScore = -Infinity;

    for (let i = 0; i < remaining.length; i++) {
      const candidate = remaining[i];

      // Normalized relevance
      const normRelevance = candidate.rrfScore / maxRrf;

      // Max similarity to any already selected chunk
      let maxSimToSelected = 0;
      for (const sel of selected) {
        const sim = calculateTextSimilarity(candidate.content, sel.content);
        if (sim > maxSimToSelected) maxSimToSelected = sim;
      }

      // Suppress near-identical duplicate chunks (> 75% word overlap)
      if (maxSimToSelected > 0.75) {
        continue;
      }

      const mmrScore =
        diversityLambda * normRelevance - (1 - diversityLambda) * maxSimToSelected;

      if (mmrScore > bestMmrScore) {
        bestMmrScore = mmrScore;
        bestIndex = i;
      }
    }

    if (bestIndex === -1) {
      // No more distinct candidates that pass duplicate suppression
      break;
    }

    const chosen = remaining.splice(bestIndex, 1)[0];

    // Check token budget
    if (accumulatedTokens + chosen.tokenCount <= tokenBudget || selected.length === 0) {
      selected.push(chosen);
      accumulatedTokens += chosen.tokenCount;
    } else {
      // Budget reached
      break;
    }
  }

  // 3. Reorder selected chunks by document position so context reads coherently
  const reordered = [...selected].sort((a, b) => {
    if (a.documentId !== b.documentId) {
      return a.documentId.localeCompare(b.documentId);
    }
    return a.chunkIndex - b.chunkIndex;
  });

  return {
    chunks: reordered,
    totalTokens: accumulatedTokens,
    droppedCount: candidates.length - selected.length,
    passedThreshold: true,
  };
}

