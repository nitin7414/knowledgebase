import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { randomUUID } from "crypto";
import prisma from "@/lib/db";
import { getOrCreateSessionId } from "@/lib/session";

export const maxDuration = 30;

export async function GET() {
  try {
    const sessionId = await getOrCreateSessionId();

    const conversations = await prisma.conversation.findMany({
      where: { sessionId },
      orderBy: { updatedAt: "desc" },
      include: {
        messages: {
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            role: true,
            content: true,
            sources: true,
            usage: true,
            createdAt: true,
          },
        },
      },
    });

    const formatted = conversations.map((c) => ({
      id: c.id,
      title: c.title,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
      messages: c.messages.map((m) => {
        let parsedSources = undefined;
        if (m.sources && Array.isArray(m.sources)) {
          parsedSources = (m.sources as Array<{ documentName?: string; pageOrSection?: string; confidence?: number }>).map((s) => ({
            documentName: s?.documentName || "Document",
            pageOrSection: s?.pageOrSection || "Reference",
            confidence: s?.confidence ?? 0.9,
          }));
        }

        const date = new Date(m.createdAt);
        const timeStr = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

        return {
          id: m.id,
          role: m.role as "user" | "assistant" | "system",
          content: m.content,
          timestamp: timeStr,
          sources: parsedSources,
        };
      }),
    }));

    return NextResponse.json({ conversations: formatted });
  } catch (err: unknown) {
    console.error("GET /api/conversations error:", err);
    return NextResponse.json(
      { error: "Failed to fetch conversations", message: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

const CreateConversationSchema = z.object({
  title: z.string().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const sessionId = await getOrCreateSessionId();
    const body = await req.json().catch(() => ({}));
    const parsed = CreateConversationSchema.safeParse(body);

    const title = parsed.success && parsed.data.title ? parsed.data.title : "New Conversation";
    const id = randomUUID();

    const conv = await prisma.conversation.create({
      data: {
        id,
        sessionId,
        title,
      },
    });

    return NextResponse.json({
      conversation: {
        id: conv.id,
        title: conv.title,
        createdAt: conv.createdAt.toISOString(),
        updatedAt: conv.updatedAt.toISOString(),
        messages: [],
      },
    });
  } catch (err: unknown) {
    console.error("POST /api/conversations error:", err);
    return NextResponse.json(
      { error: "Failed to create conversation", message: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

