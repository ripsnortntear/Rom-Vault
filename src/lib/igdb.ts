import { query, execute } from "@/lib/db";

export interface IgdbGameMetadata {
  id: string; // system__baseName
  system: string;
  cleanTitle: string;
  year: number | null;
  releaseDate: number | null;
  summary: string | null;
  genres: string[];
  keywords: string[];
  developer: string | null;
  publisher: string | null;
  igdbId: number | null;
}

export const IGDB_PLATFORM_MAP: Record<string, number> = {
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

let cachedAccessToken: string | null = null;
let tokenExpiresAt = 0;

/**
 * Obtain a valid Twitch OAuth Bearer token for IGDB API.
 */
export async function getIgdbAccessToken(): Promise<string | null> {
  const clientId = process.env.TWITCH_CLIENT_ID;
  const clientSecret = process.env.TWITCH_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return null;
  }

  const now = Math.floor(Date.now() / 1000);
  if (cachedAccessToken && now < tokenExpiresAt - 60) {
    return cachedAccessToken;
  }

  try {
    const url = `https://id.twitch.tv/oauth2/token?client_id=${encodeURIComponent(
      clientId
    )}&client_secret=${encodeURIComponent(clientSecret)}&grant_type=client_credentials`;

    const res = await fetch(url, { method: "POST" });
    if (!res.ok) {
      console.error("[IGDB] Failed to acquire Twitch token:", res.status, await res.text());
      return null;
    }

    const data = await res.json();
    cachedAccessToken = data.access_token;
    tokenExpiresAt = now + (data.expires_in || 3600);
    return cachedAccessToken;
  } catch (err) {
    console.error("[IGDB] Token fetch error:", err);
    return null;
  }
}

const ROMAN_NUMERALS: Record<string, string> = {
  ii: "2",
  iii: "3",
  iv: "4",
  v: "5",
  vi: "6",
  vii: "7",
  viii: "8",
  ix: "9",
};

/**
 * Clean game title for optimal IGDB search matching.
 */
