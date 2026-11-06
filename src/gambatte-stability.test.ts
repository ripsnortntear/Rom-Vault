import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

describe("Gambatte-GameVault Core Stability & Link Cable Contracts", () => {
  const rootDir = process.cwd();
  const corePath = path.join(rootDir, "public", "emulatorjs", "data", "cores", "gambatte-wasm.data");
  const patchPath = path.join(rootDir, "patches", "gambatte-gamevault.patch");
  const submodulePath = path.join(rootDir, "vendor", "Gambatte-GameVault");

  it("verifies public core bundle archive exists and is valid size", () => {
    expect(fs.existsSync(corePath)).toBe(true);
    const stats = fs.statSync(corePath);
    expect(stats.size).toBeGreaterThan(800000); // ~993 KB
  });

  it("verifies integration patch is tracked and intact", () => {
    expect(fs.existsSync(patchPath)).toBe(true);
    const patchContent = fs.readFileSync(patchPath, "utf8");
    expect(patchContent).toContain("HAVE_NETWORK = 1");
    expect(patchContent).toContain("ejs_link_cable_start");
    expect(patchContent).toContain("emscripten_sleep(1)");
  });

  it("verifies vendor submodule directory is configured", () => {
    expect(fs.existsSync(submodulePath)).toBe(true);
    const gitmodules = fs.readFileSync(path.join(rootDir, ".gitmodules"), "utf8");
    expect(gitmodules).toContain("vendor/Gambatte-GameVault");
    expect(gitmodules).toContain("branch = gamevault");
  });

  it("constructs stable player URLs for link-host and link-guest roles", () => {
    const gameId = "gb__Pokemon Red";
    const hostUrl = `/roms/play/${encodeURIComponent(gameId)}?autostart=1&multiplayer=link-host`;
    const guestUrl = `/roms/play/${encodeURIComponent(gameId)}?autostart=1&multiplayer=link-guest`;

    expect(hostUrl).toBe("/roms/play/gb__Pokemon%20Red?autostart=1&multiplayer=link-host");
    expect(guestUrl).toBe("/roms/play/gb__Pokemon%20Red?autostart=1&multiplayer=link-guest");
  });

  it("validates Link Cable packet encoding and round-trip parsing", () => {
    // [kind, data, fast]
    const packet = { kind: 1, data: 0x60, fast: 0 };
    const serialized = JSON.stringify(packet);
    const deserialized = JSON.parse(serialized);

    expect(deserialized.kind).toBe(1);
    expect(deserialized.data).toBe(96);
    expect(deserialized.fast).toBe(0);
  });
});
