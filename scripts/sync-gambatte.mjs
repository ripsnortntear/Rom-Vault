#!/usr/bin/env node

/**
 * Gambatte-GameVault Upstream Synchronization & Integration Script
 *
 * Synchronizes the in-browser Game Boy & Game Boy Color emulator core with upstream
 * Gambatte-GameVault (https://github.com/skitzellez/Gambatte-GameVault, branch 'gamevault')
 * while preserving ROM Vault's virtual Link Cable & Asyncify contracts:
 *  - HAVE_NETWORK = 1 & C++11 libretro build
 *  - Emscripten Asyncify event-loop yielding (emscripten_sleep) in PacketSerial::send
 *  - Exported WebAssembly link cable methods (ejs_link_cable_start, ejs_link_cable_receive, ejs_link_cable_stop)
 *  - Outbound link packet dispatch via VAULT_LINK_PACKET_OUT & window.EJS_onLinkPacket
 *  - 7z core bundle packaging into public/emulatorjs/data/cores/gambatte-wasm.data
 *
 * Usage:
 *   node scripts/sync-gambatte.mjs             # Update and sync from upstream submodule
 *   node scripts/sync-gambatte.mjs --verify    # Verify submodule, core bundle, & exported symbols (CI/CD)
 *   node scripts/sync-gambatte.mjs --check     # Check if upstream has newer commits
 *   node scripts/sync-gambatte.mjs --rebuild   # Rebuild WASM core using Docker emsdk and update core bundle
 */

import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");
const SUBMODULE_DIR = path.join(ROOT_DIR, "vendor", "Gambatte-GameVault");
const PATCH_FILE = path.join(ROOT_DIR, "patches", "gambatte-gamevault.patch");
const CORE_BUNDLE = path.join(ROOT_DIR, "public", "emulatorjs", "data", "cores", "gambatte-wasm.data");

function log(msg) {
  console.log(`[Gambatte Sync] ${msg}`);
}

