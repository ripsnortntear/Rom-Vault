import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { execSync } from "child_process";

describe("Gambatte-GameVault Submodule & Upstream Integration", () => {
  const rootDir = path.resolve(__dirname, "..");
  const gitmodulesPath = path.join(rootDir, ".gitmodules");
  const submoduleDir = path.join(rootDir, "vendor", "Gambatte-GameVault");
  const coreBundle = path.join(rootDir, "public", "emulatorjs", "data", "cores", "gambatte-wasm.data");
  const patchPath = path.join(rootDir, "patches", "gambatte-gamevault.patch");
  const syncScript = path.join(rootDir, "scripts", "sync-gambatte.mjs");

  it("registers Gambatte-GameVault in .gitmodules tracking gamevault branch", () => {
    expect(fs.existsSync(gitmodulesPath)).toBe(true);
    const content = fs.readFileSync(gitmodulesPath, "utf8");
    expect(content).toContain('[submodule "vendor/Gambatte-GameVault"]');
    expect(content).toContain("https://github.com/skitzellez/Gambatte-GameVault.git");
    expect(content).toContain("branch = gamevault");
  });

  it("contains integration patch file with network and asyncify hooks", () => {
    expect(fs.existsSync(patchPath)).toBe(true);
    const content = fs.readFileSync(patchPath, "utf8");
    expect(content).toContain("HAVE_NETWORK = 1");
    expect(content).toContain("ejs_link_cable_start");
    expect(content).toContain("emscripten_sleep(1)");
  });

  it("contains compiled WebAssembly core archive in public/emulatorjs/data/cores", () => {
    expect(fs.existsSync(coreBundle)).toBe(true);
    const size = fs.statSync(coreBundle).size;
    expect(size).toBeGreaterThan(800 * 1024); // > 800 KB
  });

  it("verifies package.json scripts for Gambatte synchronization", () => {
    const pkgJson = JSON.parse(fs.readFileSync(path.join(rootDir, "package.json"), "utf8"));
    expect(pkgJson.scripts["sync-gambatte"]).toBe("node scripts/sync-gambatte.mjs");
    expect(pkgJson.scripts["verify-gambatte"]).toBe("node scripts/sync-gambatte.mjs --verify");
  });

  it("executes sync-gambatte.mjs --verify successfully", () => {
    expect(fs.existsSync(syncScript)).toBe(true);

    const output = execSync(`node "${syncScript}" --verify`, {
      cwd: rootDir,
      encoding: "utf8",
    });

    expect(output).toContain("[✓] All Gambatte-GameVault contracts and core assets are intact.");
  });
});
