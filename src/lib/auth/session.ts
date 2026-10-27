import { cookies } from "next/headers";
import { query, execute } from "@/lib/db";
import { generateSecureToken, hashToken, generateUUID } from "@/lib/auth/crypto";
import { signSessionValue, verifySignedSessionValue } from "@/lib/auth/token-signer";
import type { AuthSession, User, UserProfile } from "@/types/auth";

export const SESSION_COOKIE_NAME = process.env.AUTH_SESSION_COOKIE_NAME || "rom_vault_session";
const SESSION_MAX_AGE_DAYS = Number(process.env.SESSION_MAX_AGE_DAYS) || 14;

/**
 * Create a new user session and store its SHA-256 hash in `auth_tokens`.
 */
export async function createSession(
  userId: string,
  ipAddress?: string,
  userAgent?: string
): Promise<{ token: string; expiresAt: Date }> {
  const token = generateSecureToken();
  const tokenHash = hashToken(token);
  const tokenId = generateUUID();

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + SESSION_MAX_AGE_DAYS);

  await execute(
    `INSERT INTO auth_tokens (id, user_id, token_hash, type, ip_address, user_agent, expires_at)
     VALUES (?, ?, ?, 'session', ?, ?, ?)`,
    [
      tokenId,
      userId,
      tokenHash,
      ipAddress ? ipAddress.slice(0, 45) : null,
      userAgent ? userAgent.slice(0, 512) : null,
      expiresAt,
    ]
  );

  return { token, expiresAt };
}

/**
 * Validate a session token (raw or signed) against `auth_tokens` and return user & profile session data.
 */
export async function validateSession(rawOrSignedToken: string): Promise<AuthSession | null> {
  if (!rawOrSignedToken || typeof rawOrSignedToken !== "string") {
    return null;
  }

  // Extract raw token if signed
  const token = rawOrSignedToken.includes(".")
    ? (await verifySignedSessionValue(rawOrSignedToken)) || rawOrSignedToken
    : rawOrSignedToken;

  const tokenHash = hashToken(token);

  interface SessionQueryResult {
    user_id: string;
    expires_at: Date;
    username: string;
    email: string;
    role: "user" | "admin";
    account_status: "pending" | "active" | "suspended";
    locked_until: Date | null;
    display_name: string | null;
    avatar_url: string | null;
    download_quota_daily: number;
    download_count_today: number;
    last_download_reset: string;
  }

  const rows = await query<SessionQueryResult>(
    `SELECT 
       t.user_id, t.expires_at,
       u.username, u.email, u.role, u.account_status, u.locked_until,
       p.display_name, p.avatar_url, p.download_quota_daily, p.download_count_today, p.last_download_reset
     FROM auth_tokens t
     INNER JOIN users u ON t.user_id = u.id
     LEFT JOIN user_profiles p ON u.id = p.user_id
     WHERE t.token_hash = ? AND t.type = 'session' AND t.expires_at > NOW()`,
    [tokenHash]
  );

  const sessionRow = rows[0];
  if (!sessionRow) {
    return null;
  }

  // Account must be active and not locked
  if (sessionRow.account_status !== "active") {
    return null;
  }
  if (sessionRow.locked_until && new Date(sessionRow.locked_until) > new Date()) {
    return null;
  }

  return {
    user: {
      id: sessionRow.user_id,
      username: sessionRow.username,
      email: sessionRow.email,
      role: sessionRow.role,
      account_status: sessionRow.account_status,
      displayName: sessionRow.display_name,
      avatarUrl: sessionRow.avatar_url,
      quotaDaily: sessionRow.role === "admin" ? null : (sessionRow.download_quota_daily || 50),
      quotaUsedToday: sessionRow.role === "admin" ? 0 : (sessionRow.download_count_today || 0),
    },
    expiresAt: new Date(sessionRow.expires_at).toISOString(),
  };
}

/**
 * Revoke an active session.
 */
export async function revokeSession(rawOrSignedToken: string): Promise<void> {
  if (!rawOrSignedToken) return;
  const token = rawOrSignedToken.includes(".")
    ? (await verifySignedSessionValue(rawOrSignedToken)) || rawOrSignedToken
    : rawOrSignedToken;
  const tokenHash = hashToken(token);
  await execute("DELETE FROM auth_tokens WHERE token_hash = ? AND type = 'session'", [tokenHash]);
}

/**
 * Revoke all sessions for a user (e.g. after password reset).
 */
export async function revokeAllUserSessions(userId: string): Promise<void> {
  await execute("DELETE FROM auth_tokens WHERE user_id = ?", [userId]);
}

/**
 * Get current session from Next.js cookies (server components / route handlers).
 */
export async function getCurrentSession(): Promise<AuthSession | null> {
  try {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME);
    if (!sessionCookie?.value) {
      return null;
    }
    return await validateSession(sessionCookie.value);
  } catch {
    return null;
  }
}

/**
 * Set the HTTP-only session cookie (cryptographically signed).
 */
export async function setSessionCookie(
  token: string,
  expiresAt: Date,
  userInfo?: { userId: string; role: "admin" | "user" }
): Promise<void> {
  const cookieStore = await cookies();
  const isHttps = process.env.NEXT_PUBLIC_APP_URL?.startsWith("https://") ?? false;
  const signedCookieValue = await signSessionValue(
    userInfo ? { userId: userInfo.userId, role: userInfo.role, token } : token
  );

  cookieStore.set(SESSION_COOKIE_NAME, signedCookieValue, {
    httpOnly: true,
    secure: isHttps || process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/roms",
    expires: expiresAt,
  });
}

/**
 * Delete the session cookie.
 */
export async function clearSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NEXT_PUBLIC_APP_URL?.startsWith("https://") ?? false,
    sameSite: "lax",
    path: "/roms",
    expires: new Date(0),
    maxAge: 0,
  });
}
