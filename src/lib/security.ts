import { z } from "zod";
import { normalizeSystem } from "./systems";

/**
 * Application security utilities for URL validation and scheme sanitization.
 */

export const avatarUrlSchema = z
  .string()
  .max(1024)
  .refine(
    (val) => {
      if (!val) return true;
      const trimmed = val.trim();
      // Reject dangerous pseudo-protocols explicitly
      if (/^(javascript|data|vbscript|file|blob):/i.test(trimmed)) {
        return false;
      }
      // Allow relative local asset paths
      if (
        (trimmed.startsWith("/avatars/") ||
          trimmed.startsWith("/images/") ||
          trimmed.startsWith("/roms/") ||
          trimmed.startsWith("/")) &&
        !trimmed.startsWith("//")
      ) {
        // Prevent directory traversal and Windows backslashes
        return !trimmed.includes("..") && !trimmed.includes("\\");
      }
      try {
        const url = new URL(trimmed);
        // Only allow secure HTTPS URLs
        return url.protocol === "https:";
      } catch {
        return false;
      }
    },
    { message: "Avatar must be a valid local path or secure HTTPS URL." }
  )
  .optional()
  .nullable();

/**
 * Validates that an avatar URL is a safe local path or secure HTTPS URL.
 */
export function isSafeAvatarUrl(url: string | null | undefined): boolean {
  if (!url || typeof url !== "string") return false;
  const trimmed = url.trim();
  if (!trimmed || trimmed.length > 1024) return false;
  const parsed = avatarUrlSchema.safeParse(trimmed);
  return parsed.success && !!parsed.data;
}

/**
 * Defensive runtime check returning the safe avatar URL, or fallback default avatar.
 */
export function getSafeAvatarUrl(
  url: string | null | undefined,
  fallback: string | null = "/avatars/default.png"
): string | null {
  if (isSafeAvatarUrl(url)) {
    return url!.trim();
  }
  return fallback;
}

/**
 * Validate that a URL uses safe HTTP/HTTPS protocols
 * and prevents script execution (e.g. javascript:, data:, vbscript:).
 */
export function isSafeHttpUrl(url: string | null | undefined): boolean {
  if (!url || typeof url !== "string") return false;
  const trimmed = url.trim();
  if (!trimmed) return false;

  // Reject dangerous URI schemes
  if (/^(javascript|data|vbscript|file|blob):/i.test(trimmed)) {
    return false;
  }

  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Returns a sanitized HTTP/HTTPS URL, or null if the URL is invalid or unsafe.
 */
export function getSafeHttpUrl(url: string | null | undefined): string | null {
  if (!isSafeHttpUrl(url)) return null;
  return url!.trim();
}

/**
 * Validates save state binary payload according to platform requirements.
 * Rejects cross-platform injections (e.g. uploading PS2/PS1 saves to 2D retro consoles).
 */
export function validateSaveFormatForPlatform(platform: string, buffer: Buffer): string | null {
  const norm = normalizeSystem(platform);

  // Check PS2 Memory Card Superblock (contains "Sony Computer Entertainment" or "Sony PS2" at header)
  const headerStr = buffer.slice(0, 64).toString("utf8");
  const isPs2Payload = headerStr.includes("Sony Computer Entertainment") || headerStr.includes("Sony PS2");

  // Check PS1 Memory Card Header ("MC" / 0x4D 0x43 at offset 0 and exactly 128KB)
  const isPs1Payload = buffer.length === 131072 && buffer[0] === 0x4d && buffer[1] === 0x43;

  if (norm === "psx" || norm === "ps1") {
    // PS1 expects exactly 128 KB (131,072 bytes)
    if (buffer.length !== 131072) {
      return "Invalid save state payload format for the target platform. PS1 memory card requires exactly 128 KB (131,072 bytes).";
    }
    if (isPs2Payload) {
      return "Invalid save state payload format for the target platform. PlayStation 2 memory card cannot be uploaded to PlayStation 1.";
    }
    return null;
  }

  if (norm === "ps2") {
    if (isPs1Payload) {
      return "Invalid save state payload format for the target platform. PlayStation 1 memory card cannot be uploaded to PlayStation 2.";
    }
    if (buffer.length > 16 * 1024 * 1024) {
      return "Save file size exceeds maximum allowable PlayStation 2 memory card size (16MB).";
    }
    return null;
  }

  // Non-PlayStation platforms (NES, SNES, GBA, GBC, GB, N64, Genesis, etc.)
  if (isPs2Payload || isPs1Payload) {
    return `Invalid save state payload format for the target platform. PlayStation memory cards cannot be uploaded to '${norm}'.`;
  }

  // 8-bit / 16-bit / handheld systems SRAM capacity sanity limit (max 4MB)
  const smallRomSystems = ["nes", "snes", "gb", "gbc", "gba", "genesis", "megadrive", "mastersystem", "gamegear"];
  if (smallRomSystems.includes(norm) && buffer.byteLength > 4 * 1024 * 1024) {
    return `Save file size (${(buffer.byteLength / 1024 / 1024).toFixed(1)}MB) exceeds maximum allowable SRAM capacity for ${norm.toUpperCase()} (4MB).`;
  }

  if (buffer.byteLength > 16 * 1024 * 1024) {
    return "Save payload exceeds maximum allowable limit (16MB).";
  }

  return null;
}
