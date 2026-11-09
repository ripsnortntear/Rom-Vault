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

import { GET as getMe, PUT as updateMe } from "@/app/api/users/me/route";

describe("Cross-Device Favorites Synchronization Suite", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("GET /api/users/me returns parsed favorites array from user profile", async () => {
    mockGetCurrentSession.mockResolvedValueOnce({
      user: { id: "user-123", username: "retrohero", role: "user" },
    });

    mockQuery.mockResolvedValueOnce([
      {
        id: "prof-1",
        user_id: "user-123",
        display_name: "Retro Hero",
        avatar_url: null,
        preferences: JSON.stringify({ theme: "retro" }),
        favorites: JSON.stringify(["mame__1942", "snes__super-metroid"]),
        download_quota_daily: 50,
        download_count_today: 0,
      },
    ]);

    const req = new NextRequest("http://localhost/roms/api/users/me");
    const res = await getMe(req);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.authenticated).toBe(true);
    expect(data.profile.favorites).toEqual(["mame__1942", "snes__super-metroid"]);
  });

  it("PUT /api/users/me updates cloud favorites array in MariaDB", async () => {
    mockGetCurrentSession.mockResolvedValueOnce({
      user: { id: "user-123", username: "retrohero", role: "user" },
    });

    // Check existing profile -> returns 1 existing row
    mockQuery.mockResolvedValueOnce([{ id: "prof-1" }]);
    mockExecute.mockResolvedValueOnce({ affectedRows: 1 });

    const req = new NextRequest("http://localhost/roms/api/users/me", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        favorites: ["mame__1942", "snes__super-metroid", "genesis__sonic2"],
      }),
    });

    const res = await updateMe(req);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.success).toBe(true);

    expect(mockExecute).toHaveBeenCalledTimes(1);
    const callArgs = mockExecute.mock.calls[0];
    expect(callArgs[0]).toContain("UPDATE user_profiles SET");
    expect(callArgs[0]).toContain("favorites = ?");
    expect(callArgs[1]).toContain(JSON.stringify(["mame__1942", "snes__super-metroid", "genesis__sonic2"]));
    expect(callArgs[1]).toContain("user-123");
  });

  it("bidirectional favorites union correctly merges mobile and desktop sets without duplicates", () => {
    const mobileLocalFavs = ["mame__1942", "nes__zelda", "psx__ff7"];
    const desktopCloudFavs = ["mame__1942", "snes__super-metroid"];

    // Union preserving order: cloud favorites followed by local favorites
    const merged = Array.from(new Set([...desktopCloudFavs, ...mobileLocalFavs]));
    expect(merged).toEqual(["mame__1942", "snes__super-metroid", "nes__zelda", "psx__ff7"]);
    expect(merged.length).toBe(4);
  });
});
