import fs from "fs";
import path from "path";
import crypto from "crypto";

const ROOT_DIR = "/var/www/html/roms";
const STORAGE_ROOT = "/mnt/storage/oldsmarchaos.com/roms";

const env = fs.readFileSync(path.join(ROOT_DIR, ".env.local"), "utf8");
const cid = env.match(/TWITCH_CLIENT_ID=(.*)/)[1].trim();
const csec = env.match(/TWITCH_CLIENT_SECRET=(.*)/)[1].trim();

const ROMAN_NUMERALS = {
  ii: "2", iii: "3", iv: "4", v: "5",
  vi: "6", vii: "7", viii: "8", ix: "9",
};

function cleanTitleForSearch(title) {
  return title
    .replace(/\s*\([^)]*\)/g, "")
    .replace(/\s*\[[^\]]*\]/g, "")
    .replace(/[\-–—:]/g, " ")
    .replace(/['"!?._]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

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

    if (cleanNum !== itemNum) {
      continue;
    }

    let score = 0;
    const platformMatch =
      targetPlatform &&
      Array.isArray(item.platforms) &&
      item.platforms.includes(targetPlatform);

    if (platformMatch) score += 50;

    if (itemNorm === cleanNorm) {
      score += 100;
    } else if (
      itemNorm.startsWith(cleanNorm + " ") ||
      cleanNorm.startsWith(itemNorm + " ")
    ) {
      score += 40;
    }

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
  const res = await fetch(
    `https://id.twitch.tv/oauth2/token?client_id=${cid}&client_secret=${csec}&grant_type=client_credentials`,
    { method: "POST" }
  );
  const data = await res.json();
  return data.access_token;
}

async function downloadBinary(url, destPath) {
  const res = await fetch(url);
  if (!res.ok) return null;
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(destPath, buf);
  return buf.length;
}

const IGDB_PLATFORM_MAP = {
  ps2: 8,
  psx: 7,
  gamecube: 21,
  n64: 4,
  snes: 19,
  nes: 18,
  genesis: 29,
  dreamcast: 23,
  saturn: 32,
  gba: 24,
  gbc: 22,
  gb: 33,
};

async function main() {
  console.log("=== Remediating Sequel Artwork Collisions ===");
  const token = await getTwitchToken();

  const systems = ["ps2", "psx", "gamecube", "n64", "snes", "genesis", "dreamcast", "saturn"];

  let fixedCount = 0;

  for (const sys of systems) {
    const artFrontDir = path.join(STORAGE_ROOT, sys, "artwork", "artwork_front");
    if (!fs.existsSync(artFrontDir)) continue;

    const files = fs.readdirSync(artFrontDir).filter(f => f.endsWith(".jpg") || f.endsWith(".png"));
    const hashes = new Map();

    for (const f of files) {
      const buf = fs.readFileSync(path.join(artFrontDir, f));
      const hash = crypto.createHash("md5").update(buf).digest("hex");
      if (!hashes.has(hash)) hashes.set(hash, []);
      hashes.get(hash).push(f);
    }

    for (const [hash, fileList] of hashes.entries()) {
      if (fileList.length < 2) continue;

      // Check if this duplicate group contains games with different sequel numbers
      const baseTitles = fileList.map(f => {
        const extIdx = f.lastIndexOf(".");
        return extIdx > 0 ? f.slice(0, extIdx) : f;
      });

      const sequelNums = new Set(baseTitles.map(b => extractSequelNumber(normalizeForMatch(cleanTitleForSearch(b)))));

      // If all files share the exact same sequel number (e.g. revisions v1.01 vs v1.02, or disc 1 vs disc 2), skip!
      if (sequelNums.size <= 1) {
        continue;
      }

      console.log(`\n[${sys.toUpperCase()}] Found collided sequel group (${fileList.length} files):`);
      for (const f of fileList) {
        console.log(`  - ${f}`);
      }

      // Re-download correct artwork for EACH game in this collided group
      const pId = IGDB_PLATFORM_MAP[sys];
      if (!pId) continue;

      for (const base of baseTitles) {
        const clean = cleanTitleForSearch(base);
        const q = `search "${clean}"; fields name, summary, cover.image_id, screenshots.image_id, platforms, category; where platforms = [${pId}]; limit 15;`;

        const res = await fetch("https://api.igdb.com/v4/games", {
          method: "POST",
          headers: { "Client-ID": cid, Authorization: `Bearer ${token}` },
          body: q
        });

        if (!res.ok) continue;
        const items = await res.json();
        const match = findBestMatch(items, clean, pId);

        if (!match) {
          console.log(`  [!] No confident match for "${base}" (clean: "${clean}")`);
          continue;
        }

        console.log(`  [✓] Resolved "${base}" -> "${match.name}" (id: ${match.id})`);

        // 1. Download 2D Box Art
        if (match.cover?.image_id) {
          const coverUrl = `https://images.igdb.com/igdb/image/upload/t_1080p/${match.cover.image_id}.jpg`;
          const targetCover = path.join(artFrontDir, `${base}.jpg`);
          const bytes = await downloadBinary(coverUrl, targetCover);
          if (bytes) {
            console.log(`      Downloaded 2D Box Art (${bytes} bytes)`);
            fixedCount++;
          }
        }

        // 2. Download In-Game Screenshot
        if (match.screenshots?.length > 0) {
          const shotId = match.screenshots[0].image_id;
          const shotUrl = `https://images.igdb.com/igdb/image/upload/t_720p/${shotId}.jpg`;
          const shotDir = path.join(STORAGE_ROOT, sys, "artwork", "screenshot");
          if (fs.existsSync(shotDir)) {
            const bytes = await downloadBinary(shotUrl, path.join(shotDir, `${base}.jpg`));
            if (bytes) {
              console.log(`      Downloaded Screenshot (${bytes} bytes)`);
            }
          }
        }

        // 3. Write Story
        if (match.summary) {
          const storyDir = path.join(STORAGE_ROOT, sys, "artwork", "story");
          if (fs.existsSync(storyDir)) {
            fs.writeFileSync(path.join(storyDir, `${base}.txt`), match.summary, "utf8");
            console.log(`      Updated Story summary`);
          }
        }
      }
    }
  }

  console.log(`\n==========================================`);
  console.log(`Remediation complete! Total covers updated: ${fixedCount}`);
}

main().catch(console.error);
