import { NextRequest } from "next/server";
import {
  getCurrentSession,
  getSessionFromCookie,
  validateSessionToken,
  SESSION_COOKIE_NAME,
} from "./session";

export interface VerifiedSession {
  userId: string;
  username: string;
  role: string;
}

/**
 * Universal session verifier checking request cookies, Next.js cookie store, and Bearer tokens.
 */
export async function verifySession(request?: Request | NextRequest): Promise<VerifiedSession | null> {
  // 1. Try Next.js cookieStore via getCurrentSession
  try {
    const current = await getCurrentSession();
    if (current?.user) {
      return {
        userId: String(current.user.id),
        username: current.user.username,
        role: current.user.role,
      };
    }
  } catch {
    // Next.js cookieStore may throw outside request contexts in certain edge runtimes
  }

  // 2. Direct request headers extraction
  if (request) {
    try {
      const cookieHeader = request.headers.get("cookie");
      if (cookieHeader) {
        const payload = await getSessionFromCookie(cookieHeader);
        if (payload?.userId) {
          return {
            userId: String(payload.userId),
            username: payload.username,
            role: payload.role,
          };
        }
      }

      const authHeader = request.headers.get("authorization");
      if (authHeader && authHeader.startsWith("Bearer ")) {
        const token = authHeader.slice(7).trim();
        const session = await validateSessionToken(token);
        if (session?.user) {
          return {
            userId: String(session.user.userId),
            username: session.user.username,
            role: session.user.role,
          };
        }
      }
    } catch (err) {
      console.warn("[verifySession] Direct header extraction failed:", err);
    }
  }

  return null;
}

/**
 * Specifically extract and verify session identity from request headers (optimized for sendBeacon / API requests).
 */
export async function verifySessionFromHeaders(request: Request): Promise<VerifiedSession | null> {
  return verifySession(request);
}

export * from "./session";
