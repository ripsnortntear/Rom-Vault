import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import fsp from "fs/promises";
import os from "os";
import path from "path";
import crypto from "crypto";
import { execFile } from "child_process";
import { promisify } from "util";
import { getCurrentSession } from "@/lib/auth/session";
import { getRomsDirectory, normalizeSystem } from "@/lib/paths";
import {
  submitAssetContribution,
  extractYoutubeVideoId,
  type ContributionCategory,
} from "@/lib/contributions";

const execFileAsync = promisify(execFile);

const ALLOWED_ASSET_TYPES = new Set<ContributionCategory>([
  "artwork_front",
  "artwork_3d",
  "screenshot",
  "screentitle",
  "logo",
  "medium",
  "video",
  "story",
]);

const CONTENT_TYPE_TO_EXT: Record<string, string> = {
  "image/png": ".png",
  "image/apng": ".png",
  "image/x-png": ".png",
  "image/jpeg": ".jpg",
  "image/jpg": ".jpg",
  "image/pjpeg": ".jpg",
  "image/jfif": ".jpg",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "image/avif": ".avif",
  "image/bmp": ".bmp",
  "image/x-ms-bmp": ".bmp",
  "image/x-bmp": ".bmp",
  "image/svg+xml": ".svg",
  "image/x-icon": ".ico",
  "image/vnd.microsoft.icon": ".ico",
  "image/ico": ".ico",
  "image/tiff": ".tiff",
  "image/x-tiff": ".tiff",
  "image/heic": ".heic",
  "image/heif": ".heif",
};

const EXT_NORMALIZATION_MAP: Record<string, string> = {
  ".png": ".png",
  ".apng": ".png",
  ".jpg": ".jpg",
  ".jpeg": ".jpg",
  ".jfif": ".jpg",
  ".pjpeg": ".jpg",
  ".pjp": ".jpg",
  ".webp": ".webp",
  ".gif": ".gif",
  ".avif": ".avif",
  ".bmp": ".bmp",
  ".dib": ".bmp",
  ".svg": ".svg",
  ".ico": ".ico",
  ".tif": ".tiff",
  ".tiff": ".tiff",
  ".heic": ".heic",
  ".heif": ".heif",
};

function detectImageExtension(
  buf: Buffer,
  fallbackName: string,
  contentTypeHeader?: string | null
): string | null {
  // 1. Magic byte signatures
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buf.length >= 8 &&
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47
  ) {
    return ".png";
  }

  // JPEG / JFIF / Exif: FF D8 FF
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return ".jpg";
  }

  // WebP: "RIFF" .... "WEBP"
  if (
    buf.length >= 12 &&
    buf.subarray(0, 4).toString("ascii") === "RIFF" &&
    buf.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return ".webp";
  }

  // GIF: "GIF87a" or "GIF89a"
  if (buf.length >= 6) {
    const gifSig = buf.subarray(0, 6).toString("ascii");
    if (gifSig === "GIF87a" || gifSig === "GIF89a") {
      return ".gif";
    }
  }

  // BMP: "BM" (42 4D)
  if (buf.length >= 6 && buf[0] === 0x42 && buf[1] === 0x4d) {
    return ".bmp";
  }

  // ICO: 00 00 01 00
  if (
    buf.length >= 4 &&
    buf[0] === 0x00 &&
    buf[1] === 0x00 &&
    buf[2] === 0x01 &&
    buf[3] === 0x00
  ) {
    return ".ico";
  }

  // TIFF: "II*\0" (49 49 2A 00) or "MM\0*" (4D 4D 00 2A)
  if (
    buf.length >= 4 &&
    ((buf[0] === 0x49 && buf[1] === 0x49 && buf[2] === 0x2a && buf[3] === 0x00) ||
      (buf[0] === 0x4d && buf[1] === 0x4d && buf[2] === 0x00 && buf[3] === 0x2a))
  ) {
    return ".tiff";
  }

  // ISO BMFF (AVIF / HEIC / HEIF): bytes 4..8 === "ftyp"
  if (buf.length >= 12 && buf.subarray(4, 8).toString("ascii") === "ftyp") {
    const brand = buf.subarray(8, 12).toString("ascii").toLowerCase();
    if (brand === "avif" || brand === "avis" || brand === "MA1B" || brand === "ma1b") {
      return ".avif";
    }
    if (
      brand === "heic" ||
      brand === "heix" ||
      brand === "hevc" ||
      brand === "mif1" ||
      brand === "msf1"
    ) {
      return ".heic";
    }
  }

  // SVG: XML/SVG text signature (only when no <script> tag is present)
  if (buf.length >= 5) {
    const headText = buf.subarray(0, Math.min(buf.length, 1024)).toString("utf-8").trim();
    if (
      (headText.startsWith("<svg") ||
        (headText.startsWith("<?xml") && headText.includes("<svg"))) &&
      !/<script\b/i.test(buf.toString("utf-8"))
    ) {
      return ".svg";
    }
  }

  // 2. HTTP Content-Type header fallback (handles extensionless CDN URLs)
  if (contentTypeHeader) {
    const cleanMime = contentTypeHeader.split(";")[0].trim().toLowerCase();
    if (CONTENT_TYPE_TO_EXT[cleanMime]) {
      return CONTENT_TYPE_TO_EXT[cleanMime];
    }
  }

  // 3. URL / Filename extension fallback
  const ext = path.extname(fallbackName).toLowerCase();
  if (EXT_NORMALIZATION_MAP[ext]) {
    return EXT_NORMALIZATION_MAP[ext];
  }

  return null;
}

