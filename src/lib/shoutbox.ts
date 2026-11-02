import "server-only";

import { query, execute } from "@/lib/db";
import type { ShoutMessage, ShoutType } from "@/types/shoutbox";

interface ShoutRow {
  id: number;
  user_id: string | null;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  role: string | null;
  type: ShoutType;
  game_id: string | null;
  system_id: string | null;
  message: string;
  created_at: Date | string;
}

let isInitialized = false;

export function _resetShoutboxInitForTesting(): void {
  isInitialized = false;
}

/**
 * Ensure table exists and seed initial release announcements if empty.
 */
export async function ensureShoutboxInitialized(): Promise<void> {
  if (isInitialized) return;

  try {
    await execute(`
      CREATE TABLE IF NOT EXISTS shoutbox_messages (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id VARCHAR(36) NULL,
        username VARCHAR(50) NOT NULL,
        display_name VARCHAR(100) NULL,
        avatar_url VARCHAR(1024) NULL,
        role VARCHAR(20) DEFAULT 'user',
        type ENUM('user', 'release', 'system') DEFAULT 'user' NOT NULL,
        game_id VARCHAR(255) NULL,
        system_id VARCHAR(50) NULL,
        message TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_shout_created (created_at DESC),
        INDEX idx_shout_type (type)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // Check row count
    const countRows = await query<{ count: number }>(
      "SELECT COUNT(*) AS count FROM shoutbox_messages"
    );
    const count = Array.isArray(countRows) && countRows[0] ? Number(countRows[0].count || 0) : 1;

    if (count === 0) {
      await seedInitialShouts();
    }

    isInitialized = true;
  } catch (err) {
    console.error("[Shoutbox] Failed to initialize table:", err);
  }
}

/**
 * Seed initial releases and welcome messages
 */
async function seedInitialShouts(): Promise<void> {
  const seeds: Array<{
    user_id: string | null;
    username: string;
    display_name: string;
    role: string;
    type: ShoutType;
    game_id: string | null;
    system_id: string | null;
    message: string;
  }> = [
    {
      user_id: null,
      username: "VaultAdmin",
      display_name: "Vault Overseer",
      role: "admin",
      type: "system",
      game_id: null,
      system_id: null,
      message:
        "Welcome to the ROM Vault Shoutbox! Chat with fellow retro gamers, see fresh library drops, and share high scores.",
    },
    {
      user_id: null,
      username: "VaultDrop",
      display_name: "Vault Drop",
      role: "system",
      type: "release",
      game_id: "gamecube__Legend of Zelda, The - The Wind Waker (USA)",
      system_id: "gamecube",
      message:
        "The Legend of Zelda: The Wind Waker (GameCube) has landed in the Vault! Grab your Master Sword and set sail.",
    },
    {
      user_id: null,
      username: "VaultDrop",
      display_name: "Vault Drop",
      role: "system",
      type: "release",
      game_id: "n64__Mario Kart 64 (USA)",
      system_id: "n64",
      message:
        "Mario Kart 64 (N64) is live with instant in-browser emulation and full gamepad support!",
    },
    {
      user_id: null,
      username: "VaultDrop",
      display_name: "Vault Drop",
      role: "system",
      type: "release",
      game_id: "ps2__007 - Nightfire (USA)",
      system_id: "ps2",
      message:
        "007: Nightfire (PS2) added to the library with 60 FPS WebGL execution and auto cloud memory cards.",
    },
    {
      user_id: null,
      username: "VaultDrop",
      display_name: "Vault Drop",
      role: "system",
      type: "release",
      game_id: "gba__Legend of Zelda, The - The Minish Cap (USA)",
      system_id: "gba",
      message:
        "The Legend of Zelda: The Minish Cap (GBA) is now playable directly in your browser!",
    },
    {
      user_id: null,
      username: "RetroGamer99",
      display_name: "RetroGamer99",
      role: "user",
      type: "user",
      game_id: null,
      system_id: null,
      message:
        "The in-browser PS2 emulation is ridiculously fast! Great to see Nightfire running so clean.",
    },
  ];

  for (const s of seeds) {
    await execute(
      `INSERT INTO shoutbox_messages (user_id, username, display_name, role, type, game_id, system_id, message)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        s.user_id,
        s.username,
        s.display_name,
        s.role,
        s.type,
        s.game_id,
        s.system_id,
        s.message,
      ]
    );
  }
}

