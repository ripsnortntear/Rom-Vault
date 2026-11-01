import fs from "fs";
import path from "path";
import type { GameItem, GameLibraryResponse, LibraryStats } from "@/types/game";
import {
  buildMediaUrl,
  getArtworkDirectory,
  getRomsDirectory,
  getStorageRoot,
  normalizeSystem,
} from "@/lib/paths";
import { getSystemMeta } from "@/lib/systems";
import { getAllCachedMetadataMap } from "@/lib/igdb";

const KNOWN_REGIONS = new Set([
  "USA",
  "Europe",
  "Japan",
  "World",
  "Australia",
  "Spain",
  "France",
  "Germany",
  "Italy",
  "Sweden",
  "Asia",
  "Korea",
  "Canada",
  "UK",
]);

const SECONDARY_DISC_REGEX =
  /[\s\(\[]+(?:disc|disk)\s*([2-9]|\d{2,}|ii|iii|iv|v|vi|b|c|d|e)[\s\)\]]+/i;

function parseDiscNumber(str: string): number {
  const match = str.match(
    /[\s\(\[]+(?:disc|disk)\s*([0-9]+|ii|iii|iv|v|vi|b|c|d|e)[\s\)\]]+/i
  );
  if (!match) return 1;
  const token = match[1].toLowerCase();
  const romanMap: Record<string, number> = {
    "1": 1,
    "2": 2,
    "3": 3,
    "4": 4,
    "5": 5,
    "6": 6,
    "7": 7,
    "8": 8,
    "9": 9,
    i: 1,
    ii: 2,
    iii: 3,
    iv: 4,
    v: 5,
    vi: 6,
    a: 1,
    b: 2,
    c: 3,
    d: 4,
    e: 5,
  };
  return romanMap[token] ?? (parseInt(token, 10) || 1);
}

function getBaseGameKey(baseName: string): string {
  let s = baseName.replace(/[\s\(\[]+(?:disc|disk)\s*[^)\]]*[)\]]+/gi, "");
  s = s.replace(
    /\s*\((?:allies|soviet|nod|gdi|evolution disc|arcade disc|shockwave[^)]*|the first generation|chronicles of arthur|blazing guns|ninja hayate|road blaster)\)/gi,
    ""
  );
  return s.trim().toLowerCase();
}

let cachedLibrary: GameLibraryResponse | null = null;
let cachedSignature = "";

function getSystemSignature(system: string): string {
  try {
    const romsDir = getRomsDirectory(system);
    const artworkDir = getArtworkDirectory(system);
    const parts: string[] = [];

    if (fs.existsSync(romsDir)) {
      const st = fs.statSync(romsDir);
      parts.push(`${system}:roms:${st.mtimeMs}:${st.size}`);
    }

    if (fs.existsSync(artworkDir)) {
      const st = fs.statSync(artworkDir);
      parts.push(`${system}:art:${st.mtimeMs}:${st.size}`);
    }

    return parts.join("|");
  } catch {
    return "";
  }
}

function getLibrarySignature(systems: string[]): string {
  const timeBucket = Math.floor(Date.now() / 30000);
  return `${timeBucket}|${systems.map((s) => getSystemSignature(s)).join("|")}`;
}

interface ParsedRomTitle {
  displayTitle: string;
  sortTitle: string;
  firstLetter: string;
  regions: string[];
  tags: string[];
  year?: number | null;
}

function parseRomBaseName(baseName: string): ParsedRomTitle {
  const parenRegex = /\(([^)]+)\)/g;
  const groups: string[] = [];
  let match: RegExpExecArray | null = parenRegex.exec(baseName);

  while (match !== null) {
    groups.push(match[1].trim());
    match = parenRegex.exec(baseName);
  }

  const rawTitle = baseName.replace(/\s*\([^)]*\)/g, "").trim();

  const regions: string[] = [];
  const tags: string[] = [];
  let year: number | null = null;

  for (const group of groups) {
    const parts = group.split(",").map((part) => part.trim());
    const isRegionGroup = parts.every((part) => KNOWN_REGIONS.has(part));
    if (isRegionGroup && regions.length === 0) {
      regions.push(...parts);
    } else {
      tags.push(group);
      const yearMatch = group.match(/\b(19\d\d|20\d\d)\b/);
      if (yearMatch && !year) {
        year = parseInt(yearMatch[1], 10);
      }
    }
  }

  if (regions.length === 0) {
    regions.push("USA");
  }

  const displayTitle = rawTitle.replace(
    /^(.+?),\s*(The|A|An)(\s+-\s+.*|$)/i,
    (_full, main: string, article: string, rest: string) =>
      `${article} ${main}${rest || ""}`
  );

  const firstChar = rawTitle.charAt(0).toUpperCase();
  const firstLetter = /^[A-Z]$/.test(firstChar) ? firstChar : "#";

  return {
    displayTitle,
    sortTitle: rawTitle,
    firstLetter,
    regions,
    tags,
    year,
  };
}

