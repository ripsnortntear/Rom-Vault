import "server-only";

import fs from "fs/promises";
import { query, execute } from "@/lib/db";
import { hashPassword } from "@/lib/auth/crypto";
import type {
  GameComment,
  GameHighScore,
  GameSocialStats,
  AuditLogItem,
  AdminUserListItem,
  AdminStorageHealth,
} from "@/types/community";

/**
 * Submit or update a 1-5 star rating for a game.
 */
export async function submitRating(userId: string, gameId: string, rating: number): Promise<void> {
  const clampedRating = Math.max(1, Math.min(5, Math.round(rating)));
  await execute(
    `INSERT INTO game_ratings (user_id, game_id, rating)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE rating = VALUES(rating), updated_at = NOW()`,
    [userId, gameId, clampedRating]
  );
}

/**
 * Fetch aggregate rating statistics and the current user's rating for a game.
 */
export async function getGameRatingStats(
  gameId: string,
  userId?: string
): Promise<{ averageRating: number; totalRatings: number; userRating: number | null }> {
  interface StatsRow {
    avg_rating: number | string | null;
    total_ratings: number;
  }

  const statsRows = await query<StatsRow>(
    `SELECT AVG(rating) as avg_rating, COUNT(*) as total_ratings
     FROM game_ratings
     WHERE game_id = ?`,
    [gameId]
  );

  const stats = statsRows[0];
  const avg = stats && stats.avg_rating !== null ? Number(Number(stats.avg_rating).toFixed(1)) : 0;
  const count = stats ? Number(stats.total_ratings) : 0;

  let userRating: number | null = null;
  if (userId) {
    const userRows = await query<{ rating: number }>(
      "SELECT rating FROM game_ratings WHERE user_id = ? AND game_id = ? LIMIT 1",
      [userId, gameId]
    );
    if (userRows[0]) {
      userRating = userRows[0].rating;
    }
  }

  return {
    averageRating: avg,
    totalRatings: count,
    userRating,
  };
}

/**
 * Post a new game comment.
 */
export async function postComment(
  userId: string,
  gameId: string,
  content: string
): Promise<GameComment> {
  const cleanContent = content.trim();
  const res = await execute(
    "INSERT INTO game_comments (user_id, game_id, content) VALUES (?, ?, ?)",
    [userId, gameId, cleanContent]
  );

  const commentId = res.insertId;
  const rows = await query<any>(
    `SELECT c.id, c.user_id, c.game_id, c.content, c.is_deleted, c.created_at, c.updated_at,
            u.username, u.role, p.display_name, p.avatar_url
     FROM game_comments c
     INNER JOIN users u ON c.user_id = u.id
     LEFT JOIN user_profiles p ON u.id = p.user_id
     WHERE c.id = ? LIMIT 1`,
    [commentId]
  );

  const row = rows[0];
  return {
    id: row.id,
    userId: row.user_id,
    gameId: row.game_id,
    content: row.content,
    isDeleted: Boolean(row.is_deleted),
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
    author: {
      id: row.user_id,
      username: row.username,
      displayName: row.display_name,
      avatarUrl: row.avatar_url,
      role: row.role,
    },
  };
}

/**
 * Fetch visible comments for a game with author details.
 */
export async function getGameComments(
  gameId: string,
  limit = 25,
  offset = 0
): Promise<GameComment[]> {
  const rows = await query<any>(
    `SELECT c.id, c.user_id, c.game_id, c.content, c.is_deleted, c.created_at, c.updated_at,
            u.username, u.role, p.display_name, p.avatar_url
     FROM game_comments c
     INNER JOIN users u ON c.user_id = u.id
     LEFT JOIN user_profiles p ON u.id = p.user_id
     WHERE c.game_id = ? AND c.is_deleted = 0
     ORDER BY c.created_at DESC
     LIMIT ? OFFSET ?`,
    [gameId, limit, offset]
  );

  return rows.map((row) => ({
    id: row.id,
    userId: row.user_id,
    gameId: row.game_id,
    content: row.content,
    isDeleted: Boolean(row.is_deleted),
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
    author: {
      id: row.user_id,
      username: row.username,
      displayName: row.display_name,
      avatarUrl: row.avatar_url,
      role: row.role,
    },
  }));
}

