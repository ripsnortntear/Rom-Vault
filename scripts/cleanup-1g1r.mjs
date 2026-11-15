#!/usr/bin/env node
// ==============================================================================
// ROM Vault - 1G1R (1 Game 1 ROM) Archive Audit & Cleanup Tool
// Audits or isolates clone ROMs & CHDs to clones_backup/ without data loss.
// ==============================================================================

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import mysql from "mysql2/promise";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, "..");
const STORAGE_ROOT = process.env.STORAGE_ROOT || "/path/to/roms";

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

async function getDbConnection() {
  return await mysql.createConnection({
    host: process.env.DB_HOST || "127.0.0.1",
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "rom_vault",
  });
}

function getMameClonesMap() {
  try {
    const output = execFileSync("/usr/games/mame", ["-listclones"], {
      encoding: "utf8",
      maxBuffer: 50 * 1024 * 1024,
    });
    const lines = output.split("\n");
    const clones = new Map();
    for (let i = 1; i < lines.length; i++) {
      const parts = lines[i].trim().split(/\s+/);
      if (parts.length >= 2) {
        clones.set(parts[0], parts[1]);
      }
    }
    return clones;
  } catch (err) {
    console.warn("[-] Warning: Failed to query /usr/games/mame -listclones:", err.message);
    return new Map();
  }
}

function rankClone(code) {
  let score = 0;
  if (/bootleg|koryu|rb3|m7|hack/i.test(code)) score += 20;
  if (/bl$|b$|ba$/i.test(code)) score += 10;
  if (/u$|ub$|e$|ue$/i.test(code)) score -= 5;
  return score;
}

async function auditSystem(system, clonesMap) {
  const romsDir = path.join(STORAGE_ROOT, system, "roms");
  const backupDir = path.join(STORAGE_ROOT, system, "clones_backup");

  if (!fs.existsSync(romsDir)) {
    return null;
  }

  const files = fs.readdirSync(romsDir).filter((f) => f.endsWith(".zip")).map((f) => f.slice(0, -4));
  const groups = new Map();

  for (const name of files) {
    const parent = clonesMap.get(name) || name;
    if (!groups.has(parent)) {
      groups.set(parent, []);
    }
    groups.get(parent).push(name);
  }

  const keepNames = [];
  const moveNames = [];

  for (const [parent, roms] of groups.entries()) {
    if (roms.length === 1) {
      keepNames.push(roms[0]);
    } else {
      let best = parent;
      if (!roms.includes(parent)) {
        best = roms.slice().sort((a, b) => rankClone(a) - rankClone(b))[0];
      }
      keepNames.push(best);
      for (const r of roms) {
        if (r !== best) {
          moveNames.push(r);
        }
      }
    }
  }

  let backedUpCount = 0;
  if (fs.existsSync(backupDir)) {
    backedUpCount = fs.readdirSync(backupDir).filter((f) => f.endsWith(".zip")).length;
  }

  return {
    system,
    romsDir,
    backupDir,
    totalActive: files.length,
    uniqueKept: keepNames.length,
    clonesFound: moveNames.length,
    backedUpCount,
    keepNames,
    moveNames,
  };
}

