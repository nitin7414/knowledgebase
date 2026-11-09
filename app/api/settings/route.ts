import { NextResponse } from "next/server";

export async function GET() {
  const models = (process.env.OPENROUTER_MODELS || "openrouter/free,google/gemma-4-26b-a4b-it:free,google/gemma-4-31b-it:free")
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);

  return NextResponse.json({
    availableModels: models,
    contextBudget: Number(process.env.RAG_CONTEXT_TOKEN_BUDGET || 2500),
    maxHistoryTurns: Number(process.env.RAG_MAX_HISTORY_TURNS || 4),
  });
}

