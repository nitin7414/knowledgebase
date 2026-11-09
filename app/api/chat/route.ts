import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { randomUUID } from "crypto";
import prisma from "@/lib/db";
import { getOrCreateSessionId } from "@/lib/session";
import { routeUserQuery } from "@/lib/rag/routing";
import { rewriteQueryIfNeeded } from "@/lib/rag/rewriter";
import { getCachedQueryEmbedding } from "@/lib/rag/query-cache";
import { executeHybridSearch } from "@/lib/rag/hybrid-search";
import { selectContextChunks } from "@/lib/rag/context-selector";
import { buildSystemPrompt, formatSourcesForPrompt, extractCitedSources, FormattedSource } from "@/lib/rag/prompt";
import { prepareConversationHistory, updateRollingSummaryInBackground } from "@/lib/rag/history";
import { streamChatCompletion, ChatMessageParam } from "@/lib/ai/openrouter";
import { checkChatRateLimits, getClientIp } from "@/lib/ratelimit";
import { generateAnswerCacheKey, getCachedAnswer, saveAnswerToCache } from "@/lib/rag/cache";
import { checkDailyTokenBudget } from "@/lib/budget-guard";
import { createRequestId, logEvent } from "@/lib/logger";

export const maxDuration = 60; // Allow 60s max execution for streaming route

const ChatRequestSchema = z.object({
  message: z.string().min(1).max(4000),
  conversationId: z.string().optional(),
  documentIds: z.array(z.string()).optional(),
  preferredModel: z.string().optional(),
});

