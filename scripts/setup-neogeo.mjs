#!/usr/bin/env node
/**
 * Setup Neo Geo Arcade System in ROM Vault
 * Translates zip ROM names to official human-readable names via ArcadeDB,
 * updates MariaDB game_metadata, links existing artwork, and downloads missing artwork.
 */

import fs from "fs";
import path from "path";
import mysql from "mysql2/promise";

const ROMS_DIR = "/var/www/html/roms";

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, "utf-8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const [k, ...v] = trimmed.split("=");
    process.env[k.trim()] = v.join("=").trim().replace(/^["']|["']$/g, "");
  }
}

loadEnvFile(path.join(ROMS_DIR, ".env.local"));
loadEnvFile(path.join(ROMS_DIR, ".env"));

const NEOGEO_ROMS_DIR = "/mnt/storage/oldsmarchaos.com/roms/neogeo/roms";
const NEOGEO_ARTWORK_DIR = "/mnt/storage/oldsmarchaos.com/roms/neogeo/artwork";

// Ensure artwork subdirectories exist
const ART_DIRS = {
  front: path.join(NEOGEO_ARTWORK_DIR, "artwork_front"),
  front3d: path.join(NEOGEO_ARTWORK_DIR, "artwork_3d"),
  logo: path.join(NEOGEO_ARTWORK_DIR, "logo"),
  title: path.join(NEOGEO_ARTWORK_DIR, "screentitle"),
  snap: path.join(NEOGEO_ARTWORK_DIR, "screenshot"),
  story: path.join(NEOGEO_ARTWORK_DIR, "story"),
  video: path.join(NEOGEO_ARTWORK_DIR, "video"),
  fanart: path.join(NEOGEO_ARTWORK_DIR, "fanart"),
  disc: path.join(NEOGEO_ARTWORK_DIR, "medium_disc"),
};

for (const dir of Object.values(ART_DIRS)) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

// Known mappings for the 20 existing high-res artwork files in collections
const EXISTING_ARTWORK_MAPPINGS = {
  "aof2": "Ryuuko no Ken 2 ~ Art of Fighting 2 (Japan, USA) (En,Ja,Es)",
  "aof3": "Art of Fighting - Ryuuko no Ken Gaiden ~ The Path of the Warrior - Art of Fighting 3 (Japan, USA) (En,Ja,Es,Pt)",
  "bstars2": "Baseball Stars 2 (Japan) (En,Ja)",
  "kof94": "King of Fighters '94, The (Japan, USA) (En,Ja) (Rev 1)",
  "kof95": "King of Fighters '95, The (Japan, USA) (En,Ja)",
  "kof98": "King of Fighters '98, The - Dream Match Never Ends ~ The King of Fighters '98 - The Slugfest (Japan) (En,Ja)",
  "lastblad": "Bakumatsu Roman - Gekka no Kenshi ~ The Last Blade (Japan) (En,Ja,Es,Pt)",
  "mslug2": "Metal Slug 2 (Japan, USA) (En,Ja)",
  "neodrift": "Neo Drift Out - New Technology (Japan)",
  "neoturfm": "Big Tournament Golf ~ Neo Turf Masters (Japan) (En,Ja)",
  "turfmast": "Big Tournament Golf ~ Neo Turf Masters (Japan) (En,Ja)",
  "pbobble": "Puzzle Bobble ~ Bust-A-Move (Japan) (En,Ja)",
  "rbff2": "RB2 - The Newcomers - Real Bout Garou Densetsu 2 ~ RB2 - The Newcomers - Real Bout Fatal Fury 2 (Japan) (En,Ja)",
  "samsho3": "Samurai Spirits - Zankurou Musouken ~ Samurai Shodown III (Japan, USA) (En,Ja,Es,Pt)",
  "sonicwi2": "Sonic Wings 2 ~ Aero Fighters 2 (Japan) (En,Ja)",
  "strhoop": "Dunk Dream ~ Street Slam ~ Street Hoop (Japan, USA)",
  "ssideki3": "Tokuten-ou 3 - Eikou e no Chousen ~ Super Sidekicks 3 - The Next Glory (Japan, USA) (En,Ja,Fr,Es,It,Pt)",
  "tophuntr": "Top Hunter - Roddy & Cathy (Japan) (En,Ja)",
  "twinspri": "Twinkle Star Sprites (Japan) (En,Ja)",
  "viewpoin": "Viewpoint (Japan)",
  "wjammers": "Flying Power Disc ~ Windjammers (Japan) (En,Ja)",
};

async function downloadFile(url, destPath) {
  if (!url || fs.existsSync(destPath)) return false;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "ROM-Vault-Metadata-Engine/1.0" },
    });
    if (!res.ok) return false;
    const arrayBuffer = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    if (buffer.length < 500) return false; // Skip empty or invalid responses
    fs.writeFileSync(destPath, buffer);
    return true;
  } catch (err) {
    return false;
  }
}

