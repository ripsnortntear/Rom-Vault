#!/usr/bin/env node
// ==============================================================================
// ROM Vault - IGDB Bulk Keywords & Themes Enrichment Tool
// Batches up to 200 games per API call to enrich all games with searchable tags
// ==============================================================================

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import mysql from "mysql2/promise";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, "..");

// Load .env.local
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

async function getTwitchToken() {
  if (!CLIENT_ID || !CLIENT_SECRET) {
    throw new Error("TWITCH_CLIENT_ID or TWITCH_CLIENT_SECRET missing");
  }
  const url = `https://id.twitch.tv/oauth2/token?client_id=${encodeURIComponent(
    CLIENT_ID
  )}&client_secret=${encodeURIComponent(CLIENT_SECRET)}&grant_type=client_credentials`;
  const res = await fetch(url, { method: "POST" });
  if (!res.ok) throw new Error(`Twitch token error: ${res.status}`);
  const data = await res.json();
  return data.access_token;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  console.log("==================================================================");
  console.log("         ROM Vault - Bulk IGDB Keywords Enrichment Engine         ");
  console.log("==================================================================");

  const token = await getTwitchToken();
  console.log("[✓] Twitch OAuth Token Acquired.");

  const pool = mysql.createPool({
    host: process.env.DB_HOST || "127.0.0.1",
    port: parseInt(process.env.DB_PORT || "3306", 10),
    user: process.env.DB_USER || "cfw34683",
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || "rom_vault",
    waitForConnections: true,
    connectionLimit: 10,
  });

  const [rows] = await pool.query(
    "SELECT DISTINCT igdb_id FROM game_metadata WHERE igdb_id IS NOT NULL AND (keywords IS NULL OR keywords = '')"
  );

  const igdbIds = rows.map((r) => r.igdb_id).filter(Boolean);
  console.log(`[*] Found ${igdbIds.length} games needing keyword enrichment.`);

  if (igdbIds.length === 0) {
    console.log("[✓] All games are already enriched with keywords!");
    await pool.end();
    return;
  }

  const BATCH_SIZE = 250;
  let updatedCount = 0;
  const startTime = Date.now();

  for (let i = 0; i < igdbIds.length; i += BATCH_SIZE) {
    const batch = igdbIds.slice(i, i + BATCH_SIZE);
    const q = `where id = (${batch.join(",")}); fields id, keywords.name, themes.name; limit ${batch.length};`;

    let res = await fetch("https://api.igdb.com/v4/games", {
      method: "POST",
      headers: {
        "Client-ID": CLIENT_ID,
        Authorization: `Bearer ${token}`,
      },
      body: q,
    });

    if (res.status === 429) {
      console.warn("\n[!] Rate limited. Waiting 5s...");
      await sleep(5000);
      res = await fetch("https://api.igdb.com/v4/games", {
        method: "POST",
        headers: {
          "Client-ID": CLIENT_ID,
          Authorization: `Bearer ${token}`,
        },
        body: q,
      });
    }

    if (!res.ok) {
      console.error(`[-] Batch failed (HTTP ${res.status})`);
      continue;
    }

    const games = await res.json();
    for (const g of games) {
      const tags = [
        ...(Array.isArray(g.keywords) ? g.keywords.map((k) => k.name) : []),
        ...(Array.isArray(g.themes) ? g.themes.map((t) => t.name) : []),
      ]
        .map((t) => t.trim())
        .filter(Boolean);

      if (tags.length > 0) {
        const joined = Array.from(new Set(tags)).join(", ");
        await pool.query(
          "UPDATE game_metadata SET keywords = ? WHERE igdb_id = ?",
          [joined, g.id]
        );
        updatedCount++;
      } else {
        // Set empty string to avoid querying again
        await pool.query(
          "UPDATE game_metadata SET keywords = '' WHERE igdb_id = ?",
          [g.id]
        );
      }
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    const processed = Math.min(i + BATCH_SIZE, igdbIds.length);
    console.log(
      `[*] Progress: ${processed}/${igdbIds.length} games checked | ${updatedCount} keywords saved (${elapsed}s)`
    );

    await sleep(260); // Respect 4 req/sec limit
  }

  await pool.end();
  console.log("==================================================================");
  console.log(`[✓] Keyword Enrichment Complete! Enriched ${updatedCount} games.`);
  console.log("==================================================================");
}

main().catch((err) => {
  console.error("[-] Fatal error:", err);
  process.exit(1);
});
