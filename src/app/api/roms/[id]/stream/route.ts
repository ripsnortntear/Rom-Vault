import "server-only";

import fs from "fs";
import path from "path";
import { Readable } from "stream";
import { NextRequest, NextResponse } from "next/server";
import { normalizeSystem } from "@/lib/paths";
import { getCurrentSession } from "@/lib/auth/session";
import { query } from "@/lib/db";

interface RouteContext {
  params: Promise<{
    id: string;
  }>;
}

const STORAGE_ROOT = path.resolve("/mnt/storage/roms");

const CORS_STREAM_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
  "Access-Control-Allow-Headers": "Range, Content-Range, Content-Type, Accept-Ranges, If-Range, Authorization",
  "Access-Control-Expose-Headers": "Content-Range, Content-Length, Accept-Ranges",
  "Cross-Origin-Resource-Policy": "cross-origin",
};

export async function OPTIONS(): Promise<NextResponse> {
  return new NextResponse(null, {
    status: 204,
    headers: CORS_STREAM_HEADERS,
  });
}

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

function resolveRomFilePath(
  id: string,
  fileParam?: string | null,
  discParam?: string | null,
  systemParam?: string | null
): { filePath: string | null; isForbidden: boolean } {
  // Path traversal check
  if (
    id.includes("..") ||
    id.includes("/../") ||
    id.includes("\\..\\") ||
    (fileParam && (fileParam.includes("..") || fileParam.includes("/../") || fileParam.includes("\\..\\")))
  ) {
    return { filePath: null, isForbidden: true };
  }

  let targetSystem: string | null = systemParam ? normalizeSystem(systemParam) : null;
  let baseName = id;

  if (id.includes("__")) {
    const parts = id.split("__");
    targetSystem = normalizeSystem(parts[0]);
    baseName = decodeURIComponent(parts.slice(1).join("__"));
  }

  const systemsToCheck = targetSystem
    ? [targetSystem]
    : [
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

  // Strategy 1: Explicit fileParam resolution
  if (fileParam) {
    const cleanFile = path.basename(fileParam);
    for (const sys of systemsToCheck) {
      const romsDir = path.join(STORAGE_ROOT, sys, "roms");
      if (!fs.existsSync(romsDir)) continue;

      const directCandidate = path.resolve(romsDir, cleanFile);
      if (
        directCandidate.startsWith(STORAGE_ROOT + path.sep) &&
        fs.existsSync(/*turbopackIgnore: true*/ directCandidate)
      ) {
        return { filePath: directCandidate, isForbidden: false };
      }

      // Check case-insensitive or without-ext match
      try {
        const entries = fs.readdirSync(romsDir);
        const match = entries.find(
          (e) =>
            e.toLowerCase() === cleanFile.toLowerCase() ||
            e.replace(/\.[^.]+$/, "").toLowerCase() === cleanFile.replace(/\.[^.]+$/, "").toLowerCase()
        );
        if (match) {
          const candidate = path.resolve(romsDir, match);
          if (candidate.startsWith(STORAGE_ROOT + path.sep)) {
            return { filePath: candidate, isForbidden: false };
          }
        }
      } catch {}
    }
  }

  // Strategy 2: Exact baseName or filename match
  for (const sys of systemsToCheck) {
    const romsDir = path.join(STORAGE_ROOT, sys, "roms");
    if (!fs.existsSync(romsDir)) continue;

    try {
      const entries = fs.readdirSync(romsDir);

      // Disc-specific match if discParam is provided (e.g. disc=2)
      if (discParam) {
        const discNum = parseInt(discParam, 10);
        const discMatch = entries.find((e) => {
          const lower = e.toLowerCase();
          const baseNoExt = e.replace(/\.[^.]+$/, "");
          const isDiscTarget =
            lower.includes(`disc ${discNum}`) ||
            lower.includes(`disc ${discParam}`) ||
            lower.includes(`disc ${discNum < 10 ? `0${discNum}` : discNum}`) ||
            lower.includes(`disk ${discNum}`);
          return (
            (e === baseName || baseNoExt.startsWith(baseName.replace(/\s*\([^)]*disc[^)]*\)/gi, "").trim())) &&
            isDiscTarget
          );
        });
        if (discMatch) {
          const candidate = path.resolve(romsDir, discMatch);
          if (candidate.startsWith(STORAGE_ROOT + path.sep)) {
            return { filePath: candidate, isForbidden: false };
          }
        }
      }

      // Exact or withoutExt match
      const match = entries.find((e) => {
        const withoutExt = e.replace(/\.[^.]+$/, "");
        return e === baseName || withoutExt === baseName;
      });
      if (match) {
        const candidate = path.resolve(romsDir, match);
        const stat = fs.statSync(/*turbopackIgnore: true*/ candidate);
        if (stat.isDirectory()) {
          const subEntries = fs.readdirSync(candidate);
          const subMatch =
            subEntries.find((s) => {
              const subLower = s.toLowerCase();
              return (
                (subLower.endsWith(".chd") ||
                  subLower.endsWith(".iso") ||
                  subLower.endsWith(".bin") ||
                  subLower.endsWith(".cue")) &&
                (subLower.includes("disc 1") || subLower.includes("disc 01") || !subLower.includes("disc"))
              );
            }) || subEntries[0];
          if (subMatch) {
            const subCandidate = path.resolve(candidate, subMatch);
            if (subCandidate.startsWith(STORAGE_ROOT + path.sep)) {
              return { filePath: subCandidate, isForbidden: false };
            }
          }
        } else if (candidate.startsWith(STORAGE_ROOT + path.sep)) {
          return { filePath: candidate, isForbidden: false };
        }
      }

      // Strategy 3: M3U playlist file resolution
      const m3uEntry = entries.find((e) => {
        const lower = e.toLowerCase();
        return (
          (e === `${baseName}.m3u` || e.replace(/\.m3u$/i, "") === baseName) &&
          lower.endsWith(".m3u")
        );
      });
      if (m3uEntry) {
        const m3uPath = path.resolve(romsDir, m3uEntry);
        try {
          const content = fs.readFileSync(m3uPath, "utf-8");
          const lines = content
            .split(/\r?\n/)
            .map((l) => l.trim())
            .filter((l) => l && !l.startsWith("#"));
          if (lines.length > 0) {
            const discIndex = discParam ? Math.max(0, parseInt(discParam, 10) - 1) : 0;
            const targetLine = lines[discIndex] || lines[0];
            const m3uTarget = path.resolve(romsDir, targetLine);
            if (
              m3uTarget.startsWith(STORAGE_ROOT + path.sep) &&
              fs.existsSync(/*turbopackIgnore: true*/ m3uTarget)
            ) {
              return { filePath: m3uTarget, isForbidden: false };
            }
          }
        } catch {}
      }

      // Strategy 4: Multi-disc Disc 1 fallback for unified game titles (e.g. "Final Fantasy VII (USA)")
      const cleanBase = baseName.replace(/[\s\(\[]+(?:disc|disk)\s*[^)\]]*[)\]]+/gi, "").trim().toLowerCase();
      const disc1Match = entries.find((e) => {
        const lower = e.toLowerCase();
        const baseNoExt = lower.replace(/\.[^.]+$/, "");
        const cleanEntryBase = baseNoExt.replace(/[\s\(\[]+(?:disc|disk)\s*[^)\]]*[)\]]+/gi, "").trim();
        const isDisc1 =
          lower.includes("disc 1") ||
          lower.includes("disc 01") ||
          lower.includes("disc i") ||
          lower.includes("disc a") ||
          lower.includes("disk 1");
        return (cleanEntryBase === cleanBase || cleanEntryBase.startsWith(cleanBase)) && isDisc1;
      });
      if (disc1Match) {
        const candidate = path.resolve(romsDir, disc1Match);
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
    const fileParam = request.nextUrl.searchParams.get("file");
    const discParam = request.nextUrl.searchParams.get("disc");
    const systemParam = request.nextUrl.searchParams.get("system");

    // 1. Path resolution & Traversal Prevention
    const { filePath, isForbidden } = resolveRomFilePath(id, fileParam, discParam, systemParam);
    if (isForbidden) {
      return NextResponse.json({ error: "Access denied." }, { status: 403, headers: CORS_STREAM_HEADERS });
    }
    if (!filePath || !fs.existsSync(/*turbopackIgnore: true*/ filePath)) {
      return NextResponse.json({ error: "ROM not found." }, { status: 404, headers: CORS_STREAM_HEADERS });
    }

    const stat = fs.statSync(/*turbopackIgnore: true*/ filePath);
    if (!stat.isFile()) {
      return NextResponse.json({ error: "Invalid file target." }, { status: 404, headers: CORS_STREAM_HEADERS });
    }

    // 2. Authentication & Authorization (Resolve strictly from signed session)
    const session = await getCurrentSession();
    if (!session || !session.user) {
      return NextResponse.json(
        { error: "Authentication required to access ROM stream." },
        { status: 401, headers: CORS_STREAM_HEADERS }
      );
    }

    const userId = session.user.id;
    const role = session.user.role;

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
              { status: 429, headers: CORS_STREAM_HEADERS }
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
        ...CORS_STREAM_HEADERS,
        "Content-Type": mimeType,
        "Accept-Ranges": "bytes",
        "Content-Length": fileSize.toString(),
        "Cache-Control": "public, max-age=31536000, immutable",
        "X-Accel-Buffering": "no",
        "Last-Modified": stat.mtime.toUTCString(),
      };

      if (isHeadMethod) {
        return new NextResponse(null, { status: 200, headers });
      }

      const nodeStream = fs.createReadStream(/*turbopackIgnore: true*/ filePath, {
        highWaterMark: 1024 * 1024 * 2,
      });
      const webStream = Readable.toWeb(nodeStream) as ReadableStream;
      return new NextResponse(webStream, { status: 200, headers });
    }

    // Process HTTP 206 Range
    const parsedRange = parseRangeHeader(rangeHeader, fileSize);
    if (!parsedRange) {
      return new NextResponse(null, {
        status: 416,
        headers: {
          ...CORS_STREAM_HEADERS,
          "Content-Range": `bytes */${fileSize}`,
          "Accept-Ranges": "bytes",
        },
      });
    }

    const { start, end } = parsedRange;
    const chunkSize = end - start + 1;

    const headers: Record<string, string> = {
      ...CORS_STREAM_HEADERS,
      "Content-Range": `bytes ${start}-${end}/${fileSize}`,
      "Accept-Ranges": "bytes",
      "Content-Length": chunkSize.toString(),
      "Content-Type": mimeType,
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Accel-Buffering": "no",
      "Last-Modified": stat.mtime.toUTCString(),
    };

    if (isHeadMethod) {
      return new NextResponse(null, { status: 206, headers });
    }

    // Zero-stutter backpressure streaming with high throughput 2MB buffer
    const nodeStream = fs.createReadStream(/*turbopackIgnore: true*/ filePath, {
      start,
      end,
      highWaterMark: 1024 * 1024 * 2,
    });
    const webStream = Readable.toWeb(nodeStream) as ReadableStream;

    return new NextResponse(webStream, {
      status: 206,
      headers,
    });
  } catch (error) {
    console.error("[api/roms/[id]/stream] Error streaming ROM:", error);
    return NextResponse.json(
      { error: "Internal server error while streaming ROM." },
      { status: 500, headers: CORS_STREAM_HEADERS }
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
