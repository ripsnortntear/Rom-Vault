import fs from "fs";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { normalizeSystem } from "@/lib/paths";

interface RouteContext {
  params: Promise<{
    gameId: string;
  }>;
}

function safeDecode(val: string): string {
  try {
    return decodeURIComponent(val);
  } catch {
    return val;
  }
}

function getCleanSaveBaseKey(gameId: string, system: string): string {
  let name = safeDecode(gameId);

  // Strip system prefix if present (e.g., "psx__Final Fantasy VII...")
  if (name.includes("__")) {
    name = name.slice(name.indexOf("__") + 2);
  }

  // Strip file extensions if present
  name = name.replace(/\.(chd|rvz|iso|bin|cue|zip|7z|sfc|smc|nes|z64|v64|n64|gba|gbc|gb)$/i, "");

  // Strip disc suffixes (e.g. " (Disc 1)", " (Disc 2)") so multi-disc games share the same memory card
  name = name.replace(/[\s\(\[]+(?:disc|disk)\s*[^)\]]*[)\]]+/gi, "");

  // Strip specific multi-disc campaign names
  name = name.replace(
    /\s*\((?:allies|soviet|nod|gdi|evolution disc|arcade disc|shockwave[^)]*|the first generation|chronicles of arthur|blazing guns|ninja hayate|road blaster)\)/gi,
    ""
  );

  // Sanitize path traversal characters
  name = name.replace(/[\/\\?%*:|"<>]/g, "_").trim();

  return name || "game_save";
}

const SAVES_ROOT = "/mnt/storage/roms/saves";

export async function GET(
  request: NextRequest,
  context: RouteContext
): Promise<NextResponse> {
  try {
    const { gameId } = await context.params;
    const system = normalizeSystem(request.nextUrl.searchParams.get("system"));
    const client = request.nextUrl.searchParams.get("client")?.replace(/[^a-zA-Z0-9_-]/g, "") || "";
    const baseKey = getCleanSaveBaseKey(gameId, system);

    // Candidates: client-specific first, then global
    const candidates: string[] = [];
    if (client) {
      candidates.push(path.join(SAVES_ROOT, system, client, `${baseKey}.srm`));
      candidates.push(path.join(SAVES_ROOT, system, client, `${baseKey}.sav`));
    }
    candidates.push(path.join(SAVES_ROOT, system, `${baseKey}.srm`));
    candidates.push(path.join(SAVES_ROOT, system, `${baseKey}.sav`));

    let foundPath: string | null = null;
    for (const cand of candidates) {
      if (fs.existsSync(cand)) {
        foundPath = cand;
        break;
      }
    }

    if (!foundPath) {
      return NextResponse.json({ exists: false, baseKey }, { status: 404 });
    }

    const data = fs.readFileSync(/*turbopackIgnore: true*/ foundPath);
    const stat = fs.statSync(/*turbopackIgnore: true*/ foundPath);
    const isDownload = request.nextUrl.searchParams.get("download") === "1";

    return new NextResponse(data, {
      status: 200,
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Length": String(data.byteLength),
        "Last-Modified": stat.mtime.toUTCString(),
        "Cache-Control": "no-cache, no-store, must-revalidate",
        "Content-Disposition": isDownload
          ? `attachment; filename="${encodeURIComponent(baseKey)}.srm"`
          : "inline",
      },
    });
  } catch (error) {
    console.error("[api/saves GET] Failed reading save:", error);
    return NextResponse.json({ error: "Failed to read save file" }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  context: RouteContext
): Promise<NextResponse> {
  try {
    const { gameId } = await context.params;
    const system = normalizeSystem(request.nextUrl.searchParams.get("system"));
    const client = request.nextUrl.searchParams.get("client")?.replace(/[^a-zA-Z0-9_-]/g, "") || "";
    const baseKey = getCleanSaveBaseKey(gameId, system);

    const arrayBuffer = await request.arrayBuffer();
    if (!arrayBuffer || arrayBuffer.byteLength === 0) {
      return NextResponse.json({ error: "Empty save payload" }, { status: 400 });
    }

    const buffer = Buffer.from(arrayBuffer);

    // Write to global system directory
    const globalDir = path.join(SAVES_ROOT, system);
    fs.mkdirSync(globalDir, { recursive: true });
    const globalPath = path.join(globalDir, `${baseKey}.srm`);
    const globalTmp = `${globalPath}.${Date.now()}.tmp`;

    fs.writeFileSync(globalTmp, buffer);
    fs.renameSync(globalTmp, globalPath);
    try {
      fs.copyFileSync(globalPath, `${globalPath}.bak`);
    } catch {
      // Backup copy non-critical
    }

    // If client ID provided, also write to client subdirectory
    if (client) {
      const clientDir = path.join(SAVES_ROOT, system, client);
      fs.mkdirSync(clientDir, { recursive: true });
      const clientPath = path.join(clientDir, `${baseKey}.srm`);
      const clientTmp = `${clientPath}.${Date.now()}.tmp`;
      fs.writeFileSync(clientTmp, buffer);
      fs.renameSync(clientTmp, clientPath);
    }

    return NextResponse.json({
      success: true,
      baseKey,
      fileSizeBytes: buffer.byteLength,
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error("[api/saves POST] Failed saving data:", error);
    return NextResponse.json({ error: "Failed to store save file" }, { status: 500 });
  }
}
