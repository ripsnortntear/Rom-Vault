import fs from "fs";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { normalizeSystem, getStorageRoot } from "@/lib/paths";
import { getCurrentSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { generateUUID } from "@/lib/auth/crypto";
import { validateSaveFormatForPlatform } from "@/lib/security";

interface RouteContext {
  params: Promise<{
    gameId: string;
  }>;
}

function deepClean(str: string): string {
  let s = str || "";
  try {
    while (s.includes("%20") || s.includes("%25")) {
      const decoded = decodeURIComponent(s);
      if (decoded === s) break;
      s = decoded;
    }
  } catch {}
  return s;
}

function getCandidateKeys(rawId: string): string[] {
  const decoded = deepClean(rawId);
  const withoutPrefix = decoded.includes("__") ? decoded.slice(decoded.indexOf("__") + 2) : decoded;
  const stripped = withoutPrefix
    .replace(/\.(chd|rvz|iso|bin|cue|zip|7z|sfc|smc|nes|z64|v64|n64|gba|gbc|gb)$/i, "")
    .replace(/[\s\(\[]+(?:disc|disk)\s*[^)\]]*[)\]]+/gi, "")
    .trim();

  const keys = new Set<string>();
  keys.add(stripped);
  keys.add(stripped.replace(/[\s]+/g, "_"));
  keys.add(stripped.replace(/[\s]+/g, "_20"));
  keys.add(stripped.replace(/[\s]+/g, "%20"));
  keys.add(rawId);
  keys.add(encodeURIComponent(stripped));

  return Array.from(keys);
}

const getSavesRoot = () => path.join(getStorageRoot(), "saves");