/**
 * Soft delete a comment. Allowed if author matches or if admin.
 */
export async function deleteComment(
  commentId: number,
  userId: string,
  isAdmin = false
): Promise<boolean> {
  let res: any;
  if (isAdmin) {
    res = await execute("UPDATE game_comments SET is_deleted = 1 WHERE id = ?", [commentId]);
  } else {
    res = await execute(
      "UPDATE game_comments SET is_deleted = 1 WHERE id = ? AND user_id = ?",
      [commentId, userId]
    );
  }
  return res.affectedRows > 0;
}

/**
 * Submit a high score.
 */
export async function submitHighScore(data: {
  userId: string;
  gameId: string;
  system: string;
  score: number;
  proofUrl?: string | null;
  metadataJson?: Record<string, unknown> | null;
}): Promise<number> {
  const res = await execute(
    `INSERT INTO game_high_scores (user_id, game_id, system, score, proof_url, metadata_json)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      data.userId,
      data.gameId,
      data.system,
      data.score,
      data.proofUrl || null,
      data.metadataJson ? JSON.stringify(data.metadataJson) : null,
    ]
  );
  return res.insertId;
}

/**
 * Retrieve high score by ID with user info.
 */
export async function getHighScoreById(id: number): Promise<GameHighScore | null> {
  const rows = await query<any>(
    `SELECT s.id, s.user_id, s.game_id, s.system, s.score, s.proof_url, s.metadata_json,
            s.is_verified, s.created_at, u.username, p.display_name, p.avatar_url
     FROM game_high_scores s
     INNER JOIN users u ON s.user_id = u.id
     LEFT JOIN user_profiles p ON u.id = p.user_id
     WHERE s.id = ? LIMIT 1`,
    [id]
  );

  const row = rows[0];
  if (!row) return null;

  return {
    id: row.id,
    userId: row.user_id,
    gameId: row.game_id,
    system: row.system,
    score: Number(row.score),
    proofUrl: row.proof_url,
    metadataJson:
      typeof row.metadata_json === "string"
        ? JSON.parse(row.metadata_json)
        : row.metadata_json || null,
    isVerified: Boolean(row.is_verified),
    createdAt: new Date(row.created_at).toISOString(),
    user: {
      id: row.user_id,
      username: row.username,
      displayName: row.display_name,
      avatarUrl: row.avatar_url,
    },
  };
}

/**
 * Fetch top high scores for a game.
 */
export async function getGameHighScores(gameId: string, limit = 10): Promise<GameHighScore[]> {
  const rows = await query<any>(
    `SELECT s.id, s.user_id, s.game_id, s.system, s.score, s.proof_url, s.metadata_json,
            s.is_verified, s.created_at, u.username, p.display_name, p.avatar_url
     FROM game_high_scores s
     INNER JOIN users u ON s.user_id = u.id
     LEFT JOIN user_profiles p ON u.id = p.user_id
     WHERE s.game_id = ? AND s.is_verified = 1
     ORDER BY s.score DESC
     LIMIT ?`,
    [gameId, limit]
  );

  return rows.map((row) => ({
    id: row.id,
    userId: row.user_id,
    gameId: row.game_id,
    system: row.system,
    score: Number(row.score),
    proofUrl: row.proof_url,
    metadataJson:
      typeof row.metadata_json === "string"
        ? JSON.parse(row.metadata_json)
        : row.metadata_json || null,
    isVerified: Boolean(row.is_verified),
    createdAt: new Date(row.created_at).toISOString(),
    user: {
      id: row.user_id,
      username: row.username,
      displayName: row.display_name,
      avatarUrl: row.avatar_url,
    },
  }));
}

/**
 * Fetch global or per-console leaderboards.
 */
export async function getLeaderboards(system?: string, limit = 50): Promise<GameHighScore[]> {
  let sql = `
    SELECT s.id, s.user_id, s.game_id, s.system, s.score, s.proof_url, s.metadata_json,
           s.is_verified, s.created_at, u.username, p.display_name, p.avatar_url
    FROM game_high_scores s
    INNER JOIN users u ON s.user_id = u.id
    LEFT JOIN user_profiles p ON u.id = p.user_id
    WHERE s.is_verified = 1
  `;
  const params: any[] = [];

  if (system && system !== "all") {
    sql += " AND s.system = ?";
    params.push(system);
  }

  sql += " ORDER BY s.score DESC LIMIT ?";
  params.push(limit);

  const rows = await query<any>(sql, params);

  return rows.map((row) => ({
    id: row.id,
    userId: row.user_id,
    gameId: row.game_id,
    system: row.system,
    score: Number(row.score),
    proofUrl: row.proof_url,
    metadataJson:
      typeof row.metadata_json === "string"
        ? JSON.parse(row.metadata_json)
        : row.metadata_json || null,
    isVerified: Boolean(row.is_verified),
    createdAt: new Date(row.created_at).toISOString(),
    user: {
      id: row.user_id,
      username: row.username,
      displayName: row.display_name,
      avatarUrl: row.avatar_url,
    },
  }));
}

/**
 * Delete a high score (moderation).
 */
export async function deleteHighScore(scoreId: number): Promise<boolean> {
  const res = await execute("DELETE FROM game_high_scores WHERE id = ?", [scoreId]);
  return res.affectedRows > 0;
}

/**
 * Aggregates all social stats for a game: rating stats, comments, and top scores.
 */
export async function getGameSocialStats(
  gameId: string,
  userId?: string
): Promise<GameSocialStats> {
  const [ratingStats, comments, topScores] = await Promise.all([
    getGameRatingStats(gameId, userId),
    getGameComments(gameId, 15, 0),
    getGameHighScores(gameId, 5),
  ]);

  return {
    averageRating: ratingStats.averageRating,
    totalRatings: ratingStats.totalRatings,
    userRating: ratingStats.userRating,
    commentsCount: comments.length,
    recentComments: comments,
    topScores,
  };
}

/* ==============================================================================
 * Admin Operations & Audit Logging
 * ============================================================================== */

/**
 * Record an audit log entry.
 */
export async function logAdminAudit(
  adminId: string | null,
  action: string,
  targetType: string,
  targetId: string,
  details?: Record<string, unknown> | null,
  ipAddress?: string | null
): Promise<void> {
  await execute(
    `INSERT INTO audit_logs (admin_id, action, target_type, target_id, details_json, ip_address)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      adminId,
      action,
      targetType,
      targetId,
      details ? JSON.stringify(details) : null,
      ipAddress || null,
    ]
  ).catch((err) => console.error("[logAdminAudit] Failed to record log:", err));
}