async function cleanSystem(audit, db) {
  console.log(`\nProcessing ${audit.system.toUpperCase()}...`);
  fs.mkdirSync(audit.backupDir, { recursive: true });

  let movedFiles = 0;
  let movedChds = 0;

  for (const r of audit.moveNames) {
    const zipName = `${r}.zip`;
    const srcZip = path.join(audit.romsDir, zipName);
    const dstZip = path.join(audit.backupDir, zipName);

    if (fs.existsSync(srcZip)) {
      fs.renameSync(srcZip, dstZip);
      movedFiles++;
    }

    const srcChd = path.join(audit.romsDir, r);
    const dstChd = path.join(audit.backupDir, r);
    if (fs.existsSync(srcChd) && fs.statSync(srcChd).isDirectory()) {
      fs.renameSync(srcChd, dstChd);
      movedChds++;
    }
  }

  console.log(`[✓] Isolated ${movedFiles} .zip files and ${movedChds} CHD directories to clones_backup/`);

  // Prune gamelist.xml
  const gamelistPath = path.join(audit.romsDir, "gamelist.xml");
  if (fs.existsSync(gamelistPath)) {
    const bakPath = path.join(audit.romsDir, "gamelist.xml.bak.pre_1g1r");
    if (!fs.existsSync(bakPath)) {
      fs.copyFileSync(gamelistPath, bakPath);
      console.log(`[✓] Created backup: ${bakPath}`);
    }

    let xml = fs.readFileSync(gamelistPath, "utf8");
    const keepPaths = new Set(audit.keepNames.map((k) => `./${k}.zip`));

    // Simple regex filter for <game>...</game>
    xml = xml.replace(/<game>[\s\S]*?<\/game>\n?/g, (match) => {
      const pathMatch = match.match(/<path>(.*?)<\/path>/);
      if (pathMatch && !keepPaths.has(pathMatch[1])) {
        return "";
      }
      return match;
    });

    fs.writeFileSync(gamelistPath, xml, "utf8");
    console.log(`[✓] Pruned clone entries from gamelist.xml`);
  }

  // Database cleanup
  if (db && audit.moveNames.length > 0) {
    const chunkSize = 200;
    let deletedCount = 0;
    for (let i = 0; i < audit.moveNames.length; i += chunkSize) {
      const chunk = audit.moveNames.slice(i, i + chunkSize);
      const ids = chunk.map((m) => `'${audit.system}__${m}'`).join(",");
      const [res] = await db.query(`DELETE FROM game_metadata WHERE id IN (${ids})`);
      deletedCount += (res && res.affectedRows) || 0;
    }
    console.log(`[✓] Cleaned ${deletedCount} clone entries from MariaDB game_metadata.`);
  }
}

async function restoreSystem(system) {
  const romsDir = path.join(STORAGE_ROOT, system, "roms");
  const backupDir = path.join(STORAGE_ROOT, system, "clones_backup");

  if (!fs.existsSync(backupDir)) {
    console.log(`No clones_backup found for ${system}.`);
    return;
  }

  const files = fs.readdirSync(backupDir);
  let restored = 0;
  for (const f of files) {
    const src = path.join(backupDir, f);
    const dst = path.join(romsDir, f);
    fs.renameSync(src, dst);
    restored++;
  }
  console.log(`[✓] Restored ${restored} files/directories from ${backupDir} to ${romsDir}.`);
}

async function main() {
  const args = process.argv.slice(2);
  const isAudit = args.includes("--audit");
  const isRestore = args.includes("--restore");
  const isClean = args.includes("--clean") || (!isAudit && !isRestore);

  const targetSystemArg = args.find((a) => a.startsWith("--system="));
  const targetSystems = targetSystemArg
    ? [targetSystemArg.split("=")[1].toLowerCase()]
    : ["mame", "neogeo"];

  console.log("==========================================");
  console.log(" ROM Vault - 1G1R Archive Manager");
  console.log("==========================================");

  if (isRestore) {
    for (const sys of targetSystems) {
      await restoreSystem(sys);
    }
    console.log("\n[✓] Restore completed.");
    return;
  }

  console.log("[*] Querying MAME clone database...");
  const clonesMap = getMameClonesMap();
  console.log(`[✓] Loaded ${clonesMap.size} clone definitions.`);

  let db = null;
  if (isClean) {
    try {
      db = await getDbConnection();
      console.log("[✓] Connected to MariaDB (rom_vault).");
    } catch (e) {
      console.warn("[-] Warning: Database connection failed. Proceeding with filesystem only:", e.message);
    }
  }

  for (const sys of targetSystems) {
    const audit = await auditSystem(sys, clonesMap);
    if (!audit) {
      console.log(`[-] System ${sys} has no roms directory at ${STORAGE_ROOT}/${sys}/roms.`);
      continue;
    }

    console.log(`\n--- ${sys.toUpperCase()} Status ---`);
    console.log(`Active ROMs        : ${audit.totalActive}`);
    console.log(`Unique 1G1R Games  : ${audit.uniqueKept}`);
    console.log(`Active Clones      : ${audit.clonesFound}`);
    console.log(`Backed-up Clones   : ${audit.backedUpCount}`);

    if (isClean && audit.clonesFound > 0) {
      await cleanSystem(audit, db);
    } else if (isClean) {
      console.log(`[✓] ${sys.toUpperCase()} is already fully cleaned to 1G1R standards.`);
    }
  }

  if (db) {
    await db.end();
  }

  console.log("\n==========================================");
  console.log(" [Done] 1G1R operation complete.");
  console.log("==========================================");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
