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
    expect(ADVANCED_DESKTOP_ONLY_SYSTEMS).toContain("saturn");
    expect(ADVANCED_DESKTOP_ONLY_SYSTEMS).not.toContain("psx");
  });

  describe("isDesktopOnlySystem", () => {
    it("returns true for PS2, Dreamcast, GameCube, and Saturn", () => {
      expect(isDesktopOnlySystem("ps2")).toBe(true);
      expect(isDesktopOnlySystem("playstation2")).toBe(true);
      expect(isDesktopOnlySystem("dreamcast")).toBe(true);
      expect(isDesktopOnlySystem("dc")).toBe(true);
      expect(isDesktopOnlySystem("gamecube")).toBe(true);
      expect(isDesktopOnlySystem("gc")).toBe(true);
      expect(isDesktopOnlySystem("saturn")).toBe(true);
    });

    it("returns false for PSX (PS1) so it remains playable on mobile", () => {
      expect(isDesktopOnlySystem("psx")).toBe(false);
      expect(isDesktopOnlySystem("ps1")).toBe(false);
      expect(isDesktopOnlySystem("playstation")).toBe(false);
    });

    it("returns false for mobile-supported systems (12 systems)", () => {
      expect(isDesktopOnlySystem("nes")).toBe(false);
      expect(isDesktopOnlySystem("snes")).toBe(false);
      expect(isDesktopOnlySystem("n64")).toBe(false);
      expect(isDesktopOnlySystem("gba")).toBe(false);
      expect(isDesktopOnlySystem("gb")).toBe(false);
      expect(isDesktopOnlySystem("gbc")).toBe(false);
      expect(isDesktopOnlySystem("sgb")).toBe(false);
      expect(isDesktopOnlySystem("genesis")).toBe(false);
      expect(isDesktopOnlySystem("sega32x")).toBe(false);
      expect(isDesktopOnlySystem("sms")).toBe(false);
      expect(isDesktopOnlySystem("sgg")).toBe(false);
      expect(isDesktopOnlySystem("psx")).toBe(false);
      expect(isDesktopOnlySystem("mame")).toBe(false);
    });

    it("handles null or empty inputs gracefully", () => {
      expect(isDesktopOnlySystem(null)).toBe(false);
      expect(isDesktopOnlySystem(undefined)).toBe(false);
      expect(isDesktopOnlySystem("")).toBe(false);
    });
  });

  describe("isSystemPlayableOnDevice", () => {
    it("blocks PS2, Dreamcast, GameCube, and Saturn on mobile", () => {
      expect(isSystemPlayableOnDevice("ps2", true)).toBe(false);
      expect(isSystemPlayableOnDevice("dreamcast", true)).toBe(false);
      expect(isSystemPlayableOnDevice("gamecube", true)).toBe(false);
      expect(isSystemPlayableOnDevice("saturn", true)).toBe(false);
    });

    it("allows the 12 mobile systems to be played on mobile", () => {
      expect(isSystemPlayableOnDevice("nes", true)).toBe(true);
      expect(isSystemPlayableOnDevice("snes", true)).toBe(true);
      expect(isSystemPlayableOnDevice("n64", true)).toBe(true);
      expect(isSystemPlayableOnDevice("gba", true)).toBe(true);
      expect(isSystemPlayableOnDevice("gb", true)).toBe(true);
      expect(isSystemPlayableOnDevice("gbc", true)).toBe(true);
      expect(isSystemPlayableOnDevice("sgb", true)).toBe(true);
      expect(isSystemPlayableOnDevice("genesis", true)).toBe(true);
      expect(isSystemPlayableOnDevice("sega32x", true)).toBe(true);
      expect(isSystemPlayableOnDevice("sms", true)).toBe(true);
      expect(isSystemPlayableOnDevice("sgg", true)).toBe(true);
      expect(isSystemPlayableOnDevice("psx", true)).toBe(true);
      expect(isSystemPlayableOnDevice("mame", true)).toBe(true);
    });

    it("allows all systems to be played in browser on desktop", () => {
      const allSystems = [
        "nes",
        "snes",
        "n64",
        "gba",
        "gb",
        "gbc",
        "sgb",
        "gamecube",
        "genesis",
        "sega32x",
        "sms",
        "sgg",
        "saturn",
        "dreamcast",
        "psx",
        "ps2",
        "mame",
      ];
      for (const sys of allSystems) {
        expect(isSystemPlayableOnDevice(sys, false)).toBe(true);
      }
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
      expect(normalizeSystem("mame")).toBe("mame");
      expect(normalizeSystem("MAME")).toBe("mame");
      expect(normalizeSystem("Arcade")).toBe("mame");
      expect(normalizeSystem("arcade")).toBe("mame");
    });
  });
});