/**
 * Fetch recent audit logs.
 */
export async function getAdminAuditLogs(limit = 50): Promise<AuditLogItem[]> {
  const rows = await query<any>(
    `SELECT a.id, a.admin_id, a.action, a.target_type, a.target_id, a.details_json,
            a.ip_address, a.created_at, u.username as admin_username
     FROM audit_logs a
     LEFT JOIN users u ON a.admin_id = u.id
     ORDER BY a.created_at DESC
     LIMIT ?`,
    [limit]
  );

  return rows.map((r) => ({
    id: r.id,
    adminId: r.admin_id,
    adminUsername: r.admin_username,
    action: r.action,
    targetType: r.target_type,
    targetId: r.target_id,
    detailsJson:
      typeof r.details_json === "string" ? JSON.parse(r.details_json) : r.details_json || null,
    ipAddress: r.ip_address,
    createdAt: new Date(r.created_at).toISOString(),
  }));
}

/**
 * Fetch users list for admin dashboard with search filter.
 */
export async function getAdminUsers(
  search?: string,
  limit = 50,
  offset = 0
): Promise<AdminUserListItem[]> {
  let sql = `
    SELECT u.id, u.username, u.email, u.role, u.account_status, u.failed_login_attempts,
           u.locked_until, u.created_at,
           p.download_quota_daily, p.download_count_today, p.display_name, p.avatar_url
    FROM users u
    LEFT JOIN user_profiles p ON u.id = p.user_id
  `;
  const params: any[] = [];

  if (search && search.trim()) {
    const term = `%${search.trim()}%`;
    sql += " WHERE u.username LIKE ? OR u.email LIKE ? OR p.display_name LIKE ?";
    params.push(term, term, term);
  }

  sql += " ORDER BY u.created_at DESC LIMIT ? OFFSET ?";
  params.push(limit, offset);

  const rows = await query<any>(sql, params);

  return rows.map((r) => ({
    id: r.id,
    username: r.username,
    email: r.email,
    role: r.role,
    accountStatus: r.account_status,
    downloadQuotaDaily: r.download_quota_daily ?? 50,
    downloadCountToday: r.download_count_today ?? 0,
    failedLoginAttempts: r.failed_login_attempts ?? 0,
    lockedUntil: r.locked_until ? new Date(r.locked_until).toISOString() : null,
    createdAt: new Date(r.created_at).toISOString(),
    displayName: r.display_name,
    avatarUrl: r.avatar_url,
  }));
}

