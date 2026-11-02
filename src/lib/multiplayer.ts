import "server-only";

import { query, execute } from "@/lib/db";
import { getSystemMeta } from "@/lib/systems";
import {
  MultiplayerRoom,
  RoomChatMessage,
  MultiplayerSignal,
  RoomStatus,
  SignalMessageType,
  SupportedMultiplayerSystem,
  SUPPORTED_MULTIPLAYER_SYSTEMS,
  UNSUPPORTED_MULTIPLAYER_SYSTEMS,
  isSupportedMultiplayerSystem,
} from "@/types/multiplayer";

export {
  SUPPORTED_MULTIPLAYER_SYSTEMS,
  UNSUPPORTED_MULTIPLAYER_SYSTEMS,
  isSupportedMultiplayerSystem,
};
export type { SupportedMultiplayerSystem };

interface RoomRow {
  id: string;
  name: string;
  system_id: string;
  emulator_core: string;
  game_id: string | null;
  game_title: string | null;
  game_file_name: string | null;
  game_cover_url: string | null;
  status: RoomStatus;
  host_id: string;
  host_username: string;
  host_display_name: string;
  host_ready: number;
  host_joined_at: Date | string;
  host_last_seen: Date | string;
  guest_id: string | null;
  guest_username: string | null;
  guest_display_name: string | null;
  guest_ready: number;
  guest_joined_at: Date | string | null;
  guest_last_seen: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

interface ChatRow {
  id: number;
  room_id: string;
  sender_id: string;
  sender_name: string;
  sender_role: "host" | "guest" | "system";
  message: string;
  created_at: Date | string;
}

interface SignalRow {
  id: number;
  room_id: string;
  sender_id: string;
  target_role: "host" | "guest";
  type: SignalMessageType;
  payload: string;
  created_at: Date | string;
}

let isInitialized = false;

export function _resetMultiplayerInitForTesting(): void {
  isInitialized = false;
}

function toIsoString(val: Date | string | null | undefined): string {
  if (!val) return new Date().toISOString();
  if (val instanceof Date) return val.toISOString();
  const parsed = new Date(val);
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
}

export async function ensureMultiplayerInitialized(): Promise<void> {
  if (isInitialized) return;

  try {
    await execute(`
      CREATE TABLE IF NOT EXISTS multiplayer_rooms (
        id VARCHAR(16) PRIMARY KEY,
        name VARCHAR(80) NOT NULL,
        system_id VARCHAR(32) NOT NULL DEFAULT 'snes',
        emulator_core VARCHAR(32) NOT NULL DEFAULT 'snes',
        game_id VARCHAR(255) NULL,
        game_title VARCHAR(255) NULL,
        game_file_name VARCHAR(255) NULL,
        game_cover_url VARCHAR(1024) NULL,
        status ENUM('waiting', 'ready', 'playing', 'closed') NOT NULL DEFAULT 'waiting',
        host_id VARCHAR(64) NOT NULL,
        host_username VARCHAR(64) NOT NULL,
        host_display_name VARCHAR(100) NOT NULL,
        host_ready TINYINT(1) NOT NULL DEFAULT 0,
        host_joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        host_last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        guest_id VARCHAR(64) NULL,
        guest_username VARCHAR(64) NULL,
        guest_display_name VARCHAR(100) NULL,
        guest_ready TINYINT(1) NOT NULL DEFAULT 0,
        guest_joined_at TIMESTAMP NULL,
        guest_last_seen TIMESTAMP NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_mp_status (status, updated_at DESC)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await execute(`
      CREATE TABLE IF NOT EXISTS multiplayer_chat (
        id INT AUTO_INCREMENT PRIMARY KEY,
        room_id VARCHAR(16) NOT NULL,
        sender_id VARCHAR(64) NOT NULL,
        sender_name VARCHAR(100) NOT NULL,
        sender_role ENUM('host', 'guest', 'system') NOT NULL DEFAULT 'host',
        message TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_mp_chat_room (room_id, id ASC)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await execute(`
      CREATE TABLE IF NOT EXISTS multiplayer_signals (
        id INT AUTO_INCREMENT PRIMARY KEY,
        room_id VARCHAR(16) NOT NULL,
        sender_id VARCHAR(64) NOT NULL,
        target_role ENUM('host', 'guest') NOT NULL,
        type VARCHAR(32) NOT NULL,
        payload MEDIUMTEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_mp_sig_poll (room_id, target_role, id ASC)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    isInitialized = true;
  } catch (err) {
    console.error("[Multiplayer] Failed to initialize tables:", err);
  }
}

function mapRowToRoom(row: RoomRow): MultiplayerRoom {
  const hostReady = Boolean(row.host_ready);
  const guestPresent = Boolean(row.guest_id);
  const guestReady = guestPresent && Boolean(row.guest_ready);
  const hasGame = Boolean(row.game_id);
  const canStart = hostReady && guestReady && hasGame;

  let computedStatus: RoomStatus = row.status;
  if (row.status !== "playing" && row.status !== "closed") {
    computedStatus = canStart ? "ready" : "waiting";
  }

  return {
    id: row.id,
    name: row.name,
    systemId: row.system_id,
    emulatorCore: row.emulator_core,
    gameId: row.game_id,
    gameTitle: row.game_title,
    gameFileName: row.game_file_name,
    gameCoverUrl: row.game_cover_url,
    status: computedStatus,
    host: {
      id: row.host_id,
      username: row.host_username,
      displayName: row.host_display_name,
      role: "host",
      isReady: hostReady,
      controllerPort: 1,
      joinedAt: toIsoString(row.host_joined_at),
      lastSeenAt: toIsoString(row.host_last_seen),
    },
    guest: row.guest_id
      ? {
          id: row.guest_id,
          username: row.guest_username || "Player2",
          displayName: row.guest_display_name || row.guest_username || "Player 2",
          role: "guest",
          isReady: guestReady,
          controllerPort: 2,
          joinedAt: toIsoString(row.guest_joined_at),
          lastSeenAt: toIsoString(row.guest_last_seen),
        }
      : null,
    canStart,
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  };
}

function mapRowToChat(row: ChatRow): RoomChatMessage {
  return {
    id: Number(row.id),
    roomId: row.room_id,
    senderId: row.sender_id,
    senderName: row.sender_name,
    senderRole: row.sender_role,
    message: row.message,
    createdAt: toIsoString(row.created_at),
  };
}

function generateRoomCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "RM-";
  for (let i = 0; i < 4; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export async function listActiveRooms(): Promise<MultiplayerRoom[]> {
  await ensureMultiplayerInitialized();

  // Mark rooms untouched for > 45 minutes as closed
  try {
    await execute(
      "UPDATE multiplayer_rooms SET status = 'closed' WHERE status != 'closed' AND updated_at < (NOW() - INTERVAL 45 MINUTE)"
    );
  } catch {}

  const rows = await query<RoomRow>(
    `SELECT * FROM multiplayer_rooms
     WHERE status != 'closed'
     ORDER BY updated_at DESC
     LIMIT 30`
  );

  if (!Array.isArray(rows)) return [];
  return rows.map(mapRowToRoom);
}

export async function getRoomById(roomId: string): Promise<MultiplayerRoom | null> {
  await ensureMultiplayerInitialized();
  const normalizedId = roomId.trim().toUpperCase();

  const rows = await query<RoomRow>(
    "SELECT * FROM multiplayer_rooms WHERE id = ? AND status != 'closed' LIMIT 1",
    [normalizedId]
  );

  if (!Array.isArray(rows) || rows.length === 0 || !rows[0]) {
    return null;
  }

  return mapRowToRoom(rows[0]);
}

export async function getRoomChat(roomId: string, limit = 60): Promise<RoomChatMessage[]> {
  await ensureMultiplayerInitialized();
  const normalizedId = roomId.trim().toUpperCase();
  const safeLimit = Math.min(Math.max(1, limit), 150);

  const rows = await query<ChatRow>(
    `SELECT id, room_id, sender_id, sender_name, sender_role, message, created_at
     FROM multiplayer_chat
     WHERE room_id = ?
     ORDER BY id DESC
     LIMIT ${safeLimit}`,
    [normalizedId]
  );

  if (!Array.isArray(rows)) return [];
  return rows.reverse().map(mapRowToChat);
}

export async function addRoomChatMessage(input: {
  roomId: string;
  senderId: string;
  senderName: string;
  senderRole: "host" | "guest" | "system";
  message: string;
}): Promise<RoomChatMessage | null> {
  await ensureMultiplayerInitialized();

  const roomId = input.roomId.trim().toUpperCase();
  const cleanMessage = input.message.trim().slice(0, 500);
  if (!cleanMessage) return null;

  const senderName = (input.senderName || "Player").trim().slice(0, 80);

  const res = await execute(
    `INSERT INTO multiplayer_chat (room_id, sender_id, sender_name, sender_role, message)
     VALUES (?, ?, ?, ?, ?)`,
    [roomId, input.senderId, senderName, input.senderRole, cleanMessage]
  );

  const rows = await query<ChatRow>(
    "SELECT * FROM multiplayer_chat WHERE id = ? LIMIT 1",
    [res.insertId]
  );

  if (Array.isArray(rows) && rows[0]) {
    return mapRowToChat(rows[0]);
  }

  return {
    id: Number(res?.insertId || Date.now()),
    roomId,
    senderId: input.senderId,
    senderName,
    senderRole: input.senderRole,
    message: cleanMessage,
    createdAt: new Date().toISOString(),
  };
}

export async function createRoom(input: {
  name: string;
  hostId: string;
  hostUsername: string;
  hostDisplayName?: string;
  systemId?: string;
  gameId?: string | null;
  gameTitle?: string | null;
  gameFileName?: string | null;
  gameCoverUrl?: string | null;
}): Promise<MultiplayerRoom> {
  await ensureMultiplayerInitialized();

  const roomId = generateRoomCode();
  const cleanName = (input.name || `${input.hostDisplayName || input.hostUsername}'s Retro Room`)
    .trim()
    .slice(0, 80);
  const systemId = (input.systemId || "snes").toLowerCase().trim();
  if (!isSupportedMultiplayerSystem(systemId)) {
    throw new Error(`Console core '${input.systemId}' is not supported for 2-player multiplayer rooms.`);
  }
  const sysMeta = getSystemMeta(systemId);
  const emulatorCore = sysMeta.ejsCore || systemId;
  const hostDisplay = (input.hostDisplayName || input.hostUsername || "Player 1").trim().slice(0, 100);

  await execute(
    `INSERT INTO multiplayer_rooms (
      id, name, system_id, emulator_core, game_id, game_title, game_file_name, game_cover_url,
      status, host_id, host_username, host_display_name, host_ready
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'waiting', ?, ?, ?, 0)`,
    [
      roomId,
      cleanName,
      systemId,
      emulatorCore,
      input.gameId || null,
      input.gameTitle || null,
      input.gameFileName || null,
      input.gameCoverUrl || null,
      input.hostId,
      input.hostUsername.slice(0, 64),
      hostDisplay,
    ]
  );

  await addRoomChatMessage({
    roomId,
    senderId: "system",
    senderName: "Lobby System",
    senderRole: "system",
    message: `Room "${cleanName}" (${roomId}) created by ${hostDisplay} (Controller Port 1). Waiting for Player 2...`,
  });

  if (input.gameTitle) {
    await addRoomChatMessage({
      roomId,
      senderId: "system",
      senderName: "Lobby System",
      senderRole: "system",
      message: `Selected [${sysMeta.shortLabel}] ${input.gameTitle} (Core: ${emulatorCore}).`,
    });
  }

  const room = await getRoomById(roomId);
  if (!room) {
    throw new Error("Failed to load newly created multiplayer room.");
  }
  return room;
}

export async function joinRoom(input: {
  roomId: string;
  playerId: string;
  username: string;
  displayName?: string;
}): Promise<{ room: MultiplayerRoom; role: "host" | "guest" }> {
  await ensureMultiplayerInitialized();
  const normalizedId = input.roomId.trim().toUpperCase();
  const existing = await getRoomById(normalizedId);

  if (!existing) {
    throw new Error("Room not found or has been closed.");
  }

  // If caller is already the Host
  if (existing.host.id === input.playerId) {
    await execute(
      "UPDATE multiplayer_rooms SET host_last_seen = NOW() WHERE id = ?",
      [normalizedId]
    );
    const updated = await getRoomById(normalizedId);
    return { room: updated || existing, role: "host" };
  }

  // If caller is already the Guest
  if (existing.guest && existing.guest.id === input.playerId) {
    await execute(
      "UPDATE multiplayer_rooms SET guest_last_seen = NOW() WHERE id = ?",
      [normalizedId]
    );
    const updated = await getRoomById(normalizedId);
    return { room: updated || existing, role: "guest" };
  }

  // If another Guest is already occupying Slot 2
  if (existing.guest && existing.guest.id !== input.playerId) {
    throw new Error("This room already has 2 players.");
  }

  const display = (input.displayName || input.username || "Player 2").trim().slice(0, 100);

  await execute(
    `UPDATE multiplayer_rooms
     SET guest_id = ?, guest_username = ?, guest_display_name = ?, guest_ready = 0,
         guest_joined_at = NOW(), guest_last_seen = NOW()
     WHERE id = ?`,
    [input.playerId, input.username.slice(0, 64), display, normalizedId]
  );

  await addRoomChatMessage({
    roomId: normalizedId,
    senderId: "system",
    senderName: "Lobby System",
    senderRole: "system",
    message: `${display} joined the room as Player 2 (Controller Port 2)!`,
  });

  const updated = await getRoomById(normalizedId);
  if (!updated) {
    throw new Error("Room disappeared during join.");
  }

  return { room: updated, role: "guest" };
}

export async function selectRoomGame(input: {
  roomId: string;
  hostId: string;
  systemId: string;
  gameId: string | null;
  gameTitle: string | null;
  gameFileName?: string | null;
  gameCoverUrl?: string | null;
}): Promise<MultiplayerRoom> {
  await ensureMultiplayerInitialized();
  const normalizedId = input.roomId.trim().toUpperCase();
  const existing = await getRoomById(normalizedId);

  if (!existing) {
    throw new Error("Room not found.");
  }
  if (existing.host.id !== input.hostId) {
    throw new Error("Only the room host can select the console emulator and game.");
  }

  const systemId = (input.systemId || "snes").toLowerCase().trim();
  if (!isSupportedMultiplayerSystem(systemId)) {
    throw new Error(`Console core '${input.systemId}' is not supported for 2-player multiplayer rooms.`);
  }

  const sysMeta = getSystemMeta(systemId);
  const emulatorCore = sysMeta.ejsCore || systemId;

  // Changing game resets ready status so both players confirm the new selection
  await execute(
    `UPDATE multiplayer_rooms
     SET system_id = ?, emulator_core = ?, game_id = ?, game_title = ?, game_file_name = ?, game_cover_url = ?,
         host_ready = 0, guest_ready = 0, status = 'waiting', host_last_seen = NOW()
     WHERE id = ?`,
    [
      systemId,
      emulatorCore,
      input.gameId,
      input.gameTitle,
      input.gameFileName || null,
      input.gameCoverUrl || null,
      normalizedId,
    ]
  );

  if (input.gameTitle) {
    await addRoomChatMessage({
      roomId: normalizedId,
      senderId: "system",
      senderName: "Lobby System",
      senderRole: "system",
      message: `Host selected [${sysMeta.shortLabel}] ${input.gameTitle} (Libretro Core: ${emulatorCore}). Ready up to begin!`,
    });
  } else {
    await addRoomChatMessage({
      roomId: normalizedId,
      senderId: "system",
      senderName: "Lobby System",
      senderRole: "system",
      message: `Host switched target console emulator to ${sysMeta.name} (${emulatorCore}).`,
    });
  }

  const updated = await getRoomById(normalizedId);
  if (!updated) throw new Error("Room not found after update.");
  return updated;
}

export async function togglePlayerReady(input: {
  roomId: string;
  playerId: string;
  isReady?: boolean;
}): Promise<MultiplayerRoom> {
  await ensureMultiplayerInitialized();
  const normalizedId = input.roomId.trim().toUpperCase();
  const existing = await getRoomById(normalizedId);

  if (!existing) {
    throw new Error("Room not found.");
  }

  let playerName = "";
  let nextReady = false;

  if (existing.host.id === input.playerId) {
    nextReady = input.isReady !== undefined ? input.isReady : !existing.host.isReady;
    playerName = existing.host.displayName;
    const bothReady = nextReady && Boolean(existing.guest?.isReady) && Boolean(existing.gameId);
    const nextStatus: RoomStatus =
      existing.status === "playing" ? "playing" : bothReady ? "ready" : "waiting";

    await execute(
      "UPDATE multiplayer_rooms SET host_ready = ?, status = ?, host_last_seen = NOW() WHERE id = ?",
      [nextReady ? 1 : 0, nextStatus, normalizedId]
    );
  } else if (existing.guest && existing.guest.id === input.playerId) {
    nextReady = input.isReady !== undefined ? input.isReady : !existing.guest.isReady;
    playerName = existing.guest.displayName;
    const bothReady = existing.host.isReady && nextReady && Boolean(existing.gameId);
    const nextStatus: RoomStatus =
      existing.status === "playing" ? "playing" : bothReady ? "ready" : "waiting";

    await execute(
      "UPDATE multiplayer_rooms SET guest_ready = ?, status = ?, guest_last_seen = NOW() WHERE id = ?",
      [nextReady ? 1 : 0, nextStatus, normalizedId]
    );
  } else {
    throw new Error("You are not a participant in this room.");
  }

  await addRoomChatMessage({
    roomId: normalizedId,
    senderId: "system",
    senderName: "Lobby System",
    senderRole: "system",
    message: nextReady
      ? `✅ ${playerName} is READY!`
      : `⏳ ${playerName} is no longer ready.`,
  });

  const updated = await getRoomById(normalizedId);
  if (!updated) throw new Error("Room not found after toggling ready state.");
  return updated;
}

export async function startMultiplayerSession(input: {
  roomId: string;
  hostId: string;
}): Promise<MultiplayerRoom> {
  await ensureMultiplayerInitialized();
  const normalizedId = input.roomId.trim().toUpperCase();
  const existing = await getRoomById(normalizedId);

  if (!existing) {
    throw new Error("Room not found.");
  }
  if (existing.host.id !== input.hostId) {
    throw new Error("Only the room host can launch the session.");
  }
  if (!existing.gameId) {
    throw new Error("Please select a game before launching the session.");
  }
  if (!existing.guest) {
    throw new Error("Waiting for Player 2 to join the room.");
  }
  if (!existing.host.isReady || !existing.guest.isReady) {
    throw new Error("Both Player 1 and Player 2 must toggle Ready before launching.");
  }

  // Clear old signals from previous sessions in this room
  await execute("DELETE FROM multiplayer_signals WHERE room_id = ?", [normalizedId]);

  await execute(
    "UPDATE multiplayer_rooms SET status = 'playing', host_last_seen = NOW() WHERE id = ?",
    [normalizedId]
  );

  await addRoomChatMessage({
    roomId: normalizedId,
    senderId: "system",
    senderName: "Lobby System",
    senderRole: "system",
    message: `🚀 GO! Launching unified 2-player libretro session for ${existing.gameTitle} (Port 1: ${existing.host.displayName}, Port 2: ${existing.guest.displayName})!`,
  });

  const updated = await getRoomById(normalizedId);
  if (!updated) throw new Error("Room not found after starting session.");
  return updated;
}

export async function returnRoomToLobby(input: {
  roomId: string;
  playerId: string;
}): Promise<MultiplayerRoom> {
  await ensureMultiplayerInitialized();
  const normalizedId = input.roomId.trim().toUpperCase();
  const existing = await getRoomById(normalizedId);

  if (!existing) {
    throw new Error("Room not found.");
  }

  await execute("DELETE FROM multiplayer_signals WHERE room_id = ?", [normalizedId]);

  await execute(
    "UPDATE multiplayer_rooms SET status = 'waiting', host_ready = 0, guest_ready = 0 WHERE id = ?",
    [normalizedId]
  );

  await addRoomChatMessage({
    roomId: normalizedId,
    senderId: "system",
    senderName: "Lobby System",
    senderRole: "system",
    message: "Session ended. Returned to room lobby.",
  });

  const updated = await getRoomById(normalizedId);
  if (!updated) throw new Error("Room not found.");
  return updated;
}

export async function leaveRoom(input: {
  roomId: string;
  playerId: string;
}): Promise<{ closed: boolean; room: MultiplayerRoom | null }> {
  await ensureMultiplayerInitialized();
  const normalizedId = input.roomId.trim().toUpperCase();
  const existing = await getRoomById(normalizedId);

  if (!existing) {
    return { closed: true, room: null };
  }

  if (existing.host.id === input.playerId) {
    await execute("UPDATE multiplayer_rooms SET status = 'closed' WHERE id = ?", [normalizedId]);
    await execute("DELETE FROM multiplayer_signals WHERE room_id = ?", [normalizedId]);
    return { closed: true, room: null };
  }

  if (existing.guest && existing.guest.id === input.playerId) {
    const guestName = existing.guest.displayName;
    await execute(
      `UPDATE multiplayer_rooms
       SET guest_id = NULL, guest_username = NULL, guest_display_name = NULL,
           guest_ready = 0, guest_joined_at = NULL, guest_last_seen = NULL,
           status = 'waiting', host_ready = 0
       WHERE id = ?`,
      [normalizedId]
    );
    await execute("DELETE FROM multiplayer_signals WHERE room_id = ?", [normalizedId]);
    await addRoomChatMessage({
      roomId: normalizedId,
      senderId: "system",
      senderName: "Lobby System",
      senderRole: "system",
      message: `${guestName} (Player 2) left the room.`,
    });

    const updated = await getRoomById(normalizedId);
    return { closed: false, room: updated };
  }

  return { closed: false, room: existing };
}

export async function sendMultiplayerSignal(input: {
  roomId: string;
  senderId: string;
  targetRole: "host" | "guest";
  type: SignalMessageType;
  payload: string;
}): Promise<number> {
  await ensureMultiplayerInitialized();
  const normalizedId = input.roomId.trim().toUpperCase();

  // If type is frame-sync, keep only the latest 2 frame-sync signals for this room so table stays tiny and fast
  if (input.type === "frame-sync") {
    try {
      await execute(
        "DELETE FROM multiplayer_signals WHERE room_id = ? AND type = 'frame-sync'",
        [normalizedId]
      );
    } catch {}
  }

  const res = await execute(
    `INSERT INTO multiplayer_signals (room_id, sender_id, target_role, type, payload)
     VALUES (?, ?, ?, ?, ?)`,
    [normalizedId, input.senderId, input.targetRole, input.type, input.payload]
  );

  return Number(res?.insertId || 0);
}

export async function pollMultiplayerSignals(input: {
  roomId: string;
  targetRole: "host" | "guest";
  afterId: number;
}): Promise<MultiplayerSignal[]> {
  await ensureMultiplayerInitialized();
  const normalizedId = input.roomId.trim().toUpperCase();

  const rows = await query<SignalRow>(
    `SELECT id, room_id, sender_id, target_role, type, payload, created_at
     FROM multiplayer_signals
     WHERE room_id = ? AND target_role = ? AND id > ?
     ORDER BY id ASC
     LIMIT 50`,
    [normalizedId, input.targetRole, input.afterId]
  );

  if (!Array.isArray(rows)) return [];
  return rows.map((r) => ({
    id: Number(r.id),
    roomId: r.room_id,
    senderId: r.sender_id,
    targetRole: r.target_role,
    type: r.type,
    payload: r.payload,
    createdAt: toIsoString(r.created_at),
  }));
}
