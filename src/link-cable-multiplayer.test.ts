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
  isLinkCableSystem,
  getLinkCableAllowedSystems,
  getMultiplayerModeForSystem,
  type LinkCablePacket,
} from "./types/multiplayer";
import {
  _resetMultiplayerInitForTesting,
  createRoom,
  selectGuestRoomGame,
  sendMultiplayerSignal,
  pollMultiplayerSignals,
} from "./lib/multiplayer";

describe("Game Boy / GBC Link Cable Multiplayer Unit Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _resetMultiplayerInitForTesting();
    mockDbQuery.mockResolvedValue([]);
    mockDbExecute.mockResolvedValue({ insertId: 1 });
  });

  const baseGbRoomRow = {
    id: "GB-LINK-1",
    name: "Pokemon Trade Room",
    system_id: "gb",
    emulator_core: "gambatte",
    game_id: "gb__Pokemon Red",
    game_title: "Pokemon - Red Version (USA, Europe)",
    game_file_name: "Pokemon - Red Version (USA, Europe).gb",
    game_cover_url: "/roms/media/gb/covers/Pokemon Red.png",
    status: "waiting" as const,
    host_id: "trainer-red",
    host_username: "TrainerRed",
    host_display_name: "Trainer Red",
    host_ready: 0,
    host_joined_at: new Date("2026-11-05T20:00:00Z"),
    host_last_seen: new Date("2026-11-05T20:00:00Z"),
    guest_id: "trainer-blue",
    guest_username: "TrainerBlue",
    guest_display_name: "Trainer Blue",
    guest_ready: 0,
    guest_joined_at: new Date("2026-11-05T20:01:00Z"),
    guest_last_seen: new Date("2026-11-05T20:01:00Z"),
    guest_game_id: null,
    guest_game_title: null,
    guest_game_file_name: null,
    guest_game_cover_url: null,
    created_at: new Date("2026-11-05T20:00:00Z"),
    updated_at: new Date("2026-11-05T20:00:00Z"),
  };

  describe("System Identification & Mode Resolution", () => {
    it("recognizes all Game Boy variants (gb, gbc, gba) as Link Cable systems", () => {
      expect(isLinkCableSystem("gb")).toBe(true);
      expect(isLinkCableSystem("gbc")).toBe(true);
      expect(isLinkCableSystem("gba")).toBe(true);
      expect(isLinkCableSystem("GB")).toBe(true);
      expect(isLinkCableSystem("GBC")).toBe(true);
      expect(isLinkCableSystem("GBA")).toBe(true);
    });

    it("distinguishes classic couch multiplayer consoles from Link Cable handhelds", () => {
      expect(isLinkCableSystem("snes")).toBe(false);
      expect(isLinkCableSystem("nes")).toBe(false);
      expect(isLinkCableSystem("genesis")).toBe(false);
      expect(isLinkCableSystem("n64")).toBe(false);
      expect(isLinkCableSystem("psx")).toBe(false);
    });

    it("resolves allowed guest link-cable emulators appropriately", () => {
      expect(getLinkCableAllowedSystems("gb")).toEqual(["gb", "gbc"]);
      expect(getLinkCableAllowedSystems("gbc")).toEqual(["gb", "gbc"]);
      expect(getLinkCableAllowedSystems("gba")).toEqual(["gba"]);
      expect(getLinkCableAllowedSystems("snes")).toEqual([]);
    });

    it("maps system IDs to appropriate MultiplayerMode", () => {
      expect(getMultiplayerModeForSystem("gb")).toBe("link-cable");
      expect(getMultiplayerModeForSystem("gbc")).toBe("link-cable");
      expect(getMultiplayerModeForSystem("gba")).toBe("link-cable");
      expect(getMultiplayerModeForSystem("snes")).toBe("couch");
      expect(getMultiplayerModeForSystem("genesis")).toBe("couch");
    });
  });

  describe("Link Cable Room Creation & Mapping", () => {
    it("automatically sets mode to link-cable when creating a Game Boy room", async () => {
      mockDbQuery
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([baseGbRoomRow]);

      const room = await createRoom({
        name: "Pokemon Trade Room",
        hostId: "trainer-red",
        hostUsername: "TrainerRed",
        hostDisplayName: "Trainer Red",
        systemId: "gb",
        gameId: "gb__Pokemon Red",
        gameTitle: "Pokemon - Red Version (USA, Europe)",
      });

      expect(room.mode).toBe("link-cable");
      expect(room.systemId).toBe("gb");
      expect(room.emulatorCore).toBe("gambatte");
      expect(room.host.displayName).toBe("Trainer Red");
    });

    it("defaults guest game to matching host game until guest picks a custom cartridge", async () => {
      mockDbQuery
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([baseGbRoomRow]);

      const room = await createRoom({
        name: "Pokemon Trade Room",
        hostId: "trainer-red",
        hostUsername: "TrainerRed",
        hostDisplayName: "Trainer Red",
        systemId: "gb",
        gameId: "gb__Pokemon Red",
        gameTitle: "Pokemon - Red Version (USA, Europe)",
      });

      expect(room.guestGameId).toBe("gb__Pokemon Red");
      expect(room.guestGameTitle).toBe("Pokemon - Red Version (USA, Europe)");
    });
  });

  describe("Guest Custom Cartridge Selection", () => {
    it("allows the guest to select their own cartridge (e.g. Pokemon Blue against Pokemon Red)", async () => {
      const updatedRow = {
        ...baseGbRoomRow,
        guest_game_id: "gb__Pokemon Blue",
        guest_game_title: "Pokemon - Blue Version (USA, Europe)",
        guest_game_file_name: "Pokemon - Blue Version (USA, Europe).gb",
        guest_game_cover_url: "/roms/media/gb/covers/Pokemon Blue.png",
      };

      mockDbQuery
        .mockResolvedValueOnce([baseGbRoomRow]) // getRoomById in selectGuestRoomGame
        .mockResolvedValueOnce([]) // addRoomChatMessage query
        .mockResolvedValueOnce([updatedRow]); // getRoomById return

      const room = await selectGuestRoomGame({
        roomId: "GB-LINK-1",
        guestId: "trainer-blue",
        gameId: "gb__Pokemon Blue",
        gameTitle: "Pokemon - Blue Version (USA, Europe)",
        gameFileName: "Pokemon - Blue Version (USA, Europe).gb",
        gameCoverUrl: "/roms/media/gb/covers/Pokemon Blue.png",
      });

      expect(room.guestGameId).toBe("gb__Pokemon Blue");
      expect(room.guestGameTitle).toBe("Pokemon - Blue Version (USA, Europe)");
      expect(room.guestGameFileName).toBe("Pokemon - Blue Version (USA, Europe).gb");
      expect(room.mode).toBe("link-cable");
    });

    it("rejects guest game selection if caller is not the room's guest", async () => {
      mockDbQuery.mockResolvedValueOnce([baseGbRoomRow]);

      await expect(
        selectGuestRoomGame({
          roomId: "GB-LINK-1",
          guestId: "impostor",
          gameId: "gb__Pokemon Yellow",
          gameTitle: "Pokemon - Yellow Version",
        })
      ).rejects.toThrow("Only the joined guest can choose their link cable cartridge.");
    });

    it("rejects guest game selection if emulator is not compatible for link cable play with host's system", async () => {
      mockDbQuery.mockResolvedValueOnce([baseGbRoomRow]);

      await expect(
        selectGuestRoomGame({
          roomId: "GB-LINK-1",
          guestId: "trainer-blue",
          systemId: "snes",
          gameId: "snes__Super Mario World",
          gameTitle: "Super Mario World",
        })
      ).rejects.toThrow(/not compatible for link cable play/);
    });
  });

  describe("Link Cable Signal Transmission & Verification", () => {
    it("successfully sends link-packet signals between peers", async () => {
      mockDbExecute.mockResolvedValue({ insertId: 42 });

      const samplePacket: LinkCablePacket = {
        kind: 1, // master packet
        data: 0x60, // sync byte
        fast: 0,
        timestamp: Date.now(),
      };

      const insertId = await sendMultiplayerSignal({
        roomId: "GB-LINK-1",
        senderId: "trainer-red",
        targetRole: "guest",
        type: "link-packet",
        payload: JSON.stringify(samplePacket),
      });

      expect(insertId).toBe(42);
      expect(mockDbExecute).toHaveBeenCalledWith(
        expect.stringContaining("INSERT INTO multiplayer_signals"),
        ["GB-LINK-1", "trainer-red", "guest", "link-packet", JSON.stringify(samplePacket)]
      );
    });

    it("correctly polls link-packet signals", async () => {
      const now = new Date();
      mockDbQuery.mockResolvedValueOnce([
        {
          id: 101,
          room_id: "GB-LINK-1",
          sender_id: "trainer-red",
          target_role: "guest",
          type: "link-packet",
          payload: JSON.stringify({ kind: 2, data: 0x61, fast: 0 }),
          created_at: now,
        },
      ]);

      const signals = await pollMultiplayerSignals({
        roomId: "GB-LINK-1",
        targetRole: "guest",
        afterId: 100,
      });

      expect(signals).toHaveLength(1);
      expect(signals[0].type).toBe("link-packet");
      const packet = JSON.parse(signals[0].payload);
      expect(packet.kind).toBe(2);
      expect(packet.data).toBe(0x61);
    });
  });
});