/**
 * Update user role (admin / user).
 */
export async function updateUserRole(
  userId: string,
  role: "user" | "admin",
  adminId: string
): Promise<boolean> {
  const res = await execute("UPDATE users SET role = ?, updated_at = NOW() WHERE id = ?", [
    role,
    userId,
  ]);
  await logAdminAudit(adminId, "update_role", "user", userId, { newRole: role });
  return res.affectedRows > 0;
}

/**
 * Update user daily download quota.
 */
export async function updateUserQuota(
  userId: string,
  dailyQuota: number,
  adminId: string
): Promise<boolean> {
  const cleanQuota = Math.max(0, Math.min(10000, Math.round(dailyQuota)));
  const res = await execute(
    "UPDATE user_profiles SET download_quota_daily = ?, updated_at = NOW() WHERE user_id = ?",
    [cleanQuota, userId]
  );
  await logAdminAudit(adminId, "update_quota", "user", userId, { newQuota: cleanQuota });
  return res.affectedRows > 0;
}

/**
 * Update user account status (active / suspended).
 */
export async function updateUserStatus(
  userId: string,
  status: "active" | "suspended",
  adminId: string
): Promise<boolean> {
  const res = await execute(
    "UPDATE users SET account_status = ?, updated_at = NOW() WHERE id = ?",
    [status, userId]
  );
  await logAdminAudit(adminId, "update_status", "user", userId, { newStatus: status });
  return res.affectedRows > 0;
}

/**
 * Admin reset of user password.
 */
export async function adminResetPassword(
  userId: string,
  newPlainTextPassword: string,
  adminId: string
): Promise<boolean> {
  const passwordHash = await hashPassword(newPlainTextPassword);
  const res = await execute(
    "UPDATE users SET password_hash = ?, failed_login_attempts = 0, locked_until = NULL, updated_at = NOW() WHERE id = ?",
    [passwordHash, userId]
  );
  // Invalidate any existing sessions
  await execute("DELETE FROM auth_tokens WHERE user_id = ?", [userId]);
  await logAdminAudit(adminId, "reset_password", "user", userId, { manualReset: true });
  return res.affectedRows > 0;
}

/**
 * Admin purge (permanent delete) of user account and associated data.
 */
export async function adminPurgeUser(userId: string, adminId: string): Promise<boolean> {
  const res = await execute("DELETE FROM users WHERE id = ?", [userId]);
  await logAdminAudit(adminId, "purge_user", "user", userId, { deleted: true });
  return res.affectedRows > 0;
}

/**
 * Get recent comments for moderation queue.
 */