export async function GET(
  request: NextRequest,
  context: RouteContext
): Promise<NextResponse> {
  try {
    // 1. Enforce strict authentication check
    const session = await getCurrentSession();
    if (!session || !session.user) {
      return NextResponse.json(
        { error: "Authentication required to access save states." },
        { status: 401 }
      );
    }

    const userId = String(session.user.id);
    const { gameId } = await context.params;
    const decoded = deepClean(gameId);

    const slotParam = request.nextUrl.searchParams.get("slot");
    const slot = slotParam ? Math.max(1, parseInt(slotParam, 10) || 1) : 1;

    // 2. Resolve canonical platform from database or ID prefix
    let system = normalizeSystem(request.nextUrl.searchParams.get("system"));
    try {
      const [games] = await db.query<any>(
        "SELECT id, system FROM game_metadata WHERE id = ? LIMIT 1",
        [gameId]
      );
      if (Array.isArray(games) && games.length > 0 && games[0].system) {
        system = normalizeSystem(games[0].system);
      }
    } catch {}

    if (decoded.includes("__")) {
      const gameSystem = normalizeSystem(decoded.split("__")[0]);
      if (system && system !== gameSystem) {
        return NextResponse.json(
          { error: `Platform mismatch: requested system '${system}' does not match game platform '${gameSystem}'.` },
          { status: 400 }
        );
      }
      system = gameSystem;
    }
    if (!system) {
      system = "psx";
    }

    let foundData: Buffer | null = null;
    let foundPath: string | null = null;
    let mtime: Date = new Date();

    // 3. User-Scoped Database Lookup (WHERE user_id = ? AND game_id = ?)
    try {
      const [rows] = await db.query<any>(
        "SELECT save_data, file_path, updated_at FROM user_saves WHERE user_id = ? AND game_id = ? AND slot = ? LIMIT 1",
        [userId, gameId, slot]
      );
      if (Array.isArray(rows) && rows.length > 0) {
        if (rows[0].save_data) {
          foundData = Buffer.isBuffer(rows[0].save_data)
            ? rows[0].save_data
            : Buffer.from(rows[0].save_data);
          if (rows[0].updated_at) mtime = new Date(rows[0].updated_at);
        } else if (rows[0].file_path && fs.existsSync(rows[0].file_path)) {
          foundPath = rows[0].file_path;
        }
      }
    } catch (dbErr) {
      console.warn("[api/saves GET] Database save check failed:", dbErr);
    }

    // 4. User-Scoped Filesystem Lookup
    const userSystemDir = path.resolve(getSavesRoot(), "users", userId, system);
    const candidateKeys = getCandidateKeys(gameId);

    if (!foundData && !foundPath && fs.existsSync(userSystemDir)) {
      for (const key of candidateKeys) {
        const possibleNames = [
          slot > 1 ? `${key}_slot${slot}.srm` : null,
          `${key}.srm`,
          `${key}.sav`,
          `${key}.mcr`,
        ].filter(Boolean) as string[];

        for (const name of possibleNames) {
          const direct = path.join(userSystemDir, name);
          if (fs.existsSync(direct)) {
            foundPath = direct;
            break;
          }
        }
        if (foundPath) break;
      }
    }

    // 5. Fallback: Read-only template / legacy save from system root if user save not yet created
    const systemDir = path.resolve(getSavesRoot(), system);
    if (!foundData && !foundPath && fs.existsSync(systemDir)) {
      for (const key of candidateKeys) {
        const possibleNames = [`${key}.srm`, `${key}.sav`, `${key}.mcr`];
        for (const name of possibleNames) {
          const direct = path.join(systemDir, name);
          if (fs.existsSync(direct)) {
            foundPath = direct;
            break;
          }
        }
        if (foundPath) break;
      }
    }

    if (!foundData && !foundPath) {
      return NextResponse.json({ exists: false }, { status: 404 });
    }

    let data: Buffer;
    if (foundData) {
      data = foundData;
    } else {
      data = fs.readFileSync(/*turbopackIgnore: true*/ foundPath!);
      const stat = fs.statSync(/*turbopackIgnore: true*/ foundPath!);
      mtime = stat.mtime;
    }

    const isDownload = request.nextUrl.searchParams.get("download") === "1";

    return new NextResponse(new Uint8Array(data), {
      status: 200,
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Length": String(data.byteLength),
        "Last-Modified": mtime.toUTCString(),
        "Cache-Control": "no-cache, no-store, must-revalidate",
        "Content-Disposition": isDownload ? `attachment; filename="save.srm"` : "inline",
      },
    });
  } catch (error) {
    console.error("[api/saves GET] Error reading save:", error);
    return NextResponse.json({ error: "Failed to read save" }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  context: RouteContext
): Promise<NextResponse> {
  try {
    // 1. Enforce strict authentication check
    const session = await getCurrentSession();
    if (!session || !session.user) {
      return NextResponse.json(
        { error: "Authentication required to store save states." },
        { status: 401 }
      );
    }

    const userId = String(session.user.id);
    const { gameId } = await context.params;
    const decoded = deepClean(gameId);

    // 2. Resolve canonical platform from database game_metadata or gameId prefix
    let canonicalPlatform: string | null = null;
    try {
      const [games] = await db.query<any>(
        "SELECT id, system FROM game_metadata WHERE id = ? LIMIT 1",
        [gameId]
      );
      if (Array.isArray(games) && games.length > 0 && games[0].system) {
        canonicalPlatform = normalizeSystem(games[0].system);
      }
    } catch (metaErr) {
      console.warn("[api/saves POST] DB metadata check warning:", metaErr);
    }

    if (!canonicalPlatform && decoded.includes("__")) {
      canonicalPlatform = normalizeSystem(decoded.split("__")[0]);
    }

    const requestedSystem = normalizeSystem(request.nextUrl.searchParams.get("system"));
    if (canonicalPlatform && requestedSystem && requestedSystem !== canonicalPlatform) {
      return NextResponse.json(
        { error: `Platform mismatch: specified system '${requestedSystem}' does not match canonical game platform '${canonicalPlatform}'.` },
        { status: 400 }
      );
    }

    const platform = canonicalPlatform || requestedSystem || "psx";

    // 3. Parse payload (support both JSON { saveData: "base64", slot: 1 } and binary octet-stream)
    let buffer: Buffer;
    let slot = 1;
    const contentType = request.headers.get("content-type") || "";

    if (contentType.includes("application/json")) {
      const body = await request.json().catch(() => null);
      if (!body) {
        return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
      }
      if (body.slot && typeof body.slot === "number" && body.slot > 0) {
        slot = body.slot;
      }
      if (typeof body.saveData === "string" && body.saveData.length > 0) {
        buffer = Buffer.from(body.saveData, "base64");
      } else {
        return NextResponse.json({ error: "Missing or invalid saveData." }, { status: 400 });
      }
    } else {
      const arrayBuffer = await request.arrayBuffer();
      if (!arrayBuffer || arrayBuffer.byteLength === 0) {
        return NextResponse.json({ error: "Empty save payload." }, { status: 400 });
      }
      buffer = Buffer.from(arrayBuffer);
      const slotParam = request.nextUrl.searchParams.get("slot");
      if (slotParam) {
        const parsed = parseInt(slotParam, 10);
        if (!isNaN(parsed) && parsed > 0) slot = parsed;
      }
    }

    // 4. Validate platform-specific save format constraints
    const formatError = validateSaveFormatForPlatform(platform, buffer);
    if (formatError) {
      return NextResponse.json({ error: formatError }, { status: 400 });
    }

    // 5. Partitioned user filesystem storage
    const userSystemDir = path.resolve(getSavesRoot(), "users", userId, platform);
    fs.mkdirSync(userSystemDir, { recursive: true });

    const cleanBase = (decoded.includes("__") ? decoded.slice(decoded.indexOf("__") + 2) : decoded)
      .replace(/\.(chd|rvz|iso|bin|cue|zip|7z|sfc|smc|nes|z64|v64|n64|gba|gbc|gb)$/i, "")
      .replace(/[\s\(\[]+(?:disc|disk)\s*[^)\]]*[)\]]+/gi, "")
      .replace(/[\/\\?%*:|"<>]/g, "_")
      .trim();

    if (!cleanBase || cleanBase.includes("..")) {
      return NextResponse.json({ error: "Invalid save target identifier." }, { status: 400 });
    }

    const fileName = slot === 1 ? `${cleanBase}.srm` : `${cleanBase}_slot${slot}.srm`;
    const targetFile = path.resolve(userSystemDir, fileName);

    if (!targetFile.startsWith(path.resolve(getSavesRoot()) + path.sep)) {
      return NextResponse.json({ error: "Invalid target path." }, { status: 403 });
    }

    const tmpFile = `${targetFile}.${Date.now()}.tmp`;
    fs.writeFileSync(tmpFile, buffer);
    fs.renameSync(tmpFile, targetFile);

    // 6. Database Upsert strictly scoped to user_id + game_id + slot
    const saveId = generateUUID();
    await db.query(
      `INSERT INTO user_saves (id, user_id, game_id, slot, platform, save_data, file_path, size_bytes, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())
       ON DUPLICATE KEY UPDATE 
         save_data = VALUES(save_data),
         file_path = VALUES(file_path),
         size_bytes = VALUES(size_bytes),
         platform = VALUES(platform),
         updated_at = NOW()`,
      [saveId, userId, gameId, slot, platform, buffer, targetFile, buffer.length]
    );

    return NextResponse.json({
      success: true,
      bytes: buffer.byteLength,
      slot,
      platform,
      target: targetFile,
    });
  } catch (error) {
    console.error("[api/saves POST] Error saving:", error);
    return NextResponse.json({ error: "Failed to store save" }, { status: 500 });
  }
}