async function main() {
  console.log("=== OldsmarChaos Neo Geo Arcade Integration ===");

  // Connect to MariaDB
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || "127.0.0.1",
    port: parseInt(process.env.DB_PORT || "3306"),
    user: process.env.DB_USER || "cfw34683",
    password: process.env.DB_PASSWORD || "G234ihb72916!?",
    database: process.env.DB_NAME || "rom_vault",
  });

  console.log("[1/4] Connected to MariaDB rom_vault successfully.");

  // Link existing 20 artwork files to short zip base names
  console.log("[2/4] Linking existing high-res collection artwork...");
  let linkedCount = 0;
  for (const [shortName, longName] of Object.entries(EXISTING_ARTWORK_MAPPINGS)) {
    for (const [cat, dir] of Object.entries(ART_DIRS)) {
      const ext = cat === "story" ? ".txt" : cat === "video" ? ".mp4" : ".png";
      const targetFile = path.join(dir, `${shortName}${ext}`);
      const sourceFile = path.join(dir, `${longName}${ext}`);
      if (fs.existsSync(sourceFile) && !fs.existsSync(targetFile)) {
        try {
          fs.symlinkSync(path.basename(sourceFile), targetFile);
          linkedCount++;
        } catch {}
      }
    }
  }
  console.log(`[2/4] Created ${linkedCount} symlinks for existing high-res artwork.`);

  // Discover Neo Geo ROMs
  const files = fs
    .readdirSync(NEOGEO_ROMS_DIR)
    .filter((f) => f.endsWith(".zip") && f.toLowerCase() !== "neogeo.zip");

  console.log(`[3/4] Processing ${files.length} Neo Geo ROMs via ArcadeDB...`);

  let resolvedCount = 0;
  let downloadedArtCount = 0;

  for (let i = 0; i < files.length; i++) {
    const zipName = files[i];
    const romBase = zipName.replace(/\.zip$/i, "");
    const gameId = `neogeo__${romBase}`;

    // Query ArcadeDB
    const queryUrl = `https://adb.arcadeitalia.net/service_scraper.php?ajax=query_mame&lang=en&game_name=${encodeURIComponent(romBase)}`;
    let item = null;
    try {
      const res = await fetch(queryUrl, {
        headers: { "User-Agent": "ROM-Vault-Metadata-Engine/1.0" },
      });
      if (res.ok) {
        const data = await res.json();
        item = data?.result?.[0] || null;
      }
    } catch {}

    const cleanTitle = item?.short_title || item?.title || romBase.toUpperCase();
    const year = item?.year ? parseInt(item.year) : null;
    const developer = item?.manufacturer || "SNK";
    const publisher = developer;
    const genre = item?.genre || "Arcade";
    const summary = item?.history || `Neo Geo arcade classic: ${cleanTitle}.`;

    // Insert or update game_metadata in MariaDB
    await connection.execute(
      `INSERT INTO game_metadata (id, system, clean_title, year, developer, publisher, genres, summary)
       VALUES (?, 'neogeo', ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         clean_title = VALUES(clean_title),
         year = VALUES(year),
         developer = VALUES(developer),
         publisher = VALUES(publisher),
         genres = VALUES(genres),
         summary = VALUES(summary)`,
      [gameId, cleanTitle, year, developer, publisher, genre, summary]
    );

    resolvedCount++;

    // Write story file if missing
    const storyPath = path.join(ART_DIRS.story, `${romBase}.txt`);
    if (!fs.existsSync(storyPath) && summary) {
      fs.writeFileSync(storyPath, summary, "utf-8");
    }

    // Download missing artwork
    const frontPath = path.join(ART_DIRS.front, `${romBase}.png`);
    const snapPath = path.join(ART_DIRS.snap, `${romBase}.png`);
    const titlePath = path.join(ART_DIRS.title, `${romBase}.png`);
    const logoPath = path.join(ART_DIRS.logo, `${romBase}.png`);

    if (item?.url_image_flyer && !fs.existsSync(frontPath)) {
      if (await downloadFile(item.url_image_flyer, frontPath)) downloadedArtCount++;
    } else if (item?.url_image_title && !fs.existsSync(frontPath)) {
      // Fallback to title screen if flyer is missing
      if (await downloadFile(item.url_image_title, frontPath)) downloadedArtCount++;
    }

    if (item?.url_image_ingame && !fs.existsSync(snapPath)) {
      if (await downloadFile(item.url_image_ingame, snapPath)) downloadedArtCount++;
    }

    if (item?.url_image_title && !fs.existsSync(titlePath)) {
      if (await downloadFile(item.url_image_title, titlePath)) downloadedArtCount++;
    }

    if (item?.url_image_marquee && !fs.existsSync(logoPath)) {
      if (await downloadFile(item.url_image_marquee, logoPath)) downloadedArtCount++;
    }

    if ((i + 1) % 25 === 0 || i === files.length - 1) {
      console.log(`[3/4] Progress: ${i + 1} / ${files.length} (${cleanTitle})`);
    }
  }

  await connection.end();
  console.log(`[4/4] Completed! Total games mapped: ${resolvedCount}, Artwork downloaded: ${downloadedArtCount}`);
}

main().catch((err) => {
  console.error("Fatal setup error:", err);
  process.exit(1);
});
