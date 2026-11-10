import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const { mockQuery, mockExecute, mockGetCurrentSession } = vi.hoisted(() => {
  return {
    mockQuery: vi.fn(),
    mockExecute: vi.fn(),
    mockGetCurrentSession: vi.fn(),
  };
});

vi.mock("@/lib/db", () => ({
  query: mockQuery,
  execute: mockExecute,
  getPool: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({
  getCurrentSession: mockGetCurrentSession,
}));

import { GET as getControls, POST as postControls } from "@/app/api/users/me/controls/route";

describe("Universal Cross-Device Control & RetroArch Settings Sync Suite", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("GET /api/users/me/controls returns 401 when unauthenticated", async () => {
    mockGetCurrentSession.mockResolvedValueOnce(null);

    const req = new NextRequest("http://localhost/roms/api/users/me/controls?gameId=gba__Pokemon_Ruby");
    const res = await getControls(req);
    expect(res.status).toBe(401);

    const data = await res.json();
    expect(data.success).toBe(false);
  });

  it("GET /api/users/me/controls returns 400 when gameId is missing", async () => {
    mockGetCurrentSession.mockResolvedValueOnce({
      user: { id: "user-abc", username: "cfw34683", role: "admin" },
    });

    const req = new NextRequest("http://localhost/roms/api/users/me/controls");
    const res = await getControls(req);
    expect(res.status).toBe(400);

    const data = await res.json();
    expect(data.error).toContain("Missing required query parameter: gameId");
  });

  it("GET /api/users/me/controls returns exact game controls and RetroArch settings when present", async () => {
    mockGetCurrentSession.mockResolvedValueOnce({
      user: { id: "user-abc", username: "cfw34683", role: "admin" },
    });

    const customControls = {
      0: {
        4: { value: "up arrow", value2: "LEFT_STICK_Y:-1" },
        5: { value: "down arrow", value2: "LEFT_STICK_Y:+1" },
        6: { value: "left arrow", value2: "LEFT_STICK_X:-1" },
        7: { value: "right arrow", value2: "LEFT_STICK_X:+1" },
      },
    };
    const customSettings = {
      input_player1_analog_dpad_mode: "1",
    };

    mockQuery.mockResolvedValueOnce([
      {
        id: 1,
        user_id: "user-abc",
        game_id: "gba__Pokemon_Ruby",
        system: "gba",
        controls: JSON.stringify(customControls),
        settings: JSON.stringify(customSettings),
        updated_at: "2026-11-10T12:00:00.000Z",
      },
    ]);

    const req = new NextRequest("http://localhost/roms/api/users/me/controls?gameId=gba__Pokemon_Ruby&system=gba");
    const res = await getControls(req);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.exists).toBe(true);
    expect(data.scope).toBe("game");
    expect(data.controls).toEqual(customControls);
    expect(data.settings).toEqual(customSettings);
  });

  it("GET /api/users/me/controls falls back to system-wide defaults when exact game isn't found", async () => {
    mockGetCurrentSession.mockResolvedValueOnce({
      user: { id: "user-abc", username: "cfw34683", role: "admin" },
    });

    // Exact game query returns empty
    mockQuery.mockResolvedValueOnce([]);

    // Fallback query returns system-wide mapping
    const systemControls = {
      0: { 4: { value: "up arrow", value2: "DPAD_UP" } },
    };
    mockQuery.mockResolvedValueOnce([
      {
        id: 2,
        user_id: "user-abc",
        game_id: "__global__",
        system: "gba",
        controls: JSON.stringify(systemControls),
        settings: JSON.stringify({ input_player1_analog_dpad_mode: "1" }),
        updated_at: "2026-11-10T12:00:00.000Z",
      },
    ]);

    const req = new NextRequest("http://localhost/roms/api/users/me/controls?gameId=gba__Pokemon_Sapphire&system=gba");
    const res = await getControls(req);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.exists).toBe(true);
    expect(data.scope).toBe("system");
    expect(data.controls).toEqual(systemControls);
  });

  it("POST /api/users/me/controls saves custom mappings to MariaDB user_game_controls", async () => {
    mockGetCurrentSession.mockResolvedValueOnce({
      user: { id: "user-abc", username: "cfw34683", role: "admin" },
    });

    mockExecute.mockResolvedValueOnce({ affectedRows: 1 });

    const payload = {
      gameId: "gba__Pokemon_Ruby",
      system: "gba",
      controls: {
        0: {
          4: { value: "up arrow", value2: "LEFT_STICK_Y:-1" },
        },
      },
      settings: {
        input_player1_analog_dpad_mode: "1",
      },
    };

    const req = new NextRequest("http://localhost/roms/api/users/me/controls", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const res = await postControls(req);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.success).toBe(true);
    expect(mockExecute).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO user_game_controls"),
      expect.arrayContaining(["user-abc", "gba__Pokemon_Ruby", "gba"])
    );
  });
});
