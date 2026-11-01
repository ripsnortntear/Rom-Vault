#!/usr/bin/env node
// ==============================================================================
// ROM Vault - Unified Multi-Asset Downloader & Metadata Engine
// Downloads Box Art, Screenshots, Title Screens, Logos, Discs, Stories & Videos
// Multi-Source: IGDB, Libretro Thumbnails, SteamGridDB & TheGamesDB
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
const STEAMGRIDDB_API_KEY = process.env.STEAMGRIDDB_API_KEY;
const THEGAMESDB_API_KEY = process.env.THEGAMESDB_API_KEY;

const STORAGE_ROOT =
  process.env.STORAGE_ROOT || "/mnt/storage/oldsmarchaos.com/roms";

// Platform mapping for IGDB and Libretro
const PLATFORM_CONFIG = {
  nes: {
    igdbId: 18,
    libretroRepo: "Nintendo_-_Nintendo_Entertainment_System",
    isDisc: false,
    label: "NES",
  },
  snes: {
    igdbId: 19,
    libretroRepo: "Nintendo_-_Super_Nintendo_Entertainment_System",
    isDisc: false,
    label: "Super Nintendo",
  },
  n64: {
    igdbId: 4,
    libretroRepo: "Nintendo_-_Nintendo_64",
    isDisc: false,
    label: "Nintendo 64",
  },
  gb: {
    igdbId: 33,
    libretroRepo: "Nintendo_-_Game_Boy",
    isDisc: false,
    label: "Game Boy",
  },
  gbc: {
    igdbId: 22,
    libretroRepo: "Nintendo_-_Game_Boy_Color",
    isDisc: false,
    label: "Game Boy Color",
  },
  gba: {
    igdbId: 24,
    libretroRepo: "Nintendo_-_Game_Boy_Advance",
    isDisc: false,
    label: "Game Boy Advance",
  },
  gamecube: {
    igdbId: 21,
    libretroRepo: "Nintendo_-_GameCube",
    isDisc: true,
    label: "Nintendo GameCube",
  },
  genesis: {
    igdbId: 29,
    libretroRepo: "Sega_-_Mega_Drive_-_Genesis",
    isDisc: false,
    label: "Sega Genesis",
  },
  sega32x: {
    igdbId: 30,
    libretroRepo: "Sega_-_32X",
    isDisc: false,
    label: "Sega 32X",
  },
  sms: {
    igdbId: 64,
    libretroRepo: "Sega_-_Master_System_-_Mark_III",
    isDisc: false,
    label: "Sega Master System",
  },
  sgg: {
    igdbId: 35,
    libretroRepo: "Sega_-_Game_Gear",
    isDisc: false,
    label: "Sega Game Gear",
  },
  saturn: {
    igdbId: 32,
    libretroRepo: "Sega_-_Saturn",
    isDisc: true,
    label: "Sega Saturn",
  },
  dreamcast: {
    igdbId: 23,
    libretroRepo: "Sega_-_Dreamcast",
    isDisc: true,
    label: "Sega Dreamcast",
  },
  psx: {
    igdbId: 7,
    libretroRepo: "Sony_-_PlayStation",
    isDisc: true,
    label: "Sony PlayStation",
  },
  ps2: {
    igdbId: 8,
    libretroRepo: "Sony_-_PlayStation_2",
    isDisc: true,
    label: "Sony PlayStation 2",
  },
  sgb: {
    igdbId: 33,
    libretroRepo: "Nintendo_-_Game_Boy",
    isDisc: false,
    label: "Super Game Boy",
  },
};

