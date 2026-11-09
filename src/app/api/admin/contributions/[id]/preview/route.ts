import "server-only";

import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { NextResponse, type NextRequest } from "next/server";
import { getCurrentSession } from "@/lib/auth/session";
import {
  getContributionById,
  getContributionsStagingDir,
  resolveTargetDirectory,
} from "@/lib/contributions";

const MIME_BY_EXT: Record<string, string> = {
  ".png": "image/png",
  ".apng": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".jfif": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".avif": "image/avif",
  ".bmp": "image/bmp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".tiff": "image/tiff",
  ".tif": "image/tiff",
  ".mp4": "video/mp4",
  ".txt": "text/plain; charset=utf-8",
};

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const isProxyAuthorized =
      request.headers.get("x-admin-authorized") === "true" ||
      request.headers.get("x-user-role") === "admin";
    if (!isProxyAuthorized) {
      const session = await getCurrentSession();
      if (!session?.user || session.user.role !== "admin") {
        return NextResponse.json({ error: "Admin access required." }, { status: 403 });
      }
    }

    const { id } = await context.params;
    const submissionId = Number(id);
    if (!Number.isFinite(submissionId) || submissionId <= 0) {
      return NextResponse.json({ error: "Invalid submission ID." }, { status: 400 });
    }

    const item = await getContributionById(submissionId);
    if (!item || !item.stagedFilename) {
      return NextResponse.json({ error: "Staged preview not found." }, { status: 404 });
    }

    const stagingDir = getContributionsStagingDir();
    const safeFilename = path.basename(item.stagedFilename);
    let filePath = `${stagingDir}/${safeFilename}`;

    // If the staged file was already promoted to the live artwork folder on approval, fall back to live file
    if (!fs.existsSync(filePath) && item.status === "approved" && item.category !== "story") {
      const targetDir = resolveTargetDirectory(item.system, item.category);
      const safeExt = item.fileExt.startsWith(".") ? item.fileExt : `.${item.fileExt}`;
      const livePath = `${targetDir}/${path.basename(item.baseName)}${safeExt}`;
      if (fs.existsSync(livePath)) {
        filePath = livePath;
      }
    }

    if (!fs.existsSync(filePath)) {
      return NextResponse.json({ error: "Staged file no longer exists on disk." }, { status: 404 });
    }

    const stat = await fsp.stat(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_BY_EXT[ext] || "application/octet-stream";

    // Support HTTP Range requests for video scrubbing in the Admin Moderation player
    const rangeHeader = request.headers.get("range");
    if (rangeHeader && ext === ".mp4") {
      const match = rangeHeader.match(/bytes=(\d*)-(\d*)/);
      if (match) {
        const start = match[1] ? parseInt(match[1], 10) : 0;
        const end = match[2] ? parseInt(match[2], 10) : stat.size - 1;
        const clampedEnd = Math.min(end, stat.size - 1);
        if (start >= 0 && start <= clampedEnd) {
          const chunkSize = clampedEnd - start + 1;
          const fh = await fsp.open(filePath, "r");
          try {
            const buf = Buffer.alloc(chunkSize);
            await fh.read(buf, 0, chunkSize, start);
            return new NextResponse(buf, {
              status: 206,
              headers: {
                "Content-Type": contentType,
                "Content-Length": String(chunkSize),
                "Content-Range": `bytes ${start}-${clampedEnd}/${stat.size}`,
                "Accept-Ranges": "bytes",
                "Cache-Control": "private, no-store",
              },
            });
          } finally {
            await fh.close();
          }
        }
      }
    }

    const buffer = await fsp.readFile(filePath);
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(buffer.length),
        "Accept-Ranges": "bytes",
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    console.error("[admin/contributions/preview] Error:", err);
    return NextResponse.json({ error: "Failed to stream staged preview." }, { status: 500 });
  }
}
