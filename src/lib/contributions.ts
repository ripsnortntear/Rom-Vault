import "server-only";

import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { query, execute } from "@/lib/db";
import { getStorageRoot, getArtworkDirectory, normalizeSystem } from "@/lib/paths";
import { scanGameLibrary } from "@/lib/scanner";
import { logAdminAudit } from "@/lib/community";

const execFileAsync = promisify(execFile);

export type ContributionCategory =
  | "artwork_front"
  | "artwork_3d"
  | "screenshot"
  | "screentitle"
  | "logo"
  | "medium"
  | "video"
  | "story";

export type ContributionStatus = "pending" | "approved" | "rejected";

export interface AssetContributionItem {
  id: number;
  userId: string;
  username: string;
  displayName: string | null;
  system: string;
  baseName: string;
  gameTitle: string;
  category: ContributionCategory;
  stagedFilename: string | null;
  fileExt: string;
  fileSize: number;
  storyText: string | null;
  sourceUrl: string | null;
  points: number;
  status: ContributionStatus;
  reviewedBy: string | null;
  reviewerUsername: string | null;
  reviewNote: string | null;
  createdAt: string;
  reviewedAt: string | null;
}

export interface ContributorLeaderboardEntry {
  rank: number;
  userId: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  totalPoints: number;
  approvedCount: number;
  pendingCount: number;
  imagesCount: number;
  videosCount: number;
  storiesCount: number;
  lastContributionAt: string | null;
}

export interface PendingAssetSlot {
  system: string;
  baseName: string;
  category: ContributionCategory;
  username: string;
  createdAt: string;
}

const DISC_SYSTEMS = new Set(["psx", "ps2", "saturn", "dreamcast", "gamecube"]);

const ALLOWED_YOUTUBE_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "youtu.be",
  "www.youtu.be",
  "youtube-nocookie.com",
  "www.youtube-nocookie.com",
]);

/**
 * Strictly validate and extract an 11-character YouTube video ID from a URL.
 * Returns null for any non-YouTube domain or invalid video ID.
 */
export function extractYoutubeVideoId(rawUrl: string): string | null {
  try {
    const trimmed = rawUrl.trim();
    if (!trimmed) return null;
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return null;
    }
    const host = parsed.hostname.toLowerCase();
    if (!ALLOWED_YOUTUBE_HOSTS.has(host)) {
      return null;
    }

    let candidateId: string | null = null;
    if (host === "youtu.be" || host === "www.youtu.be") {
      candidateId = parsed.pathname.split("/").filter(Boolean)[0] || null;
    } else if (parsed.pathname === "/watch") {
      candidateId = parsed.searchParams.get("v");
    } else if (
      parsed.pathname.startsWith("/shorts/") ||
      parsed.pathname.startsWith("/embed/") ||
      parsed.pathname.startsWith("/v/") ||
      parsed.pathname.startsWith("/live/")
    ) {
      candidateId = parsed.pathname.split("/").filter(Boolean)[1] || null;
    }

    if (candidateId && /^[a-zA-Z0-9_-]{11}$/.test(candidateId)) {
      return candidateId;
    }
    return null;
  } catch {
    return null;
  }
}

let tableEnsured = false;

