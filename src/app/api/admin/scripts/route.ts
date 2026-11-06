import { NextRequest, NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth/session";
import { adminTaskManager } from "@/lib/admin-tasks";
import { KNOWN_SYSTEMS } from "@/lib/systems";
import path from "path";

const VALID_ASSETS = new Set([
  "all",
  "boxart",
  "boxart-3d",
  "screenshots",
  "titlescreens",
  "disc",
  "cart",
  "logos",
  "stories",
  "videos",
]);

const VALID_SYSTEMS = new Set([
  "all",
  ...Object.keys(KNOWN_SYSTEMS),
  "ps2",
  "psx",
  "gamecube",
  "dreamcast",
  "saturn",
  "n64",
  "snes",
  "nes",
  "gba",
  "gbc",
  "gb",
  "sgb",
  "genesis",
  "sega32x",
  "sms",
  "sgg",
]);

function sanitizeString(str?: string | null): string {
  if (!str) return "";
  // Strip dangerous characters, keep standard titles and queries
  return str.replace(/[^\w\s\-_.,:'"()]/g, "").trim();
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const session = await getCurrentSession();
  if (!session?.user || session.user.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const taskId = searchParams.get("taskId");
  const offset = parseInt(searchParams.get("offset") || "0", 10);

  if (taskId) {
    const task = adminTaskManager.getTask(taskId);
    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }
    const newLogs = task.logs.slice(offset);
    return NextResponse.json({
      ok: true,
      task: {
        ...task,
        logs: newLogs,
        totalLogs: task.logs.length,
      },
    });
  }

  const activeTask = adminTaskManager.getActiveTask();
  const tasks = adminTaskManager.listTasks();

  return NextResponse.json({
    ok: true,
    activeTaskId: activeTask?.id ?? null,
    tasks,
  });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const session = await getCurrentSession();
  if (!session?.user || session.user.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const actionType = body?.type;
  const rootDir = process.cwd();

  let cmd = "node";
  let args: string[] = [];
  let title = "Admin Automation Task";

  switch (actionType) {
    case "metadata": {
      title = "Metadata & Artwork Downloader";
      args = [path.join(rootDir, "scripts", "download-metadata.mjs")];

      const assets: string[] = Array.isArray(body?.assets) ? body.assets : [];
      if (assets.includes("all")) {
        args.push("--all");
      } else {
        for (const a of assets) {
          if (VALID_ASSETS.has(a)) {
            args.push(`--${a}`);
          }
        }
      }

      if (body?.system && body.system !== "all" && VALID_SYSTEMS.has(body.system)) {
        args.push(`--system=${body.system}`);
      }

      const filter = sanitizeString(body?.filter);
      if (filter) {
        args.push(`--filter=${filter}`);
      }

      const limit = parseInt(body?.limit, 10);
      if (!isNaN(limit) && limit > 0) {
        args.push(`--limit=${limit}`);
      }

      const delay = parseInt(body?.delay, 10);
      if (!isNaN(delay) && delay >= 0) {
        args.push(`--delay=${delay}`);
      }

      if (body?.force) args.push("--force");
      if (body?.noCache) args.push("--no-cache");
      if (body?.clearCache) args.push("--clear-cache");
      break;
    }

    case "audit": {
      title = "System Artwork & Media Audit";
      args = [path.join(rootDir, "scripts", "download-metadata.mjs"), "--audit"];

      if (body?.system && body.system !== "all" && VALID_SYSTEMS.has(body.system)) {
        args.push(`--system=${body.system}`);
      }

      if (body?.missingOnly) args.push("--missing-only");
      if (body?.noOrphans) args.push("--no-orphans");

      const output = sanitizeString(body?.output);
      if (output) {
        args.push(`--output=${output}`);
      }
      break;
    }

    case "export_contributions": {
      title = "Export Community Artwork Contributions";
      args = [path.join(rootDir, "scripts", "download-metadata.mjs"), "--export-contributions"];

      if (body?.system && body.system !== "all" && VALID_SYSTEMS.has(body.system)) {
        args.push(`--system=${body.system}`);
      }
      break;
    }

    case "prune_orphans": {
      title = "Orphan Artwork Cleanup Suite";
      args = [path.join(rootDir, "scripts", "download-metadata.mjs"), "--prune-orphans"];

      if (body?.system && body.system !== "all" && VALID_SYSTEMS.has(body.system)) {
        args.push(`--system=${body.system}`);
      }

      const filter = sanitizeString(body?.filter);
      if (filter) {
        args.push(`--filter=${filter}`);
      }

      if (body?.dryRun) {
        args.push("--dry-run");
      }

      if (body?.yes !== false) {
        args.push("-y");
      }
      break;
    }

    case "tabstationtoo": {
      const subAction = body?.action || "verify";
      args = [path.join(rootDir, "scripts", "sync-tabstationtoo.mjs")];

      if (subAction === "verify") {
        title = "TabStationToo: Verify Integration Contracts";
        args.push("--verify");
      } else if (subAction === "check") {
        title = "TabStationToo: Check Upstream Commits";
        args.push("--check");
      } else {
        title = "TabStationToo: Pull & Sync Upstream WebAssembly";
      }
      break;
    }

    case "gambatte": {
      const subAction = body?.action || "verify";
      args = [path.join(rootDir, "scripts", "sync-gambatte.mjs")];

      if (subAction === "verify") {
        title = "Gambatte-GameVault: Verify Integration Contracts";
        args.push("--verify");
      } else if (subAction === "check") {
        title = "Gambatte-GameVault: Check Upstream Commits";
        args.push("--check");
      } else if (subAction === "rebuild") {
        title = "Gambatte-GameVault: Rebuild WebAssembly Core";
        args.push("--rebuild");
      } else {
        title = "Gambatte-GameVault: Pull & Sync Upstream Core";
      }
      break;
    }

    case "sync_repo": {
      title = "Git Repository & Submodule Synchronization";
      cmd = "/var/www/html/roms/sync-repo.sh";
      args = [];

      if (body?.rebuild) {
        args.push("--rebuild");
      }

      const commitMsg = sanitizeString(body?.commitMessage);
      if (commitMsg) {
        args.push(commitMsg);
      }
      break;
    }

    case "library_scan": {
      title = "Fast Filesystem Library Rescan";
      cmd = "bash";
      args = [path.join(rootDir, "scripts", "scan.sh")];
      break;
    }

    default:
      return NextResponse.json({ error: "Unknown action type" }, { status: 400 });
  }

  const result = adminTaskManager.startTask(actionType, title, cmd, args, rootDir);

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 409 });
  }

  return NextResponse.json({
    ok: true,
    taskId: result.taskId,
    title,
  });
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const session = await getCurrentSession();
  if (!session?.user || session.user.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const taskId = searchParams.get("taskId");

  if (!taskId) {
    return NextResponse.json({ error: "Missing taskId" }, { status: 400 });
  }

  const cancelled = adminTaskManager.cancelTask(taskId);
  if (!cancelled) {
    return NextResponse.json(
      { error: "Could not cancel task (either not found or already finished)" },
      { status: 400 }
    );
  }

  return NextResponse.json({ ok: true, message: "Task cancelled successfully." });
}
