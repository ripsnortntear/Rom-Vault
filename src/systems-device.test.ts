import { describe, it, expect } from "vitest";
import {
  isDesktopOnlySystem,
  isSystemPlayableOnDevice,
  ADVANCED_DESKTOP_ONLY_SYSTEMS,
  normalizeSystem,
} from "./lib/systems";

describe("Device System Emulation Compatibility", () => {
  it("defines advanced desktop-only systems accurately", () => {
    expect(ADVANCED_DESKTOP_ONLY_SYSTEMS).toContain("ps2");
    expect(ADVANCED_DESKTOP_ONLY_SYSTEMS).toContain("dreamcast");
    expect(ADVANCED_DESKTOP_ONLY_SYSTEMS).toContain("gamecube");
    expect(ADVANCED_DESKTOP_ONLY_SYSTEMS).not.toContain("psx");
  });

  describe("isDesktopOnlySystem", () => {
    it("returns true for PS2, Dreamcast, and GameCube", () => {
      expect(isDesktopOnlySystem("ps2")).toBe(true);
      expect(isDesktopOnlySystem("playstation2")).toBe(true);
      expect(isDesktopOnlySystem("dreamcast")).toBe(true);
      expect(isDesktopOnlySystem("dc")).toBe(true);
      expect(isDesktopOnlySystem("gamecube")).toBe(true);
      expect(isDesktopOnlySystem("gc")).toBe(true);
    });

    it("returns false for PSX (PS1) so it remains playable on mobile", () => {
      expect(isDesktopOnlySystem("psx")).toBe(false);
      expect(isDesktopOnlySystem("ps1")).toBe(false);
      expect(isDesktopOnlySystem("playstation")).toBe(false);
    });

    it("returns false for classic retro systems", () => {
      expect(isDesktopOnlySystem("nes")).toBe(false);
      expect(isDesktopOnlySystem("snes")).toBe(false);
      expect(isDesktopOnlySystem("n64")).toBe(false);
      expect(isDesktopOnlySystem("gba")).toBe(false);
      expect(isDesktopOnlySystem("gb")).toBe(false);
      expect(isDesktopOnlySystem("gbc")).toBe(false);
      expect(isDesktopOnlySystem("genesis")).toBe(false);
      expect(isDesktopOnlySystem("saturn")).toBe(false);
      expect(isDesktopOnlySystem("sms")).toBe(false);
      expect(isDesktopOnlySystem("gg")).toBe(false);
    });

    it("handles null or empty inputs gracefully", () => {
      expect(isDesktopOnlySystem(null)).toBe(false);
      expect(isDesktopOnlySystem(undefined)).toBe(false);
      expect(isDesktopOnlySystem("")).toBe(false);
    });
  });

  describe("isSystemPlayableOnDevice", () => {
    it("blocks PS2, Dreamcast, and GameCube on mobile", () => {
      expect(isSystemPlayableOnDevice("ps2", true)).toBe(false);
      expect(isSystemPlayableOnDevice("dreamcast", true)).toBe(false);
      expect(isSystemPlayableOnDevice("gamecube", true)).toBe(false);
    });

    it("allows PSX (PS1) to be played on mobile", () => {
      expect(isSystemPlayableOnDevice("psx", true)).toBe(true);
      expect(isSystemPlayableOnDevice("ps1", true)).toBe(true);
    });

    it("allows retro 8-bit, 16-bit, and handheld systems to be played on mobile", () => {
      expect(isSystemPlayableOnDevice("nes", true)).toBe(true);
      expect(isSystemPlayableOnDevice("snes", true)).toBe(true);
      expect(isSystemPlayableOnDevice("gba", true)).toBe(true);
      expect(isSystemPlayableOnDevice("genesis", true)).toBe(true);
    });

    it("allows PS2, Dreamcast, GameCube, and PSX on desktop", () => {
      expect(isSystemPlayableOnDevice("ps2", false)).toBe(true);
      expect(isSystemPlayableOnDevice("dreamcast", false)).toBe(true);
      expect(isSystemPlayableOnDevice("gamecube", false)).toBe(true);
      expect(isSystemPlayableOnDevice("psx", false)).toBe(true);
    });
  });

  describe("System normalization", () => {
    it("correctly normalizes all aliases", () => {
      expect(normalizeSystem("PS2")).toBe("ps2");
      expect(normalizeSystem("PlayStation2")).toBe("ps2");
      expect(normalizeSystem("dc")).toBe("dreamcast");
      expect(normalizeSystem("gc")).toBe("gamecube");
      expect(normalizeSystem("PS1")).toBe("psx");
      expect(normalizeSystem("playstation")).toBe("psx");
    });
  });
});
