import fs from "fs";
import path from "path";
import { Readable } from "stream";
import { NextRequest, NextResponse } from "next/server";
import {
  isValidMediaCategory,
  normalizeSystem,
  resolveSafeMediaPath,
  getStorageRoot,
} from "@/lib/paths";
import { getCurrentSession } from "@/lib/auth/session";
import { query, execute } from "@/lib/db";

interface RouteContext {
  params: Promise<{
    category: string;
    fileName: string;
  }>;
}

function getMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case ".png":
    case ".apng":
      return "image/png";
    case ".jpg":
    case ".jpeg":
    case ".jfif":
      return "image/jpeg";
    case ".webp":
      return "image/webp";
    case ".gif":
      return "image/gif";
    case ".avif":
      return "image/avif";
    case ".bmp":
      return "image/bmp";
    case ".svg":
      return "image/svg+xml";
    case ".ico":
      return "image/x-icon";
    case ".tif":
    case ".tiff":
      return "image/tiff";
    case ".mp4":
      return "video/mp4";
    case ".txt":
      return "text/plain; charset=utf-8";
    case ".zip":
      return "application/zip";
    case ".chd":
    case ".rvz":
    case ".iso":
    case ".bin":
    case ".nes":
    case ".sfc":
    case ".z64":
    case ".gba":
    case ".gb":
    case ".gbc":
      return "application/octet-stream";
    default:
      return "application/octet-stream";
  }
}

function safeDecode(val: string): string {
  try {
    return decodeURIComponent(val);
  } catch {
    return val;
  }
}

export async function GET(
  request: NextRequest,
  context: RouteContext
): Promise<NextResponse> {
  try {
    const resolvedParams = await context.params;
    const rawCategory = safeDecode(resolvedParams.category);
    const rawFileName = safeDecode(resolvedParams.fileName);
    const system = normalizeSystem(request.nextUrl.searchParams.get("system"));

    if (!isValidMediaCategory(rawCategory)) {
      return NextResponse.json({ error: "Invalid media category" }, { status: 400 });
    }

    const filePath = resolveSafeMediaPath(rawCategory, rawFileName, system);
    if (!filePath || !fs.existsSync(filePath)) {
      return NextResponse.json({ error: "Media file not found" }, { status: 404 });
    }

    // Verify confinement strictly within storage root
    const STORAGE_ROOT = getStorageRoot();
    const resolvedPath = path.resolve(filePath);
    if (!resolvedPath.startsWith(STORAGE_ROOT + path.sep)) {
      return NextResponse.json({ error: "Access denied." }, { status: 403 });
    }

    const stat = fs.statSync(filePath);
    if (!stat.isFile()) {
      return NextResponse.json({ error: "Not a valid file" }, { status: 404 });
    }

    const fileSize = stat.size;
    const mimeType = getMimeType(filePath);
    const rangeHeader = request.headers.get("range");
    const isDownload = request.nextUrl.searchParams.get("download") === "1";

    // Enforce strict authentication and daily quota limits for ROM binaries
    if (rawCategory.toLowerCase() === "roms") {
      const session = await getCurrentSession();
      if (!session?.user) {
        return NextResponse.json(
          { error: "Authentication required to access ROM assets." },
          { status: 401 }
        );
      }

      if (session.user.role !== "admin") {
        try {
          const profiles = await query<any>(
            `SELECT download_quota_daily, download_count_today, last_download_reset
             FROM user_profiles WHERE user_id = ? LIMIT 1`,
            [session.user.id]
          );
          if (profiles.length > 0) {
            const p = profiles[0];
            const today = new Date().toISOString().slice(0, 10);
            const resetDate = p.last_download_reset
              ? new Date(p.last_download_reset).toISOString().slice(0, 10)
              : "";
            const currentCount = resetDate === today ? (p.download_count_today || 0) : 0;
            const quota = p.download_quota_daily || 50;

            if (currentCount >= quota) {
              return NextResponse.json(
                { error: `Daily download quota exceeded (${quota}/${quota}). Please try again tomorrow.` },
                { status: 429 }
              );
            }

            // Increment quota on full download or initial range stream
            if (isDownload || !rangeHeader || rangeHeader.startsWith("bytes=0-")) {
              await execute(
                `UPDATE user_profiles 
                 SET download_count_today = ?, last_download_reset = CURDATE()
                 WHERE user_id = ?`,
                [currentCount + 1, session.user.id]
              );
            }
          }
        } catch (err) {
          console.error("[api/media] Error checking download quota:", err);
        }
      }
    }

    const commonHeaders: Record<string, string> = {
      "Content-Type": mimeType,
      "Accept-Ranges": "bytes",
      "Cache-Control": "public, max-age=3600, must-revalidate",
      "Last-Modified": stat.mtime.toUTCString(),
    };

    if (isDownload) {
      const safeDownloadName = path.basename(filePath).replace(/"/g, "");
      commonHeaders["Content-Disposition"] = `attachment; filename="${safeDownloadName}"`;
    }

    if (rangeHeader) {
      const parts = rangeHeader.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

      if (isNaN(start) || isNaN(end) || start >= fileSize || end >= fileSize || start > end) {
        return new NextResponse(null, {
          status: 416,
          headers: {
            "Content-Range": `bytes */${fileSize}`,
          },
        });
      }

      const chunkSize = end - start + 1;
      const nodeStream = fs.createReadStream(filePath, { start, end });
      const webStream = Readable.toWeb(nodeStream) as ReadableStream;

      return new NextResponse(webStream, {
        status: 206,
        headers: {
          ...commonHeaders,
          "Content-Range": `bytes ${start}-${end}/${fileSize}`,
          "Content-Length": chunkSize.toString(),
        },
      });
    }

    const nodeStream = fs.createReadStream(filePath);
    const webStream = Readable.toWeb(nodeStream) as ReadableStream;

    return new NextResponse(webStream, {
      status: 200,
      headers: {
        ...commonHeaders,
        "Content-Length": fileSize.toString(),
      },
    });
  } catch (error) {
    console.error("[api/media] Error serving local media:", error);
    return NextResponse.json(
      { error: "Internal server error serving media" },
      { status: 500 }
    );
  }
}
