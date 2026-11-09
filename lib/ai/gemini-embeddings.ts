import { EmbeddingProvider } from "./types";

class Semaphore {
  private queue: (() => void)[] = [];
  private active = 0;

  constructor(private limit: number) {}

  async acquire(): Promise<() => void> {
    if (this.active < this.limit) {
      this.active++;
      return () => this.release();
    }
    return new Promise((resolve) => {
      this.queue.push(() => {
        this.active++;
        resolve(() => this.release());
      });
    });
  }

  private release() {
    this.active--;
    if (this.queue.length > 0 && this.active < this.limit) {
      const next = this.queue.shift();
      if (next) next();
    }
  }
}

export class GeminiEmbeddingProvider implements EmbeddingProvider {
  readonly name = "gemini";
  readonly dimension = 768;

  private apiKey: string;
  private model: string;
  private concurrencyLimiter = new Semaphore(2);

  constructor(apiKey?: string, model?: string) {
    this.apiKey = apiKey || process.env.GEMINI_API_KEY || "";
    const configured = model || process.env.GEMINI_EMBEDDING_MODEL;
    // Normalize or fallback to currently active gemini-embedding-001
    this.model = configured && configured !== "text-embedding-004" ? configured : "gemini-embedding-001";
  }

  private async executeWithRetry<T>(operation: () => Promise<T>, maxRetries = 3): Promise<T> {
    let attempt = 0;
    while (true) {
      try {
        return await operation();
      } catch (err: unknown) {
        attempt++;
        const errorMessage = err instanceof Error ? err.message : String(err);
        const isRateLimitOrServerError =
          errorMessage.includes("429") ||
          errorMessage.includes("500") ||
          errorMessage.includes("503") ||
          errorMessage.includes("ResourceExhausted");

        if (attempt > maxRetries || !isRateLimitOrServerError) {
          throw err;
        }

        // Exponential backoff with random jitter: (2^attempt * 1000) + jitter(0..500)
        const jitter = Math.floor(Math.random() * 500);
        const delay = Math.pow(2, attempt) * 1000 + jitter;
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  private async requestBatch(
    texts: string[],
    taskType: "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY"
  ): Promise<number[][]> {
    if (!this.apiKey) {
      throw new Error("GEMINI_API_KEY is not configured in environment variables.");
    }

    const release = await this.concurrencyLimiter.acquire();

    try {
      return await this.executeWithRetry(async () => {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:batchEmbedContents?key=${this.apiKey}`;

        const payload = {
          requests: texts.map((text) => ({
            model: `models/${this.model}`,
            content: {
              parts: [{ text: text.slice(0, 8000) }], // Safeguard per-part length
            },
            taskType,
            outputDimensionality: this.dimension,
          })),
        };

        const res = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        });

        if (!res.ok) {
          const errorBody = await res.text();
          throw new Error(`Gemini Embedding API error [${res.status}]: ${errorBody}`);
        }

        const data = await res.json();
        if (!data.embeddings || !Array.isArray(data.embeddings)) {
          throw new Error("Invalid response format from Gemini Embedding API");
        }

        return data.embeddings.map((emb: { values?: number[] }) => {
          if (!emb.values || emb.values.length === 0) {
            throw new Error("Empty embedding vector returned by provider");
          }
          return emb.values;
        });
      });
    } finally {
      release();
    }
  }

  async embedTexts(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];

    // Split into sub-batches of max 40 chunks
    const BATCH_SIZE = 40;
    const allEmbeddings: number[][] = [];

    for (let i = 0; i < texts.length; i += BATCH_SIZE) {
      const batch = texts.slice(i, i + BATCH_SIZE);
      const batchVectors = await this.requestBatch(batch, "RETRIEVAL_DOCUMENT");
      allEmbeddings.push(...batchVectors);
    }

    return allEmbeddings;
  }

  async embedQuery(text: string): Promise<number[]> {
    const vectors = await this.requestBatch([text], "RETRIEVAL_QUERY");
    return vectors[0];
  }
}

let defaultProvider: EmbeddingProvider | null = null;

export function getEmbeddingProvider(): EmbeddingProvider {
  if (!defaultProvider) {
    defaultProvider = new GeminiEmbeddingProvider();
  }
  return defaultProvider;
}

