import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/db";
import { getOrCreateSessionId } from "@/lib/session";

export const maxDuration = 30;

const UpdateConversationSchema = z.object({
  title: z.string().min(1).max(100),
});

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const sessionId = await getOrCreateSessionId();
    const { id } = await params;

    const conv = await prisma.conversation.findFirst({
      where: { id, sessionId },
      include: {
        messages: {
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (!conv) {
      return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
    }

    return NextResponse.json({ conversation: conv });
  } catch (err: unknown) {
    console.error("GET /api/conversations/[id] error:", err);
    return NextResponse.json(
      { error: "Failed to fetch conversation", message: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const sessionId = await getOrCreateSessionId();
    const { id } = await params;
    const body = await req.json();
    const parsed = UpdateConversationSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid title" }, { status: 400 });
    }

    const updated = await prisma.conversation.updateMany({
      where: { id, sessionId },
      data: { title: parsed.data.title },
    });

    if (updated.count === 0) {
      return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, title: parsed.data.title });
  } catch (err: unknown) {
    console.error("PATCH /api/conversations/[id] error:", err);
    return NextResponse.json(
      { error: "Failed to update conversation", message: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const sessionId = await getOrCreateSessionId();
    const { id } = await params;

    const deleted = await prisma.conversation.deleteMany({
      where: { id, sessionId },
    });

    if (deleted.count === 0) {
      return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, deletedId: id });
  } catch (err: unknown) {
    console.error("DELETE /api/conversations/[id] error:", err);
    return NextResponse.json(
      { error: "Failed to delete conversation", message: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

