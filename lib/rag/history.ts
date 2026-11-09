import { countTokens } from "../tokens";
import { ChatMessageParam, createChatCompletion } from "../ai/openrouter";
import prisma from "../db";

export interface DBMessage {
  role: string;
  content: string;
}

const DEFAULT_HISTORY_TURNS = 4;
const DEFAULT_HISTORY_TOKEN_BUDGET = 800;

export async function prepareConversationHistory(
  conversationId: string,
  rollingSummary: string | null,
  options: { maxTurns?: number; tokenBudget?: number } = {}
): Promise<{
  historyMessages: ChatMessageParam[];
  totalTurnsInDB: number;
}> {
  const maxTurns = options.maxTurns ?? DEFAULT_HISTORY_TURNS;
  const tokenBudget = options.tokenBudget ?? DEFAULT_HISTORY_TOKEN_BUDGET;

  const messages = await prisma.message.findMany({
    where: { conversationId },
    orderBy: { createdAt: "desc" },
    take: maxTurns + 2, // Grab a couple extra to check if summary update is needed
    select: { role: true, content: true },
  });

  const totalTurnsInDB = messages.length;
  // Reverse to get chronological order
  const chronological = messages.reverse();

  const historyMessages: ChatMessageParam[] = [];

  // If rolling summary exists, prepend as system context
  if (rollingSummary && rollingSummary.trim()) {
    historyMessages.push({
      role: "system",
      content: `Prior Conversation Summary:\n${rollingSummary}`,
    });
  }

  let accumulatedTokens = historyMessages.reduce((acc, m) => acc + countTokens(m.content), 0);

  // Take most recent turns within token budget
  for (let i = chronological.length - 1; i >= 0; i--) {
    const msg = chronological[i];
    if (msg.role !== "user" && msg.role !== "assistant") continue;

    const tokens = countTokens(msg.content);
    if (accumulatedTokens + tokens <= tokenBudget || historyMessages.length <= 1) {
      historyMessages.splice(historyMessages.length - (accumulatedTokens > 0 ? 0 : 0), 0, {
        role: msg.role as "user" | "assistant",
        content: msg.content,
      });
      accumulatedTokens += tokens;
    } else {
      break;
    }
  }

  return { historyMessages, totalTurnsInDB };
}

/**
 * Lazily updates the conversation rolling summary in the background when history exceeds turns.
 * Designed to be fire-and-forget (never blocks the chat response stream).
 */
export async function updateRollingSummaryInBackground(
  conversationId: string,
  existingSummary: string | null
): Promise<void> {
  try {
    const messages = await prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: "asc" },
      take: 12,
      select: { role: true, content: true },
    });

    if (messages.length < 6) {
      return; // Not long enough to warrant a summary
    }

    const conversationTranscript = messages
      .map((m) => `${m.role.toUpperCase()}: ${m.content.slice(0, 200)}`)
      .join("\n");

    const promptMessages: ChatMessageParam[] = [
      {
        role: "system",
        content:
          "Summarize the key topics and facts discussed in this conversation into 2-3 concise sentences. Maintain essential context for future questions. Output ONLY the summary.",
      },
      {
        role: "user",
        content: `Previous summary: ${existingSummary || "None"}\n\nRecent turns:\n${conversationTranscript}`,
      },
    ];

    const result = await createChatCompletion(promptMessages, {
      maxTokens: 100,
      temperature: 0.1,
    });

    if (result.content && result.content.trim()) {
      await prisma.conversation.update({
        where: { id: conversationId },
        data: { rollingSummary: result.content.trim() },
      });
    }
  } catch (err) {
    console.warn("Background rolling summary update skipped:", err);
  }
}

