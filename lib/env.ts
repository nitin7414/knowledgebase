import { z } from "zod";

const envSchema = z.object({
  // Database (Neon Postgres with pgvector)
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required for PostgreSQL connection"),
  DIRECT_URL: z.string().optional(),

  // Embeddings (Google Gemini)
  GEMINI_API_KEY: z.string().min(1, "GEMINI_API_KEY is required for generating embeddings"),
  GEMINI_EMBEDDING_MODEL: z.string().default("text-embedding-004"),

  // LLM Inference (OpenRouter)
  OPENROUTER_API_KEY: z.string().min(1, "OPENROUTER_API_KEY is required for chat completions"),
  OPENROUTER_MODELS: z
    .string()
    .default("openrouter/free,google/gemma-4-26b-a4b-it:free,google/gemma-4-31b-it:free"),
  OPENROUTER_SITE_URL: z.string().default("http://localhost:3000"),
  OPENROUTER_APP_NAME: z.string().default("Khabri RAG"),

  // Session & Security
  SESSION_SECRET: z
    .string()
    .min(16, "SESSION_SECRET should be at least 16 characters for secure signing")
    .default("khabri-default-session-hmac-secret-key-32chars"),
  CRON_SECRET: z.string().default("khabri-cron-secret-key-development"),
  ADMIN_SECRET: z.string().default("khabri-admin-telemetry-2026"),

  // Abuse Protection & Quotas
  RATE_LIMIT_CHAT_PER_MIN: z.coerce.number().default(10),
  RATE_LIMIT_CHAT_PER_DAY: z.coerce.number().default(100),
  RATE_LIMIT_UPLOAD_PER_HOUR: z.coerce.number().default(5),
  GLOBAL_DAILY_TOKEN_CAP: z.coerce.number().default(200000),

  // RAG Engine Tuning
  RAG_CONTEXT_TOKEN_BUDGET: z.coerce.number().default(2500),
  RAG_SIMILARITY_THRESHOLD: z.coerce.number().default(0.015),
  RAG_MAX_HISTORY_TURNS: z.coerce.number().default(4),
  DATA_RETENTION_DAYS: z.coerce.number().default(7),
});

export type Env = z.infer<typeof envSchema>;

function validateEnv(): Env {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const errorDetails = result.error.issues
      .map((issue) => `  - [${issue.path.join(".")}]: ${issue.message}`)
      .join("\n");

    const message = `\n======================================================\n❌ [Khabri Environment Validation Failed]\n======================================================\n${errorDetails}\n\nPlease check your .env or Vercel Environment Variables.\n======================================================\n`;

    if (process.env.NODE_ENV === "production") {
      throw new Error(message);
    } else {
      console.warn(message);
      // Return unvalidated/coerced defaults for test/dev safety
      return envSchema.parse({
        ...process.env,
        DATABASE_URL: process.env.DATABASE_URL || "postgresql://localhost:5432/khabri_dev",
        GEMINI_API_KEY: process.env.GEMINI_API_KEY || "dummy_key",
        OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY || "dummy_key",
      });
    }
  }

  return result.data;
}

export const env = validateEnv();
