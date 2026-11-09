import { randomUUID } from "crypto";

export interface LogMetadata {
  reqId?: string;
  route?: string;
  method?: string;
  status?: number;
  latencyMs?: number;
  cacheHit?: boolean;
  modelUsed?: string;
  tokens?: {
    prompt: number;
    completion: number;
    total: number;
  };
  retrieval?: {
    candidates: number;
    selected: number;
  };
  errorClass?: string;
  errorMessage?: string;
  [key: string]: unknown;
}

/**
 * Creates a unique request correlation ID
 */
export function createRequestId(): string {
  return `req_${randomUUID().slice(0, 8)}`;
}

/**
 * Emits a structured JSON log line for observability.
 * Never includes raw document content, prompt texts, or secrets.
 */
export function logEvent(
  level: "info" | "warn" | "error",
  event: string,
  meta: LogMetadata = {}
) {
  // Defensive filter: strip any accidental prompt text or keys
  const safeMeta = { ...meta };
  delete safeMeta.content;
  delete safeMeta.prompt;
  delete safeMeta.apiKey;
  delete safeMeta.secret;
  delete safeMeta.messageContent;

  const logEntry = {
    timestamp: new Date().toISOString(),
    level,
    event,
    ...safeMeta,
  };

  const jsonStr = JSON.stringify(logEntry);

  if (level === "error") {
    console.error(jsonStr);
  } else if (level === "warn") {
    console.warn(jsonStr);
  } else {
    console.log(jsonStr);
  }
}

