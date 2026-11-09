import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { getCurrentSession } from "@/lib/auth/session";
import { getRomsDirectory, normalizeSystem } from "@/lib/paths";
import {
  submitAssetContribution,
  type ContributionCategory,
} from "@/lib/contributions";

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

function detectImageExtension(buf: Buffer, fallbackName: string): string | null {
  if (
    buf.length >= 8 &&
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47
  ) {
    return ".png";
  }
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return ".jpg";
  }
  if (
    buf.length >= 12 &&
    buf.subarray(0, 4).toString("ascii") === "RIFF" &&
    buf.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return ".webp";
  }
  const ext = path.extname(fallbackName).toLowerCase();
  if (ext === ".png" || ext === ".jpg" || ext === ".jpeg" || ext === ".webp") {
    return ext === ".jpeg" ? ".jpg" : ext;
  }
  return null;
}

function isMp4Buffer(buf: Buffer, fallbackName: string): boolean {
  if (buf.length >= 12 && buf.subarray(4, 8).toString("ascii") === "ftyp") {
    return true;
  }
  return path.extname(fallbackName).toLowerCase() === ".mp4";
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
      if (lower.startsWith(".") || lower.startsWith("gamelist") || lower.includes(".bak") || lower.endsWith(".old")) {
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

    // Handle Story / Overview text contribution (staged for admin review)
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

    // Handle Binary Image / Video upload (staged for admin review)
    const fileField = formData.get("file");
    if (!fileField || typeof fileField !== "object" || !("arrayBuffer" in fileField)) {
      return NextResponse.json(
        { ok: false, error: "No file uploaded." },
        { status: 400 }
      );
    }

    const fileObj = fileField as File;
    const buffer = Buffer.from(await fileObj.arrayBuffer());

    if (buffer.byteLength === 0) {
      return NextResponse.json(
        { ok: false, error: "Uploaded file is empty." },
        { status: 400 }
      );
    }

    if (assetType === "video") {
      if (buffer.byteLength > 65 * 1024 * 1024) {
        return NextResponse.json(
          { ok: false, error: "Gameplay video must be under 65 MB." },
          { status: 400 }
        );
      }
      if (!isMp4Buffer(buffer, fileObj.name)) {
        return NextResponse.json(
          { ok: false, error: "Gameplay video must be a valid .mp4 file." },
          { status: 400 }
        );
      }

      const submission = await submitAssetContribution({
        userId: String(session.user.id),
        username: String(session.user.username),
        displayName: session.user.displayName ? String(session.user.displayName) : null,
        system,
        baseName: canonicalBaseName,
        gameTitle,
        category: "video",
        fileExt: ".mp4",
        buffer,
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

    // Image asset types
    if (buffer.byteLength > 15 * 1024 * 1024) {
      return NextResponse.json(
        { ok: false, error: "Image file must be under 15 MB." },
        { status: 400 }
      );
    }

    const ext = detectImageExtension(buffer, fileObj.name);
    if (!ext) {
      return NextResponse.json(
        { ok: false, error: "Unsupported image format. Please upload PNG, JPG, or WEBP." },
        { status: 400 }
      );
    }

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
