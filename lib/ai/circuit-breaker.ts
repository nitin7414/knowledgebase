import prisma, { withDbRetry } from "../db";

interface ModelStatus {
  consecutiveFailures: number;
  lastFailureTime: number;
  cooldownUntil: number;
}

const modelStatuses = new Map<string, ModelStatus>();
const COOLDOWN_DURATION_MS = 60 * 1000; // 60s cooldown
const FAILURE_THRESHOLD = 2; // Trip after 2 consecutive failures

/**
 * Synchronous local check for model availability.
 */
export function isModelAvailable(modelId: string): boolean {
  const status = modelStatuses.get(modelId);
  if (!status) return true;

  if (Date.now() < status.cooldownUntil) {
    return false; // Still in cooldown
  }

  return true;
}

/**
 * Asynchronous check that checks local memory and queries Postgres
 * to sync circuit breaker state across serverless instances.
 */
export async function isModelAvailableAsync(modelId: string): Promise<boolean> {
  const now = Date.now();
  const localStatus = modelStatuses.get(modelId);
  if (localStatus && now < localStatus.cooldownUntil) {
    return false;
  }

  // Probe database for shared cooldown from other instances
  try {
    const dbCooldown = await prisma.rateLimit.findUnique({
      where: { key: `cb:${modelId}` },
    });

    if (dbCooldown && dbCooldown.windowStart.getTime() > now) {
      // Sync DB cooldown to local memory
      modelStatuses.set(modelId, {
        consecutiveFailures: FAILURE_THRESHOLD,
        lastFailureTime: now,
        cooldownUntil: dbCooldown.windowStart.getTime(),
      });
      return false;
    }
  } catch {
    // If DB check fails, rely on local in-memory state safely
  }

  return true;
}

/**
 * Records a successful model completion, clearing any failure counts and cooldowns.
 */
export function recordModelSuccess(modelId: string) {
  modelStatuses.delete(modelId);

  // Clear in DB asynchronously (skip for test/mock model identifiers)
  if (
    process.env.DATABASE_URL &&
    !modelId.startsWith("test/") &&
    !modelId.startsWith("mock-")
  ) {
    withDbRetry(() => prisma.rateLimit.deleteMany({ where: { key: `cb:${modelId}` } }))
      .catch(() => {});
  }
}

/**
 * Records a failure for a model. If consecutive failures exceed threshold,
 * trips the circuit breaker for COOLDOWN_DURATION_MS in both memory and PostgreSQL.
 */
export function recordModelFailure(modelId: string, error?: unknown) {
  const now = Date.now();
  const current = modelStatuses.get(modelId) || {
    consecutiveFailures: 0,
    lastFailureTime: now,
    cooldownUntil: 0,
  };

  current.consecutiveFailures += 1;
  current.lastFailureTime = now;

  if (current.consecutiveFailures >= FAILURE_THRESHOLD) {
    current.cooldownUntil = now + COOLDOWN_DURATION_MS;
    console.warn(
      `[CircuitBreaker] Model "${modelId}" tripped circuit breaker. In cooldown for 60s. Error:`,
      error instanceof Error ? error.message : error
    );

    // Persist cooldown to PostgreSQL for cross-serverless synchronization (skip test fixtures)
    if (
      process.env.DATABASE_URL &&
      !modelId.startsWith("test/") &&
      !modelId.startsWith("mock-")
    ) {
      const cooldownExpiry = new Date(current.cooldownUntil);
      withDbRetry(() =>
        prisma.rateLimit.upsert({
          where: { key: `cb:${modelId}` },
          update: { windowStart: cooldownExpiry, count: current.consecutiveFailures },
          create: { key: `cb:${modelId}`, windowStart: cooldownExpiry, count: current.consecutiveFailures },
        })
      ).catch(() => {
        // Silently preserve in-memory breaker if DB write fails
      });
    }
  }

  modelStatuses.set(modelId, current);
}
