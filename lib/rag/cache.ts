import { createHash } from "crypto";
import prisma from "../db";
import { normalizeQueryText } from "./query-cache";
import { FormattedSource } from "./prompt";

export interface CachedAnswer {
  answer: string;
  sources: FormattedSource[];
  createdAt: Date;
}

/**
 * Generates an idempotent cache key for an answer based on the normalized query
 * and the sorted set of active document IDs in the knowledge base.
 */
export function generateAnswerCacheKey(
  rawQuery: string,
  documentIds: string[]
): string {
  const normalized = normalizeQueryText(rawQuery);
  const sortedDocs = [...documentIds].sort().join(",");
  const combined = `${normalized}::docs:[${sortedDocs}]`;
  return createHash("sha256").update(combined).digest("hex");
}

/**
 * Checks if a grounded answer exists in the PostgreSQL answer_cache table within its TTL.
 */
export async function getCachedAnswer(
  cacheKey: string
): Promise<CachedAnswer | null> {
  try {
    const entry = await prisma.answerCache.findUnique({
      where: { key: cacheKey },
    });

    if (!entry) return null;

    // Check TTL (default 24 hours = 86400s)
    const ageSeconds = (Date.now() - entry.createdAt.getTime()) / 1000;
    if (ageSeconds > entry.ttl) {
      // Lazy cleanup
      await prisma.answerCache.delete({ where: { key: cacheKey } }).catch(() => {});
      return null;
    }

    return {
      answer: entry.answer,
      sources: entry.sources as unknown as FormattedSource[],
      createdAt: entry.createdAt,
    };
  } catch (err) {
    console.warn("Answer cache lookup failed, skipping cache:", err);
    return null;
  }
}

/**
 * Saves a grounded answer and cited sources to the PostgreSQL answer_cache table.
 */
export async function saveAnswerToCache(
  cacheKey: string,
  answer: string,
  sources: FormattedSource[],
  ttlSeconds = 86400
): Promise<void> {
  // Only cache grounded responses that cite sources and are not refusals
  if (!answer || sources.length === 0 || answer.includes("couldn't find")) {
    return;
  }

  try {
    await prisma.answerCache.upsert({
      where: { key: cacheKey },
      update: {
        answer,
        sources: sources as unknown as object,
        createdAt: new Date(),
        ttl: ttlSeconds,
      },
      create: {
        key: cacheKey,
        answer,
        sources: sources as unknown as object,
        ttl: ttlSeconds,
      },
    });
  } catch (err) {
    console.warn("Failed to write to answer cache:", err);
  }
}

