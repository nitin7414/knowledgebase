import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

/**
 * Executes a database operation with exponential backoff retry
 * to gracefully absorb Neon serverless cold starts.
 */
export async function withDbRetry<T>(fn: () => Promise<T>, maxRetries = 4): Promise<T> {
  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (err: unknown) {
      attempt++;
      const msg = err instanceof Error ? err.message : String(err);
      const isConnectionIssue =
        msg.includes("Can't reach database server") ||
        msg.includes("connection closed") ||
        msg.includes("ETIMEDOUT") ||
        msg.includes("ECONNRESET") ||
        msg.includes("Connection terminated");

      if (attempt > maxRetries || !isConnectionIssue) {
        throw err;
      }

      const delayMs = Math.pow(2, attempt) * 1500 + Math.random() * 500;
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
}

export default prisma;
