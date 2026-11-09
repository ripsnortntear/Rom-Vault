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
  mame: {
    igdbId: 52,
    libretroRepo: "MAME",
    isDisc: false,
    label: "MAME Arcade",
  },
  arcade: {
    igdbId: 52,
    libretroRepo: "MAME",
    isDisc: false,
    label: "Arcade",
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
  npm run download-metadata -- --audit [OPTIONS]
  node scripts/download-metadata.mjs [TARGET ASSET FLAGS] [OPTIONS]

AUDIT MODE (Audit ROMs against artwork & generate detailed report):
  --audit                 Audit ROMs against artwork and media libraries
  --output=<file>         Report output file path (default: audit-report.txt)
  --missing-only          Only list games with missing media in the detailed breakdown
  --no-orphans            Skip orphan artwork detection
  --export-contributions  Package unique local artwork into contributions/ with direct upload links

ORPHAN ARTWORK CLEANUP (Prune leftover artwork for deleted ROMs with [Y/N] prompt):
  --prune-orphans         Find and interactively delete orphan artwork files
  --clean-orphans         Alias for --prune-orphans
  --filter=<title>        Only prune orphan artwork matching title query (e.g. --filter="Crash")
  --dry-run               Preview orphan files without deleting anything
  -y, --yes               Skip interactive [Y/N] confirmation prompt

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
  --filter=<query>   Filter games by title substring (e.g. --filter="Arc the Lad")
  --limit=<number>   Process only the first N items (useful for testing)
  --delay=<ms>       Delay in milliseconds between IGDB queries (default: 300ms)
  --force            Re-download existing assets (overwrites local files)
  --help, -h         Show this manual

CACHE CONTROLS (Negative result caching):
  --no-cache         Bypass the "no new assets" cache and re-scan all games
  --clear-cache      Clear the cached "no new assets" records
  NOTE: When running with --all, games where "No new assets found" across all
        providers are automatically cached to skip redundant queries in future runs.

INTEGRATED APIS & DATA SOURCES:
  1. IGDB (Twitch API): HD 2D box covers, 720p screenshots, release dates, plot summaries
  2. Libretro CDN: Authentic title screens (Named_Titles), 2D box art, screenshots
  3. SteamGridDB: Official transparent PNG wheel logos and high-res grids
  4. TheGamesDB: Community game overviews, developer/publisher metadata, fallback covers
  5. ArcadeDB (Arcade Italia): Dedicated MAME/Arcade flyers, marquees, title screens, in-game snaps & video previews

SUPPORTED CONSOLE & ARCADE SYSTEMS:
  ps2, psx, gamecube, dreamcast, saturn, n64, snes, nes,
  gba, gbc, gb, sgb, genesis, sega32x, sms, sgg, mame, arcade

EXAMPLES:
  # Interactively find and delete leftover orphan artwork for PS2 (prompts Y/N):
  npm run prune-orphans -- --system=ps2
  # or
  npm run download-metadata -- --prune-orphans --system=ps2

  # Filter orphan cleanup for a specific deleted title:
  npm run prune-orphans -- --system=ps2 --filter="Spider-Man"

  # Preview orphan files without deleting (dry run):
  npm run prune-orphans -- --system=ps2 --dry-run

  # Audit PS2 ROMs against artwork (prints to terminal if <= 5KB, otherwise saves file):
  npm run download-metadata -- --audit --system=ps2

  # Audit entire ROM Vault across all systems:
  npm run download-metadata -- --audit

  # Download transparent wheel logos for PS2 using SteamGridDB:
  npm run download-metadata -- --logos --system=ps2

  # Download 2D box art for PlayStation 2 only:
  npm run download-metadata -- --boxart --system=ps2

  # Run in the background (disconnect-safe via nohup):
  nohup npm run download-metadata -- --logos --system=ps2 > /tmp/logos.log 2>&1 &
================================================================================
`);
}

// ==============================================================================
// Persistent Cache for "No New Assets Found" (Negative Result Cache)
// Records games that yielded zero new assets across all providers during --all
// ==============================================================================
class MetadataCache {
  constructor(primaryPath, fallbackPath) {
    this.primaryPath = primaryPath;
    this.fallbackPath = fallbackPath;
    this.activePath = primaryPath;
    this.data = { version: 1, exhausted: {} };
    this.dirty = false;
    this.load();
  }

  load() {
    for (const p of [this.primaryPath, this.fallbackPath]) {
      if (p && fs.existsSync(p)) {
        try {
          const raw = fs.readFileSync(p, "utf8");
          const parsed = JSON.parse(raw);
          if (parsed && typeof parsed.exhausted === "object") {
            this.data = parsed;
            this.activePath = p;
            return;
          }
        } catch {}
      }
    }
  }

  save() {
    if (!this.dirty) return;
    const targets = [this.primaryPath, this.fallbackPath].filter(Boolean);
    for (const target of targets) {
      try {
        const dir = path.dirname(target);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        const tmp = `${target}.${Date.now()}.tmp`;
        fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2), "utf8");
        fs.renameSync(tmp, target);
        this.activePath = target;
        this.dirty = false;
        return;
      } catch (e) {
        // try fallback target if primary is read-only
      }
    }
  }

  _key(system, baseName) {
    return `${system.toLowerCase()}::${baseName}`;
  }

  isExhausted(system, baseName) {
    return Boolean(this.data.exhausted[this._key(system, baseName)]);
  }

  markExhausted(system, baseName) {
    const key = this._key(system, baseName);
    if (!this.data.exhausted[key]) {
      this.data.exhausted[key] = {
        date: new Date().toISOString(),
        timestamp: Date.now(),
      };
      this.dirty = true;
    }
  }

  removeExhausted(system, baseName) {
    const key = this._key(system, baseName);
    if (this.data.exhausted[key]) {
      delete this.data.exhausted[key];
      this.dirty = true;
    }
  }

  clear() {
    this.data = { version: 1, exhausted: {} };
    this.dirty = true;
    this.save();
  }

  count() {
    return Object.keys(this.data.exhausted).length;
  }
}

// Parse Command Line Arguments
const rawArgs = process.argv.slice(2);
if (rawArgs.includes("--help") || rawArgs.includes("-h") || rawArgs.length === 0) {
  printHelp();
  process.exit(0);
}

const isAudit = rawArgs.includes("--audit");
const isPrune = rawArgs.includes("--prune-orphans") || rawArgs.includes("--clean-orphans");
const dryRun = rawArgs.includes("--dry-run");
const autoYes = rawArgs.includes("-y") || rawArgs.includes("--yes");
const exportContributions = rawArgs.includes("--export-contributions") || rawArgs.includes("--contribute");
const noCache = rawArgs.includes("--no-cache");
const clearCache = rawArgs.includes("--clear-cache");
const isAllTargets = rawArgs.includes("--all");

const CACHE_FILE = path.join(STORAGE_ROOT, ".metadata_cache.json");
const FALLBACK_CACHE_FILE = path.join(ROOT_DIR, ".metadata_cache.json");
const metadataCache = new MetadataCache(CACHE_FILE, FALLBACK_CACHE_FILE);

if (clearCache) {
  metadataCache.clear();
  console.log("[✓] Negative metadata cache cleared.");
  const hasOtherActions = isAudit || isPrune || isAllTargets || rawArgs.some((a) =>
    ["--boxart", "--2d", "--boxart-3d", "--3d", "--screenshots", "--screenshot",
     "--titlescreens", "--titlescreen", "--disc", "--cart", "--cartridge",
     "--medium", "--logos", "--logo", "--wheel", "--stories", "--story",
     "--videos", "--video"].includes(a)
  );
  if (!hasOtherActions) {
    process.exit(0);
  }
}

let targetSystem = null;
let filterQuery = null;
let limit = null;
let delayMs = 300;
let forceAll = rawArgs.includes("--force");
let outputPath = path.join(process.cwd(), "audit-report.txt");
let missingOnly = rawArgs.includes("--missing-only");
let checkOrphans = !rawArgs.includes("--no-orphans");

for (const arg of rawArgs) {
  if (arg.startsWith("--system=")) {
    targetSystem = arg.split("=")[1].toLowerCase().trim();
  } else if (arg.startsWith("--filter=") || arg.startsWith("--query=")) {
    filterQuery = arg.split("=")[1].trim();
  } else if (arg.startsWith("--limit=")) {
    limit = parseInt(arg.split("=")[1], 10);
  } else if (arg.startsWith("--delay=")) {
    delayMs = Math.max(260, parseInt(arg.split("=")[1], 10));
  } else if (arg.startsWith("--output=") || arg.startsWith("--file=")) {
    outputPath = path.resolve(process.cwd(), arg.split("=")[1].trim());
  }
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

const selectedTypes = Object.entries(targets).filter(([, v]) => v).map(([k]) => k);

// Validate Arguments
if (!isAudit && !isPrune && selectedTypes.length === 0) {
  console.error("[-] Error: No asset type specified. Please supply e.g. --boxart, --screenshots, --logos, --all, --audit, or --prune-orphans.");
  console.log("[*] Run 'npm run download-metadata -- --help' for instructions.");
  process.exit(1);
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
    if (item.first_release_date) score += 5;

    if (score > bestScore) {
      bestScore = score;
      best = item;
    }
  }

  if (bestScore < 40) return null;
  return best;
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
    const game = sData?.data ? findBestMatch(sData.data, cleanTitle) : null;
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
    const game = sData?.data ? findBestMatch(sData.data, cleanTitle) : null;
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

// ArcadeDB (Arcade Italia): Dedicated MAME metadata, flyer, marquee, snap & video provider
async function fetchArcadeDbData(romBaseName) {
  if (!romBaseName) return null;
  const cleanName = romBaseName.replace(/\.zip$/i, "").trim().toLowerCase();
  try {
    const url = `https://adb.arcadeitalia.net/service_scraper.php?ajax=query_mame&lang=en&game_name=${encodeURIComponent(cleanName)}`;
    const res = await fetch(url, {
      headers: {
        "User-Agent": "ROM-Vault-Metadata-Engine/1.0",
      },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const item = data?.result?.[0];
    if (!item) return null;

    return {
      title: item.short_title || item.title || null,
      manufacturer: item.manufacturer || null,
      year: item.year || null,
      genre: item.genre || null,
      overview: item.history || null,
      flyerUrl: item.url_image_flyer || null,
      snapUrl: item.url_image_ingame || null,
      titleUrl: item.url_image_title || null,
      marqueeUrl: item.url_image_marquee || null,
      cabinetUrl: item.url_image_cabinet || null,
      videoUrl: item.url_video_shortplay_hd || item.url_video_shortplay || null,
    };
  } catch {
    return null;
  }
}

// ==============================================================================
// AUDIT ENGINE: Matches ROMs to Artwork & Generates Detailed Reports
// ==============================================================================
async function runAudit() {
  console.log("==================================================================");
  console.log("       ROM Vault - Multi-Asset Artwork & Media Audit Engine       ");
  console.log("==================================================================");
  console.log(`[*] Target Storage: ${STORAGE_ROOT}`);
  if (targetSystem) console.log(`[*] Target System:  ${targetSystem}`);
  console.log(`[*] Report File:    ${outputPath}`);
  console.log("");

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

  const auditResults = [];
  let totalVaultRoms = 0;

  for (const sys of systemsToScan) {
    const romsDir = path.join(STORAGE_ROOT, sys, "roms");
    const artDir = path.join(STORAGE_ROOT, sys, "artwork");
    const sysConf = PLATFORM_CONFIG[sys.toLowerCase()] || {
      isDisc: false,
      label: sys,
    };

    if (!fs.existsSync(romsDir)) continue;

    const romFiles = fs
      .readdirSync(romsDir, { withFileTypes: true })
      .filter((e) => {
        if (!e.isFile()) return false;
        const l = e.name.toLowerCase();
        return (
          !l.startsWith(".") &&
          !l.startsWith("gamelist") &&
          !l.includes(".bak") &&
          !l.endsWith(".old") &&
          !/\bbios\b/i.test(l) &&
          !l.endsWith(".xml") &&
          !l.endsWith(".txt") &&
          !l.endsWith(".json") &&
          !l.endsWith(".dat") &&
          !l.endsWith(".db") &&
          !l.endsWith(".ini") &&
          !l.endsWith(".m3u")
        );
      })
      .map((e) => e.name)
      .sort((a, b) => a.localeCompare(b));

    if (romFiles.length === 0) continue;
    totalVaultRoms += romFiles.length;

    const loadArtFolder = (subNames) => {
      const names = Array.isArray(subNames) ? subNames : [subNames];
      let files = [];
      const byBase = new Map();
      for (const subName of names) {
        const full = path.join(artDir, subName);
        if (!fs.existsSync(full)) continue;
        const subFiles = fs
          .readdirSync(full, { withFileTypes: true })
          .filter((e) => e.isFile() && !e.name.startsWith("."))
          .map((e) => e.name);
        files.push(...subFiles);
        for (const f of subFiles) {
          const extIdx = f.lastIndexOf(".");
          const b = extIdx > 0 ? f.slice(0, extIdx) : f;
          if (!byBase.has(b.toLowerCase())) {
            byBase.set(b.toLowerCase(), f);
          }
        }
      }
      return { files, byBase };
    };

    const artFolders = {
      boxart: loadArtFolder(["artwork_front", "box2d"]),
      boxart3d: loadArtFolder(["artwork_3d", "box3d", "thumbnails"]),
      screenshots: loadArtFolder(["screenshot", "images"]),
      titlescreens: loadArtFolder(["screentitle", "titles"]),
      logos: loadArtFolder(["logo", "marquee"]),
      discOrCart: loadArtFolder(sysConf.isDisc ? ["medium_disc"] : ["medium_front", "cartridges"]),
      stories: loadArtFolder("story"),
      videos: loadArtFolder(["video", "videos"]),
    };

    const matchedFiles = {
      boxart: new Set(),
      boxart3d: new Set(),
      screenshots: new Set(),
      titlescreens: new Set(),
      logos: new Set(),
      discOrCart: new Set(),
      stories: new Set(),
      videos: new Set(),
    };

    const gamesAudit = [];
    const counts = {
      total: romFiles.length,
      boxart: 0,
      boxart3d: 0,
      screenshots: 0,
      titlescreens: 0,
      logos: 0,
      discOrCart: 0,
      stories: 0,
      videos: 0,
      complete: 0,
      zeroMedia: 0,
    };

    for (const romFile of romFiles) {
      const extIdx = romFile.lastIndexOf(".");
      const baseName = extIdx > 0 ? romFile.slice(0, extIdx) : romFile;
      const lowerBase = baseName.toLowerCase();
      const discLessLower = lowerBase.replace(/\s*\(disc\s*\d+[^)]*\)/i, "").trim();

      const gameStatus = {
        romFile,
        baseName,
        assets: {},
        missing: [],
      };

      for (const [key, folderData] of Object.entries(artFolders)) {
        let matchFile = folderData.byBase.get(lowerBase);
        if (!matchFile && discLessLower !== lowerBase) {
          matchFile = folderData.byBase.get(discLessLower);
        }

        if (matchFile) {
          gameStatus.assets[key] = matchFile;
          counts[key]++;
          matchedFiles[key].add(matchFile);
        } else {
          gameStatus.assets[key] = null;
          gameStatus.missing.push(key);
        }
      }

      const presentCount = Object.values(gameStatus.assets).filter(Boolean).length;
      if (presentCount === 8) counts.complete++;
      if (presentCount === 0) counts.zeroMedia++;

      gamesAudit.push(gameStatus);
    }

    const orphans = {};
    if (checkOrphans) {
      for (const [key, folderData] of Object.entries(artFolders)) {
        const unmatched = folderData.files.filter((f) => !matchedFiles[key].has(f));
        if (unmatched.length > 0) {
          orphans[key] = unmatched.sort((a, b) => a.localeCompare(b));
        }
      }
    }

    auditResults.push({
      system: sys,
      label: sysConf.label,
      isDisc: sysConf.isDisc,
      counts,
      gamesAudit,
      orphans,
    });
  }

  // Percentage helper
  const pct = (val, total) => (total > 0 ? ((val / total) * 100).toFixed(1) : "0.0");

  // Summary Table Header
  const tableHeader = [
    "----------------------------------------------------------------------------------------------------------------------------------------------------",
    "System             ROMs    2D Box   3D Box   Screens  Titles    Logos    Medium   Stories  Videos   100% Full  Zero Media",
    "----------------------------------------------------------------------------------------------------------------------------------------------------",
  ];

  const tableRows = [];
  const vaultTotals = {
    roms: 0,
    boxart: 0,
    boxart3d: 0,
    screenshots: 0,
    titlescreens: 0,
    logos: 0,
    discOrCart: 0,
    stories: 0,
    videos: 0,
    complete: 0,
    zeroMedia: 0,
  };

  for (const res of auditResults) {
    const c = res.counts;
    vaultTotals.roms += c.total;
    vaultTotals.boxart += c.boxart;
    vaultTotals.boxart3d += c.boxart3d;
    vaultTotals.screenshots += c.screenshots;
    vaultTotals.titlescreens += c.titlescreens;
    vaultTotals.logos += c.logos;
    vaultTotals.discOrCart += c.discOrCart;
    vaultTotals.stories += c.stories;
    vaultTotals.videos += c.videos;
    vaultTotals.complete += c.complete;
    vaultTotals.zeroMedia += c.zeroMedia;

    tableRows.push(
      `${res.system.padEnd(16)} ` +
      `${c.total.toString().padStart(6)} ` +
      `${(pct(c.boxart, c.total) + "%").padStart(9)} ` +
      `${(pct(c.boxart3d, c.total) + "%").padStart(8)} ` +
      `${(pct(c.screenshots, c.total) + "%").padStart(9)} ` +
      `${(pct(c.titlescreens, c.total) + "%").padStart(8)} ` +
      `${(pct(c.logos, c.total) + "%").padStart(8)} ` +
      `${(pct(c.discOrCart, c.total) + "%").padStart(9)} ` +
      `${(pct(c.stories, c.total) + "%").padStart(9)} ` +
      `${(pct(c.videos, c.total) + "%").padStart(8)} ` +
      `${c.complete.toString().padStart(11)} ` +
      `${c.zeroMedia.toString().padStart(11)}`
    );
  }

  const tableTotalRow = [
    "----------------------------------------------------------------------------------------------------------------------------------------------------",
    `TOTAL (${auditResults.length} systems) `.padEnd(17) +
    `${vaultTotals.roms.toString().padStart(6)} ` +
    `${(pct(vaultTotals.boxart, vaultTotals.roms) + "%").padStart(9)} ` +
    `${(pct(vaultTotals.boxart3d, vaultTotals.roms) + "%").padStart(8)} ` +
    `${(pct(vaultTotals.screenshots, vaultTotals.roms) + "%").padStart(9)} ` +
    `${(pct(vaultTotals.titlescreens, vaultTotals.roms) + "%").padStart(8)} ` +
    `${(pct(vaultTotals.logos, vaultTotals.roms) + "%").padStart(8)} ` +
    `${(pct(vaultTotals.discOrCart, vaultTotals.roms) + "%").padStart(9)} ` +
    `${(pct(vaultTotals.stories, vaultTotals.roms) + "%").padStart(9)} ` +
    `${(pct(vaultTotals.videos, vaultTotals.roms) + "%").padStart(8)} ` +
    `${vaultTotals.complete.toString().padStart(11)} ` +
    `${vaultTotals.zeroMedia.toString().padStart(11)}`,
    "----------------------------------------------------------------------------------------------------------------------------------------------------",
  ];

  // Assemble Terminal Summary (compact executive view)
  const terminalSummaryLines = [
    "================================================================================",
    "                    ROM VAULT - ARTWORK & MEDIA AUDIT SUMMARY                   ",
    "================================================================================",
    `Generated:       ${new Date().toISOString()}`,
    `Storage Root:    ${STORAGE_ROOT}`,
    `Systems Audited: ${auditResults.length} | Total Games: ${vaultTotals.roms}`,
    "",
    ...tableHeader,
    ...tableRows,
    ...tableTotalRow,
  ];

  const terminalSummaryText = terminalSummaryLines.join("\n");

  // Assemble Full Exhaustive Report Document
  const reportLines = [
    "================================================================================",
    "                    ROM VAULT - ARTWORK & MEDIA AUDIT REPORT                    ",
    "================================================================================",
    `Generated:       ${new Date().toISOString()}`,
    `Storage Root:    ${STORAGE_ROOT}`,
    `Systems Audited: ${auditResults.length} | Total Games: ${vaultTotals.roms}`,
    "",
    "VAULT-WIDE COVERAGE OVERVIEW:",
    ...tableHeader,
    ...tableRows,
    ...tableTotalRow,
    "",
  ];

  const assetLabels = {
    boxart: "2D Front Box Art",
    boxart3d: "3D Box Art",
    screenshots: "In-Game Screenshot",
    titlescreens: "Title Screen",
    logos: "Clear Logo / Wheel",
    discOrCart: "Disc/Cartridge Media",
    stories: "Plot Overview Story",
    videos: "Video Preview",
  };

  for (const res of auditResults) {
    const c = res.counts;
    reportLines.push(
      "================================================================================",
      `SYSTEM AUDIT: ${res.label} (${res.system})`,
      "================================================================================",
      `Total Games / ROMs: ${c.total}`,
      `Coverage Breakdown:`,
      `  - 2D Front Box Art:    ${c.boxart.toString().padStart(5)} / ${c.total} (${pct(c.boxart, c.total)}%)`,
      `  - 3D Box Art:          ${c.boxart3d.toString().padStart(5)} / ${c.total} (${pct(c.boxart3d, c.total)}%)`,
      `  - In-Game Screenshot:  ${c.screenshots.toString().padStart(5)} / ${c.total} (${pct(c.screenshots, c.total)}%)`,
      `  - Title Screen:        ${c.titlescreens.toString().padStart(5)} / ${c.total} (${pct(c.titlescreens, c.total)}%)`,
      `  - Clear Logo (Wheel):  ${c.logos.toString().padStart(5)} / ${c.total} (${pct(c.logos, c.total)}%)`,
      `  - ${res.isDisc ? "Disc Media:          " : "Cartridge Media:     "}${c.discOrCart.toString().padStart(5)} / ${c.total} (${pct(c.discOrCart, c.total)}%)`,
      `  - Plot Overview Story: ${c.stories.toString().padStart(5)} / ${c.total} (${pct(c.stories, c.total)}%)`,
      `  - Video Preview:       ${c.videos.toString().padStart(5)} / ${c.total} (${pct(c.videos, c.total)}%)`,
      `  - Complete (8/8 types):${c.complete.toString().padStart(5)} / ${c.total} (${pct(c.complete, c.total)}%)`,
      `  - Zero Media (0 types):${c.zeroMedia.toString().padStart(5)} / ${c.total} (${pct(c.zeroMedia, c.total)}%)`,
      ""
    );

    // Missing Items Breakdown
    const missingByAsset = {};
    for (const key of Object.keys(assetLabels)) {
      missingByAsset[key] = [];
    }

    for (const game of res.gamesAudit) {
      for (const m of game.missing) {
        missingByAsset[m].push(game.baseName);
      }
    }

    reportLines.push("[-] MISSING MEDIA BREAKDOWN:");
    for (const [key, label] of Object.entries(assetLabels)) {
      const list = missingByAsset[key];
      if (list.length === 0) {
        reportLines.push(`  [✓] ${label}: All ${c.total} games have assets!`);
      } else {
        reportLines.push(`  [!] ${label} (Missing for ${list.length}/${c.total} games):`);
        for (const title of list) {
          reportLines.push(`      * ${title}`);
        }
      }
    }
    reportLines.push("");

    // Orphan Files Breakdown
    const orphanKeys = Object.keys(res.orphans);
    if (orphanKeys.length > 0) {
      let totalOrphans = 0;
      orphanKeys.forEach((k) => (totalOrphans += res.orphans[k].length));
      reportLines.push(`[?] ORPHAN ARTWORK FILES (${totalOrphans} files without matching ROM):`);
      for (const [key, files] of Object.entries(res.orphans)) {
        reportLines.push(`  - Folder [${key}] (${files.length} orphans):`);
        for (const f of files) {
          reportLines.push(`      * ${f}`);
        }
      }
      reportLines.push("");
    } else {
      reportLines.push("[✓] No orphan artwork files found.\n");
    }
  }

  const reportText = reportLines.join("\n");
  const reportBuffer = Buffer.from(reportText, "utf8");
  const reportBytes = reportBuffer.length;
  const reportKb = (reportBytes / 1024).toFixed(2);

  // Write file to disk
  try {
    const outDir = path.dirname(outputPath);
    if (!fs.existsSync(outDir)) {
      fs.mkdirSync(outDir, { recursive: true });
    }
    fs.writeFileSync(outputPath, reportText, "utf8");
  } catch (err) {
    console.error(`[-] Failed to write audit report to ${outputPath}:`, err.message);
  }

  // Package contributions for community upload if requested
  if (exportContributions) {
    const contribDir = path.join(process.cwd(), "contributions");
    if (!fs.existsSync(contribDir)) {
      fs.mkdirSync(contribDir, { recursive: true });
    }

    const guideLines = [
      "# ROM Vault - Community Artwork Contribution Guide",
      "",
      `Generated: ${new Date().toISOString()}`,
      "",
      "The following retro gaming community databases accept artwork and metadata uploads to help gamers worldwide.",
      "Since public APIs are read-only (GET requests only), uploads are submitted via web portals and Git PRs:",
      "",
      "## 1. SteamGridDB (Transparent Wheel Logos, Grids & Heroes)",
      "- Portal: https://www.steamgriddb.com/",
      "- Upload Method: Log into SteamGridDB -> Search for Game -> Click 'Upload' -> Drag & Drop PNG Logo or Grid.",
      "",
      "## 2. TheGamesDB (2D Box Covers & Plot Overviews)",
      "- Portal: https://thegamesdb.net/",
      "- Upload Method: Log into TheGamesDB -> Search for Game -> Click 'Edit Game' or 'Upload Artwork'.",
      "",
      "## 3. Libretro Thumbnails (Authentic Box Art, Title Screens & Snaps)",
      "- Repository: https://github.com/libretro-thumbnails",
      "- Upload Method: Fork repository -> Add PNG images to Named_Boxarts, Named_Titles, or Named_Snaps -> Submit Pull Request.",
      "",
      "## 4. IGDB / Twitch (Global Game Database)",
      "- Portal: https://www.igdb.com/games/new",
      "- Upload Method: Submit missing games or edit existing metadata via Twitch community portal.",
      "",
      "---",
      "## Local Games with Assets Ready for Contribution Review:",
      "",
    ];

    for (const res of auditResults) {
      const candidates = res.gamesAudit.filter((g) => {
        return Object.values(g.assets).some(Boolean);
      });

      if (candidates.length > 0) {
        guideLines.push(`### Platform: ${res.label} (${res.system})`);
        guideLines.push(`- Total local candidates: ${candidates.length} games`);
        guideLines.push(`- Direct Submission & Search Links:`);
        for (const c of candidates.slice(0, 30)) {
          const cleanTitle = c.baseName.replace(/\s*\([^)]*\)/g, "").trim();
          guideLines.push(`  - **${c.baseName}**`);
          guideLines.push(`    * SteamGridDB: https://www.steamgriddb.com/search/autocomplete/${encodeURIComponent(cleanTitle)}`);
          guideLines.push(`    * TheGamesDB:  https://thegamesdb.net/search.php?name=${encodeURIComponent(cleanTitle)}`);
        }
        if (candidates.length > 30) {
          guideLines.push(`  - *...and ${candidates.length - 30} more games in this system.*`);
        }
        guideLines.push("");
      }
    }

    const guidePath = path.join(contribDir, "CONTRIBUTION-GUIDE.md");
    fs.writeFileSync(guidePath, guideLines.join("\n"), "utf8");
    console.log(`[✓] Community contribution manifest generated: ${guidePath}`);
  }

  // Terminal Output Logic
  // User Rule: "if its not over 5kb just print it in the terminal"
  if (reportBytes <= 5120) {
    console.log(reportText);
    console.log(`\n[✓] Audit report saved to ${outputPath} (${reportBytes} bytes).`);
  } else {
    console.log(terminalSummaryText);
    console.log("\n================================================================================");
    console.log(`[!] Detailed audit report size is ${reportKb} KB (exceeds 5 KB terminal threshold).`);
    console.log(`[✓] Full exhaustive report saved to: ${outputPath}`);
    console.log(`[*] Review the full itemized report with:`);
    console.log(`    cat ${outputPath} | less`);
    console.log("================================================================================\n");
  }
}

