import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { getStorageRoot, DEFAULT_STORAGE_ROOT, safeDecodeURIComponent, resolveSafeMediaPath } from "./lib/paths";

describe("Storage Root Resolution", () => {
  const origEnv = process.env.STORAGE_ROOT;

  beforeEach(() => {
    delete process.env.STORAGE_ROOT;
  });

  afterEach(() => {
    if (origEnv !== undefined) {
      process.env.STORAGE_ROOT = origEnv;
    } else {
      delete process.env.STORAGE_ROOT;
    }
  });

  it("defines storage root as /mnt/storage/oldsmarchaos.com/roms", () => {
    expect(DEFAULT_STORAGE_ROOT).toBe("/mnt/storage/oldsmarchaos.com/roms");
  });

  it("resolves to /mnt/storage/oldsmarchaos.com/roms by default", () => {
    const root = getStorageRoot();
    expect(root).toBe(DEFAULT_STORAGE_ROOT);
  });

  it("safely handles URI decoding without throwing on malformed or special characters", () => {
    expect(safeDecodeURIComponent("Hello%20World")).toBe("Hello World");
    expect(safeDecodeURIComponent("100% Star")).toBe("100% Star");
    expect(safeDecodeURIComponent("100%25%20Star")).toBe("100% Star");
    expect(safeDecodeURIComponent("")).toBe("");
  });

  it("handles arcade media aliases in resolveSafeMediaPath gracefully", () => {
    // Attempting resolution of arcade categories like marquee or box2d without path traversal
    const safePath = resolveSafeMediaPath("marquee", "pacman.png", "mame");
    expect(safePath).not.toBeNull();
    expect(safePath).toContain("pacman.png");

    const traversalPath = resolveSafeMediaPath("marquee", "../../etc/passwd", "mame");
    expect(traversalPath).toBeNull();

    const traversalSystem = resolveSafeMediaPath("marquee", "pacman.png", "../../etc/passwd");
    expect(traversalSystem).toBeNull();
  });
});
