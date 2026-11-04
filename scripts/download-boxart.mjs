#!/usr/bin/env node
// ==============================================================================
// ROM Vault - Automated 2D Box Art (Cover) Downloader
// Downloads official HD 2D box art from IGDB CDN into artwork/artwork_front/
// Can be run repeatedly on new batches; skips already existing box art in 0ms.
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

const CLIENT_ID = process.env.TWITCH_CLIENT_ID;
const CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;
const STORAGE_ROOT =
  process.env.STORAGE_ROOT || "/mnt/storage/oldsmarchaos.com/roms";

const IGDB_PLATFORM_MAP = {
  nes: 18,
  snes: 19,
  n64: 4,
  gb: 33,
  gbc: 22,
  gba: 24,
  genesis: 29,
  sega32x: 30,
  sms: 64,
  sgg: 35,
  saturn: 32,
  dreamcast: 23,
  psx: 7,
  ps2: 8,
  gamecube: 21,
};

// Parse CLI flags
const args = process.argv.slice(2);
let targetSystem = null;
let limit = null;
let delayMs = 300;
let forceAll = false;

for (const arg of args) {
  if (arg.startsWith("--system=")) {
    targetSystem = arg.split("=")[1].toLowerCase().trim();
  } else if (arg.startsWith("--limit=")) {
    limit = parseInt(arg.split("=")[1], 10);
  } else if (arg.startsWith("--delay=")) {
    delayMs = Math.max(260, parseInt(arg.split("=")[1], 10));
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

function cleanTitleForSearch(title) {
  return title
    .replace(/\s*\([^)]*\)/g, "")
    .replace(/\s*\[[^\]]*\]/g, "")
    .replace(/[\-–—:]/g, " ")
    .replace(/['"!?._]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const ROMAN_NUMERALS = {
  ii: "2",
  iii: "3",
  iv: "4",
  v: "5",
  vi: "6",
  vii: "7",
  viii: "8",
  ix: "9",
};

function normalizeForMatch(title) {
  if (!title) return "";
  let s = title.toLowerCase();
  s = s.replace(/\s*\([^)]*\)/g, "").replace(/\s*\[[^\]]*\]/g, "");
  s = s.replace(/[\-–—:._'"!?]/g, " ");
  const words = s
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => ROMAN_NUMERALS[w] || w);
  return words.join(" ");
}

function extractSequelNumber(normalized) {
  const tokens = normalized.split(/\s+/);
  for (const t of tokens) {
    if (/^[0-9]+$/.test(t)) {
      return t;
    }
    const match = t.match(/[a-z]+([0-9]+)$/);
    if (match) return match[1];
  }
  return null;
}

function findBestMatch(items, cleanTitle, targetPlatform) {
  if (!Array.isArray(items) || items.length === 0) return null;

  const cleanNorm = normalizeForMatch(cleanTitle);
  const cleanNum = extractSequelNumber(cleanNorm);

  let best = null;
  let bestScore = -1;

  for (const item of items) {
    if (!item.name) continue;
    const itemNorm = normalizeForMatch(item.name);
    const itemNum = extractSequelNumber(itemNorm);

    // Hard constraint: Sequel numbers must strictly match
    if (cleanNum !== itemNum) {
      continue;
    }

    let titleScore = 0;
    if (itemNorm === cleanNorm) {
      titleScore = 100;
    } else if (
      itemNorm.startsWith(cleanNorm + " ") ||
      cleanNorm.startsWith(itemNorm + " ")
    ) {
      titleScore = 50;
    } else {
      const cleanWords = cleanNorm.split(" ");
      const itemWords = itemNorm.split(" ");
      const matchingWords = cleanWords.filter((w) => itemWords.includes(w));
      if (
        matchingWords.length > 0 &&
        matchingWords.length >= Math.ceil(cleanWords.length / 2)
      ) {
        titleScore = 20 * matchingWords.length;
      }
    }

    if (titleScore === 0) {
      continue;
    }

    let score = titleScore;
    const platformMatch =
      targetPlatform &&
      Array.isArray(item.platforms) &&
      item.platforms.includes(targetPlatform);

    if (platformMatch) score += 40;
    if (item.category === 0) score += 10;
    if (item.category === 5) score -= 30;
    if (item.cover?.image_id) score += 5;

    if (score > bestScore) {
      bestScore = score;
      best = item;
    }
  }

  if (bestScore < 40) return null;
  return best;
}

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

// Check if a 2D box art file already exists for a game
function hasLocalBoxArt(system, baseName) {
  const frontDir = path.join(STORAGE_ROOT, system, "artwork", "artwork_front");
  if (!fs.existsSync(frontDir)) return false;

  const extensions = [".png", ".jpg", ".jpeg", ".webp"];
  for (const ext of extensions) {
    if (fs.existsSync(path.join(frontDir, `${baseName}${ext}`))) {
      return true;
    }
  }
  return false;
}

async function main() {
  console.log("==================================================================");
  console.log("        ROM Vault - 2D Box Art Downloader (IGDB CDN)             ");
  console.log("==================================================================");
  console.log(`[*] Target Storage: ${STORAGE_ROOT}`);
  if (targetSystem) console.log(`[*] Target System:  ${targetSystem}`);
  if (limit) console.log(`[*] Batch Limit:    ${limit}`);
  if (forceAll) console.log(`[*] Force Mode:     Re-downloading existing covers`);
  console.log("");

  const token = await getTwitchToken();
  console.log("[✓] Twitch OAuth token acquired successfully.");

  // Load existing IGDB IDs from MariaDB
  let mysql;
  const igdbMap = new Map();
  try {
    mysql = await import("mysql2/promise");
    const pool = mysql.createPool({
      host: process.env.DB_HOST || "127.0.0.1",
      port: parseInt(process.env.DB_PORT || "3306", 10),
      user: process.env.DB_USER || "cfw34683",
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME || "rom_vault",
    });

    const [dbRows] = await pool.query(
      "SELECT id, clean_title, igdb_id FROM game_metadata WHERE igdb_id IS NOT NULL"
    );
    await pool.end();

    for (const row of dbRows) {
      igdbMap.set(row.id, row.igdb_id);
    }
    console.log(`[✓] Indexed ${igdbMap.size} games with verified IGDB IDs from database.`);
  } catch (err) {
    console.warn(`[!] Could not connect to MariaDB (${err.message}). Will query IGDB by title.`);
  }

  // Discover candidate systems
  const allSystems = fs
    .readdirSync(STORAGE_ROOT, { withFileTypes: true })
    .filter((ent) => ent.isDirectory() && ent.name !== "saves")
    .map((ent) => ent.name);

  const systemsToScan = targetSystem
    ? allSystems.filter((s) => s.toLowerCase() === targetSystem)
    : allSystems;

  if (systemsToScan.length === 0) {
    console.error(`[-] No matching system directory found for '${targetSystem}'.`);
    process.exit(1);
  }

  // Scan ROM files on disk
  console.log("[*] Scanning storage directories for missing 2D box art...");
  let queue = [];

  for (const sys of systemsToScan) {
    const romsDir = path.join(STORAGE_ROOT, sys, "roms");
    if (!fs.existsSync(romsDir)) continue;

    const files = fs
      .readdirSync(romsDir, { withFileTypes: true })
      .filter((ent) => ent.isFile() && !ent.name.startsWith("."));

    for (const file of files) {
      const extIdx = file.name.lastIndexOf(".");
      const baseName = extIdx > 0 ? file.name.slice(0, extIdx) : file.name;

      if (!forceAll && hasLocalBoxArt(sys, baseName)) {
        continue;
      }

      // Resolve known IGDB ID if present
      const idKey = `${sys}__${encodeURIComponent(baseName)}`;
      const igdbId = igdbMap.get(idKey) || igdbMap.get(decodeURIComponent(idKey));

      queue.push({
        system: sys,
        baseName,
        igdbId: igdbId || null,
      });
    }
  }

  if (limit && limit > 0) {
    queue = queue.slice(0, limit);
  }

  console.log(`[*] Total games needing 2D box art: ${queue.length}`);
  if (queue.length === 0) {
    console.log("[✓] All games already have 2D box art present!");
    process.exit(0);
  }

  const estSec = (queue.length * delayMs) / 1000;
  console.log(`[*] Estimated download duration: ~${formatTime(estSec)}`);
  console.log("------------------------------------------------------------------");

  let downloadedCount = 0;
  let noCoverCount = 0;
  let errorCount = 0;
  const startTime = Date.now();

  // Process items in batches of 50 where IGDB ID is known
  for (let i = 0; i < queue.length; i++) {
    const item = queue[i];
    const overallIndex = i + 1;
    const pct = ((overallIndex / queue.length) * 100).toFixed(1);

    const elapsedSeconds = (Date.now() - startTime) / 1000;
    const avgSecPerItem = elapsedSeconds / overallIndex;
    const remainingItems = queue.length - overallIndex;
    const etaSeconds = avgSecPerItem * remainingItems;

    let imageId = null;

    // 1. If we have an IGDB ID, query cover for it
    if (item.igdbId) {
      try {
        const q = `fields cover.image_id; where id = ${item.igdbId}; limit 1;`;
        const res = await fetch("https://api.igdb.com/v4/games", {
          method: "POST",
          headers: {
            "Client-ID": CLIENT_ID,
            Authorization: `Bearer ${token}`,
          },
          body: q,
        });

        if (res.status === 429) {
          console.warn("\n[!] Rate limit reached. Pausing 5s...");
          await sleep(5000);
          i--;
          continue;
        }

        if (res.ok) {
          const list = await res.json();
          if (list[0]?.cover?.image_id) {
            imageId = list[0].cover.image_id;
          }
        }
      } catch (err) {
        console.warn(`[!] Cover query error: ${err.message}`);
      }
    }

    // 2. Fallback: Search IGDB by clean title and target platform
    if (!imageId) {
      const clean = cleanTitleForSearch(item.baseName);
      const platformId = IGDB_PLATFORM_MAP[item.system.toLowerCase()];
      if (clean && platformId) {
        try {
          const searchQ = `search "${clean}"; fields name, cover.image_id, platforms, category; where platforms = [${platformId}]; limit 15;`;
          const sRes = await fetch("https://api.igdb.com/v4/games", {
            method: "POST",
            headers: {
              "Client-ID": CLIENT_ID,
              Authorization: `Bearer ${token}`,
            },
            body: searchQ,
          });

          if (sRes.ok) {
            const matches = await sRes.json();
            const hit = findBestMatch(matches, clean, platformId);
            if (hit?.cover?.image_id) {
              imageId = hit.cover.image_id;
            }
          }
        } catch {}
      }
    }

    if (!imageId) {
      noCoverCount++;
      console.log(
        `[${overallIndex}/${queue.length}] (${pct}%) [${item.system.toUpperCase()}] ${item.baseName} -> No cover found on IGDB | ETA: ${formatTime(etaSeconds)}`
      );
      await sleep(delayMs);
      continue;
    }

    // Download HD cover from CloudFront CDN
    // Primary: t_1080p, Fallback: t_cover_big_2x
    const targetDir = path.join(STORAGE_ROOT, item.system, "artwork", "artwork_front");
    const targetPath = path.join(targetDir, `${item.baseName}.jpg`);

    try {
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }

      let imgRes = await fetch(`https://images.igdb.com/igdb/image/upload/t_1080p/${imageId}.jpg`);
      if (!imgRes.ok) {
        imgRes = await fetch(`https://images.igdb.com/igdb/image/upload/t_cover_big_2x/${imageId}.jpg`);
      }

      if (imgRes.ok) {
        const buffer = Buffer.from(await imgRes.arrayBuffer());
        fs.writeFileSync(targetPath, buffer);
        try {
          fs.chmodSync(targetPath, 0o664);
        } catch {}

        downloadedCount++;
        console.log(
          `[${overallIndex}/${queue.length}] (${pct}%) [${item.system.toUpperCase()}] ${item.baseName} -> Saved 2D Box Art (${(buffer.length / 1024).toFixed(0)} KB) | ETA: ${formatTime(etaSeconds)}`
        );
      } else {
        errorCount++;
        console.warn(
          `[${overallIndex}/${queue.length}] (${pct}%) [${item.system.toUpperCase()}] ${item.baseName} -> CDN Error HTTP ${imgRes.status}`
        );
      }
    } catch (err) {
      errorCount++;
      console.error(
        `[${overallIndex}/${queue.length}] (${pct}%) [${item.system.toUpperCase()}] ${item.baseName} -> Download failed: ${err.message}`
      );
    }

    await sleep(delayMs);
  }

  const totalTimeSeconds = ((Date.now() - startTime) / 1000).toFixed(0);
  console.log("==================================================================");
  console.log(`[✓] 2D Box Art Download Complete in ${formatTime(totalTimeSeconds)}!`);
  console.log(`    - Box Art Downloaded: ${downloadedCount}`);
  console.log(`    - Games without Cover: ${noCoverCount}`);
  console.log(`    - Download Errors:     ${errorCount}`);
  console.log("==================================================================");
  console.log("[*] Run 'npm run scan' (or click Rescan in Admin) to update catalog.");
}

main().catch((err) => {
  console.error("[-] Fatal error:", err);
  process.exit(1);
});