function formatSSE(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export async function POST(req: NextRequest) {
  const startTime = Date.now();
  const reqId = req.headers.get("x-request-id") || createRequestId();

  try {
    const sessionId = await getOrCreateSessionId();
    const body = await req.json();
    const parsed = ChatRequestSchema.safeParse(body);

    if (!parsed.success) {
      logEvent("warn", "chat_validation_failed", {
        reqId,
        route: "/api/chat",
        method: "POST",
        status: 400,
        errorClass: "ZodValidationError",
      });
      return NextResponse.json(
        { error: "ValidationError", message: "Invalid request payload", reqId, details: parsed.error.issues },
        { status: 400, headers: { "X-Request-Id": reqId } }
      );
    }

    const { message, conversationId: reqConvId, documentIds, preferredModel } = parsed.data;
    const clientIp = getClientIp(req);

    // Rate limiting: 10/min, 100/day
    const chatLimit = await checkChatRateLimits(sessionId, clientIp);
    if (!chatLimit.success) {
      logEvent("warn", "rate_limit_exceeded", {
        reqId,
        route: "/api/chat",
        method: "POST",
        status: 429,
        errorClass: "RateLimitExceeded",
        latencyMs: Date.now() - startTime,
      });
      return NextResponse.json(
        {
          error: "RateLimitExceeded",
          message: `Too many chat requests. Please wait ${chatLimit.retryAfterSeconds} seconds before sending another message.`,
          reqId,
        },
        {
          status: 429,
          headers: {
            "Retry-After": String(chatLimit.retryAfterSeconds || 60),
            "X-Request-Id": reqId,
          },
        }
      );
    }

    // 1. Ensure conversation exists in DB scoped to session
    let existingConversation = null;

    if (reqConvId) {
      existingConversation = await prisma.conversation.findFirst({
        where: { id: reqConvId, sessionId },
      });
    }

    if (!existingConversation) {
      // Auto-generate title from first sentence without an LLM call
      const cleanTitle = message
        .split(/[.?!;\n]/)[0]
        .replace(/["']/g, "")
        .trim()
        .slice(0, 40);

      existingConversation = await prisma.conversation.create({
        data: {
          id: reqConvId || randomUUID(),
          sessionId,
          title: cleanTitle || "New Conversation",
        },
      });
    }

    const activeConvId: string = existingConversation.id;

    // Get active document IDs for session
    const activeDocIds =
      documentIds && documentIds.length > 0
        ? documentIds
        : (
            await prisma.document.findMany({
              where: { sessionId, status: "ready" },
              select: { id: true },
            })
          ).map((d) => d.id);

    // 2. Answer Cache Check (normalized query + doc-set hash)
    const cacheKey = generateAnswerCacheKey(message, activeDocIds);
    const cachedHit = await getCachedAnswer(cacheKey);

    if (cachedHit) {
      const assistantMsgId = randomUUID();
      await prisma.message.create({
        data: {
          id: assistantMsgId,
          conversationId: activeConvId,
          role: "assistant",
          content: cachedHit.answer,
          sources: cachedHit.sources as unknown as object,
          usage: {
            promptTokens: 0,
            completionTokens: 0,
            model: "cache-hit",
            latencyMs: Date.now() - startTime,
            cacheHit: true,
          },
        },
      });

      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode(formatSSE("token", { token: cachedHit.answer })));
          controller.enqueue(
            encoder.encode(
              formatSSE("done", {
                conversationId: activeConvId,
                messageId: assistantMsgId,
                sources: cachedHit.sources,
                usage: {
                  promptTokens: 0,
                  completionTokens: 0,
                  model: "cache-hit",
                  latencyMs: Date.now() - startTime,
                },
              })
            )
          );
          controller.close();
        },
      });

      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
          "X-Accel-Buffering": "no",
        },
      });
    }

    // 3. Global Daily Token Budget Guard
    const budgetGuard = await checkDailyTokenBudget();
    if (budgetGuard.exceeded) {
      const degradedMsg =
        "Notice: The global daily demo AI token budget (200,000 tokens) has been reached for today to prevent unintended API charges. The assistant is currently in cache-only mode. Answers to previously asked questions are still available.";

      const assistantMsgId = randomUUID();
      await prisma.message.create({
        data: {
          id: assistantMsgId,
          conversationId: activeConvId,
          role: "assistant",
          content: degradedMsg,
          usage: {
            promptTokens: 0,
            completionTokens: 0,
            model: "budget-guard-degraded",
            latencyMs: Date.now() - startTime,
            cacheHit: false,
          },
        },
      });

      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode(formatSSE("token", { token: degradedMsg })));
          controller.enqueue(
            encoder.encode(
              formatSSE("done", {
                conversationId: activeConvId,
                messageId: assistantMsgId,
                sources: [],
                usage: {
                  promptTokens: 0,
                  completionTokens: 0,
                  model: "budget-guard-degraded",
                  latencyMs: Date.now() - startTime,
                },
              })
            )
          );
          controller.close();
        },
      });

      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
          "X-Accel-Buffering": "no",
        },
      });
    }

    // Save user message to database
    const userMessageId = randomUUID();
    await prisma.message.create({
      data: {
        id: userMessageId,
        conversationId: activeConvId,
        role: "user",
        content: message,
      },
    });

    // 2. Count available documents for this session
    const totalDocsCount = await prisma.document.count({
      where: {
        sessionId,
        status: "ready",
      },
    });

    // 3. Routing heuristic (skip retrieval for chit-chat, greetings, or zero documents)
    const routing = routeUserQuery(message, totalDocsCount);

    if (routing.type === "chitchat" || routing.type === "no_documents") {
      const directReply = routing.directResponse || "Hello!";
      const assistantMsgId = randomUUID();

      await prisma.message.create({
        data: {
          id: assistantMsgId,
          conversationId: activeConvId,
          role: "assistant",
          content: directReply,
          usage: {
            promptTokens: 0,
            completionTokens: 0,
            model: "heuristic-router",
            latencyMs: Date.now() - startTime,
            cacheHit: true,
          },
        },
      });

      // Stream the instant response to the client
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode(formatSSE("token", { token: directReply })));
          controller.enqueue(
            encoder.encode(
              formatSSE("done", {
                conversationId: activeConvId,
                messageId: assistantMsgId,
                sources: [],
                usage: {
                  promptTokens: 0,
                  completionTokens: 0,
                  model: "heuristic-router",
                  latencyMs: Date.now() - startTime,
                },
              })
            )
          );
          controller.close();
        },
      });

      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
          "X-Accel-Buffering": "no",
        },
      });
    }

    // 4. Retrieve conversation history
    const { historyMessages, totalTurnsInDB } = await prepareConversationHistory(
      activeConvId,
      existingConversation.rollingSummary
    );

    // 5. Query rewriting (only if follow-up reference is detected)
    const historyTurns = historyMessages
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

    const { rewrittenQuery } = await rewriteQueryIfNeeded(message, historyTurns);

    // 6. Embed query (with normalized query text cache)
    const { vector } = await getCachedQueryEmbedding(rewrittenQuery);

    // 7. Single SQL Hybrid Search
    const candidates = await executeHybridSearch({
      sessionId,
      query: rewrittenQuery,
      queryVector: vector,
      documentIds,
      limit: 25,
    });

    // 8. Context Selection with MMR & token budget
    const selection = selectContextChunks(candidates);

    // If no chunks passed threshold, short-circuit with refusal (0 LLM generation tokens!)
    if (!selection.passedThreshold || selection.chunks.length === 0) {
      const refusalContent =
        selection.refusalMessage ||
        "I couldn't find this information in your uploaded documents. Please try rephrasing or check your attached files.";

      const assistantMsgId = randomUUID();
      await prisma.message.create({
        data: {
          id: assistantMsgId,
          conversationId: activeConvId,
          role: "assistant",
          content: refusalContent,
          usage: {
            promptTokens: 0,
            completionTokens: 0,
            model: "refusal-guard",
            latencyMs: Date.now() - startTime,
            cacheHit: false,
          },
        },
      });

      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode(formatSSE("token", { token: refusalContent })));
          controller.enqueue(
            encoder.encode(
              formatSSE("done", {
                conversationId: activeConvId,
                messageId: assistantMsgId,
                sources: [],
                usage: {
                  promptTokens: 0,
                  completionTokens: 0,
                  model: "refusal-guard",
                  latencyMs: Date.now() - startTime,
                },
              })
            )
          );
          controller.close();
        },
      });

      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
          "X-Accel-Buffering": "no",
        },
      });
    }

    // 9. Prompt Assembly
    const { promptText, sourcesList } = formatSourcesForPrompt(selection.chunks);
    const systemPrompt = buildSystemPrompt();

    const messagesForLLM: ChatMessageParam[] = [
      { role: "system", content: `${systemPrompt}\n\n${promptText}` },
      ...historyMessages,
      { role: "user", content: message },
    ];

    // 10. Streaming generation with OpenRouter & cited source extraction
    const encoder = new TextEncoder();
    let accumulatedContent = "";
    let finalModelUsed = "openrouter/free";
    let finalUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };

    const stream = new ReadableStream({
      async start(controller) {
        try {
          const generator = streamChatCompletion(messagesForLLM, {
            preferredModel,
            signal: req.signal,
          });

          for await (const chunk of generator) {
            if (chunk.content) {
              accumulatedContent += chunk.content;
              controller.enqueue(
                encoder.encode(formatSSE("token", { token: chunk.content }))
              );
            }

            if (chunk.isDone) {
              if (chunk.modelUsed) finalModelUsed = chunk.modelUsed;
              if (chunk.usage) finalUsage = chunk.usage;
            }
          }

          // 11. Extract cited sources (matches inline [n] references)
          const citedSources = extractCitedSources(accumulatedContent, sourcesList);

          // Persist assistant response in Postgres
          const assistantMsgId = randomUUID();
          await prisma.message.create({
            data: {
              id: assistantMsgId,
              conversationId: activeConvId,
              role: "assistant",
              content: accumulatedContent,
              sources: citedSources as unknown as object,
              usage: {
                ...finalUsage,
                model: finalModelUsed,
                latencyMs: Date.now() - startTime,
                cacheHit: false,
              },
            },
          });

          // Save grounded answer to cache for instant future hits
          if (citedSources.length > 0) {
            saveAnswerToCache(cacheKey, accumulatedContent, citedSources).catch(() => {});
          }

          // Emit final 'done' SSE event
          controller.enqueue(
            encoder.encode(
              formatSSE("done", {
                conversationId: activeConvId,
                messageId: assistantMsgId,
                sources: citedSources,
                usage: {
                  ...finalUsage,
                  model: finalModelUsed,
                  latencyMs: Date.now() - startTime,
                },
              })
            )
          );

          logEvent("info", "chat_stream_completed", {
            reqId,
            route: "/api/chat",
            method: "POST",
            status: 200,
            latencyMs: Date.now() - startTime,
            modelUsed: finalModelUsed,
            tokens: {
              prompt: finalUsage.promptTokens,
              completion: finalUsage.completionTokens,
              total: finalUsage.totalTokens,
            },
            retrieval: {
              candidates: candidates.length,
              selected: selection.chunks.length,
            },
            cacheHit: false,
          });

          // Lazy rolling summary update in background
          if (totalTurnsInDB >= 6) {
            updateRollingSummaryInBackground(
              activeConvId,
              existingConversation?.rollingSummary || null
            ).catch(() => {});
          }

          controller.close();
        } catch (streamErr: unknown) {
          logEvent("warn", "chat_stream_fallback", {
            reqId,
            route: "/api/chat",
            method: "POST",
            status: 200,
            latencyMs: Date.now() - startTime,
            modelUsed: "fallback-graceful",
            errorClass: streamErr instanceof Error ? streamErr.name : "StreamFailure",
            retrieval: {
              candidates: candidates.length,
              selected: selection.chunks.length,
            },
          });

          // Graceful fallback: return clear friendly message, never a stack trace, and preserve retrieved sources
          const fallbackContent =
            sourcesList.length > 0
              ? "The AI language model is temporarily unavailable due to upstream provider rate limits. However, we successfully retrieved the relevant source passages from your documents below:"
              : "The language model service is temporarily unavailable. Please try your question again in a moment.";

          const assistantMsgId = randomUUID();
          await prisma.message
            .create({
              data: {
                id: assistantMsgId,
                conversationId: activeConvId,
                role: "assistant",
                content: fallbackContent,
                sources: sourcesList as unknown as object,
                usage: {
                  promptTokens: selection.totalTokens,
                  completionTokens: 0,
                  model: "fallback-graceful",
                  latencyMs: Date.now() - startTime,
                  cacheHit: false,
                },
              },
            })
            .catch(() => {});

          controller.enqueue(
            encoder.encode(formatSSE("token", { token: fallbackContent }))
          );
          controller.enqueue(
            encoder.encode(
              formatSSE("done", {
                conversationId: activeConvId,
                messageId: assistantMsgId,
                sources: sourcesList,
                usage: {
                  promptTokens: selection.totalTokens,
                  completionTokens: 0,
                  model: "fallback-graceful",
                  latencyMs: Date.now() - startTime,
                },
              })
            )
          );
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  } catch (err: unknown) {
    console.error("POST /api/chat error:", err);
    return NextResponse.json(
      {
        error: "Chat endpoint failed",
        message: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    );
  }
}

