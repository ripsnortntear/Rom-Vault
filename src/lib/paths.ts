import fs from "fs";
import path from "path";
import type { MediaCategory } from "@/types/game";
import { normalizeSystem } from "./systems";

export { normalizeSystem };

export const BASE_PATH = "/roms";
export const DEFAULT_STORAGE_ROOT = "/mnt/storage/oldsmarchaos.com/roms";

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
    if (!isValidMediaCategory(category)) return null;

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
    if (!norm || !/^[a-zA-Z0-9_-]+$/.test(norm)) {
      return null;
    }

    if (category === "roms") {
      const baseDir = getRomsDirectory(norm);
      const resolvedBase = path.resolve(baseDir);
      const resolvedTarget = path.resolve(/*turbopackIgnore: true*/ resolvedBase, sanitizedName);
      if (!resolvedTarget.startsWith(resolvedBase + path.sep)) {
        return null;
      }
      return resolvedTarget;
    }

    const artDir = getArtworkDirectory(norm);
    const categoryAliases: Record<string, string[]> = {
      artwork_front: ["artwork_front", "box2d", "images"],
      box2d: ["box2d", "images", "artwork_front"],
      images: ["images", "box2d", "artwork_front"],
      artwork_3d: ["artwork_3d", "box3d"],
      logo: ["logo", "marquee"],
      marquee: ["marquee", "logo"],
      medium_front: ["medium_front", "cartridges"],
      cartridges: ["cartridges", "medium_front"],
      screenshot: ["screenshot", "thumbnails"],
      thumbnails: ["thumbnails", "screenshot"],
      screentitle: ["screentitle", "titles"],
      titles: ["titles", "screentitle"],
      fanart: ["fanart", "fanarts"],
      fanarts: ["fanarts", "fanart"],
      video: ["video", "videos"],
      videos: ["videos", "video"],
      boxback: ["boxback"],
      manuals: ["manuals"],
    };

    const searchCategories = categoryAliases[category] || [category];
    for (const cat of searchCategories) {
      const baseDir = path.join(/*turbopackIgnore: true*/ artDir, cat);
      const resolvedBase = path.resolve(baseDir);
      const resolvedTarget = path.resolve(/*turbopackIgnore: true*/ resolvedBase, sanitizedName);
      if (resolvedTarget.startsWith(resolvedBase + path.sep) && fs.existsSync(resolvedTarget)) {
        return resolvedTarget;
      }
    }

    const defaultBase = path.resolve(path.join(/*turbopackIgnore: true*/ artDir, category));
    const defaultTarget = path.resolve(/*turbopackIgnore: true*/ defaultBase, sanitizedName);
    if (!defaultTarget.startsWith(defaultBase + path.sep)) {
      return null;
    }
    return defaultTarget;
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