function readDirectoryMap(dirPath: string): Map<string, string> {
  try {
    if (!fs.existsSync(dirPath)) {
      return new Map<string, string>();
    }
    const map = new Map<string, string>();
    for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
      if (!entry.isFile() && !entry.isSymbolicLink()) {
        continue;
      }
      const lowerFull = entry.name.toLowerCase();
      map.set(lowerFull, entry.name);
      const extIdx = lowerFull.lastIndexOf(".");
      if (extIdx > 0) {
        const lowerBase = lowerFull.slice(0, extIdx);
        if (!map.has(lowerBase)) {
          map.set(lowerBase, entry.name);
        }
      }
    }
    return map;
  } catch (error) {
    console.error("[scanner] Error reading directory:", { dirPath, error });
    return new Map<string, string>();
  }
}

function readStoryFile(storyDir: string, fileName: string): string {
  try {
    const storyPath = path.join(/*turbopackIgnore: true*/ storyDir, fileName);
    if (!fs.existsSync(storyPath)) {
      return "";
    }
    const raw = fs.readFileSync(storyPath, "utf-8");
    return raw
      .replace(/\r\n/g, "\n")
      .replace(/([a-z0-9.!?])([A-Z])/g, "$1 $2")
      .trim();
  } catch (error) {
    console.error("[scanner] Failed reading story file:", { fileName, error });
    return "";
  }
}

function discoverSystems(): string[] {
  const root = getStorageRoot();
  try {
    if (!fs.existsSync(root)) return [];
    return fs
      .readdirSync(root, { withFileTypes: true })
      .filter(
        (ent) =>
          ent.isDirectory() &&
          fs.existsSync(path.join(/*turbopackIgnore: true*/ root, ent.name, "roms"))
      )
      .map((ent) => normalizeSystem(ent.name))
      .sort();
  } catch (error) {
    console.error("[scanner] Failed discovering systems:", error);
    return [];
  }
}

interface SystemScanResult {
  games: GameItem[];
  totalSizeBytes: number;
  withVideoCount: number;
  withStoryCount: number;
  regionCounts: Record<string, number>;
}

