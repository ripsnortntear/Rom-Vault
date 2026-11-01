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
 * Delete / revoke an active database session.
 * Computes identical SHA2(token, 256) hash when clearing records from auth_tokens.
 */
export async function deleteSession(rawOrSignedToken: string): Promise<void> {
  if (!rawOrSignedToken) return;

  let tokenToHash = rawOrSignedToken;
  if (rawOrSignedToken.includes(".")) {
    const verified = await verifySessionTokenFast(rawOrSignedToken);
    if (verified.valid && verified.payload.sessionId) {
      tokenToHash = verified.payload.sessionId;
    }
  }

  const tokenHash = hashToken(tokenToHash);
  await execute(
    "DELETE FROM auth_tokens WHERE (token_hash = ? OR token_hash = SHA2(?, 256) OR token_hash = SHA2(?, 256)) AND type = 'session'",
    [tokenHash, tokenToHash, rawOrSignedToken]
  );
}

export const revokeSession = deleteSession;

/**
 * Revoke all active sessions for a user (e.g. after password reset).
 */
export async function revokeAllUserSessions(userId: string): Promise<void> {
  await execute("DELETE FROM auth_tokens WHERE user_id = ?", [userId]);
}

/**
 * Verify whether a session is still active in the database (not revoked, logged out, or expired),
 * and that the associated user account is active.
 */
export async function isSessionActiveInDb(
  sessionIdOrToken: string,
  userId?: string | number
): Promise<boolean> {
  if (!sessionIdOrToken) return false;
  try {
    const tokenHash = hashToken(sessionIdOrToken);
    const params: any[] = [tokenHash];
    let sql = `
      SELECT t.id, u.account_status
      FROM auth_tokens t
      JOIN users u ON u.id = t.user_id
      WHERE t.token_hash = ? AND t.type = 'session' AND t.expires_at > NOW()
    `;
    if (userId) {
      sql += " AND t.user_id = ?";
      params.push(String(userId));
    }
    sql += " LIMIT 1";

    const rows = await query<{ id: string; account_status: string }>(sql, params);
    if (rows.length === 0) return false;
    if (rows[0].account_status === "suspended") return false;

    return true;
  } catch (error) {
    console.error("[isSessionActiveInDb] Error verifying session in DB:", error);
    return false;
  }
}

