import { NextRequest, NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth/session";
import { query, execute } from "@/lib/db";
import { normalizeSystem } from "@/lib/paths";

interface UserGameControlRow {
  id: number;
  user_id: string;
  game_id: string;
  system: string;
  controls: string;
  settings: string | null;
  updated_at: string;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const session = await getCurrentSession();
    if (!session?.user) {
      return NextResponse.json({ success: false, error: "Unauthorized." }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const gameId = searchParams.get("gameId")?.trim();
    const system = searchParams.get("system")?.trim();
    const normSystem = system ? normalizeSystem(system) || system : null;

    if (!gameId) {
      return NextResponse.json(
        { success: false, error: "Missing required query parameter: gameId" },
        { status: 400 }
      );
    }

    // 1. Check exact game match for this user
    const exactRows = await query<UserGameControlRow>(
      "SELECT controls, settings, updated_at FROM user_game_controls WHERE user_id = ? AND game_id = ? LIMIT 1",
      [session.user.id, gameId]
    );

    if (exactRows.length > 0 && exactRows[0]) {
      const row = exactRows[0];
      let parsedControls: unknown = null;
      let parsedSettings: unknown = null;
      try {
        parsedControls = typeof row.controls === "string" ? JSON.parse(row.controls) : row.controls;
      } catch {
        parsedControls = row.controls;
      }
      try {
        parsedSettings = row.settings && typeof row.settings === "string" ? JSON.parse(row.settings) : row.settings;
      } catch {
        parsedSettings = row.settings;
      }

      return NextResponse.json({
        success: true,
        exists: true,
        scope: "game",
        gameId,
        controls: parsedControls,
        settings: parsedSettings,
        updatedAt: row.updated_at,
      });
    }

    // 2. Check system-wide or global fallback for this user
    if (normSystem) {
      const fallbackRows = await query<UserGameControlRow>(
        `SELECT controls, settings, updated_at FROM user_game_controls 
         WHERE user_id = ? AND (system = ? OR game_id = '__global__') 
         ORDER BY CASE WHEN system = ? THEN 1 ELSE 2 END LIMIT 1`,
        [session.user.id, normSystem, normSystem]
      );

      if (fallbackRows.length > 0 && fallbackRows[0]) {
        const row = fallbackRows[0];
        let parsedControls: unknown = null;
        let parsedSettings: unknown = null;
        try {
          parsedControls = typeof row.controls === "string" ? JSON.parse(row.controls) : row.controls;
        } catch {
          parsedControls = row.controls;
        }
        try {
          parsedSettings = row.settings && typeof row.settings === "string" ? JSON.parse(row.settings) : row.settings;
        } catch {
          parsedSettings = row.settings;
        }

        return NextResponse.json({
          success: true,
          exists: true,
          scope: "system",
          gameId,
          controls: parsedControls,
          settings: parsedSettings,
          updatedAt: row.updated_at,
        });
      }
    }

    return NextResponse.json({
      success: true,
      exists: false,
      gameId,
      controls: null,
      settings: null,
    });
  } catch (error: any) {
    console.error("[api/users/me/controls GET] Error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch user game controls." },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const session = await getCurrentSession();
    if (!session?.user) {
      return NextResponse.json({ success: false, error: "Unauthorized." }, { status: 401 });
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ success: false, error: "Invalid JSON payload." }, { status: 400 });
    }

    const gameId = typeof body.gameId === "string" ? body.gameId.trim() : "";
    const rawSystem = typeof body.system === "string" ? body.system.trim() : "";
    const system = (rawSystem ? normalizeSystem(rawSystem) || rawSystem : "gba").slice(0, 50);

    if (!gameId) {
      return NextResponse.json({ success: false, error: "gameId is required." }, { status: 400 });
    }

    if (!body.controls) {
      return NextResponse.json({ success: false, error: "controls payload is required." }, { status: 400 });
    }

    const controlsStr = typeof body.controls === "string" ? body.controls : JSON.stringify(body.controls);
    const settingsStr = body.settings ? (typeof body.settings === "string" ? body.settings : JSON.stringify(body.settings)) : null;

    // Cap control & settings payload to prevent unbounded storage abuse
    if (controlsStr.length > 256 * 1024 || (settingsStr && settingsStr.length > 256 * 1024)) {
      return NextResponse.json(
        { success: false, error: "Controls payload exceeds maximum permitted size (256 KB)." },
        { status: 400 }
      );
    }

    await execute(
      `INSERT INTO user_game_controls (user_id, game_id, system, controls, settings, updated_at)
       VALUES (?, ?, ?, ?, ?, NOW())
       ON DUPLICATE KEY UPDATE
         system = VALUES(system),
         controls = VALUES(controls),
         settings = VALUES(settings),
         updated_at = NOW()`,
      [session.user.id, gameId, system, controlsStr, settingsStr]
    );

    return NextResponse.json({
      success: true,
      gameId,
      system,
      savedAt: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("[api/users/me/controls POST] Error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to save user game controls." },
      { status: 500 }
    );
  }
}