/**
 * Transcodes legacy/non-browser-universal formats (.tiff, .heic, .heif, .bmp) to .png using ffmpeg when possible.
 */
async function normalizeImageBufferIfNeeded(
  buf: Buffer,
  ext: string
): Promise<{ buffer: Buffer; ext: string }> {
  if (ext !== ".tiff" && ext !== ".heic" && ext !== ".heif") {
    return { buffer: buf, ext };
  }

  const tmpToken = crypto.randomBytes(8).toString("hex");
  const tmpIn = path.join(os.tmpdir(), `romvault_in_${tmpToken}${ext}`);
  const tmpOut = path.join(os.tmpdir(), `romvault_out_${tmpToken}.png`);
  try {
    await fsp.writeFile(tmpIn, buf);
    await execFileAsync(
      "/usr/bin/ffmpeg",
      ["-y", "-i", tmpIn, "-frames:v", "1", tmpOut],
      { timeout: 15000 }
    );
    if (fs.existsSync(tmpOut)) {
      const converted = await fsp.readFile(tmpOut);
      if (converted.byteLength > 0) {
        return { buffer: converted, ext: ".png" };
      }
    }
  } catch {
    // Fall back to original buffer if conversion is unavailable
  } finally {
    await fsp.unlink(tmpIn).catch(() => {});
    await fsp.unlink(tmpOut).catch(() => {});
  }
  return { buffer: buf, ext };
}

