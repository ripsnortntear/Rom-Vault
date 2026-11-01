import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getStorageRoot, DEFAULT_STORAGE_ROOT, LEGACY_STORAGE_ROOT } from "./lib/paths";
import fs from "fs";

describe("Storage Root Resolution & Migration Fallback", () => {
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

  it("defines new storage root as /mnt/storage/oldsmarchaos.com/roms", () => {
    expect(DEFAULT_STORAGE_ROOT).toBe("/mnt/storage/oldsmarchaos.com/roms");
    expect(LEGACY_STORAGE_ROOT).toBe("/mnt/storage/roms");
  });

  it("resolves to existing populated path or falls back safely", () => {
    const root = getStorageRoot();
    expect(root).toBeDefined();
    expect([DEFAULT_STORAGE_ROOT, LEGACY_STORAGE_ROOT]).toContain(root);
  });
});
