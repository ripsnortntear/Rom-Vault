import "server-only";

import { query, execute } from "@/lib/db";
import { logAdminAudit } from "@/lib/community";

export interface GameModerationRecord {
  gameId: string;
  system: string;
  isDisabled: boolean;
  preferredCover: string | null;
  customCoverUrl: string | null;
  customTitle: string | null;
  customStory: string | null;
  moderatedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface GameModerationUpdates {
  isDisabled?: boolean;
  preferredCover?: string | null;
  customCoverUrl?: string | null;
  customTitle?: string | null;
  customStory?: string | null;
}

/**
 * Fetch all game moderation records in bulk for fast scanner ingestion.
 */
export async function getAllGameModerations(): Promise<Map<string, GameModerationRecord>> {
  const map = new Map<string, GameModerationRecord>();
  try {
    const rows = await query<any>(
      `SELECT game_id, system, is_disabled, preferred_cover, custom_cover_url,
              custom_title, custom_story, moderated_by, created_at, updated_at
       FROM game_moderation`
    );

    for (const r of rows) {
      map.set(r.game_id, {
        gameId: r.game_id,
        system: r.system,
        isDisabled: Boolean(r.is_disabled),
        preferredCover: r.preferred_cover,
        customCoverUrl: r.custom_cover_url,
        customTitle: r.custom_title,
        customStory: r.custom_story,
        moderatedBy: r.moderated_by,
        createdAt: new Date(r.created_at).toISOString(),
        updatedAt: new Date(r.updated_at).toISOString(),
      });
    }
  } catch (err) {
    console.warn("[moderation] Error querying game_moderation records:", err);
  }
  return map;
}

/**
 * Fetch a single game's moderation record.
 */
export async function getGameModeration(gameId: string): Promise<GameModerationRecord | null> {
  try {
    const rows = await query<any>(
      `SELECT game_id, system, is_disabled, preferred_cover, custom_cover_url,
              custom_title, custom_story, moderated_by, created_at, updated_at
       FROM game_moderation
       WHERE game_id = ?
       LIMIT 1`,
      [gameId]
    );

    const r = rows[0];
    if (!r) return null;

    return {
      gameId: r.game_id,
      system: r.system,
      isDisabled: Boolean(r.is_disabled),
      preferredCover: r.preferred_cover,
      customCoverUrl: r.custom_cover_url,
      customTitle: r.custom_title,
      customStory: r.custom_story,
      moderatedBy: r.moderated_by,
      createdAt: new Date(r.created_at).toISOString(),
      updatedAt: new Date(r.updated_at).toISOString(),
    };
  } catch (err) {
    console.error(`[moderation] Error querying record for ${gameId}:`, err);
    return null;
  }
}

/**
 * Update or insert a game's moderation configuration.
 */
export async function updateGameModeration(
  gameId: string,
  system: string,
  updates: GameModerationUpdates,
  adminUser?: { id: string; username: string }
): Promise<boolean> {
  try {
    const existing = await getGameModeration(gameId);

    const newDisabled =
      updates.isDisabled !== undefined
        ? updates.isDisabled ? 1 : 0
        : existing?.isDisabled ? 1 : 0;

    const newPreferredCover =
      updates.preferredCover !== undefined
        ? updates.preferredCover
        : existing?.preferredCover ?? null;

    const newCustomCoverUrl =
      updates.customCoverUrl !== undefined
        ? updates.customCoverUrl
        : existing?.customCoverUrl ?? null;

    const newCustomTitle =
      updates.customTitle !== undefined
        ? updates.customTitle
        : existing?.customTitle ?? null;

    const newCustomStory =
      updates.customStory !== undefined
        ? updates.customStory
        : existing?.customStory ?? null;

    const modBy = adminUser?.username || "admin";

    await execute(
      `INSERT INTO game_moderation (
         game_id, system, is_disabled, preferred_cover, custom_cover_url,
         custom_title, custom_story, moderated_by
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         system = VALUES(system),
         is_disabled = VALUES(is_disabled),
         preferred_cover = VALUES(preferred_cover),
         custom_cover_url = VALUES(custom_cover_url),
         custom_title = VALUES(custom_title),
         custom_story = VALUES(custom_story),
         moderated_by = VALUES(moderated_by),
         updated_at = NOW()`,
      [
        gameId,
        system,
        newDisabled,
        newPreferredCover,
        newCustomCoverUrl,
        newCustomTitle,
        newCustomStory,
        modBy,
      ]
    );

    if (adminUser) {
      await logAdminAudit(
        adminUser.id,
        "moderate_game",
        "game",
        gameId,
        {
          updates,
          moderatedBy: modBy,
        }
      );
    }

    return true;
  } catch (err) {
    console.error(`[moderation] Failed updating moderation for ${gameId}:`, err);
    return false;
  }
}

/**
 * Wipe all high scores for a specific game (e.g. if corrupted or hacked).
 */
export async function wipeGameScores(
  gameId: string,
  adminId?: string
): Promise<boolean> {
  try {
    const res = await execute(
      "DELETE FROM game_high_scores WHERE game_id = ?",
      [gameId]
    );

    if (adminId) {
      await logAdminAudit(
        adminId,
        "wipe_game_scores",
        "game",
        gameId,
        { affectedRows: res.affectedRows }
      );
    }

    return true;
  } catch (err) {
    console.error(`[moderation] Failed wiping scores for ${gameId}:`, err);
    return false;
  }
}