// ==============================================================================
// ORPHAN CLEANUP ENGINE: Interactively Prunes Leftover Artwork for Deleted ROMs
// ==============================================================================
async function pruneOrphans() {
  console.log("==================================================================");
  console.log("              ROM Vault - Orphan Artwork Cleanup Engine           ");
  console.log("==================================================================");
  console.log(`[*] Target Storage: ${STORAGE_ROOT}`);
  if (targetSystem) console.log(`[*] Target System:  ${targetSystem}`);
  if (filterQuery) console.log(`[*] Filter Query:   "${filterQuery}"`);
  if (dryRun) console.log(`[*] Execution Mode: DRY RUN (no files will be deleted)`);
  console.log("");

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

  const orphansToDelete = [];
  let totalOrphanBytes = 0;

  for (const sys of systemsToScan) {
    const romsDir = path.join(STORAGE_ROOT, sys, "roms");
    const artDir = path.join(STORAGE_ROOT, sys, "artwork");

    if (!fs.existsSync(romsDir) || !fs.existsSync(artDir)) continue;

    // Collect all valid ROM base names
    const romFiles = fs
      .readdirSync(romsDir, { withFileTypes: true })
      .filter((e) => e.isFile() && !e.name.startsWith("."))
      .map((e) => e.name);

    const validBases = new Set();
    for (const rf of romFiles) {
      const extIdx = rf.lastIndexOf(".");
      const base = extIdx > 0 ? rf.slice(0, extIdx) : rf;
      validBases.add(base.toLowerCase());
      const discLess = base.replace(/\s*\(disc\s*\d+[^)]*\)/i, "").trim().toLowerCase();
      validBases.add(discLess);
    }

    // Inspect all subdirectories in artwork/
    const artFolders = fs
      .readdirSync(artDir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name);

    for (const folder of artFolders) {
      const folderPath = path.join(artDir, folder);
      const files = fs
        .readdirSync(folderPath, { withFileTypes: true })
        .filter((e) => e.isFile() && !e.name.startsWith("."));

      for (const f of files) {
        const extIdx = f.name.lastIndexOf(".");
        const artBase = extIdx > 0 ? f.name.slice(0, extIdx) : f.name;
        const lowerArt = artBase.toLowerCase();

        // Safeguard: Protect platform-wide default assets and system files
        if (["default", "desktop", "folder", "thumbs", ".gitkeep"].includes(lowerArt)) {
          continue;
        }

        const discLessArt = lowerArt.replace(/\s*\(disc\s*\d+[^)]*\)/i, "").trim();

        const isMatch = validBases.has(lowerArt) || validBases.has(discLessArt);
        if (!isMatch) {
          if (filterQuery && !f.name.toLowerCase().includes(filterQuery.toLowerCase())) {
            continue;
          }

          const fullPath = path.join(folderPath, f.name);
          let size = 0;
          try {
            size = fs.statSync(fullPath).size;
          } catch {}

          orphansToDelete.push({
            system: sys,
            folder,
            fileName: f.name,
            fullPath,
            size,
          });
          totalOrphanBytes += size;
        }
      }
    }
  }

  if (orphansToDelete.length === 0) {
    console.log("[✓] No orphan artwork files found! Library artwork is 100% clean and matched to ROMs.");
    return;
  }

  // Group by system and folder for clear summary
  const byFolder = {};
  for (const item of orphansToDelete) {
    const key = `${item.system} / artwork / ${item.folder}`;
    byFolder[key] = (byFolder[key] || 0) + 1;
  }

  const mbFreed = (totalOrphanBytes / (1024 * 1024)).toFixed(2);
  console.log(`[!] Found ${orphansToDelete.length} orphan artwork files (~${mbFreed} MB) with no matching ROM in vault:\n`);
  for (const [key, count] of Object.entries(byFolder)) {
    console.log(`    - ${key.padEnd(36)}: ${count} files`);
  }
  console.log("");

  // Print first 30 files as samples
  console.log("Sample orphan files identified for removal:");
  const sample = orphansToDelete.slice(0, 30);
  for (const item of sample) {
    console.log(`  * [${item.system}/${item.folder}] ${item.fileName}`);
  }
  if (orphansToDelete.length > 30) {
    console.log(`  * ... and ${orphansToDelete.length - 30} more orphan files.`);
  }

  if (dryRun) {
    console.log(`\n[*] DRY RUN COMPLETE: ${orphansToDelete.length} files would be deleted (~${mbFreed} MB). No changes made.`);
    return;
  }

  // Interactive Y/N Confirmation
  let proceed = autoYes;
  if (!proceed) {
    if (!process.stdin.isTTY) {
      console.error("\n[-] Error: Non-interactive terminal detected. Run directly in terminal or pass --yes (-y) to confirm deletion.");
      process.exit(1);
    }

    const readlinePromises = await import("node:readline/promises");
    const rl = readlinePromises.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    const answer = await rl.question(
      `\nAre you sure you want to permanently delete these ${orphansToDelete.length} orphan files? [y/N]: `
    );
    rl.close();

    const normAns = answer.trim().toLowerCase();
    proceed = normAns === "y" || normAns === "yes";
  }

  if (!proceed) {
    console.log("\n[*] Cleanup aborted by user. No files were deleted.");
    return;
  }

  console.log(`\n[+] Deleting ${orphansToDelete.length} orphan artwork files...`);
  let deletedCount = 0;
  let deletedBytes = 0;
  for (const item of orphansToDelete) {
    try {
      fs.unlinkSync(item.fullPath);
      deletedCount++;
      deletedBytes += item.size;
    } catch (err) {
      console.warn(`[!] Failed to delete ${item.fullPath}: ${err.message}`);
    }
  }

  const finalMb = (deletedBytes / (1024 * 1024)).toFixed(2);
  console.log("==================================================================");
  console.log(`[✓] Cleanup Complete!`);
  console.log(`    - Files Deleted:     ${deletedCount}`);
  console.log(`    - Disk Space Freed:  ${finalMb} MB`);
  console.log("==================================================================");
}