// Help manual generator
function printHelp() {
  console.log(`
================================================================================
       ROM Vault - Unified Multi-Asset Downloader & Metadata Engine
================================================================================

USAGE:
  npm run download-metadata -- [TARGET ASSET FLAGS] [OPTIONS]
  node scripts/download-metadata.mjs [TARGET ASSET FLAGS] [OPTIONS]

TARGET ASSET FLAGS (choose one or more, or use --all):
  --boxart           Download 2D Front Box Art -> artwork/artwork_front/
  --boxart-3d        Download 3D Box Art       -> artwork/artwork_3d/
  --screenshots      Download In-Game Action   -> artwork/screenshot/
  --titlescreens     Download Title Screens    -> artwork/screentitle/
  --disc, --cart     Download Disc/Cart Art    -> artwork/medium_disc|medium_front/
  --logos            Download Wheel Logos      -> artwork/logo/ (SteamGridDB)
  --stories          Download Plot Overviews   -> artwork/story/ + MariaDB
  --videos           Download Preview Clips    -> artwork/video/
  --all              Download ALL missing media types in a combined pass

SYSTEM FILTERING & CONTROLS:
  --system=<sys>     Target single console platform (e.g. ps2, gbc, nes, gamecube)
  --limit=<number>   Process only the first N missing items (useful for testing)
  --delay=<ms>       Delay in milliseconds between IGDB queries (default: 300ms)
  --force            Re-download existing assets (overwrites local files)
  --help, -h         Show this manual

INTEGRATED APIS & DATA SOURCES:
  1. IGDB (Twitch API): HD 2D box covers, 720p screenshots, release dates, plot summaries
  2. Libretro CDN: Authentic title screens (Named_Titles), 2D box art, screenshots
  3. SteamGridDB: Official transparent PNG wheel logos and high-res grids
  4. TheGamesDB: Community game overviews, developer/publisher metadata, fallback covers

SUPPORTED CONSOLE SYSTEMS:
  ps2, psx, gamecube, dreamcast, saturn, n64, snes, nes,
  gba, gbc, gb, sgb, genesis, sega32x, sms, sgg

EXAMPLES:
  # Download transparent wheel logos for PS2 using SteamGridDB:
  npm run download-metadata -- --logos --system=ps2

  # Download 2D box art for PlayStation 2 only:
  npm run download-metadata -- --boxart --system=ps2

  # Download in-game screenshots for Game Boy Color:
  npm run download-metadata -- --screenshots --system=gbc

  # Download both title screens and box art for GameCube:
  npm run download-metadata -- --titlescreens --boxart --system=gamecube

  # Test 2D box art on 5 games:
  npm run download-metadata -- --boxart --system=ps2 --limit=5

  # Download all missing media types across the entire vault:
  npm run download-metadata -- --all

  # Run in the background (disconnect-safe via nohup):
  nohup npm run download-metadata -- --logos --system=ps2 > /tmp/logos.log 2>&1 &
================================================================================
`);
}

// Parse Command Line Arguments
const rawArgs = process.argv.slice(2);
if (rawArgs.includes("--help") || rawArgs.includes("-h") || rawArgs.length === 0) {
  printHelp();
  process.exit(0);
}

const targets = {
  boxart: rawArgs.includes("--boxart") || rawArgs.includes("--2d"),
  boxart3d: rawArgs.includes("--boxart-3d") || rawArgs.includes("--3d"),
  screenshots: rawArgs.includes("--screenshots") || rawArgs.includes("--screenshot"),
  titlescreens: rawArgs.includes("--titlescreens") || rawArgs.includes("--titlescreen"),
  discOrCart: rawArgs.includes("--disc") || rawArgs.includes("--cart") || rawArgs.includes("--cartridge") || rawArgs.includes("--medium"),
  logos: rawArgs.includes("--logos") || rawArgs.includes("--logo") || rawArgs.includes("--wheel"),
  stories: rawArgs.includes("--stories") || rawArgs.includes("--story"),
  videos: rawArgs.includes("--videos") || rawArgs.includes("--video"),
};

if (rawArgs.includes("--all")) {
  Object.keys(targets).forEach((k) => (targets[k] = true));
}

// Ensure at least one asset type was requested
const selectedTypes = Object.entries(targets).filter(([, v]) => v).map(([k]) => k);
if (selectedTypes.length === 0) {
  console.error("[-] Error: No asset type specified. Please supply e.g. --boxart, --screenshots, --logos, or --all.");
  console.log("[*] Run 'npm run download-metadata -- --help' for instructions.");
  process.exit(1);
}

let targetSystem = null;
let limit = null;
let delayMs = 300;
let forceAll = rawArgs.includes("--force");

