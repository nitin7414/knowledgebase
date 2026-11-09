import { NextRequest, NextResponse } from "next/server";
import prisma, { withDbRetry } from "@/lib/db";

export const maxDuration = 60; // Allow 60s for batch cleanup

export async function GET(req: NextRequest) {
  try {
    // 1. Authenticate Vercel Cron invocation
    const authHeader = req.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;

    if (!cronSecret) {
      return NextResponse.json(
        { error: "Server misconfiguration: CRON_SECRET is not configured." },
        { status: 500 }
      );
    }

    if (authHeader !== `Bearer ${cronSecret}`) {
      const url = new URL(req.url);
      const queryKey = url.searchParams.get("key");
      if (queryKey !== cronSecret) {
        return NextResponse.json({ error: "Unauthorized cron execution." }, { status: 401 });
      }
    }

    // 2. Compute retention cutoff date
    const retentionDays = Number(process.env.DATA_RETENTION_DAYS || 7);
    const cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

    console.log(`[RetentionCron] Purging data older than ${retentionDays} days (before ${cutoffDate.toISOString()})...`);

    // 3. Delete expired documents (Cascade relation purges all chunks and embeddings)
    const deletedDocs = await withDbRetry(() =>
      prisma.document.deleteMany({
        where: {
          createdAt: { lt: cutoffDate },
        },
      })
    );

    // 4. Delete expired conversations (Cascade relation purges all messages)
    const deletedConvs = await withDbRetry(() =>
      prisma.conversation.deleteMany({
        where: {
          updatedAt: { lt: cutoffDate },
        },
      })
    );

    // 5. Purge expired rate limits and query caches
    const deletedRateLimits = await withDbRetry(() =>
      prisma.rateLimit.deleteMany({
        where: {
          windowStart: { lt: cutoffDate },
        },
      })
    );

    const deletedCaches = await withDbRetry(() =>
      prisma.answerCache.deleteMany({
        where: {
          createdAt: { lt: cutoffDate },
        },
      })
    );

    const result = {
      success: true,
      timestamp: new Date().toISOString(),
      retentionDays,
      cutoffDate: cutoffDate.toISOString(),
      purged: {
        documents: deletedDocs.count,
        conversations: deletedConvs.count,
        rateLimits: deletedRateLimits.count,
        answerCaches: deletedCaches.count,
      },
    };

    console.log("[RetentionCron] Cleanup finished:", result.purged);

    return NextResponse.json(result);
  } catch (err: unknown) {
    console.error("[RetentionCron] Error executing retention cleanup:", err);
    return NextResponse.json(
      {
        error: "Retention cleanup failed",
        message: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    );
  }
}
