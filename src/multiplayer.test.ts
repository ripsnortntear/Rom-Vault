import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockDbQuery, mockDbExecute } = vi.hoisted(() => ({
  mockDbQuery: vi.fn(),
  mockDbExecute: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    query: mockDbQuery,
    execute: mockDbExecute,
  },
  query: mockDbQuery,
  execute: mockDbExecute,
}));

vi.mock("./lib/db", () => ({
  db: {
    query: mockDbQuery,
    execute: mockDbExecute,
  },
  query: mockDbQuery,
  execute: mockDbExecute,
}));

import {
  _resetMultiplayerInitForTesting,
  createRoom,
  joinRoom,
  selectRoomGame,
  togglePlayerReady,
  startMultiplayerSession,
  addRoomChatMessage,
  sendMultiplayerSignal,
  pollMultiplayerSignals,
  touchRoomHeartbeat,
  pruneGhostRoomsAndPlayers,
  SUPPORTED_MULTIPLAYER_SYSTEMS,
  UNSUPPORTED_MULTIPLAYER_SYSTEMS,
  isSupportedMultiplayerSystem,
} from "./lib/multiplayer";

describe("2-Player Retro Multiplayer Room System Unit Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _resetMultiplayerInitForTesting();
    mockDbQuery.mockResolvedValue([]);
    mockDbExecute.mockResolvedValue({ insertId: 1 });
  });

  const baseRoomRow = {
    id: "RM-TEST",
    name: "Arcade Night",
    system_id: "snes",
    emulator_core: "snes",
    game_id: "snes__Super Mario Kart (USA)",
    game_title: "Super Mario Kart (USA)",
    game_file_name: "Super Mario Kart (USA).sfc",
    game_cover_url: null,
    status: "waiting" as const,
    host_id: "host-1",
    host_username: "PlayerOne",
    host_display_name: "Player One",
    host_ready: 0,
    host_joined_at: new Date("2026-11-02T15:00:00Z"),
    host_last_seen: new Date("2026-11-02T15:00:00Z"),
    guest_id: null,
    guest_username: null,
    guest_display_name: null,
    guest_ready: 0,
    guest_joined_at: null,
    guest_last_seen: null,
    created_at: new Date("2026-11-02T15:00:00Z"),
    updated_at: new Date("2026-11-02T15:00:00Z"),
  };

  it("creates a custom multiplayer room with Host assigned to Controller Port 1", async () => {
    mockDbQuery
      .mockResolvedValueOnce([]) // chat insert lookup 1
      .mockResolvedValueOnce([]) // chat insert lookup 2
      .mockResolvedValueOnce([baseRoomRow]); // getRoomById

    const room = await createRoom({
      name: "Arcade Night",
      hostId: "host-1",
      hostUsername: "PlayerOne",
      hostDisplayName: "Player One",
      systemId: "snes",
      gameId: "snes__Super Mario Kart (USA)",
      gameTitle: "Super Mario Kart (USA)",
    });

    expect(room.name).toBe("Arcade Night");
    expect(room.host.id).toBe("host-1");
    expect(room.host.controllerPort).toBe(1);
    expect(room.guest).toBeNull();
    expect(room.canStart).toBe(false);
  });

  it("allows a second user to join as Guest on Controller Port 2", async () => {
    const joinedRow = {
      ...baseRoomRow,
      guest_id: "guest-2",
      guest_username: "PlayerTwo",
      guest_display_name: "Player Two",
      guest_ready: 0,
      guest_joined_at: new Date("2026-11-02T15:01:00Z"),
      guest_last_seen: new Date("2026-11-02T15:01:00Z"),
    };

    mockDbQuery
      .mockResolvedValueOnce([baseRoomRow]) // existing room lookup
      .mockResolvedValueOnce([]) // chat message lookup
      .mockResolvedValueOnce([joinedRow]); // updated room lookup

    const result = await joinRoom({
      roomId: "RM-TEST",
      playerId: "guest-2",
      username: "PlayerTwo",
      displayName: "Player Two",
    });

    expect(result.role).toBe("guest");
    expect(result.room.guest).not.toBeNull();
    expect(result.room.guest?.id).toBe("guest-2");
    expect(result.room.guest?.controllerPort).toBe(2);
    expect(result.room.canStart).toBe(false);
  });

  it("allows the Host to select a console emulator and game, resetting ready status", async () => {
    const updatedGameRow = {
      ...baseRoomRow,
      system_id: "genesis",
      emulator_core: "segaMD",
      game_id: "genesis__Streets of Rage 2 (USA)",
      game_title: "Streets of Rage 2 (USA)",
      host_ready: 0,
      guest_ready: 0,
    };

    mockDbQuery
      .mockResolvedValueOnce([baseRoomRow])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([updatedGameRow]);

    const room = await selectRoomGame({
      roomId: "RM-TEST",
      hostId: "host-1",
      systemId: "genesis",
      gameId: "genesis__Streets of Rage 2 (USA)",
      gameTitle: "Streets of Rage 2 (USA)",
    });

    expect(room.systemId).toBe("genesis");
    expect(room.emulatorCore).toBe("segaMD");
    expect(room.gameTitle).toBe("Streets of Rage 2 (USA)");
  });

  it("activates canStart ('Go' button) once both players toggle Ready", async () => {
    const bothPresentNotReady = {
      ...baseRoomRow,
      host_ready: 1,
      guest_id: "guest-2",
      guest_username: "PlayerTwo",
      guest_display_name: "Player Two",
      guest_ready: 0,
    };

    const bothReadyRow = {
      ...bothPresentNotReady,
      guest_ready: 1,
      status: "ready" as const,
    };

    mockDbQuery
      .mockResolvedValueOnce([bothPresentNotReady])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([bothReadyRow]);

    const room = await togglePlayerReady({
      roomId: "RM-TEST",
      playerId: "guest-2",
      isReady: true,
    });

    expect(room.host.isReady).toBe(true);
    expect(room.guest?.isReady).toBe(true);
    expect(room.canStart).toBe(true);
    expect(room.status).toBe("ready");
  });

  it("prevents launching session if both players are not ready, and launches when both are ready", async () => {
    const notReadyRow = {
      ...baseRoomRow,
      host_ready: 1,
      guest_id: "guest-2",
      guest_username: "PlayerTwo",
      guest_display_name: "Player Two",
      guest_ready: 0,
    };

    mockDbQuery.mockResolvedValueOnce([notReadyRow]);

    await expect(
      startMultiplayerSession({ roomId: "RM-TEST", hostId: "host-1" })
    ).rejects.toThrow(/Both Player 1 and Player 2 must toggle Ready/);

    const bothReadyRow = {
      ...notReadyRow,
      guest_ready: 1,
    };
    const playingRow = {
      ...bothReadyRow,
      status: "playing" as const,
    };

    mockDbQuery
      .mockResolvedValueOnce([bothReadyRow])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([playingRow]);

    const playingRoom = await startMultiplayerSession({
      roomId: "RM-TEST",
      hostId: "host-1",
    });

    expect(playingRoom.status).toBe("playing");
  });

  it("supports room chat and Player 2 controller input signaling", async () => {
    mockDbQuery.mockResolvedValueOnce([
      {
        id: 10,
        room_id: "RM-TEST",
        sender_id: "guest-2",
        sender_name: "Player Two",
        sender_role: "guest",
        message: "Ready for Streets of Rage 2!",
        created_at: new Date(),
      },
    ]);

    const msg = await addRoomChatMessage({
      roomId: "RM-TEST",
      senderId: "guest-2",
      senderName: "Player Two",
      senderRole: "guest",
      message: "Ready for Streets of Rage 2!",
    });

    expect(msg?.message).toBe("Ready for Streets of Rage 2!");

    mockDbExecute.mockResolvedValueOnce({ insertId: 42 });
    const sigId = await sendMultiplayerSignal({
      roomId: "RM-TEST",
      senderId: "guest-2",
      targetRole: "host",
      type: "p2-input",
      payload: JSON.stringify({ buttonIndex: 8, pressed: true, value: 1 }),
    });
    expect(sigId).toBe(42);

    mockDbQuery.mockResolvedValueOnce([
      {
        id: 42,
        room_id: "RM-TEST",
        sender_id: "guest-2",
        target_role: "host",
        type: "p2-input",
        payload: JSON.stringify({ buttonIndex: 8, pressed: true, value: 1 }),
        created_at: new Date(),
      },
    ]);

    const signals = await pollMultiplayerSignals({
      roomId: "RM-TEST",
      targetRole: "host",
      afterId: 0,
    });
    expect(signals).toHaveLength(1);
    expect(signals[0]?.type).toBe("p2-input");
  });

  describe("Multiplayer Console Core Restrictions (Dreamcast & Saturn Exclusion)", () => {
    it("excludes dreamcast and saturn from SUPPORTED_MULTIPLAYER_SYSTEMS", () => {
      const supportedIds = SUPPORTED_MULTIPLAYER_SYSTEMS.map((s) => s.id);
      expect(supportedIds).not.toContain("dreamcast");
      expect(supportedIds).not.toContain("saturn");
      expect(UNSUPPORTED_MULTIPLAYER_SYSTEMS).toContain("dreamcast");
      expect(UNSUPPORTED_MULTIPLAYER_SYSTEMS).toContain("saturn");
    });

    it("isSupportedMultiplayerSystem returns false for dreamcast and saturn, true for standard retro cores", () => {
      expect(isSupportedMultiplayerSystem("dreamcast")).toBe(false);
      expect(isSupportedMultiplayerSystem("saturn")).toBe(false);
      expect(isSupportedMultiplayerSystem("DREAMCAST")).toBe(false);
      expect(isSupportedMultiplayerSystem("SATURN")).toBe(false);

      expect(isSupportedMultiplayerSystem("snes")).toBe(true);
      expect(isSupportedMultiplayerSystem("nes")).toBe(true);
      expect(isSupportedMultiplayerSystem("genesis")).toBe(true);
      expect(isSupportedMultiplayerSystem("psx")).toBe(true);
      expect(isSupportedMultiplayerSystem("n64")).toBe(true);
      expect(isSupportedMultiplayerSystem("gba")).toBe(true);
    });

    it("rejects room creation if systemId is dreamcast or saturn", async () => {
      await expect(
        createRoom({
          name: "DC Room",
          hostId: "host-1",
          hostUsername: "PlayerOne",
          systemId: "dreamcast",
        })
      ).rejects.toThrow(/not supported for 2-player multiplayer rooms/);

      await expect(
        createRoom({
          name: "Saturn Room",
          hostId: "host-1",
          hostUsername: "PlayerOne",
          systemId: "saturn",
        })
      ).rejects.toThrow(/not supported for 2-player multiplayer rooms/);
    });

    it("rejects game selection if systemId is dreamcast or saturn", async () => {
      mockDbQuery.mockResolvedValueOnce([baseRoomRow]);

      await expect(
        selectRoomGame({
          roomId: "RM-TEST",
          hostId: "host-1",
          systemId: "dreamcast",
          gameId: "dreamcast__Sonic Adventure (USA)",
          gameTitle: "Sonic Adventure (USA)",
        })
      ).rejects.toThrow(/not supported for 2-player multiplayer rooms/);
    });
  });

  describe("Active Heartbeat & Ghost Room Auto-Pruning", () => {
    it("touchRoomHeartbeat updates host_last_seen or guest_last_seen with rate limiting", async () => {
      await touchRoomHeartbeat({
        roomId: "RM-TEST",
        role: "host",
      });

      expect(mockDbExecute).toHaveBeenCalledWith(
        expect.stringContaining("UPDATE multiplayer_rooms"),
        ["RM-TEST"]
      );

      const hostCall = mockDbExecute.mock.calls.find((call) =>
        call[0].includes("host_last_seen = NOW()")
      );
      expect(hostCall).toBeDefined();

      await touchRoomHeartbeat({
        roomId: "RM-TEST",
        role: "guest",
      });

      const guestCall = mockDbExecute.mock.calls.find((call) =>
        call[0].includes("guest_last_seen = NOW()")
      );
      expect(guestCall).toBeDefined();
    });

    it("pruneGhostRoomsAndPlayers executes queries to close stale rooms and evict ghost guests", async () => {
      await pruneGhostRoomsAndPlayers(true);

      const closeAbandonedCall = mockDbExecute.mock.calls.find(
        (call) =>
          call[0].includes("status = 'closed'") &&
          call[0].includes("host_last_seen < (NOW() - INTERVAL 75 SECOND)")
      );
      expect(closeAbandonedCall).toBeDefined();

      const evictGhostGuestCall = mockDbExecute.mock.calls.find(
        (call) =>
          call[0].includes("guest_id = NULL") &&
          call[0].includes("guest_last_seen < (NOW() - INTERVAL 45 SECOND)")
      );
      expect(evictGhostGuestCall).toBeDefined();
    });
  });
});