function isSafeExternalImageUrl(rawUrl: string): URL | null {
  try {
    const parsed = new URL(rawUrl.trim());
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return null;
    }
    // Only standard web ports allowed
    if (parsed.port && parsed.port !== "80" && parsed.port !== "443") {
      return null;
    }
    const host = parsed.hostname.toLowerCase();
    if (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "0.0.0.0" ||
      host === "::1" ||
      host === "[::1]" ||
      host.endsWith(".local") ||
      host.endsWith(".internal") ||
      host.endsWith(".arpa") ||
      host.endsWith(".lan") ||
      host === "oldsmarchaos.com" ||
      host.endsWith(".oldsmarchaos.com") ||
      !host.includes(".") ||
      host.startsWith("[") ||
      host.includes(":") ||
      /^127\./.test(host) ||
      /^10\./.test(host) ||
      /^192\.168\./.test(host) ||
      /^169\.254\./.test(host) ||
      /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(host) ||
      /^172\.(1[6-9]|2\d|3[0-1])\./.test(host) ||
      /^192\.0\.2\./.test(host) ||
      /^198\.51\.100\./.test(host) ||
      /^203\.0\.113\./.test(host) ||
      /^(22[4-9]|2[3-5]\d)\./.test(host)
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getCurrentSession();
    if (!session?.user) {
      return NextResponse.json(
        { ok: false, error: "Please sign in to contribute assets to the vault." },
        { status: 401 }
      );
    }

    const formData = await request.formData();
    const rawSystem = String(formData.get("system") || "").trim();
    const rawBaseName = String(formData.get("baseName") || "").trim();
    const rawGameTitle = String(formData.get("gameTitle") || "").trim();
    const assetType = String(formData.get("assetType") || "").trim() as ContributionCategory;

    if (!rawSystem || !rawBaseName || !ALLOWED_ASSET_TYPES.has(assetType)) {
      return NextResponse.json(
        { ok: false, error: "Invalid system, game, or asset category." },
        { status: 400 }
      );
    }

    const system = normalizeSystem(rawSystem);
    if (
      !system ||
      !/^[a-zA-Z0-9_-]+$/.test(system) ||
      rawBaseName.includes("/") ||
      rawBaseName.includes("\\") ||
      rawBaseName.includes("..") ||
      rawBaseName === "."
    ) {
      return NextResponse.json(
        { ok: false, error: "Invalid path parameters." },
        { status: 400 }
      );
    }

    // Verify the ROM exists in the target system's roms directory
    const romsDir = getRomsDirectory(system);
    if (!fs.existsSync(romsDir)) {
      return NextResponse.json(
        { ok: false, error: `System directory for '${system}' not found.` },
        { status: 404 }
      );
    }

    const romEntries = fs.readdirSync(romsDir);
    const matchingRom = romEntries.find((entry) => {
      const lower = entry.toLowerCase();
      if (
        lower.startsWith(".") ||
        lower.startsWith("gamelist") ||
        lower.includes(".bak") ||
        lower.endsWith(".old")
      ) {
        return false;
      }
      const extIdx = entry.lastIndexOf(".");
      const entryBase = extIdx > 0 ? entry.slice(0, extIdx) : entry;
      return entryBase.toLowerCase() === rawBaseName.toLowerCase();
    });

    if (!matchingRom) {
      return NextResponse.json(
        { ok: false, error: `ROM '${rawBaseName}' was not found in ${system.toUpperCase()}.` },
        { status: 404 }
      );
    }

    const canonicalBaseName =
      matchingRom.lastIndexOf(".") > 0
        ? matchingRom.slice(0, matchingRom.lastIndexOf("."))
        : matchingRom;

    const gameTitle = rawGameTitle || canonicalBaseName;

    // 1. Handle Story / Overview text contribution (staged for admin review)
    if (assetType === "story") {
      let storyText = String(formData.get("storyText") || "").trim();
      const uploadedFile = formData.get("file");
      if (!storyText && uploadedFile && typeof uploadedFile === "object" && "arrayBuffer" in uploadedFile) {
        const buf = Buffer.from(await (uploadedFile as File).arrayBuffer());
        if (buf.byteLength > 64 * 1024) {
          return NextResponse.json(
            { ok: false, error: "Story text file exceeds 64 KB limit." },
            { status: 400 }
          );
        }
        storyText = buf.toString("utf-8").trim();
      }

      if (!storyText || storyText.length < 10) {
        return NextResponse.json(
          { ok: false, error: "Please provide a game description of at least 10 characters." },
          { status: 400 }
        );
      }

      if (storyText.length > 32000) {
        storyText = storyText.slice(0, 32000);
      }

      const submission = await submitAssetContribution({
        userId: String(session.user.id),
        username: String(session.user.username),
        displayName: session.user.displayName ? String(session.user.displayName) : null,
        system,
        baseName: canonicalBaseName,
        gameTitle,
        category: "story",
        fileExt: ".txt",
        storyText,
      });

      return NextResponse.json({
        ok: true,
        status: "pending",
        submission,
        assetType,
        points: submission.points,
        contributor: session.user.displayName || session.user.username,
      });
    }

    // 2. Handle Gameplay Video contribution — ONLY ACCEPT YOUTUBE LINKS
    if (assetType === "video") {
      const youtubeUrl = String(formData.get("youtubeUrl") || formData.get("mediaUrl") || "").trim();
      if (!youtubeUrl) {
        return NextResponse.json(
          {
            ok: false,
            error: "Please enter a YouTube link (only YouTube links are accepted for gameplay videos).",
          },
          { status: 400 }
        );
      }

      const youtubeId = extractYoutubeVideoId(youtubeUrl);
      if (!youtubeId) {
        return NextResponse.json(
          {
            ok: false,
            error:
              "Invalid video link. Only YouTube links (youtube.com/watch?v=... or youtu.be/...) are accepted for gameplay videos.",
          },
          { status: 400 }
        );
      }

      const canonicalYoutubeUrl = `https://www.youtube.com/watch?v=${youtubeId}`;

      const submission = await submitAssetContribution({
        userId: String(session.user.id),
        username: String(session.user.username),
        displayName: session.user.displayName ? String(session.user.displayName) : null,
        system,
        baseName: canonicalBaseName,
        gameTitle,
        category: "video",
        fileExt: ".mp4",
        sourceUrl: canonicalYoutubeUrl,
      });

      return NextResponse.json({
        ok: true,
        status: "pending",
        submission,
        assetType,
        points: submission.points,
        contributor: session.user.displayName || session.user.username,
      });
    }

    // 3. Handle Image asset contribution (File upload OR Image URL)
    const imageUrl = String(formData.get("imageUrl") || formData.get("mediaUrl") || "").trim();
    const fileField = formData.get("file");

    let buffer: Buffer | null = null;
    let fallbackName = "";
    let sourceUrl: string | null = null;
    let fetchedContentType: string | null = null;

    if (imageUrl) {
      const safeUrl = isSafeExternalImageUrl(imageUrl);
      if (!safeUrl) {
        return NextResponse.json(
          { ok: false, error: "Please provide a valid public http:// or https:// image URL." },
          { status: 400 }
        );
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      try {
        const res = await fetch(safeUrl.toString(), {
          signal: controller.signal,
          redirect: "error",
          headers: {
            "User-Agent": "ROMVault-AssetFetcher/1.0",
            Accept:
              "image/avif,image/webp,image/png,image/jpeg,image/gif,image/svg+xml,image/bmp,image/*;q=0.8,*/*;q=0.5",
          },
        });
        if (!res.ok) {
          return NextResponse.json(
            { ok: false, error: `Failed to fetch image from URL (HTTP ${res.status}).` },
            { status: 400 }
          );
        }
        const contentLength = Number(res.headers.get("content-length"));
        if (contentLength && contentLength > 15 * 1024 * 1024) {
          return NextResponse.json(
            { ok: false, error: "Image file exceeds 15 MB limit." },
            { status: 400 }
          );
        }
        fetchedContentType = res.headers.get("content-type");
        const arrayBuf = await res.arrayBuffer();
        buffer = Buffer.from(arrayBuf);
        fallbackName = safeUrl.pathname;
        sourceUrl = safeUrl.toString();
      } catch (err: any) {
        return NextResponse.json(
          { ok: false, error: `Could not download image from URL: ${err?.message || "timeout"}` },
          { status: 400 }
        );
      } finally {
        clearTimeout(timeout);
      }
    } else if (fileField && typeof fileField === "object" && "arrayBuffer" in fileField) {
      const fileObj = fileField as File;
      buffer = Buffer.from(await fileObj.arrayBuffer());
      fallbackName = fileObj.name;
      fetchedContentType = fileObj.type || null;
    } else {
      return NextResponse.json(
        { ok: false, error: "Please upload an image file or enter a direct image URL." },
        { status: 400 }
      );
    }

    if (!buffer || buffer.byteLength === 0) {
      return NextResponse.json(
        { ok: false, error: "Image is empty." },
        { status: 400 }
      );
    }

    if (buffer.byteLength > 15 * 1024 * 1024) {
      return NextResponse.json(
        { ok: false, error: "Image file must be under 15 MB." },
        { status: 400 }
      );
    }

    const detectedExt = detectImageExtension(buffer, fallbackName, fetchedContentType);
    if (!detectedExt) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Unsupported or invalid image format. Supported formats include PNG, JPG/JPEG/JFIF, WEBP, GIF, AVIF, SVG, BMP, ICO, TIFF, and HEIC.",
        },
        { status: 400 }
      );
    }

    const normalized = await normalizeImageBufferIfNeeded(buffer, detectedExt);
    buffer = normalized.buffer;
    const ext = normalized.ext;

    const submission = await submitAssetContribution({
      userId: String(session.user.id),
      username: String(session.user.username),
      displayName: session.user.displayName ? String(session.user.displayName) : null,
      system,
      baseName: canonicalBaseName,
      gameTitle,
      category: assetType,
      fileExt: ext,
      buffer,
      sourceUrl,
    });

    return NextResponse.json({
      ok: true,
      status: "pending",
      submission,
      assetType,
      points: submission.points,
      contributor: session.user.displayName || session.user.username,
    });
  } catch (error) {
    console.error("[contribute/upload] Error processing contribution:", error);
    return NextResponse.json(
      { ok: false, error: "Internal server error while staging asset contribution." },
      { status: 500 }
    );
  }
}