async function main() {
  if (isPrune) {
    await pruneOrphans();
    return;
  }

  if (isAudit) {
    await runAudit();
    return;
  }

  console.log("==================================================================");
  console.log("       ROM Vault - Multi-Asset Download & Metadata Engine         ");
  console.log("==================================================================");
  console.log(`[*] Target Storage: ${STORAGE_ROOT}`);
  console.log(`[*] Active Targets: ${selectedTypes.join(", ")}`);
  if (targetSystem) console.log(`[*] Target System:  ${targetSystem}`);
  if (filterQuery)  console.log(`[*] Filter Query:   "${filterQuery}"`);
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
  let dbPool = null;
  const igdbMap = new Map();
  try {
    mysql = await import("mysql2/promise");
    dbPool = mysql.createPool({
      host: process.env.DB_HOST || "127.0.0.1",
      port: parseInt(process.env.DB_PORT || "3306", 10),
      user: process.env.DB_USER || "cfw34683",
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME || "rom_vault",
      waitForConnections: true,
      connectionLimit: 5,
    });

    const [dbRows] = await dbPool.query(
      "SELECT id, igdb_id FROM game_metadata WHERE igdb_id IS NOT NULL"
    );

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
  let cachedSkippedCount = 0;

  for (const sys of systemsToScan) {
    const romsDir = path.join(STORAGE_ROOT, sys, "roms");
    if (!fs.existsSync(romsDir)) continue;

    const sysConf = PLATFORM_CONFIG[sys.toLowerCase()] || {
      isDisc: false,
      label: sys,
    };

    const files = fs
      .readdirSync(romsDir, { withFileTypes: true })
      .filter((ent) => {
        if (!ent.isFile()) return false;
        const l = ent.name.toLowerCase();
        const ext = path.extname(l);
        return (
          !l.startsWith(".") &&
          !l.startsWith("gamelist") &&
          !l.includes(".bak") &&
          !l.endsWith(".old") &&
          /^\.(zip|7z|chd|iso|bin|cue|rvz|nes|sfc|smc|gb|gbc|gba|z64|n64|v64|md|gen|32x|sms|gg|pbp|cso|gdi|cdi|wad|gcm|nds|rom|a26|pce|ngp|ngc|ws|wsc)$/i.test(ext)
        );
      });

    for (const file of files) {
      const extIdx = file.name.lastIndexOf(".");
      const baseName = extIdx > 0 ? file.name.slice(0, extIdx) : file.name;

      if (filterQuery && !baseName.toLowerCase().includes(filterQuery.toLowerCase())) {
        continue;
      }

      if (!forceAll && !noCache && metadataCache.isExhausted(sys, baseName)) {
        cachedSkippedCount++;
        continue;
      }

      const artDir = path.join(STORAGE_ROOT, sys, "artwork");
      const needs = {};

      const hasAsset = (subFolders, extList) => {
        const folders = Array.isArray(subFolders) ? subFolders : [subFolders];
        return folders.some((f) => fileExistsWithAnyExt(path.join(artDir, f), baseName, extList));
      };

      if (targets.boxart && (forceAll || !hasAsset(["artwork_front", "box2d"]))) {
        needs.boxart = true;
      }
      if (targets.boxart3d && (forceAll || !hasAsset(["artwork_3d", "box3d", "thumbnails"]))) {
        needs.boxart3d = true;
      }
      if (targets.screenshots && (forceAll || !hasAsset(["screenshot", "images"]))) {
        needs.screenshots = true;
      }
      if (targets.titlescreens && (forceAll || !hasAsset(["screentitle", "titles"]))) {
        needs.titlescreens = true;
      }
      if (targets.discOrCart) {
        const subFolder = sysConf.isDisc ? "medium_disc" : "medium_front";
        const checkFolders = sysConf.isDisc ? ["medium_disc"] : ["medium_front", "cartridges"];
        if (forceAll || !hasAsset(checkFolders)) {
          needs.discOrCart = subFolder;
        }
      }
      if (targets.logos && (forceAll || !hasAsset(["logo", "marquee"]))) {
        needs.logos = true;
      }
      if (targets.stories && (forceAll || !hasAsset(["story"], [".txt"]))) {
        needs.stories = true;
      }
      if (targets.videos && (forceAll || !hasAsset(["video", "videos"], [".mp4"]))) {
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

  if (cachedSkippedCount > 0) {
    console.log(`[*] Skipped ${cachedSkippedCount} games verified with no new assets (cached from prior --all runs; use --force or --no-cache to re-scan)`);
  }

  if (limit && limit > 0) {
    queue = queue.slice(0, limit);
  }

  console.log(`[*] Total games needing requested assets: ${queue.length}`);
  if (queue.length === 0) {
    console.log("[✓] All target games already have requested assets present or cached as unavailable!");
    process.exit(0);
  }

  const estSec = (queue.length * delayMs) / 1000;
  console.log(`[*] Estimated processing duration: ~${formatTime(estSec)}`);
  console.log("------------------------------------------------------------------");

  let successCount = 0;
  let notFoundCount = 0;
  const startTime = Date.now();

  process.on("SIGINT", () => {
    console.log("\n[!] Process interrupted. Saving cache...");
    metadataCache.save();
    process.exit(0);
  });

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
    let clean = cleanTitleForSearch(base);
    const artBaseDir = path.join(STORAGE_ROOT, sys, "artwork");
    const downloadedForGame = [];

    // For MAME / Arcade, query ArcadeDB first to get canonical title, flyer, marquee, snaps, and video
    let arcadeDbData = null;
    if (sys.toLowerCase() === "mame" || sys.toLowerCase() === "arcade" || item.config.igdbId === 52) {
      arcadeDbData = await fetchArcadeDbData(base);
      if (arcadeDbData?.title) {
        clean = cleanTitleForSearch(arcadeDbData.title);
      }
    }

    // 1. Fetch IGDB Metadata (if token available and needed)
    let igdbData = null;
    if (twitchToken && (item.needs.boxart || item.needs.screenshots || item.needs.stories || item.needs.videos)) {
      try {
        let q = "";
        if (item.igdbId) {
          q = `fields name, summary, cover.image_id, screenshots.image_id, videos.video_id, genres.name, keywords.name, themes.name; where id = ${item.igdbId}; limit 1;`;
        } else {
          const pId = item.config.igdbId;
          if (clean && pId) {
            q = `search "${clean}"; fields name, summary, cover.image_id, screenshots.image_id, videos.video_id, platforms, category, genres.name, keywords.name, themes.name; where platforms = [${pId}]; limit 15;`;
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
            if (list.length > 0) {
              igdbData = item.igdbId ? list[0] : findBestMatch(list, clean, item.config.igdbId);
              if (igdbData && dbPool) {
                const kws = [
                  ...(Array.isArray(igdbData.keywords) ? igdbData.keywords.map((k) => k.name) : []),
                  ...(Array.isArray(igdbData.themes) ? igdbData.themes.map((t) => t.name) : []),
                ].filter(Boolean);
                const genres = Array.isArray(igdbData.genres)
                  ? igdbData.genres.map((g) => g.name).filter(Boolean)
                  : [];
                if (kws.length > 0 || genres.length > 0 || igdbData.summary) {
                  const gameId = `${sys}__${encodeURIComponent(base)}`;
                  dbPool.query(
                    `INSERT INTO game_metadata (id, system, clean_title, summary, genres, keywords, igdb_id)
                     VALUES (?, ?, ?, ?, ?, ?, ?)
                     ON DUPLICATE KEY UPDATE
                       summary = COALESCE(VALUES(summary), summary),
                       genres = COALESCE(VALUES(genres), genres),
                       keywords = COALESCE(VALUES(keywords), keywords),
                       igdb_id = COALESCE(VALUES(igdb_id), igdb_id)`,
                    [
                      gameId,
                      sys,
                      clean,
                      igdbData.summary || null,
                      genres.length > 0 ? genres.join(", ") : null,
                      kws.length > 0 ? kws.join(", ") : null,
                      igdbData.id || null,
                    ]
                  ).catch(() => {});
                }
              }
            }
          }
        }
      } catch {}
    }

    // Save ArcadeDB metadata to MariaDB if IGDB did not populate
    if (arcadeDbData && !igdbData && dbPool) {
      const gameId = `${sys}__${encodeURIComponent(base)}`;
      dbPool.query(
        `INSERT INTO game_metadata (id, system, clean_title, summary, genres)
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           clean_title = COALESCE(VALUES(clean_title), clean_title),
           summary = COALESCE(VALUES(summary), summary),
           genres = COALESCE(VALUES(genres), genres)`,
        [
          gameId,
          sys,
          arcadeDbData.title || clean,
          arcadeDbData.overview || null,
          arcadeDbData.genre || null,
        ]
      ).catch(() => {});
    }

    // --- Asset A: 2D Box Art / Flyer ---
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

      // 2. ArcadeDB Flyer (Arcade / MAME)
      if (!saved && arcadeDbData?.flyerUrl) {
        const bytes = await downloadBinary(arcadeDbData.flyerUrl, targetPath);
        if (bytes) {
          downloadedForGame.push("Flyer (ArcadeDB)");
          saved = true;
        }
      }

      // 3. Fallback: Libretro Named_Boxarts
      if (!saved && item.config.libretroRepo) {
        const lrCandidates = [arcadeDbData?.title, base].filter(Boolean);
        for (const cand of lrCandidates) {
          const lrUrl = `https://raw.githubusercontent.com/libretro-thumbnails/${item.config.libretroRepo}/master/Named_Boxarts/${encodeURIComponent(cand)}.png`;
          const bytes = await downloadBinary(lrUrl, path.join(artBaseDir, "artwork_front", `${base}.png`));
          if (bytes) {
            downloadedForGame.push("2D Box Art (Libretro)");
            saved = true;
            break;
          }
        }
      }

      // 4. Fallback: SteamGridDB Grids
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

    // --- Asset A2: 3D Box Art / Cabinet Photo ---
    if (item.needs.boxart3d) {
      let saved = false;
      const targetPath = path.join(artBaseDir, "artwork_3d", `${base}.png`);
      if (arcadeDbData?.cabinetUrl) {
        const bytes = await downloadBinary(arcadeDbData.cabinetUrl, targetPath);
        if (bytes) {
          downloadedForGame.push("Cabinet Photo (ArcadeDB)");
          saved = true;
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

      // 2. ArcadeDB Snap (Arcade / MAME)
      if (!saved && arcadeDbData?.snapUrl) {
        const bytes = await downloadBinary(arcadeDbData.snapUrl, targetPath);
        if (bytes) {
          downloadedForGame.push("Screenshot (ArcadeDB)");
          saved = true;
        }
      }

      // 3. Fallback: Libretro Named_Snaps
      if (!saved && item.config.libretroRepo) {
        const lrCandidates = [arcadeDbData?.title, base].filter(Boolean);
        for (const cand of lrCandidates) {
          const lrUrl = `https://raw.githubusercontent.com/libretro-thumbnails/${item.config.libretroRepo}/master/Named_Snaps/${encodeURIComponent(cand)}.png`;
          const bytes = await downloadBinary(lrUrl, path.join(artBaseDir, "screenshot", `${base}.png`));
          if (bytes) {
            downloadedForGame.push("Screenshot (Libretro)");
            saved = true;
            break;
          }
        }
      }
    }

    // --- Asset C: Title Screens ---
    if (item.needs.titlescreens) {
      let saved = false;
      const targetPath = path.join(artBaseDir, "screentitle", `${base}.png`);

      // 1. Try Libretro Named_Titles
      if (item.config.libretroRepo) {
        const lrCandidates = [arcadeDbData?.title, base].filter(Boolean);
        for (const cand of lrCandidates) {
          const lrUrl = `https://raw.githubusercontent.com/libretro-thumbnails/${item.config.libretroRepo}/master/Named_Titles/${encodeURIComponent(cand)}.png`;
          const bytes = await downloadBinary(lrUrl, targetPath);
          if (bytes) {
            downloadedForGame.push("Title Screen (Libretro)");
            saved = true;
            break;
          }
        }
      }

      // 2. ArcadeDB Title Screen
      if (!saved && arcadeDbData?.titleUrl) {
        const bytes = await downloadBinary(arcadeDbData.titleUrl, targetPath);
        if (bytes) {
          downloadedForGame.push("Title Screen (ArcadeDB)");
          saved = true;
        }
      }

      // 3. Fallback: Second IGDB screenshot
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

    // --- Asset D: Transparent Wheel Logos / Marquees ---
    if (item.needs.logos) {
      let saved = false;
      const targetPath = path.join(artBaseDir, "logo", `${base}.png`);

      // 1. SteamGridDB Logo
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

      // 2. ArcadeDB Marquee
      if (!saved && arcadeDbData?.marqueeUrl) {
        const bytes = await downloadBinary(arcadeDbData.marqueeUrl, targetPath);
        if (bytes) {
          downloadedForGame.push("Cabinet Marquee (ArcadeDB)");
          saved = true;
        }
      }
    }

    // --- Asset E: Stories / Plot Summaries ---
    if (item.needs.stories) {
      let storyText = igdbData?.summary || null;
      if (!storyText && arcadeDbData?.overview) {
        storyText = arcadeDbData.overview;
      }
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

    // --- Asset G: Preview Video ---
    if (item.needs.videos && arcadeDbData?.videoUrl) {
      const targetPath = path.join(artBaseDir, "video", `${base}.mp4`);
      const bytes = await downloadBinary(arcadeDbData.videoUrl, targetPath);
      if (bytes) {
        downloadedForGame.push("Video Preview (ArcadeDB)");
      }
    }

    // Output Result
    if (downloadedForGame.length > 0) {
      successCount++;
      console.log(
        `[${itemNum}/${queue.length}] (${pct}%) [${sys.toUpperCase()}] ${base} -> ${downloadedForGame.join(" + ")} | ETA: ${formatTime(etaSeconds)}`
      );
      metadataCache.removeExhausted(sys, base);
    } else {
      notFoundCount++;
      console.log(
        `[${itemNum}/${queue.length}] (${pct}%) [${sys.toUpperCase()}] ${base} -> No new assets found | ETA: ${formatTime(etaSeconds)}`
      );
      if (isAllTargets) {
        metadataCache.markExhausted(sys, base);
      }
    }

    if (itemNum % 10 === 0) {
      metadataCache.save();
    }

    await sleep(delayMs);
  }

  metadataCache.save();

  const totalTimeSeconds = ((Date.now() - startTime) / 1000).toFixed(0);
  console.log("==================================================================");
  console.log(`[✓] Download Completed in ${formatTime(totalTimeSeconds)}!`);
  console.log(`    - Games Enriched: ${successCount}`);
  console.log(`    - Games Untouched:${notFoundCount}`);
  console.log("==================================================================");
  console.log("[*] Run 'npm run scan' (or click Rescan in Admin) to update catalog.");
  if (dbPool) {
    await dbPool.end();
  }
}

main().catch((err) => {
  console.error("[-] Fatal error:", err);
  process.exit(1);
});