export async function ensureContributionsTable(): Promise<void> {
  if (tableEnsured) return;
  try {
    await execute(`
      CREATE TABLE IF NOT EXISTS asset_contributions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id VARCHAR(64) NOT NULL,
        username VARCHAR(64) NOT NULL,
        display_name VARCHAR(100) NULL,
        system VARCHAR(32) NOT NULL,
        base_name VARCHAR(255) NOT NULL,
        game_title VARCHAR(255) NOT NULL,
        category VARCHAR(32) NOT NULL,
        staged_filename VARCHAR(255) NULL,
        file_ext VARCHAR(16) NOT NULL,
        file_size INT NOT NULL DEFAULT 0,
        story_text TEXT NULL,
        source_url VARCHAR(1024) NULL,
        points INT NOT NULL DEFAULT 10,
        status ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending',
        reviewed_by VARCHAR(64) NULL,
        reviewer_username VARCHAR(64) NULL,
        review_note VARCHAR(255) NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        reviewed_at TIMESTAMP NULL,
        INDEX idx_status_created (status, created_at DESC),
        INDEX idx_user_status (user_id, status),
        INDEX idx_game_cat (system, base_name, category, status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    await execute(
      "ALTER TABLE asset_contributions ADD COLUMN IF NOT EXISTS source_url VARCHAR(1024) NULL AFTER story_text"
    ).catch(() => {});
    tableEnsured = true;
  } catch (err) {
    console.warn("[contributions] Failed ensuring asset_contributions table:", err);
  }
}

export function getPointsForCategory(category: ContributionCategory): number {
  switch (category) {
    case "video":
      return 25;
    case "artwork_front":
    case "artwork_3d":
    case "logo":
      return 15;
    case "screenshot":
    case "screentitle":
    case "medium":
    case "story":
    default:
      return 10;
  }
}

export function getContributionsStagingDir(): string {
  return path.join(/*turbopackIgnore: true*/ getStorageRoot(), ".contributions", "pending");
}

function resolveTargetDirectory(system: string, category: ContributionCategory): string {
  const artRoot = getArtworkDirectory(system);
  const candidates: Record<ContributionCategory, string[]> = {
    artwork_front: ["artwork_front", "box2d"],
    artwork_3d: ["artwork_3d", "box3d", "thumbnails"],
    screenshot: ["screenshot", "images"],
    screentitle: ["screentitle", "titles"],
    logo: ["logo", "marquee"],
    medium: DISC_SYSTEMS.has(system)
      ? ["medium_disc", "medium_front"]
      : ["medium_front", "cartridges"],
    video: ["video", "videos"],
    story: ["story"],
  };

  const dirs = candidates[category] || ["artwork_front"];
  for (const sub of dirs) {
    const full = path.join(/*turbopackIgnore: true*/ artRoot, sub);
    if (fs.existsSync(full)) {
      return full;
    }
  }

  const primary = path.join(/*turbopackIgnore: true*/ artRoot, dirs[0]);
  fs.mkdirSync(primary, { recursive: true });
  return primary;
}

function mapRow(r: any): AssetContributionItem {
  return {
    id: Number(r.id),
    userId: String(r.user_id),
    username: String(r.username),
    displayName: r.display_name ? String(r.display_name) : null,
    system: String(r.system),
    baseName: String(r.base_name),
    gameTitle: String(r.game_title || r.base_name),
    category: r.category as ContributionCategory,
    stagedFilename: r.staged_filename ? String(r.staged_filename) : null,
    fileExt: String(r.file_ext || ""),
    fileSize: Number(r.file_size || 0),
    storyText: r.story_text ? String(r.story_text) : null,
    sourceUrl: r.source_url ? String(r.source_url) : null,
    points: Number(r.points || getPointsForCategory(r.category as ContributionCategory)),
    status: (r.status || "pending") as ContributionStatus,
    reviewedBy: r.reviewed_by ? String(r.reviewed_by) : null,
    reviewerUsername: r.reviewer_username ? String(r.reviewer_username) : null,
    reviewNote: r.review_note ? String(r.review_note) : null,
    createdAt: r.created_at ? new Date(r.created_at).toISOString() : new Date().toISOString(),
    reviewedAt: r.reviewed_at ? new Date(r.reviewed_at).toISOString() : null,
  };
}

/**
 * Download a 45-second 480p MP4 preview clip from a verified YouTube URL into the staging path.
 */
export async function downloadYoutubePreviewToStaging(
  submissionId: number,
  youtubeUrl: string,
  stagedPath: string
): Promise<boolean> {
  try {
    const ytDlpBin = fs.existsSync("/usr/local/bin/yt-dlp")
      ? "/usr/local/bin/yt-dlp"
      : "yt-dlp";

    await fsp.mkdir(path.dirname(stagedPath), { recursive: true });

    await execFileAsync(
      ytDlpBin,
      [
        "--no-playlist",
        "--no-warnings",
        "--max-filesize",
        "65M",
        "--download-sections",
        "*0:00-0:45",
        "-f",
        "bestvideo[height<=480][ext=mp4]+bestaudio[ext=m4a]/best[height<=480][ext=mp4]/best[height<=480]",
        "--merge-output-format",
        "mp4",
        "-o",
        stagedPath,
        youtubeUrl,
      ],
      { timeout: 120000 }
    );

    if (fs.existsSync(stagedPath)) {
      const stat = await fsp.stat(stagedPath);
      if (stat.size > 0) {
        await execute(
          "UPDATE asset_contributions SET file_size = ? WHERE id = ?",
          [stat.size, submissionId]
        ).catch(() => {});
        return true;
      }
    }
    return false;
  } catch (err) {
    console.warn("[contributions] yt-dlp background preview extraction warning:", err);
    return false;
  }
}

/**
 * Create a new staged asset submission awaiting admin verification.
 */
export async function submitAssetContribution(params: {
  userId: string;
  username: string;
  displayName?: string | null;
  system: string;
  baseName: string;
  gameTitle: string;
  category: ContributionCategory;
  fileExt: string;
  buffer?: Buffer;
  storyText?: string;
  sourceUrl?: string | null;
}): Promise<AssetContributionItem> {
  await ensureContributionsTable();

  const normSys = normalizeSystem(params.system);
  const points = getPointsForCategory(params.category);
  let stagedFilename: string | null = null;
  let fileSize = 0;

  if (params.category === "story") {
    fileSize = Buffer.byteLength(params.storyText || "", "utf-8");
  } else if (params.buffer) {
    const stagingDir = getContributionsStagingDir();
    await fsp.mkdir(stagingDir, { recursive: true });
    const token = crypto.randomBytes(12).toString("hex");
    const safeExt = params.fileExt.startsWith(".") ? params.fileExt : `.${params.fileExt}`;
    stagedFilename = `${normSys}_${Date.now()}_${token}${safeExt}`;
    const stagedPath = path.join(/*turbopackIgnore: true*/ stagingDir, stagedFilename);
    await fsp.writeFile(stagedPath, params.buffer);
    fileSize = params.buffer.length;
  } else if (params.category === "video" && params.sourceUrl) {
    const stagingDir = getContributionsStagingDir();
    await fsp.mkdir(stagingDir, { recursive: true });
    const token = crypto.randomBytes(12).toString("hex");
    stagedFilename = `${normSys}_${Date.now()}_${token}.mp4`;
  }

  const res = await execute(
    `INSERT INTO asset_contributions
      (user_id, username, display_name, system, base_name, game_title, category, staged_filename, file_ext, file_size, story_text, source_url, points, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
    [
      params.userId,
      params.username,
      params.displayName || null,
      normSys,
      params.baseName,
      params.gameTitle || params.baseName,
      params.category,
      stagedFilename,
      params.fileExt,
      fileSize,
      params.storyText || null,
      params.sourceUrl || null,
      points,
    ]
  );

  // If this is a YouTube video link submission, kick off non-blocking background extraction into staging
  if (params.category === "video" && params.sourceUrl && stagedFilename) {
    const stagingDir = getContributionsStagingDir();
    const stagedPath = path.join(/*turbopackIgnore: true*/ stagingDir, stagedFilename);
    void downloadYoutubePreviewToStaging(res.insertId, params.sourceUrl, stagedPath);
  }

  const inserted = await getContributionById(res.insertId);
  if (!inserted) {
    throw new Error("Failed to retrieve newly created asset contribution.");
  }
  return inserted;
}

export async function getContributionById(id: number): Promise<AssetContributionItem | null> {
  await ensureContributionsTable();
  const rows = await query<any>(
    "SELECT * FROM asset_contributions WHERE id = ? LIMIT 1",
    [id]
  );
  if (!rows[0]) return null;
  return mapRow(rows[0]);
}

/**
 * Fetch the Community Asset Contributors Leaderboard.
 */
export async function getContributionLeaderboard(
  limit = 25
): Promise<ContributorLeaderboardEntry[]> {
  try {
    await ensureContributionsTable();
    const rows = await query<any>(
      `SELECT
          c.user_id,
          MAX(c.username) AS username,
          MAX(c.display_name) AS display_name,
          SUM(CASE WHEN c.status = 'approved' THEN c.points ELSE 0 END) AS total_points,
          SUM(CASE WHEN c.status = 'approved' THEN 1 ELSE 0 END) AS approved_count,
          SUM(CASE WHEN c.status = 'pending' THEN 1 ELSE 0 END) AS pending_count,
          SUM(CASE WHEN c.status = 'approved' AND c.category IN ('artwork_front','artwork_3d','screenshot','screentitle','logo','medium') THEN 1 ELSE 0 END) AS images_count,
          SUM(CASE WHEN c.status = 'approved' AND c.category = 'video' THEN 1 ELSE 0 END) AS videos_count,
          SUM(CASE WHEN c.status = 'approved' AND c.category = 'story' THEN 1 ELSE 0 END) AS stories_count,
          MAX(c.created_at) AS last_contribution_at
       FROM asset_contributions c
       WHERE c.status IN ('approved', 'pending')
       GROUP BY c.user_id
       ORDER BY total_points DESC, approved_count DESC, pending_count DESC, last_contribution_at ASC
       LIMIT ?`,
      [limit]
    );

    return rows.map((r, index) => ({
      rank: index + 1,
      userId: String(r.user_id),
      username: String(r.username || "Contributor"),
      displayName: r.display_name ? String(r.display_name) : null,
      avatarUrl: r.avatar_url ? String(r.avatar_url) : null,
      totalPoints: Number(r.total_points || 0),
      approvedCount: Number(r.approved_count || 0),
      pendingCount: Number(r.pending_count || 0),
      imagesCount: Number(r.images_count || 0),
      videosCount: Number(r.videos_count || 0),
      storiesCount: Number(r.stories_count || 0),
      lastContributionAt: r.last_contribution_at
        ? new Date(r.last_contribution_at).toISOString()
        : null,
    }));
  } catch (err) {
    console.warn("[contributions] Failed fetching leaderboard:", err);
    return [];
  }
}

/**
 * Fetch all currently pending asset slots so the UI can show "Pending Review" badges.
 */
export async function getPendingAssetSlots(): Promise<PendingAssetSlot[]> {
  try {
    await ensureContributionsTable();
    const rows = await query<any>(
      `SELECT system, base_name, category, username, created_at
       FROM asset_contributions
       WHERE status = 'pending'
       ORDER BY created_at DESC`
    );
    return rows.map((r) => ({
      system: String(r.system),
      baseName: String(r.base_name),
      category: r.category as ContributionCategory,
      username: String(r.username),
      createdAt: r.created_at ? new Date(r.created_at).toISOString() : new Date().toISOString(),
    }));
  } catch {
    return [];
  }
}

/**
 * Fetch recent contributions for a specific user.
 */
export async function getUserRecentContributions(
  userId: string,
  limit = 20
): Promise<AssetContributionItem[]> {
  try {
    await ensureContributionsTable();
    const rows = await query<any>(
      `SELECT * FROM asset_contributions
       WHERE user_id = ?
       ORDER BY created_at DESC
       LIMIT ?`,
      [userId, limit]
    );
    return rows.map(mapRow);
  } catch {
    return [];
  }
}

/**
 * Fetch contributions for the Admin Moderation queue.
 */
export async function getModerationContributions(
  statusFilter: "pending" | "approved" | "rejected" | "all" = "all",
  limit = 150
): Promise<AssetContributionItem[]> {
  try {
    await ensureContributionsTable();
    if (statusFilter === "all") {
      const rows = await query<any>(
        `SELECT * FROM asset_contributions
         ORDER BY FIELD(status, 'pending', 'approved', 'rejected'), created_at DESC
         LIMIT ?`,
        [limit]
      );
      return rows.map(mapRow);
    } else {
      const rows = await query<any>(
        `SELECT * FROM asset_contributions
         WHERE status = ?
         ORDER BY created_at DESC
         LIMIT ?`,
        [statusFilter, limit]
      );
      return rows.map(mapRow);
    }
  } catch (err) {
    console.warn("[contributions] Failed fetching moderation contributions:", err);
    return [];
  }
}

export async function getPendingContributionsCount(): Promise<number> {
  try {
    await ensureContributionsTable();
    const rows = await query<{ count: number }>(
      "SELECT COUNT(*) AS count FROM asset_contributions WHERE status = 'pending'"
    );
    return Number(rows[0]?.count || 0);
  } catch {
    return 0;
  }
}

/**
 * Admin Action: Approve a pending contribution, promoting its staged file into the live Vault artwork directory.
 */
export async function approveAssetContribution(
  submissionId: number,
  adminId: string,
  adminUsername: string
): Promise<{ ok: boolean; error?: string; item?: AssetContributionItem }> {
  await ensureContributionsTable();
  const item = await getContributionById(submissionId);
  if (!item) {
    return { ok: false, error: "Contribution submission not found." };
  }
  if (item.status === "approved") {
    return { ok: false, error: "This submission has already been approved." };
  }

  const targetDir = resolveTargetDirectory(item.system, item.category);

  if (item.category === "story") {
    const text = (item.storyText || "").trim();
    if (!text) {
      return { ok: false, error: "Story text is empty." };
    }
    const targetFile = path.join(/*turbopackIgnore: true*/ targetDir, `${item.baseName}.txt`);
    await fsp.writeFile(targetFile, `${text}\n`, "utf-8");

    try {
      const gameId = `${item.system}__${encodeURIComponent(item.baseName)}`;
      await execute(
        `INSERT INTO game_metadata (game_id, system, clean_title, summary, is_fetched)
         VALUES (?, ?, ?, ?, 1)
         ON DUPLICATE KEY UPDATE summary = VALUES(summary), is_fetched = 1`,
        [gameId, item.system, item.gameTitle || item.baseName, text]
      );
    } catch (err) {
      console.warn("[contributions] Non-fatal DB metadata update warning:", err);
    }
  } else {
    if (!item.stagedFilename) {
      return { ok: false, error: "Staged file reference is missing for this submission." };
    }
    const stagingDir = getContributionsStagingDir();
    const stagedPath = path.join(/*turbopackIgnore: true*/ stagingDir, path.basename(item.stagedFilename));

    // If this is a YouTube video and the background download hasn't finished yet, complete it now
    if (!fs.existsSync(stagedPath) && item.category === "video" && item.sourceUrl) {
      const downloaded = await downloadYoutubePreviewToStaging(
        item.id,
        item.sourceUrl,
        stagedPath
      );
      if (!downloaded || !fs.existsSync(stagedPath)) {
        return {
          ok: false,
          error: "Failed to download MP4 video clip from YouTube link.",
        };
      }
    }

    if (!fs.existsSync(stagedPath)) {
      return { ok: false, error: "Staged file no longer exists on disk." };
    }

    const safeExt = item.fileExt.startsWith(".") ? item.fileExt : `.${item.fileExt}`;
    const targetFile = path.join(/*turbopackIgnore: true*/ targetDir, `${item.baseName}${safeExt}`);

    // Remove conflicting extensions for the same baseName in targetDir so the newly approved asset takes precedence
    for (const oldExt of [".png", ".jpg", ".jpeg", ".webp", ".mp4"]) {
      if (oldExt !== safeExt) {
        const oldPath = path.join(/*turbopackIgnore: true*/ targetDir, `${item.baseName}${oldExt}`);
        if (fs.existsSync(oldPath)) {
          try {
            await fsp.unlink(oldPath);
          } catch {}
        }
      }
    }

    await fsp.copyFile(stagedPath, targetFile);
    try {
      await fsp.unlink(stagedPath);
    } catch {}
  }

  await execute(
    `UPDATE asset_contributions
     SET status = 'approved', reviewed_by = ?, reviewer_username = ?, reviewed_at = NOW()
     WHERE id = ?`,
    [adminId, adminUsername, submissionId]
  );

  await logAdminAudit(adminId, "APPROVE_ASSET", "contribution", String(submissionId), {
    system: item.system,
    baseName: item.baseName,
    category: item.category,
    contributor: item.username,
    sourceUrl: item.sourceUrl || null,
    points: item.points,
  });

  await scanGameLibrary(true).catch(() => {});

  const updated = await getContributionById(submissionId);
  return { ok: true, item: updated || item };
}

/**
 * Admin Action: Reject a pending contribution and delete its staged file from disk.
 */
export async function rejectAssetContribution(
  submissionId: number,
  adminId: string,
  adminUsername: string,
  reviewNote?: string
): Promise<{ ok: boolean; error?: string; item?: AssetContributionItem }> {
  await ensureContributionsTable();
  const item = await getContributionById(submissionId);
  if (!item) {
    return { ok: false, error: "Contribution submission not found." };
  }

  if (item.stagedFilename) {
    const stagingDir = getContributionsStagingDir();
    const stagedPath = path.join(/*turbopackIgnore: true*/ stagingDir, path.basename(item.stagedFilename));
    if (fs.existsSync(stagedPath)) {
      try {
        await fsp.unlink(stagedPath);
      } catch {}
    }
  }

  await execute(
    `UPDATE asset_contributions
     SET status = 'rejected', reviewed_by = ?, reviewer_username = ?, review_note = ?, reviewed_at = NOW()
     WHERE id = ?`,
    [adminId, adminUsername, reviewNote?.trim() || null, submissionId]
  );

  await logAdminAudit(adminId, "REJECT_ASSET", "contribution", String(submissionId), {
    system: item.system,
    baseName: item.baseName,
    category: item.category,
    contributor: item.username,
    reviewNote: reviewNote || null,
  });

  const updated = await getContributionById(submissionId);
  return { ok: true, item: updated || item };
}
