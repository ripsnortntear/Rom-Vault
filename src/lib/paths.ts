import fs from "fs";
import path from "path";
import type { MediaCategory } from "@/types/game";
import { normalizeSystem } from "./systems";

export { normalizeSystem };

export const BASE_PATH = "/roms";
export const DEFAULT_STORAGE_ROOT = "/mnt/storage/oldsmarchaos.com/roms";
export const LEGACY_STORAGE_ROOT = "/mnt/storage/roms";

export function getWorkspaceRoot(): string {
  const cwd = process.cwd();
  if (path.basename(cwd) === ".") {
    return path.resolve(cwd, "..");
  }
  return cwd;
}

export function getStorageRoot(): string {
  // If explicitly configured in environment, check if valid and populated
  if (process.env.STORAGE_ROOT) {
    const custom = path.resolve(process.env.STORAGE_ROOT);
    if (fs.existsSync(custom)) {
      try {
        const files = fs.readdirSync(custom);
        if (files.length > 0) return custom;
      } catch {}
    }
  }

  // Primary: /mnt/storage/oldsmarchaos.com/roms (if populated)
  if (fs.existsSync(DEFAULT_STORAGE_ROOT)) {
    try {
      const files = fs.readdirSync(DEFAULT_STORAGE_ROOT);
      if (files.length > 0) return DEFAULT_STORAGE_ROOT;
    } catch {}
  }

  // Seamless fallback during migration: /mnt/storage/roms
  if (fs.existsSync(LEGACY_STORAGE_ROOT)) {
    return LEGACY_STORAGE_ROOT;
  }

  return DEFAULT_STORAGE_ROOT;
}

/**
 * Safely decodes a URI component, falling back to original string if malformed (e.g. contains '%').
 */
export function safeDecodeURIComponent(val: string): string {
  if (!val || typeof val !== "string") return "";
  try {
    return decodeURIComponent(val);
  } catch {
    return val;
  }
}

export function isValidConsoleSystem(value: string | null | undefined): boolean {
  if (!value) return false;
  const norm = normalizeSystem(value);
  const sysDir = path.join(/*turbopackIgnore: true*/ getStorageRoot(), norm);
  return fs.existsSync(sysDir);
}

export function getRomsDirectory(system = "nes"): string {
  const norm = normalizeSystem(system);
  return path.join(/*turbopackIgnore: true*/ getStorageRoot(), norm, "roms");
}

export function getArtworkDirectory(system = "nes"): string {
  const norm = normalizeSystem(system);
  return path.join(/*turbopackIgnore: true*/ getStorageRoot(), norm, "artwork");
}

export function isValidMediaCategory(value: string): boolean {
  if (!value || typeof value !== "string") return false;
  const clean = path.basename(value);
  return clean === value && /^[a-zA-Z0-9_-]+$/.test(clean);
}

/**
 * Resolves a requested media file safely while preventing path traversal attacks.
 */
export function resolveSafeMediaPath(
  category: string,
  fileName: string,
  system = "nes"
): string | null {
  try {
    const sanitizedName = path.basename(fileName);
    if (
      !sanitizedName ||
      sanitizedName !== fileName ||
      sanitizedName === "." ||
      sanitizedName === ".." ||
      sanitizedName.includes("/") ||
      sanitizedName.includes("\\")
    ) {
      return null;
    }

    const norm = normalizeSystem(system);
    const baseDir =
      category === "roms"
        ? getRomsDirectory(norm)
        : path.join(/*turbopackIgnore: true*/ getArtworkDirectory(norm), category);

    const resolvedBase = path.resolve(baseDir);
    const resolvedTarget = path.resolve(/*turbopackIgnore: true*/ resolvedBase, sanitizedName);

    if (!resolvedTarget.startsWith(resolvedBase + path.sep)) {
      return null;
    }

    return resolvedTarget;
  } catch (error) {
    console.error("[paths] Failed to resolve safe media path:", {
      category,
      fileName,
      system,
      error,
    });
    return null;
  }
}

export function buildMediaUrl(
  category: string,
  fileName: string,
  system = "nes"
): string {
  const norm = normalizeSystem(system);
  const baseUrl = `${BASE_PATH}/api/media/${encodeURIComponent(category)}/${encodeURIComponent(fileName)}`;
  if (category === "roms") {
    return `${baseUrl}?system=${encodeURIComponent(norm)}`;
  }
  return `${baseUrl}?system=${encodeURIComponent(norm)}&v=v4`;
}
