#!/usr/bin/env node

/**
 * TabStationToo Upstream Synchronization & Integration Script
 *
 * Synchronizes the in-browser PS2 emulator component with upstream TabStationToo
 * (https://github.com/TabStationToo/TabStationToo, branch 'wasm') while preserving
 * ROM Vault's critical integration contracts:
 *  - Synchronous gamepad polling & haptic shield in index.html
 *  - Cross-origin credentialless isolation in isolation.js
 *  - Cloud virtual memory card sync, debouncing & fast content hashing in app.js
 *  - Embedded iframe beforeunload guard (preventing Edge/Chrome unload warnings)
 *  - Cooperative postMessage handlers (VAULT_FORCE_SAVE, VAULT_SAVE_AND_EXIT, VAULT_SAVE_STATUS)
 *
 * Usage:
 *   node scripts/sync-tabstationtoo.mjs             # Update and sync from upstream submodule
 *   node scripts/sync-tabstationtoo.mjs --verify    # Verify submodule & file contracts (CI/CD)
 *   node scripts/sync-tabstationtoo.mjs --check     # Check if upstream has newer commits
 */

import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");
const SUBMODULE_DIR = path.join(ROOT_DIR, "vendor", "TabStationToo");
const UPSTREAM_WEB_DIR = path.join(SUBMODULE_DIR, "pcsx2-wasm", "web");
const TARGET_DIR = path.join(ROOT_DIR, "public", "tabstationtoo");
const PATCHES_DIR = path.join(ROOT_DIR, "patches");
const GITHUB_PAGES_BASE = "https://tabstationtoo.github.io/TabStationToo";

const REQUIRED_FILES = [
  "app.js",
  "audio-tap.js",
  "cable-worker.js",
  "coi-serviceworker.js",
  "coi-serviceworker-LICENSE.txt",
  "disc-worker.js",
  "favicon.svg",
  "icons.svg",
  "index.html",
  "isolation.js",
  "pcsx2-wasm.data",
  "pcsx2-wasm.js",
  "pcsx2-wasm.wasm",
  "style.css",
];

const CONTRACTS = [
  {
    name: "Gamepad & Haptic Shield in index.html",
    file: "index.html",
    test: (content) =>
      content.includes("GamepadHapticActuator") &&
      content.includes("origGetGamepads"),
  },
  {
    name: "Cross-Origin Credentialless in isolation.js",
    file: "isolation.js",
    test: (content) => content.includes("coepCredentialless: () => true"),
  },
  {
    name: "Fast Memory Card Hashing (quickCardHash) in app.js",
    file: "app.js",
    test: (content) =>
      content.includes("quickCardHash") && content.includes("0x811c9dc5"),
  },
  {
    name: "Memory Card Cloud Sync & Debounce State in app.js",
    file: "app.js",
    test: (content) =>
      content.includes("cloudSyncState") &&
      content.includes("DEBOUNCE_QUIET_MS") &&
      content.includes("MIN_AUTO_SYNC_INTERVAL_MS"),
  },
  {
    name: "Embedded Subframe beforeunload Guard in app.js",
    file: "app.js",
    test: (content) =>
      content.includes("if (window.self !== window.top)") &&
      content.includes("persistMemoryCards(true)"),
  },
  {
    name: "Cooperative Iframe PostMessage Contracts in app.js",
    file: "app.js",
    test: (content) =>
      content.includes("VAULT_FORCE_SAVE") &&
      content.includes("VAULT_SAVE_STATUS") &&
      content.includes("VAULT_SAVE_AND_EXIT"),
  },
  {
    name: "Cloud Memory Card Slot 1 Auto-Mount in app.js",
    file: "app.js",
    test: (content) =>
      content.includes("cloud_ps2_slot1") &&
      content.includes("searchParams.get('memcard')"),
  },
];

function log(msg) {
  console.log(`[TabStationToo Sync] ${msg}`);
}