export function cleanTitleForSearch(title: string): string {
  return title
    .replace(/\s*\([^)]*\)/g, "") // Remove parentheticals: (USA), (Disc 1), (v1.1)
    .replace(/\s*\[[^\]]*\]/g, "") // Remove brackets: [!], [b1]
    .replace(/[\-–—:]/g, " ")      // Replace dashes/colons with spaces
    .replace(/['"!?._]/g, "")       // Remove punctuation
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeForMatch(title: string): string {
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

export function extractSequelNumber(normalized: string): string | null {
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

export function findBestIgdbMatch(
  items: any[],
  cleanTitle: string,
  targetPlatform?: number | null
): any | null {
  if (!Array.isArray(items) || items.length === 0) return null;

  const cleanNorm = normalizeForMatch(cleanTitle);
  const cleanNum = extractSequelNumber(cleanNorm);

  let best: any = null;
  let bestScore = -1;

  for (const item of items) {
    if (!item.name) continue;
    const itemNorm = normalizeForMatch(item.name);
    const itemNum = extractSequelNumber(itemNorm);

    // Hard constraint: If one has a sequel number and the other has a different sequel number, reject
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

    // Zero title overlap means unrelated game
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
    if (item.category === 5) score -= 30; // ROM hack penalty
    if (item.cover?.image_id) score += 5;
    if (item.first_release_date) score += 5;

    if (score > bestScore) {
      bestScore = score;
      best = item;
    }
  }

  // Minimum threshold to prevent arbitrary fallback matches
  if (bestScore < 40) return null;

  return best;
}

export function normalizeTitleForComparison(title: string): string {
  return normalizeForMatch(title).replace(/[^a-z0-9]/g, "");
}

/**
 * Fetch all cached game metadata records from MariaDB in bulk.
 */
export async function getAllCachedMetadataMap(): Promise<Map<string, IgdbGameMetadata>> {
  const map = new Map<string, IgdbGameMetadata>();
  try {
    const rows = await query<any>(
      "SELECT id, system, clean_title, year, release_date, summary, genres, keywords, developer, publisher, igdb_id FROM game_metadata"
    );

    for (const r of rows) {
      map.set(r.id, {
        id: r.id,
        system: r.system,
        cleanTitle: r.clean_title,
        year: r.year,
        releaseDate: r.release_date ? Number(r.release_date) : null,
        summary: r.summary,
        genres: r.genres ? r.genres.split(",").map((g: string) => g.trim()).filter(Boolean) : [],
        keywords: r.keywords ? r.keywords.split(",").map((k: string) => k.trim()).filter(Boolean) : [],
        developer: r.developer,
        publisher: r.publisher,
        igdbId: r.igdb_id,
      });
    }
  } catch (err) {
    console.error("[IGDB] Error loading cached metadata:", err);
  }
  return map;
}

/**
 * Synchronous in-memory cache for fast lookups during request lifecycles.
 */
let memoryMetadataCache: Map<string, IgdbGameMetadata> | null = null;
let lastCacheLoad = 0;

export async function getFastCachedMetadata(id: string): Promise<IgdbGameMetadata | null> {
  const now = Date.now();
  if (!memoryMetadataCache || now - lastCacheLoad > 60000) {
    memoryMetadataCache = await getAllCachedMetadataMap();
    lastCacheLoad = now;
  }
  return memoryMetadataCache.get(id) ?? null;
}

/**
 * Query IGDB for a single game and persist result to MariaDB.
 */
export async function resolveGameMetadata(
  id: string,
  system: string,
  displayTitle: string
): Promise<IgdbGameMetadata | null> {
  // 1. Check database first
  try {
    const rows = await query<any>(
      "SELECT id, system, clean_title, year, release_date, summary, genres, keywords, developer, publisher, igdb_id FROM game_metadata WHERE id = ? LIMIT 1",
      [id]
    );
    if (rows.length > 0) {
      const r = rows[0];
      return {
        id: r.id,
        system: r.system,
        cleanTitle: r.clean_title,
        year: r.year,
        releaseDate: r.release_date ? Number(r.release_date) : null,
        summary: r.summary,
        genres: r.genres ? r.genres.split(",").map((g: string) => g.trim()).filter(Boolean) : [],
        keywords: r.keywords ? r.keywords.split(",").map((k: string) => k.trim()).filter(Boolean) : [],
        developer: r.developer,
        publisher: r.publisher,
        igdbId: r.igdb_id,
      };
    }
  } catch {}

  const token = await getIgdbAccessToken();
  const clientId = process.env.TWITCH_CLIENT_ID;
  if (!token || !clientId) return null;

  const clean = cleanTitleForSearch(displayTitle);
  if (!clean) return null;

  const targetPlatform = IGDB_PLATFORM_MAP[system.toLowerCase()] ?? null;

  try {
    const apicalypseQuery = `search "${clean}"; fields name, first_release_date, platforms, category, summary, genres.name, keywords.name, themes.name, involved_companies.company.name, involved_companies.developer, involved_companies.publisher; limit 20;`;

    const res = await fetch("https://api.igdb.com/v4/games", {
      method: "POST",
      headers: {
        "Client-ID": clientId,
        Authorization: `Bearer ${token}`,
      },
      body: apicalypseQuery,
    });

    if (!res.ok) {
      console.warn(`[IGDB] Query failed for "${clean}":`, res.status, await res.text());
      return null;
    }

    const items: any[] = await res.json();
    if (!items || items.length === 0) {
      // Record negative cache in DB with null year so we don't spam IGDB repeatedly
      await execute(
        "INSERT INTO game_metadata (id, system, clean_title, year) VALUES (?, ?, ?, NULL) ON DUPLICATE KEY UPDATE updated_at = NOW()",
        [id, system, clean]
      ).catch(() => {});
      return null;
    }

    const match = findBestIgdbMatch(items, clean, targetPlatform);

    if (!match) {
      // Record negative cache in DB with null year so we don't spam IGDB repeatedly
      await execute(
        "INSERT INTO game_metadata (id, system, clean_title, year) VALUES (?, ?, ?, NULL) ON DUPLICATE KEY UPDATE updated_at = NOW()",
        [id, system, clean]
      ).catch(() => {});
      return null;
    }

    let year: number | null = null;
    if (match.first_release_date) {
      year = new Date(match.first_release_date * 1000).getFullYear();
    }

    let devName: string | null = null;
    let pubName: string | null = null;

    if (Array.isArray(match.involved_companies)) {
      for (const ic of match.involved_companies) {
        if (ic.developer && !devName && ic.company?.name) {
          devName = ic.company.name;
        }
        if (ic.publisher && !pubName && ic.company?.name) {
          pubName = ic.company.name;
        }
      }
    }

    const genreList: string[] = Array.isArray(match.genres)
      ? match.genres.map((g: any) => g.name).filter(Boolean)
      : [];

    const keywordList: string[] = [
      ...(Array.isArray(match.keywords) ? match.keywords.map((k: any) => k.name) : []),
      ...(Array.isArray(match.themes) ? match.themes.map((t: any) => t.name) : []),
    ].filter(Boolean);

    const meta: IgdbGameMetadata = {
      id,
      system,
      cleanTitle: clean,
      year,
      releaseDate: match.first_release_date ?? null,
      summary: match.summary ?? null,
      genres: genreList,
      keywords: keywordList,
      developer: devName,
      publisher: pubName,
      igdbId: match.id ?? null,
    };

    // Save to database
    await execute(
      `INSERT INTO game_metadata (id, system, clean_title, year, release_date, summary, genres, keywords, developer, publisher, igdb_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         year = VALUES(year),
         release_date = VALUES(release_date),
         summary = VALUES(summary),
         genres = VALUES(genres),
         keywords = VALUES(keywords),
         developer = VALUES(developer),
         publisher = VALUES(publisher),
         igdb_id = VALUES(igdb_id)`,
      [
        meta.id,
        meta.system,
        meta.cleanTitle,
        meta.year,
        meta.releaseDate,
        meta.summary,
        meta.genres.join(", "),
        meta.keywords.join(", "),
        meta.developer,
        meta.publisher,
        meta.igdbId,
      ]
    ).catch((dbErr) => {
      console.warn("[IGDB] DB insert failed:", dbErr);
    });

    if (memoryMetadataCache) {
      memoryMetadataCache.set(id, meta);
    }

    return meta;
  } catch (err) {
    console.error(`[IGDB] Error resolving "${clean}":`, err);
    return null;
  }
}
