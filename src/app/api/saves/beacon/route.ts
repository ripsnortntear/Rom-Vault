import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifySession } from "@/lib/auth";
import crypto from "crypto";

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    // navigator.sendBeacon sends data as text/plain or application/json
    const rawBody = await request.text();
    if (!rawBody || rawBody.trim().length === 0) {
      return NextResponse.json({ error: "Empty payload" }, { status: 400 });
    }

    let body: any;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ error: "Invalid JSON in beacon payload" }, { status: 400 });
    }

    const { gameId, emulatorType, saveData, slotIndex = 0 } = body;

    // Verify session
    const session = await verifySession(request);
    const userId = session?.userId || body.userId;

    if (!gameId || !saveData || !userId) {
      return NextResponse.json({ error: "Missing required parameters" }, { status: 400 });
    }

    const saveType =
      body.saveType || (emulatorType === "tabstationtoo" ? "savestate" : "memory_card");
    const buffer = Buffer.from(saveData, "base64");
    if (buffer.length === 0) {
      return NextResponse.json({ error: "Zero-byte save data" }, { status: 400 });
    }

    const checksum = crypto.createHash("sha256").update(buffer).digest("hex");

    // Perform an authoritative upsert into MariaDB user_game_saves
    await db.query(
      `INSERT INTO user_game_saves (user_id, game_id, save_type, slot_index, save_data, file_size, checksum, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, NOW())
       ON DUPLICATE KEY UPDATE 
         save_data = VALUES(save_data), 
         file_size = VALUES(file_size), 
         checksum = VALUES(checksum),
         updated_at = NOW()`,
      [userId, gameId, saveType, slotIndex, buffer, buffer.length, checksum]
    );

    // Also mirror to user_saves for parity
    try {
      const slotNum = slotIndex === 0 ? 1 : slotIndex;
      await db.query(
        `INSERT INTO user_saves (id, user_id, game_id, slot, platform, save_data, size_bytes, updated_at)
         VALUES (UUID(), ?, ?, ?, ?, ?, ?, NOW())
         ON DUPLICATE KEY UPDATE 
           save_data = VALUES(save_data),
           size_bytes = VALUES(size_bytes),
           updated_at = NOW()`,
        [userId, gameId, slotNum, saveType, buffer, buffer.length]
      );
    } catch {}

    // sendBeacon ignores response bodies, but returning 200 confirms success
    return NextResponse.json({ success: true, checksum }, { status: 200 });
  } catch (error) {
    console.error("[api/saves/beacon] Beacon save persistence failed:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