function scanSystem(system: string): SystemScanResult {
  const romsDir = getRomsDirectory(system);
  const artworkDir = getArtworkDirectory(system);
  const meta = getSystemMeta(system);

  if (!fs.existsSync(romsDir)) {
    return {
      games: [],
      totalSizeBytes: 0,
      withVideoCount: 0,
      withStoryCount: 0,
      regionCounts: {},
    };
  }

  const artworkFrontMap = readDirectoryMap(path.join(/*turbopackIgnore: true*/ artworkDir, "artwork_front"));
  const artwork3dMap = readDirectoryMap(path.join(/*turbopackIgnore: true*/ artworkDir, "artwork_3d"));
  const logoMap = readDirectoryMap(path.join(/*turbopackIgnore: true*/ artworkDir, "logo"));
  const mediumFrontMap = readDirectoryMap(path.join(/*turbopackIgnore: true*/ artworkDir, "medium_front"));
  const mediumDiscMap = readDirectoryMap(path.join(/*turbopackIgnore: true*/ artworkDir, "medium_disc"));
  const screenshotMap = readDirectoryMap(path.join(/*turbopackIgnore: true*/ artworkDir, "screenshot"));
  const screenTitleMap = readDirectoryMap(path.join(/*turbopackIgnore: true*/ artworkDir, "screentitle"));
  const fanartMap = readDirectoryMap(path.join(/*turbopackIgnore: true*/ artworkDir, "fanart"));
  const bezelDayMap = readDirectoryMap(path.join(/*turbopackIgnore: true*/ artworkDir, "bezel_day"));
  const bezelNightMap = readDirectoryMap(path.join(/*turbopackIgnore: true*/ artworkDir, "bezel_night"));
  const storyMap = readDirectoryMap(path.join(/*turbopackIgnore: true*/ artworkDir, "story"));
  const videoMap = readDirectoryMap(path.join(/*turbopackIgnore: true*/ artworkDir, "video"));
  const storyDir = path.join(/*turbopackIgnore: true*/ artworkDir, "story");

  const romEntries = fs
    .readdirSync(romsDir, { withFileTypes: true })
    .filter((entry) => {
      if (!entry.isFile() && !entry.isSymbolicLink()) return false;
      if (entry.isSymbolicLink()) {
        try {
          const stat = fs.statSync(path.join(romsDir, entry.name));
          if (!stat.isFile()) return false;
        } catch {
          return false;
        }
      }
      const lower = entry.name.toLowerCase();
      if (lower.startsWith(".") || lower.endsWith(".m3u")) return false;
      if (
        lower.includes("bios") &&
        (lower.endsWith(".bin") || lower.endsWith(".rom") || lower.endsWith(".dat"))
      ) {
        return false;
      }
      return true;
    });

  const regionCounts: Record<string, number> = {};
  let totalSizeBytes = 0;
  let withVideoCount = 0;
  let withStoryCount = 0;

  const primaryEntries: fs.Dirent[] = [];
  const secondaryEntries: fs.Dirent[] = [];

  for (const entry of romEntries) {
    const extIdx = entry.name.lastIndexOf(".");
    const baseName = extIdx > 0 ? entry.name.slice(0, extIdx) : entry.name;
    if (SECONDARY_DISC_REGEX.test(baseName)) {
      secondaryEntries.push(entry);
    } else {
      primaryEntries.push(entry);
    }
  }

  const games: GameItem[] = primaryEntries.map((entry) => {
    const romFileName = entry.name;
    const extIdx = romFileName.lastIndexOf(".");
    const baseName = extIdx > 0 ? romFileName.slice(0, extIdx) : romFileName;
    const lowerBase = baseName.toLowerCase();

    let fileSizeBytes = 0;
    try {
      fileSizeBytes = fs.statSync(path.join(/*turbopackIgnore: true*/ romsDir, romFileName)).size;
    } catch (statError) {
      console.error("[scanner] Could not stat ROM file:", {
        system,
        romFileName,
        statError,
      });
    }

    totalSizeBytes += fileSizeBytes;

    const parsed = parseRomBaseName(baseName);
    for (const region of parsed.regions) {
      regionCounts[region] = (regionCounts[region] ?? 0) + 1;
    }

    const artworkFrontFile = artworkFrontMap.get(`${lowerBase}.png`) ?? artworkFrontMap.get(lowerBase);
    const artwork3dFile = artwork3dMap.get(`${lowerBase}.png`) ?? artwork3dMap.get(lowerBase);
    const logoFile = logoMap.get(`${lowerBase}.png`) ?? logoMap.get(lowerBase);
    const mediumFrontFile = mediumFrontMap.get(`${lowerBase}.png`) ?? mediumFrontMap.get(lowerBase);
    const mediumDiscFile = mediumDiscMap.get(`${lowerBase}.png`) ?? mediumDiscMap.get(lowerBase);
    const screenshotFile = screenshotMap.get(`${lowerBase}.png`) ?? screenshotMap.get(lowerBase);
    const screenTitleFile = screenTitleMap.get(`${lowerBase}.png`) ?? screenTitleMap.get(lowerBase);
    const fanartFile = fanartMap.get(`${lowerBase}.png`) ?? fanartMap.get(lowerBase);
    const bezelDayFile = bezelDayMap.get(`${lowerBase}.png`) ?? bezelDayMap.get(lowerBase);
    const bezelNightFile = bezelNightMap.get(`${lowerBase}.png`) ?? bezelNightMap.get(lowerBase);
    const storyFile = storyMap.get(`${lowerBase}.txt`) ?? storyMap.get(lowerBase);
    const videoFile = videoMap.get(`${lowerBase}.mp4`) ?? videoMap.get(lowerBase);

    if (videoFile) {
      withVideoCount += 1;
    }

    const story = storyFile ? readStoryFile(storyDir, storyFile) : "";
    if (story.length > 0) {
      withStoryCount += 1;
    }

    const isDisc = /[\s\(\[]+(?:disc|disk)\s*(1|i|a)[\s\)\]]+/i.test(baseName);
    const discs = isDisc
      ? [
          {
            discNumber: 1,
            fileName: romFileName,
            romUrl: buildMediaUrl("roms", romFileName, system),
            fileSizeBytes,
          },
        ]
      : undefined;

    return {
      id: `${system}__${encodeURIComponent(baseName)}`,
      system,
      systemLabel: meta.shortLabel,
      systemCompany: meta.company,
      badgeColor: meta.badgeColor,
      playable: meta.playable,
      baseName,
      romFileName,
      displayTitle: parsed.displayTitle,
      sortTitle: parsed.sortTitle,
      firstLetter: parsed.firstLetter,
      regions: parsed.regions,
      tags: parsed.tags,
      fileSizeBytes,
      story,
      discs,
      year: parsed.year ?? null,
      media: {
        rom: buildMediaUrl("roms", romFileName, system),
        artworkFront: artworkFrontFile
          ? buildMediaUrl("artwork_front", artworkFrontFile, system)
          : null,
        artwork3d: artwork3dFile
          ? buildMediaUrl("artwork_3d", artwork3dFile, system)
          : null,
        logo: logoFile ? buildMediaUrl("logo", logoFile, system) : null,
        mediumFront: mediumFrontFile
          ? buildMediaUrl("medium_front", mediumFrontFile, system)
          : null,
        mediumDisc: mediumDiscFile
          ? buildMediaUrl("medium_disc", mediumDiscFile, system)
          : null,
        screenshot: screenshotFile
          ? buildMediaUrl("screenshot", screenshotFile, system)
          : null,
        screenTitle: screenTitleFile
          ? buildMediaUrl("screentitle", screenTitleFile, system)
          : null,
        fanart: fanartFile ? buildMediaUrl("fanart", fanartFile, system) : null,
        bezelDay: bezelDayFile ? buildMediaUrl("bezel_day", bezelDayFile, system) : null,
        bezelNight: bezelNightFile ? buildMediaUrl("bezel_night", bezelNightFile, system) : null,
        video: videoFile ? buildMediaUrl("video", videoFile, system) : null,
      },
    };
  });

  const primaryKeyMap = new Map<string, GameItem>();
  const primaryTitleMap = new Map<string, GameItem>();

  for (const game of games) {
    primaryKeyMap.set(getBaseGameKey(game.baseName), game);
    primaryTitleMap.set(game.sortTitle.toLowerCase(), game);
  }

  for (const entry of secondaryEntries) {
    const romFileName = entry.name;
    const extIdx = romFileName.lastIndexOf(".");
    const baseName = extIdx > 0 ? romFileName.slice(0, extIdx) : romFileName;

    let fileSizeBytes = 0;
    try {
      fileSizeBytes = fs.statSync(path.join(/*turbopackIgnore: true*/ romsDir, romFileName)).size;
    } catch {}

    totalSizeBytes += fileSizeBytes;

    const baseKey = getBaseGameKey(baseName);
    const parsed = parseRomBaseName(baseName);
    const primary =
      primaryKeyMap.get(baseKey) ??
      primaryTitleMap.get(parsed.sortTitle.toLowerCase());

    if (primary) {
      if (!primary.discs) {
        primary.discs = [
          {
            discNumber: 1,
            fileName: primary.romFileName,
            romUrl: primary.media.rom,
            fileSizeBytes: primary.fileSizeBytes,
          },
        ];
      }
      primary.discs.push({
        discNumber: parseDiscNumber(baseName),
        fileName: romFileName,
        romUrl: buildMediaUrl("roms", romFileName, system),
        fileSizeBytes,
      });
      primary.discs.sort((a, b) => a.discNumber - b.discNumber);
    }
  }

  return {
    games,
    totalSizeBytes,
    withVideoCount,
    withStoryCount,
    regionCounts,
  };
}

