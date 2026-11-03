import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { execSync } from "child_process";

describe("TabStationToo Submodule & Upstream Integration", () => {
  const rootDir = path.resolve(__dirname, "..");
  const gitmodulesPath = path.join(rootDir, ".gitmodules");
  const submoduleDir = path.join(rootDir, "vendor", "TabStationToo");
  const tabstationtooDir = path.join(rootDir, "public", "tabstationtoo");

  it("registers TabStationToo in .gitmodules tracking wasm branch", () => {
    expect(fs.existsSync(gitmodulesPath)).toBe(true);
    const content = fs.readFileSync(gitmodulesPath, "utf8");
    expect(content).toContain('[submodule "vendor/TabStationToo"]');
    expect(content).toContain("https://github.com/TabStationToo/TabStationToo.git");
    expect(content).toContain("branch = wasm");
  });

  it("contains all compiled WebAssembly and runtime binaries in public/tabstationtoo", () => {
    const wasmFile = path.join(tabstationtooDir, "pcsx2-wasm.wasm");
    const dataFile = path.join(tabstationtooDir, "pcsx2-wasm.data");
    const jsFile = path.join(tabstationtooDir, "pcsx2-wasm.js");

    expect(fs.existsSync(wasmFile)).toBe(true);
    expect(fs.existsSync(dataFile)).toBe(true);
    expect(fs.existsSync(jsFile)).toBe(true);

    const wasmSize = fs.statSync(wasmFile).size;
    const dataSize = fs.statSync(dataFile).size;
    const jsSize = fs.statSync(jsFile).size;

    // Verify minimum expected binary payload sizes
    expect(wasmSize).toBeGreaterThan(10 * 1024 * 1024); // > 10 MB
    expect(dataSize).toBeGreaterThan(4 * 1024 * 1024);  // > 4 MB
    expect(jsSize).toBeGreaterThan(200 * 1024);         // > 200 KB
  });

  it("enforces Gamepad & Haptic Shield in index.html", () => {
    const indexPath = path.join(tabstationtooDir, "index.html");
    expect(fs.existsSync(indexPath)).toBe(true);
    const content = fs.readFileSync(indexPath, "utf8");

    expect(content).toContain("GamepadHapticActuator");
    expect(content).toContain("vibrationActuator");
    expect(content).toContain("origGetGamepads");
  });

  it("enforces cross-origin credentialless in isolation.js", () => {
    const isoPath = path.join(tabstationtooDir, "isolation.js");
    expect(fs.existsSync(isoPath)).toBe(true);
    const content = fs.readFileSync(isoPath, "utf8");

    expect(content).toContain("coepCredentialless: () => true");
  });

  it("enforces virtual memory card cloud sync, debouncing, and hash deduplication in app.js", () => {
    const appPath = path.join(tabstationtooDir, "app.js");
    expect(fs.existsSync(appPath)).toBe(true);
    const content = fs.readFileSync(appPath, "utf8");

    // Stepped FNV-1a buffer hashing
    expect(content).toContain("quickCardHash");
    expect(content).toContain("0x811c9dc5");

    // Debounce & state tracking
    expect(content).toContain("cloudSyncState");
    expect(content).toContain("DEBOUNCE_QUIET_MS");
    expect(content).toContain("MIN_AUTO_SYNC_INTERVAL_MS");

    // Slot 1 cloud memory card
    expect(content).toContain("cloud_ps2_slot1");
  });

  it("enforces subframe beforeunload guard to prevent native Edge dialogs in app.js", () => {
    const appPath = path.join(tabstationtooDir, "app.js");
    const content = fs.readFileSync(appPath, "utf8");

    expect(content).toContain("if (window.self !== window.top)");
    expect(content).toContain("persistMemoryCards(true)");
  });

  it("enforces cooperative postMessage contracts in app.js", () => {
    const appPath = path.join(tabstationtooDir, "app.js");
    const content = fs.readFileSync(appPath, "utf8");

    expect(content).toContain("VAULT_FORCE_SAVE");
    expect(content).toContain("VAULT_SAVE_STATUS");
    expect(content).toContain("VAULT_SAVE_AND_EXIT");
  });

  it("executes sync-tabstationtoo.mjs --verify successfully", () => {
    const scriptPath = path.join(rootDir, "scripts", "sync-tabstationtoo.mjs");
    expect(fs.existsSync(scriptPath)).toBe(true);

    const output = execSync(`node "${scriptPath}" --verify`, {
      cwd: rootDir,
      encoding: "utf8",
    });

    expect(output).toContain("All TabStationToo contracts and assets are intact.");
  });
});
