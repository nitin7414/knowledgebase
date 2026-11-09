import {
  isModelAvailable,
  isModelAvailableAsync,
  recordModelSuccess,
  recordModelFailure,
} from "./circuit-breaker";
import { countTokens } from "../tokens";

export interface ChatMessageParam {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface StreamChunk {
  content: string;
  isDone: boolean;
  modelUsed?: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface CompletionResult {
  content: string;
  modelUsed: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

let activeOpenRouterModelsCache: Set<string> | null = null;
let lastModelCatalogFetch = 0;
const MODEL_CATALOG_TTL_MS = 60 * 60 * 1000; // 1 hour

export async function getValidModelChain(preferredModel?: string): Promise<string[]> {
  const envModels = (
    process.env.OPENROUTER_MODELS ||
    "openrouter/free,google/gemma-4-26b-a4b-it:free,google/gemma-4-31b-it:free"
  )
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);

  let rawList = envModels;
  if (preferredModel && !rawList.includes(preferredModel)) {
    rawList = [preferredModel, ...rawList];
  } else if (preferredModel) {
    rawList = [preferredModel, ...rawList.filter((m) => m !== preferredModel)];
  }

  // Fetch or use cached OpenRouter active catalog
  const now = Date.now();
  if (!activeOpenRouterModelsCache || now - lastModelCatalogFetch > MODEL_CATALOG_TTL_MS) {
    try {
      const apiKey = process.env.OPENROUTER_API_KEY;
      if (apiKey) {
        const catRes = await fetch("https://openrouter.ai/api/v1/models", {
          headers: { Authorization: `Bearer ${apiKey}` },
          next: { revalidate: 3600 },
        });
        if (catRes.ok) {
          const catJson = await catRes.json();
          if (Array.isArray(catJson.data)) {
            activeOpenRouterModelsCache = new Set(catJson.data.map((m: { id: string }) => m.id));
            lastModelCatalogFetch = now;
          }
        }
      }
    } catch (e) {
      console.warn("[ModelDiscovery] Could not reach OpenRouter catalog endpoint, using env models directly:", e);
    }
  }

  if (activeOpenRouterModelsCache && activeOpenRouterModelsCache.size > 0) {
    const validated = rawList.filter((m) => {
      const exists = m === "openrouter/free" || activeOpenRouterModelsCache!.has(m);
      if (!exists) {
        console.warn(`[ModelDiscovery] Configured model "${m}" is not found in OpenRouter catalog. Skipping.`);
      }
      return exists;
    });
    if (validated.length > 0) return validated;
  }

  return rawList.length > 0 ? rawList : ["openrouter/free"];
}

/**
 * Executes a non-streaming completion with automatic fallback and circuit breaking.
 */
export async function createChatCompletion(
  messages: ChatMessageParam[],
  options: {
    maxTokens?: number;
    temperature?: number;
    preferredModel?: string;
  } = {}
): Promise<CompletionResult> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY is not configured.");
  }

  const modelChain = await getValidModelChain(options.preferredModel);
  let lastError: Error | null = null;

  for (const model of modelChain) {
    if (!(await isModelAvailableAsync(model))) {
      continue;
    }

    try {
      const res = await fetchWithRetry("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": process.env.OPENROUTER_SITE_URL || "http://localhost:3000",
          "X-Title": process.env.OPENROUTER_APP_NAME || "Khabri RAG",
        },
        body: JSON.stringify({
          model,
          messages,
          max_tokens: options.maxTokens ?? 1024,
          temperature: options.temperature ?? 0.2,
        }),
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`OpenRouter [${res.status}] error: ${errorText}`);
      }

      const json = await res.json();
      const content = json.choices?.[0]?.message?.content || "";
      recordModelSuccess(model);

      const promptEst = countTokens(messages.map((m) => m.content).join(" "));
      const compEst = countTokens(content);

      return {
        content,
        modelUsed: model,
        usage: {
          promptTokens: json.usage?.prompt_tokens ?? promptEst,
          completionTokens: json.usage?.completion_tokens ?? compEst,
          totalTokens: json.usage?.total_tokens ?? promptEst + compEst,
        },
      };
    } catch (err) {
      recordModelFailure(model, err);
      lastError = err instanceof Error ? err : new Error(String(err));
    }
  }

  throw lastError || new Error("All configured models in fallback chain failed.");
}

/**
 * Executes a streaming completion over OpenRouter with multi-model fallback.
 * Yields individual token strings as they arrive.
 */
export async function* streamChatCompletion(
  messages: ChatMessageParam[],
  options: {
    maxTokens?: number;
    temperature?: number;
    preferredModel?: string;
    signal?: AbortSignal;
  } = {}
): AsyncGenerator<StreamChunk> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY is not configured.");
  }

  const modelChain = await getValidModelChain(options.preferredModel);
  let activeModel = "";
  let streamResponse: Response | null = null;
  let lastError: Error | null = null;

  for (const model of modelChain) {
    if (!(await isModelAvailableAsync(model))) {
      continue;
    }

    try {
      const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": process.env.OPENROUTER_SITE_URL || "http://localhost:3000",
          "X-Title": process.env.OPENROUTER_APP_NAME || "Khabri RAG",
        },
        body: JSON.stringify({
          model,
          messages,
          max_tokens: options.maxTokens ?? 1500,
          temperature: options.temperature ?? 0.2,
          stream: true,
        }),
        signal: options.signal,
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`OpenRouter [${res.status}] error: ${errorText}`);
      }

      activeModel = model;
      streamResponse = res;
      recordModelSuccess(model);
      break;
    } catch (err) {
      recordModelFailure(model, err);
      lastError = err instanceof Error ? err : new Error(String(err));
    }
  }

  if (!streamResponse || !streamResponse.body) {
    throw lastError || new Error("All configured models in fallback chain failed to initialize stream.");
  }

  const reader = streamResponse.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let fullOutput = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith(":")) continue; // Comment or empty line

        if (trimmed.startsWith("data:")) {
          const dataContent = trimmed.slice(5).trim();
          if (dataContent === "[DONE]") {
            continue;
          }

          try {
            const parsed = JSON.parse(dataContent);
            const delta = parsed.choices?.[0]?.delta?.content;
            if (delta) {
              fullOutput += delta;
              yield {
                content: delta,
                isDone: false,
                modelUsed: activeModel,
              };
            }
          } catch {
            // Skip unparseable heartbeats or malformed frames
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  const promptEst = countTokens(messages.map((m) => m.content).join(" "));
  const compEst = countTokens(fullOutput);

  yield {
    content: "",
    isDone: true,
    modelUsed: activeModel,
    usage: {
      promptTokens: promptEst,
      completionTokens: compEst,
      totalTokens: promptEst + compEst,
    },
  };
}

async function fetchWithRetry(url: string, init: RequestInit, retries = 2): Promise<Response> {
  let attempt = 0;
  while (true) {
    try {
      const res = await fetch(url, init);
      if (res.status === 429 || res.status >= 500) {
        if (attempt >= retries) return res;
        throw new Error(`HTTP ${res.status}`);
      }
      return res;
    } catch (err) {
      attempt++;
      if (attempt > retries) throw err;
      const delay = Math.pow(2, attempt) * 600 + Math.random() * 300;
      await new Promise((r) => setTimeout(r, delay));
    }
  }
}