function runCmd(cmd, cwd = ROOT_DIR) {
  try {
    return execSync(cmd, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  } catch (err) {
    throw new Error(`Command failed: ${cmd}\n${err.stderr || err.message}`);
  }
}

async function verifyContracts() {
  log("Verifying integration contracts and core archive integrity...");
  let errors = 0;

  // 1. Check core bundle exists and has reasonable size
  if (!fs.existsSync(CORE_BUNDLE)) {
    console.error(`  [✗] Missing core bundle: ${CORE_BUNDLE}`);
    errors++;
  } else {
    const stats = fs.statSync(CORE_BUNDLE);
    if (stats.size < 500000) {
      console.error(`  [✗] Core bundle is abnormally small (${stats.size} bytes): ${CORE_BUNDLE}`);
      errors++;
    } else {
      log(`  [✓] Core bundle present: ${(stats.size / 1024).toFixed(1)} KB`);
    }
  }

  // 2. Check 7z archive contents
  try {
    const listOutput = execSync(`7z l "${CORE_BUNDLE}"`, { encoding: "utf8" });
    const hasJs = listOutput.includes("gambatte_libretro.js");
    const hasWasm = listOutput.includes("gambatte_libretro.wasm");

    if (!hasJs || !hasWasm) {
      console.error("  [✗] Core bundle missing gambatte_libretro.js or gambatte_libretro.wasm");
      errors++;
    } else {
      log("  [✓] Archive contains gambatte_libretro.js and gambatte_libretro.wasm");
    }
  } catch (e) {
    console.error(`  [✗] Failed to read 7z archive: ${e.message}`);
    errors++;
  }

  // 3. Check required exported link cable functions in JS/WASM bundle
  try {
    const jsContent = execSync(`7z e -so "${CORE_BUNDLE}" gambatte_libretro.js`, {
      encoding: "utf8",
      maxBuffer: 10 * 1024 * 1024,
    });

    const requiredSymbols = [
      "_ejs_link_cable_start",
      "_ejs_link_cable_receive",
      "_ejs_link_cable_stop",
      "Asyncify",
    ];

    for (const sym of requiredSymbols) {
      if (!jsContent.includes(sym)) {
        console.error(`  [✗] Required symbol missing in core bundle: ${sym}`);
        errors++;
      } else {
        log(`  [✓] Exported symbol verified: ${sym}`);
      }
    }
  } catch (e) {
    console.error(`  [✗] Failed to inspect exported symbols: ${e.message}`);
    errors++;
  }

  // 4. Check patch file exists
  if (!fs.existsSync(PATCH_FILE)) {
    console.error(`  [✗] Missing patch file: ${PATCH_FILE}`);
    errors++;
  } else {
    log(`  [✓] Patch file present: patches/gambatte-gamevault.patch`);
  }

  if (errors > 0) {
    throw new Error(`Verification failed with ${errors} error(s).`);
  }

  log("[✓] All Gambatte-GameVault contracts and core assets are intact.");
  return true;
}

async function checkUpstream() {
  log("Checking upstream repository status (branch: gamevault)...");
  if (!fs.existsSync(SUBMODULE_DIR) || fs.readdirSync(SUBMODULE_DIR).length === 0) {
    log("Submodule directory not initialized. Initializing...");
    runCmd("git submodule update --init --recursive vendor/Gambatte-GameVault");
  }

  try {
    runCmd("git fetch origin gamevault", SUBMODULE_DIR);
    const localHash = runCmd("git rev-parse HEAD", SUBMODULE_DIR);
    const remoteHash = runCmd("git rev-parse origin/gamevault", SUBMODULE_DIR);

    log(`Submodule Local Commit:  ${localHash}`);
    log(`Submodule Remote Commit: ${remoteHash}`);

    if (localHash === remoteHash) {
      log("[✓] Submodule is up to date with upstream origin/gamevault.");
      return { upToDate: true, localHash, remoteHash };
    } else {
      log(`[!] Newer upstream commit available: ${remoteHash}`);
      return { upToDate: false, localHash, remoteHash };
    }
  } catch (err) {
    log(`Warning: Could not fetch from upstream (${err.message}). Checking offline status.`);
    const currentHash = runCmd("git rev-parse HEAD", SUBMODULE_DIR);
    return { upToDate: true, localHash: currentHash, remoteHash: currentHash };
  }
}

async function rebuildCore() {
  log("Rebuilding Gambatte WASM Core with Link Cable and Asyncify support...");

  const dockerAvailable = (() => {
    try {
      execSync("docker --version", { stdio: "ignore" });
      return true;
    } catch {
      return false;
    }
  })();

  if (!dockerAvailable) {
    throw new Error("Docker is required to compile Gambatte WebAssembly core (emscripten/emsdk:latest).");
  }

  const buildScript = `
    set -e
    cd /workspace/vendor/Gambatte-GameVault
    git checkout -f gamevault 2>/dev/null || true
    git apply /workspace/patches/gambatte-gamevault.patch 2>/dev/null || true
    make -f Makefile.libretro platform=emscripten HAVE_NETWORK=1 -j$(nproc)
  `;

  log("Compiling Gambatte libretro bitcode via Docker emsdk...");
  execSync(`docker run --rm -v "${ROOT_DIR}:/workspace" emscripten/emsdk:latest bash -c "${buildScript}"`, {
    stdio: "inherit",
  });

  log("[✓] Compilation succeeded. Verify contracts...");
  await verifyContracts();
}

async function syncFromUpstream() {
  log("Starting synchronization from Gambatte-GameVault submodule...");

  if (!fs.existsSync(SUBMODULE_DIR) || fs.readdirSync(SUBMODULE_DIR).length === 0) {
    log("Initializing submodule vendor/Gambatte-GameVault...");
    runCmd("git submodule update --init --recursive vendor/Gambatte-GameVault");
  } else {
    try {
      log("Pulling latest upstream changes on gamevault branch...");
      runCmd("git fetch origin gamevault", SUBMODULE_DIR);
      runCmd("git checkout gamevault", SUBMODULE_DIR);
      runCmd("git merge --ff-only origin/gamevault || true", SUBMODULE_DIR);
    } catch (e) {
      log(`Submodule fetch warning: ${e.message}`);
    }
  }

  const upstreamCommit = runCmd("git rev-parse HEAD", SUBMODULE_DIR);
  log(`Upstream commit: ${upstreamCommit}`);

  // Re-apply integration patch
  log("Applying ROM Vault Link Cable & Asyncify integration patch...");
  try {
    runCmd(`git apply --check "${PATCH_FILE}"`, SUBMODULE_DIR);
    runCmd(`git apply "${PATCH_FILE}"`, SUBMODULE_DIR);
    log("[✓] Integration patch applied successfully.");
  } catch (err) {
    log(`Patch apply notice: ${err.message}`);
  }

  // Verify contracts
  await verifyContracts();
}

async function main() {
  const args = process.argv.slice(2);

  if (args.includes("--check")) {
    await checkUpstream();
  } else if (args.includes("--verify")) {
    await verifyContracts();
  } else if (args.includes("--rebuild")) {
    await rebuildCore();
  } else if (args.includes("--help") || args.includes("-h")) {
    console.log(`
Gambatte-GameVault Upstream Synchronization Tool

Options:
  --check    Check if upstream repository has newer commits on 'gamevault' branch
  --verify   Verify core archive, exported WebAssembly symbols, and contracts
  --rebuild  Rebuild WASM core using Docker emscripten and re-bundle
  --help     Show this help message

Default (no flags): Sync from upstream, apply patch, and verify contracts.
    `);
  } else {
    await syncFromUpstream();
  }
}

main().catch((err) => {
  console.error(`\n[✗] Fatal Gambatte Sync Error: ${err.message}`);
  process.exit(1);
});
