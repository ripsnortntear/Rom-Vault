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
  ensureShoutboxInitialized,
  getRecentShouts,
  postShout,
  announceGameRelease,
  _resetShoutboxInitForTesting,
} from "./lib/shoutbox";

describe("Shoutbox Module Unit Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _resetShoutboxInitForTesting();
    mockDbQuery.mockResolvedValue([]);
    mockDbExecute.mockResolvedValue({ insertId: 1 });
  });

  describe("ensureShoutboxInitialized", () => {
    it("creates table and seeds messages when table is empty", async () => {
      mockDbExecute.mockResolvedValue({});
      mockDbQuery.mockResolvedValueOnce([{ count: 0 }]); // count is 0

      await ensureShoutboxInitialized();

      expect(mockDbExecute).toHaveBeenCalled();
      // Should query count
      expect(mockDbQuery).toHaveBeenCalledWith(
        expect.stringContaining("SELECT COUNT(*)")
      );
    });

    it("does not re-seed if count > 0", async () => {
      mockDbExecute.mockResolvedValue({});
      mockDbQuery.mockResolvedValueOnce([{ count: 12 }]);

      await ensureShoutboxInitialized();

      // Should check count but not run insert seeds
      expect(mockDbQuery).toHaveBeenCalled();
    });
  });

  describe("getRecentShouts", () => {
    it("returns formatted and ordered shout messages", async () => {
      mockDbExecute.mockResolvedValue({});
      mockDbQuery
        .mockResolvedValueOnce([{ count: 5 }])
        .mockResolvedValueOnce([
          {
            id: 2,
            user_id: "user-123",
            username: "RetroGamer",
            display_name: "Retro Gamer",
            avatar_url: null,
            role: "user",
            type: "user",
            game_id: null,
            system_id: null,
            message: "Anyone down for some Mario Kart 64?",
            created_at: new Date("2026-11-02T12:00:00Z"),
          },
          {
            id: 1,
            user_id: null,
            username: "VaultDrop",
            display_name: "Vault Drop",
            avatar_url: null,
            role: "system",
            type: "release",
            game_id: "n64__Mario Kart 64 (USA)",
            system_id: "n64",
            message: "Mario Kart 64 (N64) added to the Vault!",
            created_at: new Date("2026-11-02T11:00:00Z"),
          },
        ]);

      const shouts = await getRecentShouts(10);

      expect(shouts).toHaveLength(2);
      // Older message id 1 should be first in linear chat display
      expect(shouts[0].id).toBe(1);
      expect(shouts[0].type).toBe("release");
      expect(shouts[0].gameId).toBe("n64__Mario Kart 64 (USA)");
      expect(shouts[0].createdAt).toBe("2026-11-02T11:00:00.000Z");

      expect(shouts[1].id).toBe(2);
      expect(shouts[1].type).toBe("user");
      expect(shouts[1].username).toBe("RetroGamer");
    });
  });

  describe("postShout", () => {
    it("inserts and returns a user shout", async () => {
      mockDbExecute.mockResolvedValue({ insertId: 42 });

      const shout = await postShout({
        userId: "user-abc",
        username: "CloudPlayer",
        displayName: "Cloud",
        avatarUrl: "https://example.com/avatar.png",
        role: "user",
        message: "Final Fantasy VII works great!",
      });

      expect(shout.id).toBe(42);
      expect(shout.username).toBe("CloudPlayer");
      expect(shout.displayName).toBe("Cloud");
      expect(shout.message).toBe("Final Fantasy VII works great!");
      expect(mockDbExecute).toHaveBeenCalledWith(
        expect.stringContaining("INSERT INTO shoutbox_messages"),
        expect.arrayContaining(["user-abc", "CloudPlayer", "Cloud"])
      );
    });

    it("clamps messages to 280 characters", async () => {
      mockDbExecute.mockResolvedValue({ insertId: 43 });

      const longMessage = "a".repeat(500);
      const shout = await postShout({
        username: "Spammer",
        message: longMessage,
      });

      expect(shout.message).toHaveLength(280);
    });

    it("rejects whitespace-only or empty messages", async () => {
      await expect(
        postShout({
          username: "Tester",
          message: "    ",
        })
      ).rejects.toThrow("Shout message cannot be empty.");
    });
  });

  describe("announceGameRelease", () => {
    it("formats and posts a release announcement shout", async () => {
      mockDbExecute.mockResolvedValue({ insertId: 99 });

      const announcement = await announceGameRelease({
        id: "ps2__007 - Nightfire (USA)",
        title: "007: Nightfire",
        system: "ps2",
      });

      expect(announcement.id).toBe(99);
      expect(announcement.type).toBe("release");
      expect(announcement.systemId).toBe("ps2");
      expect(announcement.gameId).toBe("ps2__007 - Nightfire (USA)");
      expect(announcement.message).toContain("007: Nightfire (PS2)");
      expect(announcement.username).toBe("VaultDrop");
    });
  });
});
