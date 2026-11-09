import { NextRequest, NextResponse } from "next/server";
import prisma, { withDbRetry } from "@/lib/db";

export const maxDuration = 30;

export async function GET(req: NextRequest) {
  try {
    // 1. Authenticate admin request
    const adminSecret = process.env.ADMIN_SECRET || process.env.CRON_SECRET || "khabri-admin-telemetry-2026";
    const authHeader = req.headers.get("authorization");
    const secretHeader = req.headers.get("x-admin-secret");
    const querySecret = new URL(req.url).searchParams.get("secret");

    const providedSecret =
      secretHeader ||
      (authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null) ||
      querySecret;

    if (!providedSecret || providedSecret !== adminSecret) {
      return NextResponse.json(
        { error: "Unauthorized", message: "Invalid or missing admin credentials." },
        { status: 401 }
      );
    }

    // 2. Fetch database counts
    const [convCount, msgCount, docCount, chunkCount, storageAgg] = await withDbRetry(() =>
      Promise.all([
        prisma.conversation.count(),
        prisma.message.count(),
        prisma.document.count(),
        prisma.chunk.count(),
        prisma.document.aggregate({ _sum: { size: true } }),
      ])
    );

    // 3. Aggregate assistant telemetry from last 1,000 assistant messages
    const assistantMessages = await withDbRetry(() =>
      prisma.message.findMany({
        where: { role: "assistant" },
        select: { usage: true, createdAt: true },
        orderBy: { createdAt: "desc" },
        take: 1000,
      })
    );

    let cacheHits = 0;
    let fallbackCount = 0;
    let totalPromptTokens = 0;
    let totalCompletionTokens = 0;
    let totalLatencyMs = 0;
    const modelDistribution: Record<string, number> = {};

    for (const msg of assistantMessages) {
      const usage = msg.usage as Record<string, unknown> | null;
      if (usage) {
        if (usage.cacheHit === true) cacheHits++;
        const model = (usage.model as string) || "unknown";
        modelDistribution[model] = (modelDistribution[model] || 0) + 1;

        if (model.includes("fallback")) fallbackCount++;

        if (typeof usage.promptTokens === "number") totalPromptTokens += usage.promptTokens;
        if (typeof usage.completionTokens === "number") totalCompletionTokens += usage.completionTokens;
        if (typeof usage.latencyMs === "number") totalLatencyMs += usage.latencyMs;
      }
    }

    const totalAssistant = assistantMessages.length;
    const cacheHitRate = totalAssistant > 0 ? Number(((cacheHits / totalAssistant) * 100).toFixed(1)) : 0;
    const fallbackRate = totalAssistant > 0 ? Number(((fallbackCount / totalAssistant) * 100).toFixed(1)) : 0;
    const avgTotalTokens =
      totalAssistant > 0
        ? Math.round((totalPromptTokens + totalCompletionTokens) / totalAssistant)
        : 0;
    const avgLatency = totalAssistant > 0 ? Math.round(totalLatencyMs / totalAssistant) : 0;

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      overview: {
        conversations: convCount,
        messages: msgCount,
        documents: docCount,
        chunks: chunkCount,
        totalStorageBytes: storageAgg._sum.size || 0,
      },
      assistantPerformance: {
        sampleSize: totalAssistant,
        cacheHitRatePercent: cacheHitRate,
        fallbackRatePercent: fallbackRate,
        averageTokensPerQuery: avgTotalTokens,
        tokenSplit: {
          avgPromptTokens: totalAssistant > 0 ? Math.round(totalPromptTokens / totalAssistant) : 0,
          avgCompletionTokens: totalAssistant > 0 ? Math.round(totalCompletionTokens / totalAssistant) : 0,
        },
        averageLatencyMs: avgLatency,
        modelBreakdown: modelDistribution,
      },
    });
  } catch (err: unknown) {
    console.error("GET /api/admin/stats error:", err);
    return NextResponse.json(
      {
        error: "InternalServerError",
        message: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    );
  }
}

