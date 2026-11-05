import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import crypto from "crypto";

// Hoisted mocks for CI unit testing
const { mockGetCurrentSession, mockDbQuery, mockDbExecute } = vi.hoisted(() => ({
  mockGetCurrentSession: vi.fn(),
  mockDbQuery: vi.fn(),
  mockDbExecute: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({
  getCurrentSession: mockGetCurrentSession,
  getSessionFromCookie: vi.fn().mockResolvedValue(null),
  validateSessionToken: vi.fn().mockResolvedValue(null),
  SESSION_COOKIE_NAME: "rom_vault_session",
}));

vi.mock("@/lib/auth", () => ({
  getCurrentSession: mockGetCurrentSession,
  verifySession: vi.fn(async () => {
    const session = await mockGetCurrentSession();
    if (!session || !session.user) return null;
    return {
      userId: String(session.user.id),
      username: session.user.username,
      role: session.user.role,
    };
  }),
  verifySessionFromHeaders: vi.fn(async () => {
    const session = await mockGetCurrentSession();
    if (!session || !session.user) return null;
    return {
      userId: String(session.user.id),
      username: session.user.username,
      role: session.user.role,
    };
  }),
}));

vi.mock("@/lib/db", () => ({
  db: { query: mockDbQuery, execute: mockDbExecute },
  query: mockDbQuery,
  execute: mockDbExecute,
}));

import { GET as getSaves, POST as postSaves } from "@/app/api/saves/route";
import { POST as postBeacon } from "@/app/api/saves/beacon/route";
import {
  SaveSyncService,
  uint8ArrayToBase64,
  base64ToUint8Array,
  resolveSaveEndpoint,
  isValidPs1MemoryCard,
  isBlankPs1MemoryCard,
  computeSaveChecksum,
  filterCandidateSaveFiles,
} from "@/lib/sync-service";
import { createFormattedPs1MemoryCard } from "@/lib/memory-cards";

describe("Universal Cross-Device Save Synchronization & Database Authority Suite", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("SaveSyncService Binary Helpers", () => {
    it("round-trips arbitrary binary data between Uint8Array and Base64 perfectly", () => {
      const original = new Uint8Array([0x00, 0xff, 0x42, 0x13, 0x37, 0xde, 0xad, 0xbe, 0xef]);
      const base64 = uint8ArrayToBase64(original);
      const restored = base64ToUint8Array(base64);

      expect(restored.length).toBe(original.length);
      for (let i = 0; i < original.length; i++) {
        expect(restored[i]).toBe(original[i]);
      }
    });

    it("handles large binary buffers without call-stack overflow", () => {
      // 128 KB buffer (standard PS1 memory card / large save state)
      const large = new Uint8Array(131072);
      for (let i = 0; i < large.length; i++) {
        large[i] = i % 256;
      }

      const base64 = uint8ArrayToBase64(large);
      const restored = base64ToUint8Array(base64);

      expect(restored.length).toBe(large.length);
      expect(restored[100]).toBe(100);
      expect(restored[131000]).toBe(131000 % 256);
    });

    it("resolves endpoint paths safely with or without /roms base", () => {
      expect(resolveSaveEndpoint("/api/saves")).toBe("/api/saves");
    });
  });

  describe("GET /api/saves (Authoritative Cloud Save Fetch)", () => {
    it("returns 401 when unauthenticated", async () => {
      mockGetCurrentSession.mockResolvedValue(null);

      const req = new NextRequest("http://localhost:39254/api/saves?gameId=snes__SuperMario");
      const res = await getSaves(req);

      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.error).toBe("Unauthorized");
    });

    it("returns 400 when gameId is missing", async () => {
      mockGetCurrentSession.mockResolvedValue({
        user: { id: "user-123", username: "player1", role: "user" },
      });

      const req = new NextRequest("http://localhost:39254/api/saves");
      const res = await getSaves(req);

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe("Missing gameId");
    });

    it("returns authoritative save data from user_game_saves table", async () => {
      mockGetCurrentSession.mockResolvedValue({
        user: { id: "user-123", username: "player1", role: "user" },
      });

      const sampleSave = Buffer.from("SNES_SUPER_MARIO_SAVE_BINARY_DATA");
      const sha256 = crypto.createHash("sha256").update(sampleSave).digest("hex");

      mockDbQuery.mockResolvedValueOnce([
        [
          {
            save_data: sampleSave,
            checksum: sha256,
            file_size: sampleSave.length,
            updated_at: "2026-11-02T19:00:00Z",
          },
        ],
      ]);

      const req = new NextRequest(
        "http://localhost:39254/api/saves?gameId=snes__SuperMario&saveType=savestate&slotIndex=0"
      );
      const res = await getSaves(req);

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.exists).toBe(true);
      expect(json.checksum).toBe(sha256);
      expect(json.saveData).toBe(sampleSave.toString("base64"));
      expect(json.fileSize).toBe(sampleSave.length);
    });

    it("defaults saveType to savegame for in-game saves when omitted from query", async () => {
      mockGetCurrentSession.mockResolvedValue({
        user: { id: "user-123", username: "player1", role: "user" },
      });

      const sampleSave = Buffer.from("POKEMON_RED_GBA_SRAM");
      const sha256 = crypto.createHash("sha256").update(sampleSave).digest("hex");

      mockDbQuery.mockResolvedValueOnce([
        [
          {
            save_data: sampleSave,
            checksum: sha256,
            file_size: sampleSave.length,
            updated_at: "2026-11-04T12:00:00Z",
          },
        ],
      ]);

      const req = new NextRequest("http://localhost:39254/api/saves?gameId=gba__PokemonFireRed&slotIndex=0");
      const res = await getSaves(req);

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.exists).toBe(true);
      expect(json.checksum).toBe(sha256);
      expect(mockDbQuery).toHaveBeenCalledWith(
        expect.stringContaining("save_type = ?"),
        expect.arrayContaining(["user-123", "gba__PokemonFireRed", "savegame", "savegame"])
      );
    });

    it("falls back to legacy user_saves when record not found in user_game_saves", async () => {
      mockGetCurrentSession.mockResolvedValue({
        user: { id: "user-123", username: "player1", role: "user" },
      });

      // user_game_saves returns empty
      mockDbQuery.mockResolvedValueOnce([[]]);

      // legacy user_saves returns row
      const legacySave = Buffer.from("LEGACY_SLOT1_DATA");
      mockDbQuery.mockResolvedValueOnce([
        [
          {
            save_data: legacySave,
            updated_at: "2026-11-01T12:00:00Z",
          },
        ],
      ]);

      const req = new NextRequest(
        "http://localhost:39254/api/saves?gameId=gba__Pokemon&slotIndex=0"
      );
      const res = await getSaves(req);

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.exists).toBe(true);
      expect(json.saveData).toBe(legacySave.toString("base64"));
    });

    it("returns exists: false when save is not found in either table", async () => {
      mockGetCurrentSession.mockResolvedValue({
        user: { id: "user-123", username: "player1", role: "user" },
      });

      mockDbQuery.mockResolvedValueOnce([[]]);
      mockDbQuery.mockResolvedValueOnce([[]]);

      const req = new NextRequest(
        "http://localhost:39254/api/saves?gameId=nes__Zelda"
      );
      const res = await getSaves(req);

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.exists).toBe(false);
    });
  });

  describe("POST /api/saves (Authoritative Cloud Save Sync)", () => {
    it("returns 401 when unauthenticated", async () => {
      mockGetCurrentSession.mockResolvedValue(null);

      const req = new NextRequest("http://localhost:39254/api/saves", {
        method: "POST",
        body: JSON.stringify({ gameId: "snes__SuperMario", saveData: "AABBCC" }),
        headers: { "Content-Type": "application/json" },
      });
      const res = await postSaves(req);

      expect(res.status).toBe(401);
    });

    it("returns 400 when missing required fields", async () => {
      mockGetCurrentSession.mockResolvedValue({
        user: { id: "user-123", username: "player1", role: "user" },
      });

      const req = new NextRequest("http://localhost:39254/api/saves", {
        method: "POST",
        body: JSON.stringify({ gameId: "snes__SuperMario" }), // missing saveData
        headers: { "Content-Type": "application/json" },
      });
      const res = await postSaves(req);

      expect(res.status).toBe(400);
    });

    it("upserts authoritative save into user_game_saves via JSON payload", async () => {
      mockGetCurrentSession.mockResolvedValue({
        user: { id: "user-123", username: "player1", role: "user" },
      });

      mockDbQuery.mockResolvedValue([{ affectedRows: 1 }]);

      const raw = Buffer.from("MY_NEW_SAVE_STATE");
      const b64 = raw.toString("base64");
      const expectedChecksum = crypto.createHash("sha256").update(raw).digest("hex");

      const req = new NextRequest("http://localhost:39254/api/saves", {
        method: "POST",
        body: JSON.stringify({
          gameId: "snes__SuperMario",
          saveType: "savestate",
          slotIndex: 0,
          saveData: b64,
        }),
        headers: { "Content-Type": "application/json" },
      });

      const res = await postSaves(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.checksum).toBe(expectedChecksum);
      expect(json.fileSize).toBe(raw.length);

      // Verify DB query was called with user_game_saves
      expect(mockDbQuery).toHaveBeenCalledWith(
        expect.stringContaining("INSERT INTO user_game_saves"),
        expect.arrayContaining(["user-123", "snes__SuperMario", "savestate", 0])
      );
    });

    it("supports binary octet-stream payload with query parameters", async () => {
      mockGetCurrentSession.mockResolvedValue({
        user: { id: "user-123", username: "player1", role: "user" },
      });

      mockDbQuery.mockResolvedValue([{ affectedRows: 1 }]);

      const binary = new Uint8Array([10, 20, 30, 40, 50]);
      const req = new NextRequest(
        "http://localhost:39254/api/saves?gameId=genesis__Sonic&saveType=native&slotIndex=1",
        {
          method: "POST",
          body: binary,
          headers: { "Content-Type": "application/octet-stream" },
        }
      );

      const res = await postSaves(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.fileSize).toBe(5);
    });
  });

  describe("POST /api/saves/beacon (Emergency Exit Save Persistence)", () => {
    it("handles text/plain beacon payload and persists authoritative save", async () => {
      mockGetCurrentSession.mockResolvedValue({
        user: { id: "user-123", username: "player1", role: "user" },
      });

      mockDbQuery.mockResolvedValue([{ affectedRows: 1 }]);

      const raw = Buffer.from("EMERGENCY_EXIT_SAVE_STATE");
      const b64 = raw.toString("base64");
      const expectedChecksum = crypto.createHash("sha256").update(raw).digest("hex");

      const payload = JSON.stringify({
        userId: "user-123",
        gameId: "n64__Mario64",
        emulatorType: "emulatorjs",
        saveData: b64,
      });

      const req = new NextRequest("http://localhost:39254/api/saves/beacon", {
        method: "POST",
        body: payload,
        headers: { "Content-Type": "text/plain" },
      });

      const res = await postBeacon(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.checksum).toBe(expectedChecksum);

      expect(mockDbQuery).toHaveBeenCalledWith(
        expect.stringContaining("INSERT INTO user_game_saves"),
        expect.arrayContaining(["user-123", "n64__Mario64"])
      );
    });

    it("returns 400 on empty beacon payload", async () => {
      const req = new NextRequest("http://localhost:39254/api/saves/beacon", {
        method: "POST",
        body: "",
      });

      const res = await postBeacon(req);
      expect(res.status).toBe(400);
    });
  });

  describe("SaveSyncService Client Integration", () => {
    it("triggers navigator.sendBeacon when save bytes are provided", () => {
      const mockSendBeacon = vi.fn().mockReturnValue(true);
      Object.defineProperty(globalThis, "navigator", {
        value: { sendBeacon: mockSendBeacon },
        configurable: true,
        writable: true,
      });

      const sample = new Uint8Array([1, 2, 3, 4]);
      const queued = SaveSyncService.triggerBeaconExit("user-123", "snes__ChronoTrigger", "emulatorjs", sample);

      expect(queued).toBe(true);
      expect(mockSendBeacon).toHaveBeenCalledWith(
        "/api/saves/beacon",
        expect.any(Blob)
      );
    });

    it("gracefully returns false when navigator.sendBeacon is unavailable", () => {
      Object.defineProperty(globalThis, "navigator", {
        value: {},
        configurable: true,
        writable: true,
      });
      const sample = new Uint8Array([1, 2, 3]);
      const queued = SaveSyncService.triggerBeaconExit("user-123", "snes__ChronoTrigger", "emulatorjs", sample);

      expect(queued).toBe(false);
    });
  });

  describe("PS1 Memory Card Validation & Per-Game IDBFS Isolation", () => {
    it("validates 128 KB PS1 memory card magic header and rejects cross-system 2 KB saves", () => {
      const formattedCard = new Uint8Array(createFormattedPs1MemoryCard());
      expect(isValidPs1MemoryCard(formattedCard)).toBe(true);
      expect(isBlankPs1MemoryCard(formattedCard)).toBe(true);

      // 2 KB SNES save must never be accepted as a valid or non-blank PS1 memory card
      const snesSave = new Uint8Array(2048);
      snesSave[0] = 0x4d;
      snesSave[1] = 0x43;
      expect(isValidPs1MemoryCard(snesSave)).toBe(false);
      expect(isBlankPs1MemoryCard(snesSave)).toBe(false);
    });

    it("detects non-blank PS1 saves across all 15 directory frames (including slots 4..15)", () => {
      const card = new Uint8Array(createFormattedPs1MemoryCard());
      expect(isBlankPs1MemoryCard(card)).toBe(true);

      // Write an active block allocation state (0x51) into slot 7 (frame 7 at offset 7 * 128)
      card[7 * 128] = 0x51;
      expect(isValidPs1MemoryCard(card)).toBe(true);
      expect(isBlankPs1MemoryCard(card)).toBe(false);
    });

    it("computes byte-accurate checksums sensitive to changes at any byte offset", () => {
      const cardA = new Uint8Array(createFormattedPs1MemoryCard());
      const cardB = new Uint8Array(cardA);
      // Modify byte at non-32-aligned offset (e.g. offset 131 inside directory frame 1)
      cardB[131] = 0x51;
      expect(computeSaveChecksum(cardA)).not.toBe(computeSaveChecksum(cardB));
    });

    it("filters /data/saves files strictly to current game candidates to prevent cross-game contamination", () => {
      const existingInIdbfs = [
        "Super Mario World (USA).srm",
        "After Burner (World).srm",
        "Final Fantasy VII (USA) (Disc 1).srm",
      ];
      const ff7Candidates = [
        "Final Fantasy VII (USA) (Disc 1).srm",
        "Final Fantasy VII (USA).srm",
      ];
      const filtered = filterCandidateSaveFiles(existingInIdbfs, ff7Candidates);
      expect(filtered).toEqual(["Final Fantasy VII (USA) (Disc 1).srm"]);
      expect(filtered).not.toContain("Super Mario World (USA).srm");
    });
  });
});
