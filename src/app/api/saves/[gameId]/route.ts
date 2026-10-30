import fs from "fs";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { normalizeSystem } from "@/lib/paths";

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

const SAVES_ROOT = "/mnt/storage/roms/saves";

export async function GET(
  request: NextRequest,
  context: RouteContext
): Promise<NextResponse> {
  try {
    const { gameId } = await context.params;
    const system = normalizeSystem(request.nextUrl.searchParams.get("system")) || "psx";
    const systemDir = path.join(SAVES_ROOT, system);

    if (!fs.existsSync(systemDir)) {
      return NextResponse.json({ exists: false }, { status: 404 });
    }

    const candidateKeys = getCandidateKeys(gameId);
    let foundPath: string | null = null;

    // 1. Search directly in system directory and immediate subdirectories
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

    // 2. Search client subdirectories if not found in root
    if (!foundPath) {
      const entries = fs.readdirSync(systemDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory() && entry.name !== "users") {
          const subDir = path.join(systemDir, entry.name);
          for (const key of candidateKeys) {
            const possibleNames = [`${key}.srm`, `${key}.sav`, `${key}.mcr`];
            for (const name of possibleNames) {
              const subPath = path.join(subDir, name);
              if (fs.existsSync(subPath)) {
                foundPath = subPath;
                break;
              }
            }
            if (foundPath) break;
          }
        }
        if (foundPath) break;
      }
    }

    if (!foundPath) {
      return NextResponse.json({ exists: false }, { status: 404 });
    }

    const data = fs.readFileSync(foundPath);
    const stat = fs.statSync(foundPath);
    const isDownload = request.nextUrl.searchParams.get("download") === "1";

    return new NextResponse(data, {
      status: 200,
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Length": String(data.byteLength),
        "Last-Modified": stat.mtime.toUTCString(),
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
    const { gameId } = await context.params;
    const system = normalizeSystem(request.nextUrl.searchParams.get("system")) || "psx";
    const arrayBuffer = await request.arrayBuffer();

    if (!arrayBuffer || arrayBuffer.byteLength === 0) {
      return NextResponse.json({ error: "Empty save payload" }, { status: 400 });
    }

    const buffer = Buffer.from(arrayBuffer);
    const systemDir = path.join(SAVES_ROOT, system);
    fs.mkdirSync(systemDir, { recursive: true });

    // Canonical filename uses clean spaces: e.g. "Final Fantasy VII (USA).srm"
    const decoded = deepClean(gameId);
    const cleanBase = (decoded.includes("__") ? decoded.slice(decoded.indexOf("__") + 2) : decoded)
      .replace(/\.(chd|rvz|iso|bin|cue|zip|7z|sfc|smc|nes|z64|v64|n64|gba|gbc|gb)$/i, "")
      .replace(/[\s\(\[]+(?:disc|disk)\s*[^)\]]*[)\]]+/gi, "")
      .replace(/[\/\\?%*:|"<>]/g, "_")
      .trim();

    const targetFile = path.join(systemDir, `${cleanBase}.srm`);
    const tmpFile = `${targetFile}.${Date.now()}.tmp`;

    fs.writeFileSync(tmpFile, buffer);
    fs.renameSync(tmpFile, targetFile);

    try {
      fs.copyFileSync(targetFile, `${targetFile}.bak`);
    } catch {}

    // Mirror to legacy %20 name if it exists on disk to ensure backward compatibility
    const legacyNames = [
      `${cleanBase.replace(/[\s]+/g, "_20")}_20.srm`,
      `${cleanBase.replace(/[\s]+/g, "_20")}.srm`,
      `${cleanBase.replace(/[\s]+/g, "_")}.srm`
    ];
    for (const leg of legacyNames) {
      const legPath = path.join(systemDir, leg);
      if (fs.existsSync(legPath)) {
        try { fs.copyFileSync(targetFile, legPath); } catch {}
      }
    }

    return NextResponse.json({
      success: true,
      bytes: buffer.byteLength,
      target: targetFile,
    });
  } catch (error) {
    console.error("[api/saves POST] Error saving:", error);
    return NextResponse.json({ error: "Failed to store save" }, { status: 500 });
  }
}