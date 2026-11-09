import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getOrCreateSessionId } from "@/lib/session";

export const maxDuration = 30;

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const sessionId = await getOrCreateSessionId();
    const { id } = await params;

    const doc = await prisma.document.findFirst({
      where: {
        id,
        sessionId,
      },
    });

    if (!doc) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    // Cascade delete document and chunks
    await prisma.document.delete({
      where: { id },
    });

    return NextResponse.json({ success: true, deletedId: id });
  } catch (err: unknown) {
    console.error("DELETE /api/documents/[id] error:", err);
    return NextResponse.json(
      { error: "Failed to delete document", message: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

