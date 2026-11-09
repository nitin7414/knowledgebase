import { cookies } from "next/headers";
import { createHmac, randomUUID, timingSafeEqual } from "crypto";

export const SESSION_COOKIE_NAME = "khabri_session_id";
const DEFAULT_SECRET = "khabri-rag-anonymous-session-secret-salt-2026";

function getSecret(): string {
  return process.env.SESSION_SECRET || DEFAULT_SECRET;
}

function signSessionId(sessionId: string): string {
  const hmac = createHmac("sha256", getSecret()).update(sessionId).digest("hex");
  return `${sessionId}.${hmac}`;
}

function verifySignedSession(value: string): string | null {
  const parts = value.split(".");
  if (parts.length !== 2) return null;
  const [sessionId, signature] = parts;
  if (!sessionId || !signature) return null;

  const expectedHmac = createHmac("sha256", getSecret()).update(sessionId).digest("hex");
  const sigBuffer = Buffer.from(signature, "hex");
  const expBuffer = Buffer.from(expectedHmac, "hex");

  if (sigBuffer.length !== expBuffer.length) return null;
  if (!timingSafeEqual(sigBuffer, expBuffer)) return null;

  return sessionId;
}

/**
 * Retrieves the verified anonymous session ID from cookies,
 * or generates and sets a new signed session cookie.
 */
export async function getOrCreateSessionId(): Promise<string> {
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

  cookieStore.set(SESSION_COOKIE_NAME, signed, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365, // 1 year
  });

  return newSessionId;
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

