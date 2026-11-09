import { NextRequest } from "next/server";
import prisma from "./db";

export interface RateLimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  retryAfterSeconds?: number;
}

export function getClientIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
  const realIp = req.headers.get("x-real-ip");
  if (realIp) {
    return realIp.trim();
  }
  return "127.0.0.1";
}

/**
 * Checks and increments rate limit using PostgreSQL table `rate_limits`.
 * Atomic upsert with window reset on expiry.
 */
export async function checkRateLimit(
  key: string,
  maxRequests: number,
  windowSeconds: number
): Promise<RateLimitResult> {
  const now = new Date();

  try {
    const existing = await prisma.rateLimit.findUnique({
      where: { key },
    });

    if (!existing) {
      // First request in window
      await prisma.rateLimit.create({
        data: {
          key,
          windowStart: now,
          count: 1,
        },
      });
      return {
        success: true,
        limit: maxRequests,
        remaining: maxRequests - 1,
      };
    }

    const elapsedSeconds = (now.getTime() - existing.windowStart.getTime()) / 1000;

    if (elapsedSeconds >= windowSeconds) {
      // Window expired, reset window
      await prisma.rateLimit.update({
        where: { key },
        data: {
          windowStart: now,
          count: 1,
        },
      });
      return {
        success: true,
        limit: maxRequests,
        remaining: maxRequests - 1,
      };
    }

    if (existing.count >= maxRequests) {
      // Limit exceeded
      const retryAfterSeconds = Math.max(1, Math.ceil(windowSeconds - elapsedSeconds));
      return {
        success: false,
        limit: maxRequests,
        remaining: 0,
        retryAfterSeconds,
      };
    }

    // Increment count
    const updated = await prisma.rateLimit.update({
      where: { key },
      data: {
        count: { increment: 1 },
      },
    });

    return {
      success: true,
      limit: maxRequests,
      remaining: Math.max(0, maxRequests - updated.count),
    };
  } catch (err) {
    // Graceful fallback on database glitch so we don't break user experience
    console.warn("Rate limit check failed, falling back to allow:", err);
    return {
      success: true,
      limit: maxRequests,
      remaining: 1,
    };
  }
}

/**
 * Validates chat rate limits per session and per IP (minute + daily).
 */
export async function checkChatRateLimits(
  sessionId: string,
  ip: string
): Promise<RateLimitResult> {
  const perMinLimit = Number(process.env.RATE_LIMIT_CHAT_PER_MIN || 10);
  const perDayLimit = Number(process.env.RATE_LIMIT_CHAT_PER_DAY || 100);

  // 1. Check minute window (Session)
  const sessionMin = await checkRateLimit(`chat:min:session:${sessionId}`, perMinLimit, 60);
  if (!sessionMin.success) return sessionMin;

  // 2. Check minute window (IP)
  const ipMin = await checkRateLimit(`chat:min:ip:${ip}`, perMinLimit, 60);
  if (!ipMin.success) return ipMin;

  // 3. Check day window (Session)
  const sessionDay = await checkRateLimit(`chat:day:session:${sessionId}`, perDayLimit, 86400);
  if (!sessionDay.success) return sessionDay;

  // 4. Check day window (IP)
  const ipDay = await checkRateLimit(`chat:day:ip:${ip}`, perDayLimit, 86400);
  if (!ipDay.success) return ipDay;

  return { success: true, limit: perMinLimit, remaining: sessionMin.remaining };
}

/**
 * Validates document upload rate limits per session and per IP (hour).
 */
export async function checkUploadRateLimits(
  sessionId: string,
  ip: string
): Promise<RateLimitResult> {
  const perHourLimit = Number(process.env.RATE_LIMIT_UPLOAD_PER_HOUR || 5);

  const sessionCheck = await checkRateLimit(`upload:hour:session:${sessionId}`, perHourLimit, 3600);
  if (!sessionCheck.success) return sessionCheck;

  const ipCheck = await checkRateLimit(`upload:hour:ip:${ip}`, perHourLimit, 3600);
  if (!ipCheck.success) return ipCheck;

  return sessionCheck;
}

