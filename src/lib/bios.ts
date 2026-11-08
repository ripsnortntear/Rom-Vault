import fs from "fs";
import path from "path";
import { getStorageRoot, normalizeSystem } from "./paths";

export interface SystemBiosInfo {
  expectedFileName: string;
  biosPath: string;
}

/**
 * Searches for an available BIOS file for a given system in both:
 * 1. /mnt/storage/oldsmarchaos.com/roms/{system}/bios/
 * 2. /mnt/storage/oldsmarchaos.com/roms/{system}/roms/
 */
export function findSystemBios(system: string, requestedFileName?: string): SystemBiosInfo | null {
  const norm = normalizeSystem(system);
  const root = getStorageRoot();
  const searchDirs = [
    path.join(root, norm, "bios"),
    path.join(root, norm, "roms"),
    path.join(root, norm),
    path.join(root, "bios"),
  ];

  if (requestedFileName) {
    const cleanReq = path.basename(requestedFileName);
    for (const dir of searchDirs) {
      const candidate = path.join(dir, cleanReq);
      if (fs.existsSync(/*turbopackIgnore: true*/ candidate) && fs.statSync(/*turbopackIgnore: true*/ candidate).isFile()) {
        return {
          expectedFileName: cleanReq,
          biosPath: candidate,
        };
      }
    }
  }

  const patterns: Record<string, { expected: string; test: (name: string) => boolean }> = {
    saturn: {
      expected: "saturn_bios.bin",
      test: (name) => {
        const l = name.toLowerCase();
        return (
          l.includes("saturn") && l.includes("bios") && l.endsWith(".bin")
        ) || l === "saturn_bios.bin" || l === "sega_101.bin" || l === "mpr-17933.bin";
      },
    },
    gba: {
      expected: "gba_bios.bin",
      test: (name) => {
        const l = name.toLowerCase();
        return (
          l.includes("gba") && l.includes("bios") && l.endsWith(".bin")
        ) || l === "gba_bios.bin";
      },
    },
    sega32x: {
      expected: "32X_G_BIOS.BIN",
      test: (name) => {
        const l = name.toLowerCase();
        return l.includes("32x") && l.includes("bios") && l.endsWith(".bin");
      },
    },
    dreamcast: {
      expected: "dc_boot.bin",
      test: (name) => {
        const l = name.toLowerCase();
        return (
          (l.includes("dreamcast") && l.includes("bios")) ||
          l === "dc_boot.bin"
        );
      },
    },
    psx: {
      expected: "scph5501.bin",
      test: (name) => {
        const l = name.toLowerCase();
        return (
          l.includes("scph") ||
          (l.includes("psx") && l.includes("bios")) ||
          (l.includes("ps1") && l.includes("bios")) ||
          l === "psxonpsp660.bin"
        ) && l.endsWith(".bin");
      },
    },
    ps2: {
      expected: "scph39001.bin",
      test: (name) => {
        const l = name.toLowerCase();
        return (
          l === "scph39001.bin" ||
          l.includes("39001") ||
          (l.includes("scph") && l.endsWith(".bin"))
        );
      },
    },
  };

  const sysConfig = patterns[norm];
  if (!sysConfig) return null;

  for (const dir of searchDirs) {
    if (!fs.existsSync(/*turbopackIgnore: true*/ dir)) continue;
    try {
      const files = fs.readdirSync(/*turbopackIgnore: true*/ dir);
      for (const file of files) {
        if (sysConfig.test(file)) {
          const fullPath = path.join(dir, file);
          if (fs.statSync(/*turbopackIgnore: true*/ fullPath).isFile()) {
            return {
              expectedFileName: sysConfig.expected,
              biosPath: fullPath,
            };
          }
        }
      }
    } catch (err) {
      console.error(`[bios] Error reading dir ${dir}:`, err);
    }
  }

  return null;
}
