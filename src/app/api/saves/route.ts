import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifySession } from "@/lib/auth";
import crypto from "crypto";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await verifySession(request);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const gameId = searchParams.get("gameId");
    const saveType = searchParams.get("saveType") || "savegame";
    const slotIndex = parseInt(searchParams.get("slotIndex") || "0", 10);

    if (!gameId) {
      return NextResponse.json({ error: "Missing gameId" }, { status: 400 });
    }

    // 1. Authoritative lookup in user_game_saves (with priority-ranked fallback for slot 0)
    try {
      const [rows] = await db.query<any>(
        slotIndex === 0
          ? "SELECT save_data, checksum, file_size, updated_at FROM user_game_saves WHERE user_id = ? AND game_id = ? AND slot_index = 0 AND (save_type = ? OR save_type IN ('savegame', 'memory_card', 'savestate')) ORDER BY CASE WHEN save_type = ? THEN 1 WHEN save_type = 'savegame' THEN 2 WHEN save_type = 'memory_card' THEN 3 ELSE 4 END LIMIT 1"
          : "SELECT save_data, checksum, file_size, updated_at FROM user_game_saves WHERE user_id = ? AND game_id = ? AND save_type = ? AND slot_index = ? LIMIT 1",
        slotIndex === 0
          ? [session.userId, gameId, saveType, saveType]
          : [session.userId, gameId, saveType, slotIndex]
      );

      if (Array.isArray(rows) && rows.length > 0 && rows[0].save_data) {
        const rawBuf = Buffer.isBuffer(rows[0].save_data)
          ? rows[0].save_data
          : Buffer.from(rows[0].save_data);

        return NextResponse.json({
          exists: true,
          saveData: rawBuf.toString("base64"),
          checksum: rows[0].checksum,
          fileSize: rows[0].file_size || rawBuf.length,
          updatedAt: rows[0].updated_at,
        });
      }
    } catch (dbErr) {
      console.warn("[api/saves GET] user_game_saves lookup warning:", dbErr);
    }

    // 2. Compatibility fallback: check user_saves table
    try {
      const slotNum = slotIndex === 0 ? 1 : slotIndex;
      const [legacyRows] = await db.query<any>(
        "SELECT save_data, updated_at FROM user_saves WHERE user_id = ? AND game_id = ? AND slot = ? LIMIT 1",
        [session.userId, gameId, slotNum]
      );

      if (Array.isArray(legacyRows) && legacyRows.length > 0 && legacyRows[0].save_data) {
        const rawBuf = Buffer.isBuffer(legacyRows[0].save_data)
          ? legacyRows[0].save_data
          : Buffer.from(legacyRows[0].save_data);
        const checksum = crypto.createHash("sha256").update(rawBuf).digest("hex");

        return NextResponse.json({
          exists: true,
          saveData: rawBuf.toString("base64"),
          checksum,
          fileSize: rawBuf.length,
          updatedAt: legacyRows[0].updated_at,
        });
      }
    } catch (legacyErr) {
      console.warn("[api/saves GET] legacy user_saves lookup warning:", legacyErr);
    }

    return NextResponse.json({ exists: false }, { status: 200 });
  } catch (error) {
    console.error("[api/saves GET] Failed to fetch save:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await verifySession(request);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const contentType = request.headers.get("content-type") || "";
    let gameId: string | null = null;
    let saveType = "savegame";
    let slotIndex = 0;
    let buffer: Buffer | null = null;

    if (contentType.includes("application/json")) {
      const body = await request.json().catch(() => null);
      if (!body) {
        return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
      }
      gameId = body.gameId;
      if (body.saveType) saveType = body.saveType;
      if (typeof body.slotIndex === "number") slotIndex = body.slotIndex;
      if (body.saveData && typeof body.saveData === "string") {
        buffer = Buffer.from(body.saveData, "base64");
      }
    } else {
      // Raw octet-stream support
      const { searchParams } = new URL(request.url);
      gameId = searchParams.get("gameId");
      if (searchParams.has("saveType")) saveType = searchParams.get("saveType") || "savegame";
      if (searchParams.has("slotIndex")) slotIndex = parseInt(searchParams.get("slotIndex") || "0", 10);

      const arrayBuf = await request.arrayBuffer();
      if (arrayBuf && arrayBuf.byteLength > 0) {
        buffer = Buffer.from(arrayBuf);
      }
    }

    if (!gameId || !buffer || buffer.length === 0) {
      return NextResponse.json({ error: "Missing required fields: gameId and saveData" }, { status: 400 });
    }

    const checksum = crypto.createHash("sha256").update(buffer).digest("hex");

    // Perform authoritative upsert into user_game_saves
    await db.query(
      `INSERT INTO user_game_saves (user_id, game_id, save_type, slot_index, save_data, file_size, checksum, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, NOW())
       ON DUPLICATE KEY UPDATE 
         save_data = VALUES(save_data), 
         file_size = VALUES(file_size), 
         checksum = VALUES(checksum),
         updated_at = NOW()`,
      [session.userId, gameId, saveType, slotIndex, buffer, buffer.length, checksum]
    );

    // Keep legacy user_saves in sync for backward compatibility
    try {
      const slotNum = slotIndex === 0 ? 1 : slotIndex;
      await db.query(
        `INSERT INTO user_saves (id, user_id, game_id, slot, platform, save_data, size_bytes, updated_at)
         VALUES (UUID(), ?, ?, ?, ?, ?, ?, NOW())
         ON DUPLICATE KEY UPDATE 
           save_data = VALUES(save_data),
           size_bytes = VALUES(size_bytes),
           updated_at = NOW()`,
        [session.userId, gameId, slotNum, saveType, buffer, buffer.length]
      );
    } catch {}

    return NextResponse.json({
      success: true,
      checksum,
      fileSize: buffer.length,
      slotIndex,
    });
  } catch (error) {
    console.error("[api/saves POST] Failed to save data:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