let isScanning = false;

export function isScanActive(): boolean {
  return isScanning;
}

export function acquireScanLock(): boolean {
  if (isScanning) return false;
  isScanning = true;
  return true;
}

export function releaseScanLock(): void {
  isScanning = false;
}

export async function scanGameLibrary(forceRefresh = false): Promise<GameLibraryResponse> {
  const systems = discoverSystems();
  const currentSignature = getLibrarySignature(systems);

  if (cachedLibrary && !forceRefresh && currentSignature === cachedSignature) {
    return cachedLibrary;
  }

  if (forceRefresh) {
    if (!acquireScanLock()) {
      const err = new Error("A filesystem rescan is already in progress.");
      err.name = "ScanConflictError";
      throw err;
    }
  }

  try {
    const allGames: GameItem[] = [];
    const combinedRegions: Record<string, number> = {};
    const systemCounts: Record<string, number> = {};
    let totalSizeBytes = 0;
    let withVideoCount = 0;
    let withStoryCount = 0;

    for (const sys of systems) {
      const res = scanSystem(sys);
      allGames.push(...res.games);
      totalSizeBytes += res.totalSizeBytes;
      withVideoCount += res.withVideoCount;
      withStoryCount += res.withStoryCount;
      systemCounts[sys] = res.games.length;

      for (const [region, count] of Object.entries(res.regionCounts)) {
        combinedRegions[region] = (combinedRegions[region] ?? 0) + count;
      }
    }

    // Attach cached metadata from MariaDB
    try {
      const metaMap = await getAllCachedMetadataMap();
      if (metaMap.size > 0) {
        for (const game of allGames) {
          const meta = metaMap.get(game.id) ?? metaMap.get(decodeURIComponent(game.id));
          if (meta) {
            if (meta.year) game.year = meta.year;
            if (meta.developer) game.developer = meta.developer;
            if (meta.publisher) game.publisher = meta.publisher;
            if (meta.genres && meta.genres.length > 0) game.genres = meta.genres;
            if (!game.story && meta.summary) game.story = meta.summary;
          }
        }
      }
    } catch (metaErr) {
      console.warn("[scanner] Failed attaching database metadata:", metaErr);
    }

    allGames.sort((a, b) => a.sortTitle.localeCompare(b.sortTitle));

    const stats: LibraryStats = {
      totalGames: allGames.length,
      totalSizeBytes,
      regions: combinedRegions,
      systems: systemCounts,
      withVideoCount,
      withStoryCount,
      scannedAt: new Date().toISOString(),
    };

    cachedLibrary = { games: allGames, stats };
    cachedSignature = currentSignature;
    return cachedLibrary;
  } catch (error) {
    if ((error as any)?.name === "ScanConflictError") {
      throw error;
    }
    console.error("[scanner] Fatal error scanning game library:", error);
    return {
      games: [],
      stats: {
        totalGames: 0,
        totalSizeBytes: 0,
        regions: {},
        systems: {},
        withVideoCount: 0,
        withStoryCount: 0,
        scannedAt: new Date().toISOString(),
      },
    };
  } finally {
    if (forceRefresh) {
      releaseScanLock();
    }
  }
}

export function updateCachedGameMetadata(id: string, meta: Partial<GameItem>): void {
  if (!cachedLibrary) return;
  const decodedId = decodeURIComponent(id);
  const game = cachedLibrary.games.find(
    (g) => g.id === id || decodeURIComponent(g.id) === decodedId
  );
  if (game) {
    if (meta.year !== undefined) game.year = meta.year;
    if (meta.developer !== undefined) game.developer = meta.developer;
    if (meta.publisher !== undefined) game.publisher = meta.publisher;
    if (meta.genres !== undefined) game.genres = meta.genres;
    if (meta.story !== undefined && !game.story) game.story = meta.story;
  }
}

export async function getGameById(id: string): Promise<GameItem | null> {
  const { games } = await scanGameLibrary();
  const decodedId = decodeURIComponent(id);
  const found = games.find(
    (g) => g.id === id || g.id === decodedId || decodeURIComponent(g.id) === decodedId
  );
  if (found) return found;

  const withoutPrefix = decodedId.includes("__")
    ? decodedId.split("__").slice(1).join("__")
    : decodedId;
  const match = games.find(
    (g) => g.baseName === withoutPrefix || g.romFileName === withoutPrefix
  );
  return match ?? null;
}