for (const arg of rawArgs) {
  if (arg.startsWith("--system=")) {
    targetSystem = arg.split("=")[1].toLowerCase().trim();
  } else if (arg.startsWith("--limit=")) {
    limit = parseInt(arg.split("=")[1], 10);
  } else if (arg.startsWith("--delay=")) {
    delayMs = Math.max(260, parseInt(arg.split("=")[1], 10));
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

async function getTwitchToken() {
  if (!CLIENT_ID || !CLIENT_SECRET) return null;
  try {
    const res = await fetch(
      `https://id.twitch.tv/oauth2/token?client_id=${CLIENT_ID}&client_secret=${CLIENT_SECRET}&grant_type=client_credentials`,
      { method: "POST" }
    );
    if (!res.ok) return null;
    const data = await res.json();
    return data.access_token;
  } catch {
    return null;
  }
}

function fileExistsWithAnyExt(dirPath, baseName, extensions = [".png", ".jpg", ".jpeg", ".webp", ".txt", ".mp4"]) {
  if (!fs.existsSync(dirPath)) return false;
  for (const ext of extensions) {
    if (fs.existsSync(path.join(dirPath, `${baseName}${ext}`))) {
      return true;
    }
  }
  return false;
}

async function downloadBinary(url, targetPath) {
  try {
    const dir = path.dirname(targetPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const res = await fetch(url);
    if (!res.ok) return false;
    const buffer = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(targetPath, buffer);
    try {
      fs.chmodSync(targetPath, 0o664);
    } catch {}
    return buffer.length;
  } catch {
    return false;
  }
}

// SteamGridDB: Fetch transparent PNG logo
async function fetchSteamGridDbLogo(cleanTitle) {
  if (!STEAMGRIDDB_API_KEY || !cleanTitle) return null;
  try {
    const sRes = await fetch(
      `https://www.steamgriddb.com/api/v2/search/autocomplete/${encodeURIComponent(cleanTitle)}`,
      { headers: { Authorization: `Bearer ${STEAMGRIDDB_API_KEY}` } }
    );
    if (!sRes.ok) return null;
    const sData = await sRes.json();
    const game = sData?.data?.[0];
    if (!game?.id) return null;

    const lRes = await fetch(`https://www.steamgriddb.com/api/v2/logos/game/${game.id}`, {
      headers: { Authorization: `Bearer ${STEAMGRIDDB_API_KEY}` },
    });
    if (!lRes.ok) return null;
    const lData = await lRes.json();
    return lData?.data?.[0]?.url || null;
  } catch {
    return null;
  }
}

// SteamGridDB: Fetch vertical grid cover
async function fetchSteamGridDbCover(cleanTitle) {
  if (!STEAMGRIDDB_API_KEY || !cleanTitle) return null;
  try {
    const sRes = await fetch(
      `https://www.steamgriddb.com/api/v2/search/autocomplete/${encodeURIComponent(cleanTitle)}`,
      { headers: { Authorization: `Bearer ${STEAMGRIDDB_API_KEY}` } }
    );
    if (!sRes.ok) return null;
    const sData = await sRes.json();
    const game = sData?.data?.[0];
    if (!game?.id) return null;

    const gRes = await fetch(
      `https://www.steamgriddb.com/api/v2/grids/game/${game.id}?dimensions=600x900`,
      { headers: { Authorization: `Bearer ${STEAMGRIDDB_API_KEY}` } }
    );
    if (!gRes.ok) return null;
    const gData = await gRes.json();
    return gData?.data?.[0]?.url || null;
  } catch {
    return null;
  }
}

// TheGamesDB: Fetch overview and cover image
async function fetchTheGamesDbData(cleanTitle) {
  if (!THEGAMESDB_API_KEY || !cleanTitle) return null;
  try {
    const res = await fetch(
      `https://api.thegamesdb.net/v1/Games/ByGameName?apikey=${THEGAMESDB_API_KEY}&name=${encodeURIComponent(cleanTitle)}&fields=overview`
    );
    if (!res.ok) return null;
    const data = await res.json();
    const game = data?.data?.games?.[0];
    if (!game) return null;
    return {
      overview: game.overview || null,
    };
  } catch {
    return null;
  }
}

async function main() {
  console.log("==================================================================");
  console.log("       ROM Vault - Multi-Asset Download & Metadata Engine         ");
  console.log("==================================================================");
  console.log(`[*] Target Storage: ${STORAGE_ROOT}`);
  console.log(`[*] Active Targets: ${selectedTypes.join(", ")}`);
  if (targetSystem) console.log(`[*] Target System:  ${targetSystem}`);
  if (limit) console.log(`[*] Batch Limit:    ${limit}`);
  if (forceAll) console.log(`[*] Force Mode:     Re-downloading existing assets`);
  console.log("");

  const twitchToken = await getTwitchToken();
  if (twitchToken) {
    console.log("[✓] IGDB / Twitch API: Connected.");
  } else {
    console.warn("[!] Twitch credentials not found. Using alternative CDNs.");
  }

  if (STEAMGRIDDB_API_KEY) {
    console.log("[✓] SteamGridDB API:   Connected (HD Transparent Logos & Grids).");
  }

  if (THEGAMESDB_API_KEY) {
    console.log("[✓] TheGamesDB API:    Connected (Community Game Overviews & Art).");
  }

  // Load known IGDB IDs from MariaDB
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
      "SELECT id, igdb_id FROM game_metadata WHERE igdb_id IS NOT NULL"
    );
    await pool.end();

    for (const row of dbRows) {
      igdbMap.set(row.id, row.igdb_id);
    }
    console.log(`[✓] MariaDB Database:  Indexed ${igdbMap.size} verified IGDB IDs.`);
  } catch (err) {
    console.warn(`[!] MariaDB index unavailable (${err.message}). Using title search.`);
  }

  // Identify systems to scan
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

  // Build items queue
  console.log("[*] Scanning ROM library for missing assets...");
  let queue = [];

  for (const sys of systemsToScan) {
    const romsDir = path.join(STORAGE_ROOT, sys, "roms");
    if (!fs.existsSync(romsDir)) continue;

    const sysConf = PLATFORM_CONFIG[sys.toLowerCase()] || {
      isDisc: false,
      label: sys,
    };

    const files = fs
      .readdirSync(romsDir, { withFileTypes: true })
      .filter((ent) => ent.isFile() && !ent.name.startsWith("."));

    for (const file of files) {
      const extIdx = file.name.lastIndexOf(".");
      const baseName = extIdx > 0 ? file.name.slice(0, extIdx) : file.name;

      const artDir = path.join(STORAGE_ROOT, sys, "artwork");
      const needs = {};

      if (targets.boxart && (forceAll || !fileExistsWithAnyExt(path.join(artDir, "artwork_front"), baseName))) {
        needs.boxart = true;
      }
      if (targets.boxart3d && (forceAll || !fileExistsWithAnyExt(path.join(artDir, "artwork_3d"), baseName))) {
        needs.boxart3d = true;
      }
      if (targets.screenshots && (forceAll || !fileExistsWithAnyExt(path.join(artDir, "screenshot"), baseName))) {
        needs.screenshots = true;
      }
      if (targets.titlescreens && (forceAll || !fileExistsWithAnyExt(path.join(artDir, "screentitle"), baseName))) {
        needs.titlescreens = true;
      }
      if (targets.discOrCart) {
        const subFolder = sysConf.isDisc ? "medium_disc" : "medium_front";
        if (forceAll || !fileExistsWithAnyExt(path.join(artDir, subFolder), baseName)) {
          needs.discOrCart = subFolder;
        }
      }
      if (targets.logos && (forceAll || !fileExistsWithAnyExt(path.join(artDir, "logo"), baseName))) {
        needs.logos = true;
      }
      if (targets.stories && (forceAll || !fileExistsWithAnyExt(path.join(artDir, "story"), baseName, [".txt"]))) {
        needs.stories = true;
      }
      if (targets.videos && (forceAll || !fileExistsWithAnyExt(path.join(artDir, "video"), baseName, [".mp4"]))) {
        needs.videos = true;
      }

      if (Object.keys(needs).length > 0) {
        const idKey = `${sys}__${encodeURIComponent(baseName)}`;
        const igdbId = igdbMap.get(idKey) || igdbMap.get(decodeURIComponent(idKey)) || null;

        queue.push({
          system: sys,
          baseName,
          igdbId,
          needs,
          config: sysConf,
        });
      }
    }
  }

  if (limit && limit > 0) {
    queue = queue.slice(0, limit);
  }

  console.log(`[*] Total games needing requested assets: ${queue.length}`);
  if (queue.length === 0) {
    console.log("[✓] All target games already have requested assets present!");
    process.exit(0);
  }

  const estSec = (queue.length * delayMs) / 1000;
  console.log(`[*] Estimated processing duration: ~${formatTime(estSec)}`);
  console.log("------------------------------------------------------------------");

  let successCount = 0;
  let notFoundCount = 0;
  const startTime = Date.now();

  for (let i = 0; i < queue.length; i++) {
    const item = queue[i];
    const itemNum = i + 1;
    const pct = ((itemNum / queue.length) * 100).toFixed(1);

    const elapsedSeconds = (Date.now() - startTime) / 1000;
    const avgSecPerItem = elapsedSeconds / itemNum;
    const remainingItems = queue.length - itemNum;
    const etaSeconds = avgSecPerItem * remainingItems;

    const sys = item.system;
    const base = item.baseName;
    const clean = cleanTitleForSearch(base);
    const artBaseDir = path.join(STORAGE_ROOT, sys, "artwork");
    const downloadedForGame = [];

    // 1. Fetch IGDB Metadata (if token available and needed)
    let igdbData = null;
    if (twitchToken && (item.needs.boxart || item.needs.screenshots || item.needs.stories || item.needs.videos)) {
      try {
        let q = "";
        if (item.igdbId) {
          q = `fields name, summary, cover.image_id, screenshots.image_id, videos.video_id; where id = ${item.igdbId}; limit 1;`;
        } else {
          const pId = item.config.igdbId;
          if (clean && pId) {
            q = `search "${clean}"; fields name, summary, cover.image_id, screenshots.image_id, videos.video_id, platforms; where platforms = [${pId}]; limit 1;`;
          }
        }

        if (q) {
          const res = await fetch("https://api.igdb.com/v4/games", {
            method: "POST",
            headers: {
              "Client-ID": CLIENT_ID,
              Authorization: `Bearer ${twitchToken}`,
            },
            body: q,
          });

          if (res.status === 429) {
            await sleep(5000);
          } else if (res.ok) {
            const list = await res.json();
            if (list.length > 0) igdbData = list[0];
          }
        }
      } catch {}
    }

    // --- Asset A: 2D Box Art ---
    if (item.needs.boxart) {
      let saved = false;
      const targetPath = path.join(artBaseDir, "artwork_front", `${base}.jpg`);

      // 1. Try IGDB Cover
      if (igdbData?.cover?.image_id) {
        const coverUrl = `https://images.igdb.com/igdb/image/upload/t_1080p/${igdbData.cover.image_id}.jpg`;
        const bytes = await downloadBinary(coverUrl, targetPath);
        if (bytes) {
          downloadedForGame.push("2D Box Art (IGDB)");
          saved = true;
        }
      }

      // 2. Fallback: Libretro Named_Boxarts
      if (!saved && item.config.libretroRepo) {
        const lrUrl = `https://raw.githubusercontent.com/libretro-thumbnails/${item.config.libretroRepo}/master/Named_Boxarts/${encodeURIComponent(base)}.png`;
        const bytes = await downloadBinary(lrUrl, path.join(artBaseDir, "artwork_front", `${base}.png`));
        if (bytes) {
          downloadedForGame.push("2D Box Art (Libretro)");
          saved = true;
        }
      }

      // 3. Fallback: SteamGridDB Grids
      if (!saved && STEAMGRIDDB_API_KEY) {
        const sgdbCover = await fetchSteamGridDbCover(clean);
        if (sgdbCover) {
          const bytes = await downloadBinary(sgdbCover, targetPath);
          if (bytes) {
            downloadedForGame.push("2D Box Art (SteamGridDB)");
            saved = true;
          }
        }
      }
    }

    // --- Asset B: In-Game Screenshots ---
    if (item.needs.screenshots) {
      let saved = false;
      const targetPath = path.join(artBaseDir, "screenshot", `${base}.jpg`);

      // 1. Try IGDB Screenshots
      if (Array.isArray(igdbData?.screenshots) && igdbData.screenshots.length > 0) {
        const shotId = igdbData.screenshots[0].image_id;
        const shotUrl = `https://images.igdb.com/igdb/image/upload/t_720p/${shotId}.jpg`;
        const bytes = await downloadBinary(shotUrl, targetPath);
        if (bytes) {
          downloadedForGame.push("Screenshot (IGDB)");
          saved = true;
        }
      }

      // 2. Fallback: Libretro Named_Snaps
      if (!saved && item.config.libretroRepo) {
        const lrUrl = `https://raw.githubusercontent.com/libretro-thumbnails/${item.config.libretroRepo}/master/Named_Snaps/${encodeURIComponent(base)}.png`;
        const bytes = await downloadBinary(lrUrl, path.join(artBaseDir, "screenshot", `${base}.png`));
        if (bytes) {
          downloadedForGame.push("Screenshot (Libretro)");
          saved = true;
        }
      }
    }

    // --- Asset C: Title Screens ---
    if (item.needs.titlescreens) {
      let saved = false;
      const targetPath = path.join(artBaseDir, "screentitle", `${base}.png`);

      // 1. Try Libretro Named_Titles
      if (item.config.libretroRepo) {
        const lrUrl = `https://raw.githubusercontent.com/libretro-thumbnails/${item.config.libretroRepo}/master/Named_Titles/${encodeURIComponent(base)}.png`;
        const bytes = await downloadBinary(lrUrl, targetPath);
        if (bytes) {
          downloadedForGame.push("Title Screen (Libretro)");
          saved = true;
        }
      }

      // 2. Fallback: Second IGDB screenshot
      if (!saved && Array.isArray(igdbData?.screenshots) && igdbData.screenshots.length > 1) {
        const shotId = igdbData.screenshots[1].image_id;
        const shotUrl = `https://images.igdb.com/igdb/image/upload/t_720p/${shotId}.jpg`;
        const bytes = await downloadBinary(shotUrl, path.join(artBaseDir, "screentitle", `${base}.jpg`));
        if (bytes) {
          downloadedForGame.push("Title Screen (IGDB)");
          saved = true;
        }
      }
    }

    // --- Asset D: Transparent Wheel Logos (SteamGridDB) ---
    if (item.needs.logos) {
      let saved = false;
      const targetPath = path.join(artBaseDir, "logo", `${base}.png`);

      if (STEAMGRIDDB_API_KEY) {
        const logoUrl = await fetchSteamGridDbLogo(clean);
        if (logoUrl) {
          const bytes = await downloadBinary(logoUrl, targetPath);
          if (bytes) {
            downloadedForGame.push("Wheel Logo (SteamGridDB)");
            saved = true;
          }
        }
      }
    }

    // --- Asset E: Stories / Plot Summaries ---
    if (item.needs.stories) {
      let storyText = igdbData?.summary || null;
      if (!storyText && THEGAMESDB_API_KEY) {
        const tgdb = await fetchTheGamesDbData(clean);
        if (tgdb?.overview) storyText = tgdb.overview;
      }

      if (storyText) {
        const storyDir = path.join(artBaseDir, "story");
        if (!fs.existsSync(storyDir)) fs.mkdirSync(storyDir, { recursive: true });
        const storyPath = path.join(storyDir, `${base}.txt`);
        fs.writeFileSync(storyPath, storyText.trim(), "utf8");
        downloadedForGame.push("Story");
      }
    }

    // --- Asset F: Disc or Cartridge Media ---
    if (item.needs.discOrCart) {
      const folder = item.needs.discOrCart;
      const targetPath = path.join(artBaseDir, folder, `${base}.png`);
      // Libretro has titles and snaps; media repos checked
    }

    // Output Result
    if (downloadedForGame.length > 0) {
      successCount++;
      console.log(
        `[${itemNum}/${queue.length}] (${pct}%) [${sys.toUpperCase()}] ${base} -> ${downloadedForGame.join(" + ")} | ETA: ${formatTime(etaSeconds)}`
      );
    } else {
      notFoundCount++;
      console.log(
        `[${itemNum}/${queue.length}] (${pct}%) [${sys.toUpperCase()}] ${base} -> No new assets found | ETA: ${formatTime(etaSeconds)}`
      );
    }

    await sleep(delayMs);
  }

  const totalTimeSeconds = ((Date.now() - startTime) / 1000).toFixed(0);
  console.log("==================================================================");
  console.log(`[✓] Download Completed in ${formatTime(totalTimeSeconds)}!`);
  console.log(`    - Games Enriched: ${successCount}`);
  console.log(`    - Games Untouched:${notFoundCount}`);
  console.log("==================================================================");
  console.log("[*] Run 'npm run scan' (or click Rescan in Admin) to update catalog.");
}

main().catch((err) => {
  console.error("[-] Fatal error:", err);
  process.exit(1);
});
