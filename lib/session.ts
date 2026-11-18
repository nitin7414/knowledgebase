import { cookies } from "next/headers";
import { createHmac, randomUUID, timingSafeEqual } from "crypto";

export const SESSION_COOKIE_NAME = "khabri_session_id";
const DEFAULT_SECRET = "khabri-rag-anonymous-session-secret-salt-2026";

function getSecret(): string {
  return process.env.SESSION_SECRET || DEFAULT_SECRET;
}

export function signSessionId(sessionId: string): string {
  const hmac = createHmac("sha256", getSecret()).update(sessionId).digest("hex");
  return `${sessionId}.${hmac}`;
}

export function verifySignedSession(value: string): string | null {
  if (!value) return null;
  const parts = value.split(".");
  if (parts.length === 2) {
    const [sessionId, signature] = parts;
    if (!sessionId || !signature) return null;

    const expectedHmac = createHmac("sha256", getSecret()).update(sessionId).digest("hex");
    const sigBuffer = Buffer.from(signature, "hex");
    const expBuffer = Buffer.from(expectedHmac, "hex");

    if (sigBuffer.length === expBuffer.length && timingSafeEqual(sigBuffer, expBuffer)) {
      return sessionId;
    }
  }

  // Accept valid raw UUID format if passed via header
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.trim())) {
    return value.trim();
  }

  return null;
}

/**
 * Retrieves the verified anonymous session ID from request headers or cookies,
 * or generates and sets a new signed session cookie.
 */
export async function getOrCreateSessionId(req?: Request | null): Promise<string> {
  // 1. Check x-session-id header first if request is provided
  if (req) {
    const headerVal = req.headers.get("x-session-id") || req.headers.get("X-Session-Id");
    if (headerVal) {
      const verified = verifySignedSession(headerVal);
      if (verified) {
        return verified;
      }
    }
  }

  // 2. Check cookies
  try {
    const cookieStore = await cookies();
    const rawCookie = cookieStore.get(SESSION_COOKIE_NAME)?.value;

    if (rawCookie) {
      const verified = verifySignedSession(rawCookie);
      if (verified) {
        return verified;
      }
    }

    const newSessionId = randomUUID();
    const signed = signSessionId(newSessionId);

    // Only set secure if on HTTPS or Vercel production to avoid dropping localhost cookies
    const isHttps = process.env.VERCEL === "1" || process.env.NODE_ENV === "production";

    cookieStore.set(SESSION_COOKIE_NAME, signed, {
      httpOnly: true,
      secure: isHttps,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 365, // 1 year
    });

    return newSessionId;
  } catch {
    return randomUUID();
  }
}

/**
 * Synchronously verify a session header/cookie string if available in request
 */
export function parseAndVerifySessionCookie(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null;
  const match = cookieHeader
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${SESSION_COOKIE_NAME}=`));

  if (!match) return null;
  const rawVal = match.split("=")[1];
  return verifySignedSession(decodeURIComponent(rawVal));
}