function runCmd(cmd, cwd = ROOT_DIR) {
  try {
    return execSync(cmd, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  } catch (err) {
    throw new Error(`Command failed: ${cmd}\n${err.stderr || err.message}`);
  }
}

async function verifyContracts() {
  log("Verifying integration contracts and file integrity...");
  let errors = 0;

  // 1. Check all required files exist
  for (const file of REQUIRED_FILES) {
    const fullPath = path.join(TARGET_DIR, file);
    if (!fs.existsSync(fullPath)) {
      console.error(`  [✗] Missing required file: public/tabstationtoo/${file}`);
      errors++;
    } else {
      const stats = fs.statSync(fullPath);
      if (stats.size === 0) {
        console.error(`  [✗] File is empty: public/tabstationtoo/${file}`);
        errors++;
      }
    }
  }

  // 2. Syntax validation
  try {
    execSync(`node -c "${path.join(TARGET_DIR, "app.js")}"`, { stdio: "ignore" });
    log("  [✓] Syntax check passed: public/tabstationtoo/app.js");
  } catch (e) {
    console.error("  [✗] Syntax check failed on public/tabstationtoo/app.js");
    errors++;
  }

  try {
    execSync(`node -c "${path.join(TARGET_DIR, "isolation.js")}"`, { stdio: "ignore" });
    log("  [✓] Syntax check passed: public/tabstationtoo/isolation.js");
  } catch (e) {
    console.error("  [✗] Syntax check failed on public/tabstationtoo/isolation.js");
    errors++;
  }

  // 3. Contract checks
  for (const contract of CONTRACTS) {
    const filePath = path.join(TARGET_DIR, contract.file);
    if (!fs.existsSync(filePath)) {
      errors++;
      continue;
    }
    const content = fs.readFileSync(filePath, "utf8");
    if (!contract.test(content)) {
      console.error(`  [✗] Contract violation: ${contract.name}`);
      errors++;
    } else {
      log(`  [✓] Contract verified: ${contract.name}`);
    }
  }

  if (errors > 0) {
    throw new Error(`Verification failed with ${errors} error(s).`);
  }

  log("[✓] All TabStationToo contracts and assets are intact.");
  return true;
}

async function checkUpstream() {
  log("Checking upstream repository status (branch: wasm)...");
  if (!fs.existsSync(SUBMODULE_DIR)) {
    log("Submodule directory not found. Initializing...");
    runCmd("git submodule update --init --recursive vendor/TabStationToo");
  }

  try {
    runCmd("git fetch origin wasm", SUBMODULE_DIR);
    const localHash = runCmd("git rev-parse HEAD", SUBMODULE_DIR);
    const remoteHash = runCmd("git rev-parse origin/wasm", SUBMODULE_DIR);

    log(`Submodule Local Commit:  ${localHash}`);
    log(`Submodule Remote Commit: ${remoteHash}`);

    if (localHash === remoteHash) {
      log("[✓] Submodule is up to date with upstream origin/wasm.");
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

async function downloadWasmBinaryIfMissing(filename, expectedMinBytes) {
  const targetFile = path.join(TARGET_DIR, filename);
  if (fs.existsSync(targetFile)) {
    const size = fs.statSync(targetFile).size;
    if (size >= expectedMinBytes) {
      return;
    }
  }

  log(`Downloading upstream ${filename} from GitHub Pages (${GITHUB_PAGES_BASE})...`);
  const url = `${GITHUB_PAGES_BASE}/${filename}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to download ${url}: HTTP ${res.status}`);
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(targetFile, buffer);
  log(`Downloaded ${filename} (${buffer.length} bytes).`);
}

async function syncFromUpstream() {
  log("Starting synchronization from TabStationToo submodule...");

  // 1. Ensure submodule is initialized and up to date
  if (!fs.existsSync(SUBMODULE_DIR) || fs.readdirSync(SUBMODULE_DIR).length === 0) {
    log("Initializing submodule vendor/TabStationToo...");
    runCmd("git submodule update --init --recursive vendor/TabStationToo");
  } else {
    try {
      log("Pulling latest upstream changes on wasm branch...");
      runCmd("git fetch origin wasm", SUBMODULE_DIR);
      runCmd("git checkout wasm", SUBMODULE_DIR);
      runCmd("git merge --ff-only origin/wasm || true", SUBMODULE_DIR);
    } catch (e) {
      log(`Submodule fetch warning: ${e.message}`);
    }
  }

  const upstreamCommit = runCmd("git rev-parse HEAD", SUBMODULE_DIR);
  log(`Upstream commit: ${upstreamCommit}`);

  if (!fs.existsSync(UPSTREAM_WEB_DIR)) {
    throw new Error(`Upstream web directory not found at ${UPSTREAM_WEB_DIR}`);
  }

  // 2. Copy static upstream web files that have no ROM Vault custom overrides
  const staticFilesAndDirs = [
    "audio-tap.js",
    "cable-worker.js",
    "coi-serviceworker.js",
    "coi-serviceworker-LICENSE.txt",
    "disc-worker.js",
    "favicon.svg",
    "icons.svg",
    "style.css",
    "fonts",
    "icons",
    "library",
    "vendor",
  ];

  for (const item of staticFilesAndDirs) {
    const src = path.join(UPSTREAM_WEB_DIR, item);
    const dst = path.join(TARGET_DIR, item);
    if (!fs.existsSync(src)) continue;

    if (fs.statSync(src).isDirectory()) {
      fs.cpSync(src, dst, { recursive: true });
    } else {
      fs.copyFileSync(src, dst);
    }
  }
  log("Copied upstream static web assets (workers, css, fonts, icons, library).");

  // 3. Ensure wasm binaries are present
  await downloadWasmBinaryIfMissing("pcsx2-wasm.wasm", 10 * 1024 * 1024);
  await downloadWasmBinaryIfMissing("pcsx2-wasm.data", 4 * 1024 * 1024);
  await downloadWasmBinaryIfMissing("pcsx2-wasm.js", 200 * 1024);

  // 4. Verify that target files have all ROM Vault contracts
  await verifyContracts();

  log("Sync completed successfully.");
}

async function main() {
  const args = process.argv.slice(2);
  const isVerify = args.includes("--verify");
  const isCheck = args.includes("--check") || args.includes("--check-upstream");
  const isHelp = args.includes("--help") || args.includes("-h");

  if (isHelp) {
    console.log(`
TabStationToo Upstream Synchronization Tool

Options:
  --verify          Verify all files and ROM Vault contracts (used in CI/CD)
  --check           Check upstream remote repository for newer commits
  --update          Perform upstream pull, asset sync, and contract verification (default)
  --help, -h        Show this help message
`);
    process.exit(0);
  }

  try {
    if (isVerify) {
      await verifyContracts();
    } else if (isCheck) {
      await checkUpstream();
    } else {
      await syncFromUpstream();
    }
  } catch (err) {
    console.error(`\n[ERROR] ${err.message}`);
    process.exit(1);
  }
}

main();
