import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import prisma, { withDbRetry } from "@/lib/db";
import { getOrCreateSessionId, SESSION_COOKIE_NAME } from "@/lib/session";

export const maxDuration = 30;

export async function DELETE() {
  try {
    const sessionId = await getOrCreateSessionId();

    console.log(`[SessionDelete] User requested permanent data purge for session "${sessionId}"...`);

    // 1. Delete documents (Cascade automatically purges chunks and embeddings)
    const deletedDocs = await withDbRetry(() =>
      prisma.document.deleteMany({
        where: { sessionId },
      })
    );

    // 2. Delete conversations (Cascade automatically purges messages)
    const deletedConvs = await withDbRetry(() =>
      prisma.conversation.deleteMany({
        where: { sessionId },
      })
    );

    // 3. Clear session rate limit entries
    await withDbRetry(() =>
      prisma.rateLimit.deleteMany({
        where: {
          key: { startsWith: `rl:${sessionId}` },
        },
      })
    );

    // 4. Invalidate session cookie
    const cookieStore = await cookies();
    cookieStore.delete(SESSION_COOKIE_NAME);

    console.log(
      `[SessionDelete] Purge complete for session "${sessionId}": ${deletedDocs.count} documents, ${deletedConvs.count} conversations deleted.`
    );

    return NextResponse.json({
      success: true,
      message: "All documents and conversations for your session have been permanently deleted.",
      deleted: {
        documents: deletedDocs.count,
        conversations: deletedConvs.count,
      },
    });
  } catch (err: unknown) {
    console.error("[SessionDelete] Failed to delete session data:", err);
    return NextResponse.json(
      {
        error: "Failed to delete session data",
        message: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    );
  }
}