/**
 * Fetch the latest shouts. Returns them in chronological order (oldest to newest)
 * for standard chat feed display.
 */
export async function getRecentShouts(limit = 60): Promise<ShoutMessage[]> {
  await ensureShoutboxInitialized();

  const safeLimit = Math.max(1, Math.min(100, Math.floor(limit)));

  const rows = await query<ShoutRow>(
    `SELECT id, user_id, username, display_name, avatar_url, role, type, game_id, system_id, message, created_at
     FROM shoutbox_messages
     ORDER BY id DESC
     LIMIT ?`,
    [safeLimit]
  );

  const formatted: ShoutMessage[] = rows.map((r) => ({
    id: Number(r.id),
    userId: r.user_id,
    username: r.username,
    displayName: r.display_name,
    avatarUrl: r.avatar_url,
    role: r.role || "user",
    type: r.type,
    gameId: r.game_id,
    systemId: r.system_id,
    message: r.message,
    createdAt: (() => {
      if (r.created_at instanceof Date && !isNaN(r.created_at.getTime())) {
        return r.created_at.toISOString();
      }
      if (r.created_at) {
        const d = new Date(r.created_at);
        if (!isNaN(d.getTime())) return d.toISOString();
      }
      return new Date().toISOString();
    })(),
  }));

  // Reverse so oldest of the batch is first, newest is last for linear chat display
  return formatted.reverse();
}

/**
 * Post a new shout (user or system)
 */
export async function postShout(params: {
  userId?: string | null;
  username: string;
  displayName?: string | null;
  avatarUrl?: string | null;
  role?: string;
  type?: ShoutType;
  gameId?: string | null;
  systemId?: string | null;
  message: string;
}): Promise<ShoutMessage> {
  await ensureShoutboxInitialized();

  const cleanMessage = params.message.trim().slice(0, 280);
  if (!cleanMessage) {
    throw new Error("Shout message cannot be empty.");
  }

  const cleanUsername = (params.username || "Guest").trim().slice(0, 50);
  const cleanDisplayName = params.displayName ? params.displayName.trim().slice(0, 100) : cleanUsername;
  const cleanRole = params.role || "user";
  const type: ShoutType = params.type || "user";

  const result = await execute(
    `INSERT INTO shoutbox_messages (user_id, username, display_name, avatar_url, role, type, game_id, system_id, message)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      params.userId || null,
      cleanUsername,
      cleanDisplayName,
      params.avatarUrl || null,
      cleanRole,
      type,
      params.gameId || null,
      params.systemId || null,
      cleanMessage,
    ]
  );

  const insertId = result?.insertId || 0;

  return {
    id: Number(insertId),
    userId: params.userId || null,
    username: cleanUsername,
    displayName: cleanDisplayName,
    avatarUrl: params.avatarUrl || null,
    role: cleanRole,
    type,
    gameId: params.gameId || null,
    systemId: params.systemId || null,
    message: cleanMessage,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Automatically announce a new game release in the shoutbox
 */
export async function announceGameRelease(game: {
  id: string;
  title: string;
  system: string;
}): Promise<ShoutMessage> {
  const formattedSystem = game.system.toUpperCase();
  const announcementText = `🎮 NEW RELEASE: ${game.title} (${formattedSystem}) has been archived and is now playable in the Vault!`;

  return postShout({
    userId: null,
    username: "VaultDrop",
    displayName: "Vault Drop",
    role: "system",
    type: "release",
    gameId: game.id,
    systemId: game.system.toLowerCase(),
    message: announcementText,
  });
}
