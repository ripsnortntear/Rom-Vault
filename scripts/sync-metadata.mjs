#!/usr/bin/env node
// ==============================================================================
// ROM Vault - IGDB Bulk Metadata Sync Engine
// Respects IGDB rate limits: max 4 req/sec (configured to ~3.3 req/sec)
// ==============================================================================

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, "..");

// 1. Load .env.local configuration
function loadEnv() {
  const envPath = path.join(ROOT_DIR, ".env.local");
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, "utf8").split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const idx = trimmed.indexOf("=");
      if (idx > 0) {
        const key = trimmed.slice(0, idx).trim();
        const val = trimmed.slice(idx + 1).trim().replace(/^['"]|['"]$/g, "");
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  }
}

loadEnv();

const AUTH_SECRET = process.env.AUTH_SECRET || process.env.SESSION_SECRET;
const PORT = process.env.PORT || "39254";
const BASE_URL = `http://127.0.0.1:${PORT}/roms`;

// Parse command line arguments
const args = process.argv.slice(2);
let targetSystem = null;
let limit = null;
let delayMs = 300; // ~3.3 requests per second (safely under 4 req/sec limit)
let forceAll = false;

for (const arg of args) {
  if (arg.startsWith("--system=")) {
    targetSystem = arg.split("=")[1].toLowerCase().trim();
  } else if (arg.startsWith("--limit=")) {
    limit = parseInt(arg.split("=")[1], 10);
  } else if (arg.startsWith("--delay=")) {
    delayMs = Math.max(260, parseInt(arg.split("=")[1], 10)); // minimum 260ms (~3.8 req/sec)
  } else if (arg === "--force") {
    forceAll = true;
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function formatTime(seconds) {
  if (!seconds || seconds <= 0 || !isFinite(seconds)) return "calculating...";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  if (m > 60) {
    const h = Math.floor(m / 60);
    const remM = m % 60;
    return `${h}h ${remM}m`;
  }
  return `${m}m ${s}s`;
}

async function main() {
  console.log("==================================================================");
  console.log("       ROM Vault - IGDB Bulk Metadata Synchronizer               ");
  console.log("==================================================================");
  console.log(`[*] Target Server: ${BASE_URL}`);
  console.log(`[*] Rate Limiting: 1 request every ${delayMs}ms (~${(1000 / delayMs).toFixed(1)} req/sec)`);
  if (targetSystem) console.log(`[*] Filter System: ${targetSystem}`);
  if (limit) console.log(`[*] Batch Limit: ${limit}`);
  if (forceAll) console.log(`[*] Force Mode: Re-fetching existing metadata`);
  console.log("");

  // 1. Fetch library games from active vault
  console.log("[*] Fetching games from local vault...");
  const headers = {};
  if (AUTH_SECRET) {
    headers["Authorization"] = `Bearer ${AUTH_SECRET}`;
  }

  const libRes = await fetch(`${BASE_URL}/api/games`, { headers });
  if (!libRes.ok) {
    console.error(`[-] Failed to fetch game library from server (HTTP ${libRes.status})`);
    process.exit(1);
  }

  const libData = await libRes.json();
  let games = libData.games || [];
  console.log(`[✓] Discovered ${games.length} total games in library.`);

  // Filter by system if specified
  if (targetSystem) {
    games = games.filter((g) => g.system.toLowerCase() === targetSystem);
    console.log(`[*] Filtered to ${games.length} games for system '${targetSystem}'.`);
  }

  // Filter out games that already have year / metadata (unless --force)
  let queue = forceAll ? games : games.filter((g) => !g.year);

  if (limit && limit > 0) {
    queue = queue.slice(0, limit);
  }

  console.log(`[*] Games needing metadata update: ${queue.length} (Skipping ${games.length - queue.length} already cached)`);
  if (queue.length === 0) {
    console.log("[✓] All selected games are already enriched with IGDB metadata!");
    process.exit(0);
  }

  const estTotalSeconds = (queue.length * delayMs) / 1000;
  console.log(`[*] Estimated sync duration: ~${formatTime(estTotalSeconds)}`);
  console.log("------------------------------------------------------------------");

  let successCount = 0;
  let notFoundCount = 0;
  let errorCount = 0;
  const startTime = Date.now();

  for (let i = 0; i < queue.length; i++) {
    const game = queue[i];
    const itemNum = i + 1;
    const pct = ((itemNum / queue.length) * 100).toFixed(1);

    const elapsedSeconds = (Date.now() - startTime) / 1000;
    const avgSecPerItem = elapsedSeconds / itemNum;
    const remainingItems = queue.length - itemNum;
    const etaSeconds = avgSecPerItem * remainingItems;

    const gameTitle = game.displayTitle || game.baseName;
    const url = `${BASE_URL}/api/games/${encodeURIComponent(game.id)}/metadata?title=${encodeURIComponent(gameTitle)}`;

    let attempts = 0;
    let resolved = false;

    while (attempts < 3 && !resolved) {
      attempts++;
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: {
            ...headers,
            "Content-Type": "application/json",
          },
        });

        if (res.status === 429) {
          console.warn(`\n[!] Rate limit reached (HTTP 429). Pausing for 5 seconds...`);
          await sleep(5000);
          continue;
        }

        if (res.ok) {
          const result = await res.json();
          resolved = true;
          if (result?.found && result?.metadata?.year) {
            successCount++;
            const meta = result.metadata;
            const dev = meta.developer ? ` (${meta.developer})` : "";
            console.log(
              `[${itemNum}/${queue.length}] (${pct}%) [${game.system.toUpperCase()}] ${gameTitle} -> ${meta.year}${dev} | ETA: ${formatTime(etaSeconds)}`
            );
          } else {
            notFoundCount++;
            console.log(
              `[${itemNum}/${queue.length}] (${pct}%) [${game.system.toUpperCase()}] ${gameTitle} -> No match in IGDB | ETA: ${formatTime(etaSeconds)}`
            );
          }
        } else {
          resolved = true;
          errorCount++;
          console.warn(
            `[${itemNum}/${queue.length}] (${pct}%) [${game.system.toUpperCase()}] ${gameTitle} -> HTTP ${res.status} | ETA: ${formatTime(etaSeconds)}`
          );
        }
      } catch (err) {
        if (attempts >= 3) {
          errorCount++;
          console.error(
            `[${itemNum}/${queue.length}] (${pct}%) [${game.system.toUpperCase()}] ${gameTitle} -> Network Error: ${err.message}`
          );
        } else {
          await sleep(1500);
        }
      }
    }

    // Rate limiter throttle between requests
    await sleep(delayMs);
  }

  const totalTimeSeconds = ((Date.now() - startTime) / 1000).toFixed(0);
  console.log("==================================================================");
  console.log(`[✓] Metadata Sync Completed in ${formatTime(totalTimeSeconds)}!`);
  console.log(`    - Resolved & Updated: ${successCount}`);
  console.log(`    - Not in IGDB:        ${notFoundCount}`);
  console.log(`    - Errors / Skipped:   ${errorCount}`);
  console.log("==================================================================");
}

main().catch((err) => {
  console.error("[-] Fatal sync error:", err);
  process.exit(1);
});