export async function getModerationComments(limit = 50): Promise<GameComment[]> {
  const rows = await query<any>(
    `SELECT c.id, c.user_id, c.game_id, c.content, c.is_deleted, c.created_at, c.updated_at,
            u.username, u.role, p.display_name, p.avatar_url
     FROM game_comments c
     INNER JOIN users u ON c.user_id = u.id
     LEFT JOIN user_profiles p ON u.id = p.user_id
     ORDER BY c.created_at DESC
     LIMIT ?`,
    [limit]
  );

  return rows.map((row) => ({
    id: row.id,
    userId: row.user_id,
    gameId: row.game_id,
    content: row.content,
    isDeleted: Boolean(row.is_deleted),
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
    author: {
      id: row.user_id,
      username: row.username,
      displayName: row.display_name,
      avatarUrl: row.avatar_url,
      role: row.role,
    },
  }));
}

/**
 * Get recent high scores for moderation queue.
 */
export async function getModerationScores(limit = 50): Promise<GameHighScore[]> {
  const rows = await query<any>(
    `SELECT s.id, s.user_id, s.game_id, s.system, s.score, s.proof_url, s.metadata_json,
            s.is_verified, s.created_at, u.username, p.display_name, p.avatar_url
     FROM game_high_scores s
     INNER JOIN users u ON s.user_id = u.id
     LEFT JOIN user_profiles p ON u.id = p.user_id
     ORDER BY s.created_at DESC
     LIMIT ?`,
    [limit]
  );

  return rows.map((row) => ({
    id: row.id,
    userId: row.user_id,
    gameId: row.game_id,
    system: row.system,
    score: Number(row.score),
    proofUrl: row.proof_url,
    metadataJson:
      typeof row.metadata_json === "string"
        ? JSON.parse(row.metadata_json)
        : row.metadata_json || null,
    isVerified: Boolean(row.is_verified),
    createdAt: new Date(row.created_at).toISOString(),
    user: {
      id: row.user_id,
      username: row.username,
      displayName: row.display_name,
      avatarUrl: row.avatar_url,
    },
  }));
}

/**
 * Collect storage and vault health metrics.
 */
export async function getAdminStorageHealth(): Promise<AdminStorageHealth> {
  let romStats = { totalBytes: 0, usedBytes: 0, freeBytes: 0, percentUsed: 0 };
  let saveStats = { totalBytes: 0, usedBytes: 0, freeBytes: 0, percentUsed: 0 };

  try {
    const romStat = await fs.statfs("/mnt/storage/roms/").catch(() => fs.statfs("/"));
    if (romStat) {
      const total = romStat.blocks * romStat.bsize;
      const free = romStat.bfree * romStat.bsize;
      const used = total - free;
      romStats = {
        totalBytes: total,
        usedBytes: used,
        freeBytes: free,
        percentUsed: total > 0 ? Math.round((used / total) * 100) : 0,
      };
    }
  } catch {}

  try {
    const saveStat = await fs.statfs("/storage/saves/").catch(() => fs.statfs("/"));
    if (saveStat) {
      const total = saveStat.blocks * saveStat.bsize;
      const free = saveStat.bfree * saveStat.bsize;
      const used = total - free;
      saveStats = {
        totalBytes: total,
        usedBytes: used,
        freeBytes: free,
        percentUsed: total > 0 ? Math.round((used / total) * 100) : 0,
      };
    }
  } catch {}

  const [sessionRows, userRows, scoreRows, commentRows, ratingRows] = await Promise.all([
    query<{ count: number }>(
      "SELECT COUNT(*) as count FROM auth_tokens WHERE type = 'session' AND expires_at > NOW()"
    ),
    query<{ count: number }>("SELECT COUNT(*) as count FROM users"),
    query<{ count: number }>("SELECT COUNT(*) as count FROM game_high_scores"),
    query<{ count: number }>("SELECT COUNT(*) as count FROM game_comments WHERE is_deleted = 0"),
    query<{ count: number }>("SELECT COUNT(*) as count FROM game_ratings"),
  ]);

  return {
    romStorage: romStats,
    saveStorage: saveStats,
    activeSessionsCount: sessionRows[0]?.count || 0,
    totalUsersCount: userRows[0]?.count || 0,
    totalScoresCount: scoreRows[0]?.count || 0,
    totalCommentsCount: commentRows[0]?.count || 0,
    totalRatingsCount: ratingRows[0]?.count || 0,
  };
}
