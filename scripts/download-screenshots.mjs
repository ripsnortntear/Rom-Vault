#!/usr/bin/env node
// ==============================================================================
// ROM Vault - Automated In-Game Screenshot Downloader
// Fetches official high-res screenshots from IGDB CDN for games missing them.
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
const CLIENT_ID = process.env.TWITCH_CLIENT_ID;
const CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;

const STORAGE_ROOT =
  process.env.STORAGE_ROOT || "/mnt/storage/oldsmarchaos.com/roms";

// Parse CLI flags
const args = process.argv.slice(2);
let targetSystem = null;
let limit = null;
let quality = "720p"; // 720p, 1080p, or screenshot_big
let delayMs = 300;

for (const arg of args) {
  if (arg.startsWith("--system=")) {
    targetSystem = arg.split("=")[1].toLowerCase().trim();
  } else if (arg.startsWith("--limit=")) {
    limit = parseInt(arg.split("=")[1], 10);
  } else if (arg.startsWith("--delay=")) {
    delayMs = Math.max(260, parseInt(arg.split("=")[1], 10));
  } else if (arg.startsWith("--quality=")) {
    quality = arg.split("=")[1].trim();
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

// Acquire Twitch OAuth token
async function getTwitchToken() {
  if (!CLIENT_ID || !CLIENT_SECRET) {
    throw new Error("Missing TWITCH_CLIENT_ID or TWITCH_CLIENT_SECRET in .env.local");
  }
  const res = await fetch(
    `https://id.twitch.tv/oauth2/token?client_id=${CLIENT_ID}&client_secret=${CLIENT_SECRET}&grant_type=client_credentials`,
    { method: "POST" }
  );
  if (!res.ok) {
    throw new Error(`Failed to authenticate with Twitch OAuth: HTTP ${res.status}`);
  }
  const data = await res.json();
  return data.access_token;
}

// Check if a screenshot already exists for a game baseName
function hasLocalScreenshot(system, baseName) {
  const screenshotDir = path.join(STORAGE_ROOT, system, "artwork", "screenshot");
  if (!fs.existsSync(screenshotDir)) return false;

  const extensions = [".png", ".jpg", ".jpeg", ".webp"];
  for (const ext of extensions) {
    if (fs.existsSync(path.join(screenshotDir, `${baseName}${ext}`))) {
      return true;
    }
  }
  return false;
}

async function main() {
  console.log("==================================================================");
  console.log("      ROM Vault - In-Game Screenshot Downloader (IGDB CDN)       ");
  console.log("==================================================================");
  console.log(`[*] Target Storage: ${STORAGE_ROOT}`);
  console.log(`[*] Image Quality:  ${quality}`);
  if (targetSystem) console.log(`[*] Target System:  ${targetSystem}`);
  if (limit) console.log(`[*] Batch Limit:    ${limit}`);
  console.log("");

  const token = await getTwitchToken();
  console.log("[✓] Twitch OAuth token acquired successfully.");

  // Fetch games and cached IGDB metadata
  console.log("[*] Querying vault library...");
  const headers = {};
  if (AUTH_SECRET) {
    headers["Authorization"] = `Bearer ${AUTH_SECRET}`;
  }

  const libRes = await fetch(`${BASE_URL}/api/games`, { headers });
  if (!libRes.ok) {
    console.error(`[-] Failed fetching games from server (HTTP ${libRes.status})`);
    process.exit(1);
  }

  const { games } = await libRes.json();
  console.log(`[✓] Loaded ${games.length} games from library.`);

  // Load IGDB IDs from MariaDB via dynamic import or direct DB connection
  let mysql;
  try {
    mysql = await import("mysql2/promise");
  } catch {
    console.error("[-] mysql2 is required to read igdb_ids from database.");
    process.exit(1);
  }

  const pool = mysql.createPool({
    host: process.env.DB_HOST || "127.0.0.1",
    port: parseInt(process.env.DB_PORT || "3306", 10),
    user: process.env.DB_USER || "cfw34683",
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || "rom_vault",
  });

  const [dbRows] = await pool.query(
    "SELECT id, igdb_id FROM game_metadata WHERE igdb_id IS NOT NULL"
  );
  await pool.end();

  const igdbMap = new Map();
  for (const row of dbRows) {
    igdbMap.set(row.id, row.igdb_id);
  }
  console.log(`[✓] Indexed ${igdbMap.size} games with verified IGDB IDs.`);

  // Build download queue
  let queue = [];
  for (const game of games) {
    if (targetSystem && game.system.toLowerCase() !== targetSystem) continue;

    // Check if screenshot already exists on disk
    if (hasLocalScreenshot(game.system, game.baseName)) {
      continue;
    }

    const igdbId = igdbMap.get(game.id) || igdbMap.get(decodeURIComponent(game.id));
    if (!igdbId) {
      continue; // No IGDB ID found
    }

    queue.push({
      game,
      igdbId,
    });
  }

  if (limit && limit > 0) {
    queue = queue.slice(0, limit);
  }

  console.log(`[*] Games needing screenshots: ${queue.length}`);
  if (queue.length === 0) {
    console.log("[✓] All target games already have screenshots present!");
    process.exit(0);
  }

  const estSec = (queue.length * delayMs) / 1000;
  console.log(`[*] Estimated download time: ~${formatTime(estSec)}`);
  console.log("------------------------------------------------------------------");

  let downloadedCount = 0;
  let noScreenshotCount = 0;
  let failedCount = 0;
  const startTime = Date.now();

  // Process in batches of 50 to optimize IGDB queries
  const BATCH_SIZE = 50;
  for (let b = 0; b < queue.length; b += BATCH_SIZE) {
    const batch = queue.slice(b, b + BATCH_SIZE);
    const idList = batch.map((item) => item.igdbId).join(", ");

    const queryBody = `fields id, screenshots.image_id; where id = (${idList}); limit ${BATCH_SIZE};`;

    let igdbResults = [];
    try {
      const igdbRes = await fetch("https://api.igdb.com/v4/games", {
        method: "POST",
        headers: {
          "Client-ID": CLIENT_ID,
          Authorization: `Bearer ${token}`,
        },
        body: queryBody,
      });

      if (igdbRes.ok) {
        igdbResults = await igdbRes.json();
      } else {
        console.warn(`[!] IGDB batch query failed: HTTP ${igdbRes.status}`);
      }
    } catch (err) {
      console.error(`[-] Batch query error: ${err.message}`);
    }

    const screenshotLookup = new Map();
    for (const res of igdbResults) {
      if (Array.isArray(res.screenshots) && res.screenshots.length > 0) {
        // Pick the primary screenshot
        const imageId = res.screenshots[0].image_id;
        if (imageId) {
          screenshotLookup.set(res.id, imageId);
        }
      }
    }

    // Download images for each game in the batch
    for (let i = 0; i < batch.length; i++) {
      const { game, igdbId } = batch[i];
      const overallIndex = b + i + 1;
      const pct = ((overallIndex / queue.length) * 100).toFixed(1);

      const elapsedSeconds = (Date.now() - startTime) / 1000;
      const avgSecPerItem = elapsedSeconds / overallIndex;
      const remainingItems = queue.length - overallIndex;
      const etaSeconds = avgSecPerItem * remainingItems;

      const imageId = screenshotLookup.get(igdbId);
      const title = game.displayTitle || game.baseName;

      if (!imageId) {
        noScreenshotCount++;
        console.log(
          `[${overallIndex}/${queue.length}] (${pct}%) [${game.system.toUpperCase()}] ${title} -> No screenshot on IGDB | ETA: ${formatTime(etaSeconds)}`
        );
        continue;
      }

      // Download image from CloudFront CDN
      const imageUrl = `https://images.igdb.com/igdb/image/upload/t_${quality}/${imageId}.jpg`;
      const targetDir = path.join(STORAGE_ROOT, game.system, "artwork", "screenshot");
      const targetPath = path.join(targetDir, `${game.baseName}.jpg`);

      try {
        if (!fs.existsSync(targetDir)) {
          fs.mkdirSync(targetDir, { recursive: true });
        }

        const imgRes = await fetch(imageUrl);
        if (imgRes.ok) {
          const buffer = Buffer.from(await imgRes.arrayBuffer());
          fs.writeFileSync(targetPath, buffer);
          downloadedCount++;
          console.log(
            `[${overallIndex}/${queue.length}] (${pct}%) [${game.system.toUpperCase()}] ${title} -> Saved screenshot (${(buffer.length / 1024).toFixed(0)} KB) | ETA: ${formatTime(etaSeconds)}`
          );
        } else {
          failedCount++;
          console.warn(
            `[${overallIndex}/${queue.length}] (${pct}%) [${game.system.toUpperCase()}] ${title} -> CDN Error HTTP ${imgRes.status}`
          );
        }
      } catch (err) {
        failedCount++;
        console.error(
          `[${overallIndex}/${queue.length}] (${pct}%) [${game.system.toUpperCase()}] ${title} -> Download failed: ${err.message}`
        );
      }
    }

    // Rate limiter between IGDB batches
    await sleep(delayMs);
  }

  const totalTimeSeconds = ((Date.now() - startTime) / 1000).toFixed(0);
  console.log("==================================================================");
  console.log(`[✓] Screenshot Download Complete in ${formatTime(totalTimeSeconds)}!`);
  console.log(`    - Screenshots Downloaded: ${downloadedCount}`);
  console.log(`    - Games without IGDB Art: ${noScreenshotCount}`);
  console.log(`    - Download Errors:        ${failedCount}`);
  console.log("==================================================================");
  console.log("[*] Run 'npm run scan' to refresh the web catalog with new screenshots.");
}

main().catch((err) => {
  console.error("[-] Fatal error:", err);
  process.exit(1);
});
