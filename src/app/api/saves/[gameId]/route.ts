import fs from "fs";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { normalizeSystem } from "@/lib/paths";
import { getCurrentSession } from "@/lib/auth/session";

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

function detectCrossPlatformMismatch(system: string, buffer: Buffer): string | null {
  const norm = normalizeSystem(system);

  // Check PS2 Memory Card Superblock (contains "Sony Computer Entertainment Inc." at header)
  const headerStr = buffer.slice(0, 64).toString("utf8");
  const isPs2Payload = headerStr.includes("Sony Computer Entertainment");

  // Check PS1 Memory Card Header ("MC" / 0x4D 0x43 at offset 0 and exactly 128KB)
  const isPs1Payload = buffer.length === 131072 && buffer[0] === 0x4d && buffer[1] === 0x43;

  if (norm !== "ps2" && isPs2Payload) {
    return `Cross-platform save injection rejected: PlayStation 2 memory card payload cannot be uploaded to '${norm}'.`;
  }

  if (norm !== "psx" && isPs1Payload) {
    return `Cross-platform save injection rejected: PlayStation 1 memory card payload cannot be uploaded to '${norm}'.`;
  }

  // 8-bit / 16-bit / handheld systems SRAM capacity sanity limit (max 4MB)
  const smallRomSystems = ["nes", "snes", "gb", "gbc", "gba", "genesis", "megadrive", "mastersystem", "gamegear"];
  if (smallRomSystems.includes(norm) && buffer.byteLength > 4 * 1024 * 1024) {
    return `Save file size (${(buffer.byteLength / 1024 / 1024).toFixed(1)}MB) exceeds maximum allowable SRAM capacity for ${norm.toUpperCase()} (4MB).`;
  }

  // PS1 memory card limit (128KB standard, or up to 2MB max for multi-block formats)
  if (norm === "psx" && buffer.byteLength > 2 * 1024 * 1024) {
    return `Save file size exceeds maximum allowable PlayStation 1 memory card size (2MB).`;
  }

  // Global ceiling for any save payload (16MB)
  if (buffer.byteLength > 16 * 1024 * 1024) {
    return `Save payload exceeds maximum allowable limit (16MB).`;
  }

  return null;
}

export async function GET(
  request: NextRequest,
  context: RouteContext
): Promise<NextResponse> {
  try {
    const session = await getCurrentSession();
    if (!session || !session.user) {
      return NextResponse.json(
        { error: "Authentication required to access save states." },
        { status: 401 }
      );
    }

    const { gameId } = await context.params;
    const decoded = deepClean(gameId);

    let system = normalizeSystem(request.nextUrl.searchParams.get("system"));
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

    const systemDir = path.resolve(SAVES_ROOT, system);
    if (!systemDir.startsWith(path.resolve(SAVES_ROOT))) {
      return NextResponse.json({ error: "Invalid target platform." }, { status: 400 });
    }

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
    const session = await getCurrentSession();
    if (!session || !session.user) {
      return NextResponse.json(
        { error: "Authentication required to store save states." },
        { status: 401 }
      );
    }

    const { gameId } = await context.params;
    const decoded = deepClean(gameId);

    let system = normalizeSystem(request.nextUrl.searchParams.get("system"));
    if (decoded.includes("__")) {
      const gameSystem = normalizeSystem(decoded.split("__")[0]);
      if (system && system !== gameSystem) {
        return NextResponse.json(
          { error: `Platform mismatch: specified system '${system}' does not match game platform '${gameSystem}'.` },
          { status: 400 }
        );
      }
      system = gameSystem;
    }
    if (!system) {
      system = "psx";
    }

    const systemDir = path.resolve(SAVES_ROOT, system);
    if (!systemDir.startsWith(path.resolve(SAVES_ROOT))) {
      return NextResponse.json({ error: "Invalid target platform." }, { status: 400 });
    }

    const arrayBuffer = await request.arrayBuffer();
    if (!arrayBuffer || arrayBuffer.byteLength === 0) {
      return NextResponse.json({ error: "Empty save payload." }, { status: 400 });
    }

    const buffer = Buffer.from(arrayBuffer);

    // Validate platform scope and check for cross-platform save injection
    const mismatchError = detectCrossPlatformMismatch(system, buffer);
    if (mismatchError) {
      return NextResponse.json({ error: mismatchError }, { status: 400 });
    }

    fs.mkdirSync(systemDir, { recursive: true });

    // Canonical filename uses clean spaces: e.g. "Final Fantasy VII (USA).srm"
    const cleanBase = (decoded.includes("__") ? decoded.slice(decoded.indexOf("__") + 2) : decoded)
      .replace(/\.(chd|rvz|iso|bin|cue|zip|7z|sfc|smc|nes|z64|v64|n64|gba|gbc|gb)$/i, "")
      .replace(/[\s\(\[]+(?:disc|disk)\s*[^)\]]*[)\]]+/gi, "")
      .replace(/[\/\\?%*:|"<>]/g, "_")
      .trim();

    if (!cleanBase || cleanBase.includes("..")) {
      return NextResponse.json({ error: "Invalid save file target." }, { status: 400 });
    }

    const targetFile = path.resolve(systemDir, `${cleanBase}.srm`);
    if (!targetFile.startsWith(path.resolve(SAVES_ROOT) + path.sep)) {
      return NextResponse.json({ error: "Invalid target path." }, { status: 403 });
    }
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