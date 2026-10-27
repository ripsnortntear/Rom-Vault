import "server-only";

import { query, execute } from "@/lib/db";
import { generateSecureToken, hashToken, generateUUID } from "@/lib/auth/crypto";
import { verifySessionTokenFast } from "@/lib/auth/session";
import type { AuthSession } from "@/types/auth";

const SESSION_MAX_AGE_DAYS = Number(process.env.SESSION_MAX_AGE_DAYS) || 14;

/**
 * Record a new session in MariaDB `auth_tokens`.
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
 * Revoke an active database session.
 */
export async function revokeSession(rawOrSignedToken: string): Promise<void> {
  if (!rawOrSignedToken) return;

  let tokenToHash = rawOrSignedToken;
  if (rawOrSignedToken.includes(".")) {
    const verified = await verifySessionTokenFast(rawOrSignedToken);
    if (verified.valid && verified.payload.sessionId) {
      tokenToHash = verified.payload.sessionId;
    }
  }

  const tokenHash = hashToken(tokenToHash);
  await execute("DELETE FROM auth_tokens WHERE token_hash = ? AND type = 'session'", [tokenHash]);
}

/**
 * Revoke all active sessions for a user (e.g. after password reset).
 */
export async function revokeAllUserSessions(userId: string): Promise<void> {
  await execute("DELETE FROM auth_tokens WHERE user_id = ?", [userId]);
}
