import fs from "fs";
import zlib from "zlib";
import { resolveSafeMediaPath } from "@/lib/paths";
import { getSystemMeta } from "@/lib/systems";

const VALID_ROM_EXTENSIONS = [
  ".nes",
  ".sfc",
  ".smc",
  ".fig",
  ".swc",
  ".z64",
  ".n64",
  ".v64",
  ".gba",
  ".gb",
  ".gbc",
  ".sgb",
  ".md",
  ".gen",
  ".smd",
  ".32x",
  ".sms",
  ".gg",
  ".bin",
  ".chd",
  ".iso",
  ".rvz",
  ".cue",
  ".img",
  ".pbp",
  ".cso",
];

/**
 * Extracts the uncompressed ROM buffer from a .zip file
 * using the ZIP Central Directory and Node's built-in zlib.inflateRawSync.
 */
export function extractNesFromZip(
  zipFileName: string,
  system = "nes"
): Buffer | null {
  try {
    let zipPath = resolveSafeMediaPath("roms", zipFileName, system);
    if (!zipPath || !fs.existsSync(zipPath)) {
      const stripped = zipFileName.replace(/\.[a-z0-9]+$/i, "");
      const altZip = `${stripped}.zip`;
      const altPath = resolveSafeMediaPath("roms", altZip, system);
      if (altPath && fs.existsSync(altPath)) {
        zipPath = altPath;
        zipFileName = altZip;
      } else {
        return null;
      }
    }

    // If already an uncompressed ROM file (e.g. .chd, .rvz, etc.) and not .zip,
    // only read into memory if reasonably sized (< 256MB)
    if (!zipFileName.toLowerCase().endsWith(".zip")) {
      const stat = fs.statSync(zipPath);
      if (stat.size > 256 * 1024 * 1024) {
        return null; // Streamed via media route instead of buffering in memory
      }
      return fs.readFileSync(zipPath);
    }

    const buf = fs.readFileSync(zipPath);

    // Locate End of Central Directory (EOCD) signature: 0x06054b50
    let eocdOffset = -1;
    for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
      if (buf.readUInt32LE(i) === 0x06054b50) {
        eocdOffset = i;
        break;
      }
    }

    if (eocdOffset === -1) {
      return null;
    }

    const totalEntries = buf.readUInt16LE(eocdOffset + 10);
    let cdOffset = buf.readUInt32LE(eocdOffset + 16);

    for (let entryIdx = 0; entryIdx < totalEntries; entryIdx++) {
      if (cdOffset + 46 > buf.length || buf.readUInt32LE(cdOffset) !== 0x02014b50) {
        break;
      }

      const compressionMethod = buf.readUInt16LE(cdOffset + 10);
      const compressedSize = buf.readUInt32LE(cdOffset + 20);
      const cdFileNameLen = buf.readUInt16LE(cdOffset + 28);
      const cdExtraLen = buf.readUInt16LE(cdOffset + 30);
      const cdCommentLen = buf.readUInt16LE(cdOffset + 32);
      const localHeaderOffset = buf.readUInt32LE(cdOffset + 42);

      const entryName = buf
        .subarray(cdOffset + 46, cdOffset + 46 + cdFileNameLen)
        .toString("utf8");

      cdOffset += 46 + cdFileNameLen + cdExtraLen + cdCommentLen;

      const lowerEntry = entryName.toLowerCase();
      const isRomEntry = VALID_ROM_EXTENSIONS.some((ext) => lowerEntry.endsWith(ext));
      if (!isRomEntry && totalEntries > 1) {
        continue;
      }

      if (
        localHeaderOffset + 30 > buf.length ||
        buf.readUInt32LE(localHeaderOffset) !== 0x04034b50
      ) {
        return null;
      }

      const lfhFileNameLen = buf.readUInt16LE(localHeaderOffset + 26);
      const lfhExtraLen = buf.readUInt16LE(localHeaderOffset + 28);
      const dataStart = localHeaderOffset + 30 + lfhFileNameLen + lfhExtraLen;
      const compressedSlice = buf.subarray(dataStart, dataStart + compressedSize);

      if (compressionMethod === 0) {
        return Buffer.from(compressedSlice);
      }
      if (compressionMethod === 8) {
        return zlib.inflateRawSync(compressedSlice);
      }
    }

    return null;
  } catch (error) {
    console.error("[nesExtractor] Failed to extract ROM from zip:", {
      zipFileName,
      system,
      error,
    });
    return null;
  }
}

export function toCleanNesSlug(
  baseName: string,
  system = "nes"
): string {
  const cleaned = baseName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const meta = getSystemMeta(system);
  const primaryExt = meta.romExtensions[0]?.replace(/^\./, "") || "rom";
  return `${cleaned || "game"}.${primaryExt}`;
}
