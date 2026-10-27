import "server-only";

import fs from "fs";
import path from "path";
import { Readable } from "stream";
import { NextRequest, NextResponse } from "next/server";
import { normalizeSystem } from "@/lib/paths";
import { getCurrentSession } from "@/lib/auth/session";
import { query, execute } from "@/lib/db";

interface RouteContext {
  params: Promise<{
    id: string;
  }>;
}

const STORAGE_ROOT = path.resolve("/mnt/storage/roms");

function getMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case ".chd":
      return "application/x-chd";
    case ".iso":
    case ".bin":
    case ".cue":
    case ".rom":
    case ".nes":
    case ".sfc":
    case ".smc":
    case ".z64":
    case ".n64":
    case ".gba":
    case ".gb":
    case ".gbc":
    case ".rvz":
    default:
      return "application/octet-stream";
  }
}

function resolveRomFilePath(id: string): { filePath: string | null; isForbidden: boolean } {
  // Path traversal check
  if (id.includes("..") || id.includes("/../") || id.includes("\\..\\")) {
    return { filePath: null, isForbidden: true };
  }

  // Case 1: ID is formatted as `${system}__${baseName}`
  if (id.includes("__")) {
    const parts = id.split("__");
    const system = normalizeSystem(parts[0]);
    const baseName = decodeURIComponent(parts.slice(1).join("__"));
    const romsDir = path.join(STORAGE_ROOT, system, "roms");

    if (fs.existsSync(romsDir)) {
      // Check exact match or basename match
      try {
        const entries = fs.readdirSync(romsDir);
        const match = entries.find((e) => {
          const withoutExt = e.replace(/\.[^.]+$/, "");
          return e === baseName || withoutExt === baseName;
        });
        if (match) {
          const candidate = path.resolve(romsDir, match);
          if (candidate.startsWith(STORAGE_ROOT + path.sep)) {
            return { filePath: candidate, isForbidden: false };
          }
        }
      } catch {}
    }
  }

  // Case 2: ID is a direct filename or clean title across all supported systems
  const systems = [
    "psx",
    "ps2",
    "n64",
    "snes",
    "nes",
    "gamecube",
    "genesis",
    "gba",
    "gb",
    "gbc",
    "dreamcast",
    "saturn",
    "sega32x",
    "sms",
    "sgg",
  ];

  for (const sys of systems) {
    const romsDir = path.join(STORAGE_ROOT, sys, "roms");
    if (!fs.existsSync(romsDir)) continue;

    try {
      const entries = fs.readdirSync(romsDir);
      const match = entries.find((e) => {
        const withoutExt = e.replace(/\.[^.]+$/, "");
        return e === id || withoutExt === id;
      });
      if (match) {
        const candidate = path.resolve(romsDir, match);
        if (candidate.startsWith(STORAGE_ROOT + path.sep)) {
          return { filePath: candidate, isForbidden: false };
        }
      }
    } catch {}
  }

  return { filePath: null, isForbidden: false };
}

function parseRangeHeader(
  rangeHeader: string,
  fileSize: number
): { start: number; end: number } | null {
  const match = rangeHeader.match(/^bytes=(\d*)-(\d*)$/);
  if (!match) return null;

  const [, startStr, endStr] = match;
  let start: number;
  let end: number;

  if (startStr === "" && endStr !== "") {
    // Suffix range: bytes=-500
    const suffixLength = parseInt(endStr, 10);
    if (isNaN(suffixLength) || suffixLength <= 0) return null;
    start = Math.max(0, fileSize - suffixLength);
    end = fileSize - 1;
  } else if (startStr !== "" && endStr === "") {
    // Open range: bytes=1000-
    start = parseInt(startStr, 10);
    end = fileSize - 1;
  } else if (startStr !== "" && endStr !== "") {
    // Explicit range: bytes=0-1048575
    start = parseInt(startStr, 10);
    end = parseInt(endStr, 10);
  } else {
    return null;
  }

  if (isNaN(start) || isNaN(end) || start < 0 || end >= fileSize || start > end) {
    return null;
  }

  return { start, end };
}

