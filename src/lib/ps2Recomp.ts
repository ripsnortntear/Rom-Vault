import fs from "fs";
import path from "path";
import { getStorageRoot, normalizeSystem } from "./paths";

const WEB_BUILDS_DIR = "/mnt/storage/roms/ps2/web_builds";

export interface Ps2WebBuildInfo {
  buildPath: string;
  hasHtml: boolean;
  htmlPath: string;
}

export function toPs2Slug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "") || "game";
}

/**
 * Checks if a recompiled web build exists for a PS2 game
 */
export function findPs2WebBuild(baseNameOrId: string): Ps2WebBuildInfo | null {
  const cleanName = baseNameOrId.includes("__")
    ? decodeURIComponent(baseNameOrId.split("__")[1] || baseNameOrId)
    : decodeURIComponent(baseNameOrId);

  const cleanBase = cleanName.replace(/\.[a-z0-9]+$/i, "");
  const slug = toPs2Slug(cleanBase);

  const candidates = [
    cleanBase,
    slug,
    cleanName,
  ];

  for (const cand of candidates) {
    const dir = path.join(WEB_BUILDS_DIR, cand);
    if (!fs.existsSync(/*turbopackIgnore: true*/ dir)) continue;

    const htmlCandidate = path.join(dir, "ps2web.html");
    const indexCandidate = path.join(dir, "index.html");

    const htmlPath = fs.existsSync(/*turbopackIgnore: true*/ htmlCandidate)
      ? htmlCandidate
      : fs.existsSync(/*turbopackIgnore: true*/ indexCandidate)
      ? indexCandidate
      : null;

    if (htmlPath) {
      return {
        buildPath: dir,
        hasHtml: true,
        htmlPath,
      };
    }
  }

  return null;
}