async function handleStream(
  request: NextRequest,
  context: RouteContext,
  isHeadMethod: boolean
): Promise<NextResponse> {
  try {
    const { id: rawId } = await context.params;
    const id = decodeURIComponent(rawId);

    // 1. Path resolution & Traversal Prevention
    const { filePath, isForbidden } = resolveRomFilePath(id);
    if (isForbidden) {
      return NextResponse.json({ error: "Access denied." }, { status: 403 });
    }
    if (!filePath || !fs.existsSync(/*turbopackIgnore: true*/ filePath)) {
      return NextResponse.json({ error: "ROM not found." }, { status: 404 });
    }

    const stat = fs.statSync(/*turbopackIgnore: true*/ filePath);
    if (!stat.isFile()) {
      return NextResponse.json({ error: "Invalid file target." }, { status: 404 });
    }

    // 2. Authentication & Authorization
    const headerUserId = request.headers.get("x-user-id");
    const headerRole = request.headers.get("x-user-role");

    let userId = headerUserId;
    let role = headerRole;

    if (!userId) {
      const session = await getCurrentSession();
      if (!session) {
        return NextResponse.json(
          { error: "Authentication required to access ROM stream." },
          { status: 401 }
        );
      }
      userId = session.user.id;
      role = session.user.role;
    }

    // Check daily download quota for non-admin users
    if (role !== "admin" && userId) {
      try {
        const profiles = await query<any>(
          `SELECT download_quota_daily, download_count_today, last_download_reset
           FROM user_profiles WHERE user_id = ? LIMIT 1`,
          [userId]
        );
        if (profiles.length > 0) {
          const p = profiles[0];
          const today = new Date().toISOString().slice(0, 10);
          const resetDate = p.last_download_reset
            ? new Date(p.last_download_reset).toISOString().slice(0, 10)
            : "";
          const count = resetDate === today ? (p.download_count_today || 0) : 0;
          const quota = p.download_quota_daily || 50;

          if (count >= quota) {
            return NextResponse.json(
              { error: `Daily download quota exceeded (${quota}/${quota}). Please try again tomorrow.` },
              { status: 429 }
            );
          }
        }
      } catch (quotaErr) {
        console.error("[api/roms/stream] Quota check error:", quotaErr);
      }
    }

    const fileSize = stat.size;
    const mimeType = getMimeType(filePath);
    const rangeHeader = request.headers.get("range");

    // 3. Byte-Range Processing
    if (!rangeHeader) {
      // 200 OK Full Stream
      const headers: Record<string, string> = {
        "Content-Type": mimeType,
        "Accept-Ranges": "bytes",
        "Content-Length": fileSize.toString(),
        "Cache-Control": "private, no-transform, max-age=86400",
        "Last-Modified": stat.mtime.toUTCString(),
      };

      if (isHeadMethod) {
        return new NextResponse(null, { status: 200, headers });
      }

      const nodeStream = fs.createReadStream(/*turbopackIgnore: true*/ filePath);
      const webStream = Readable.toWeb(nodeStream) as ReadableStream;
      return new NextResponse(webStream, { status: 200, headers });
    }

    // Process HTTP 206 Range
    const parsedRange = parseRangeHeader(rangeHeader, fileSize);
    if (!parsedRange) {
      return new NextResponse(null, {
        status: 416,
        headers: {
          "Content-Range": `bytes */${fileSize}`,
          "Accept-Ranges": "bytes",
        },
      });
    }

    const { start, end } = parsedRange;
    const chunkSize = end - start + 1;

    const headers: Record<string, string> = {
      "Content-Range": `bytes ${start}-${end}/${fileSize}`,
      "Accept-Ranges": "bytes",
      "Content-Length": chunkSize.toString(),
      "Content-Type": mimeType,
      "Cache-Control": "private, no-transform, max-age=86400",
      "Last-Modified": stat.mtime.toUTCString(),
    };

    if (isHeadMethod) {
      return new NextResponse(null, { status: 206, headers });
    }

    // Zero-stutter backpressure streaming
    const nodeStream = fs.createReadStream(/*turbopackIgnore: true*/ filePath, { start, end });
    const webStream = Readable.toWeb(nodeStream) as ReadableStream;

    return new NextResponse(webStream, {
      status: 206,
      headers,
    });
  } catch (error) {
    console.error("[api/roms/[id]/stream] Error streaming ROM:", error);
    return NextResponse.json(
      { error: "Internal server error while streaming ROM." },
      { status: 500 }
    );
  }
}

export async function GET(
  request: NextRequest,
  context: RouteContext
): Promise<NextResponse> {
  return handleStream(request, context, false);
}

export async function HEAD(
  request: NextRequest,
  context: RouteContext
): Promise<NextResponse> {
  return handleStream(request, context, true);
}
