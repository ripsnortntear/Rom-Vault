import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import { findPs2WebBuild, toPs2Slug } from "./ps2Recomp";

const LOGS_DIR = "/mnt/storage/roms/ps2/web_builds/.logs";

function ensureLogsDir() {
  if (!fs.existsSync(/*turbopackIgnore: true*/ LOGS_DIR)) {
    fs.mkdirSync(/*turbopackIgnore: true*/ LOGS_DIR, { recursive: true });
    try {
      fs.chmodSync(/*turbopackIgnore: true*/ LOGS_DIR, 0o777);
    } catch {}
  }
}

export function safeDecode(val: string): string {
  let decoded = val;
  try {
    decoded = decodeURIComponent(val);
    if (decoded.includes("%")) {
      decoded = decodeURIComponent(decoded);
    }
  } catch {}
  return decoded;
}

export function getJobSlug(gameIdOrName: string): string {
  const decoded = safeDecode(gameIdOrName);
  const clean = decoded.includes("__")
    ? decoded.split("__")[1] || decoded
    : decoded;
  return toPs2Slug(clean.replace(/\.[a-z0-9]+$/i, ""));
}

export function getJobLogPath(slug: string): string {
  return path.join(LOGS_DIR, `${slug}.log`);
}

export function getJobPidPath(slug: string): string {
  return path.join(LOGS_DIR, `${slug}.pid`);
}

export function getRecompileStatus(gameIdOrName: string): {
  status: "idle" | "running" | "completed" | "failed";
  playUrl: string | null;
  log?: string;
} {
  const slug = getJobSlug(gameIdOrName);
  const build = findPs2WebBuild(gameIdOrName);
  if (build && build.hasHtml) {
    return {
      status: "completed",
      playUrl: `/roms/api/ps2-play/${slug}/index.html`,
    };
  }

  const logPath = getJobLogPath(slug);
  const pidPath = getJobPidPath(slug);

  // Check if PID file exists AND process is actually running in the OS
  if (fs.existsSync(/*turbopackIgnore: true*/ pidPath)) {
    try {
      const pidStr = fs.readFileSync(/*turbopackIgnore: true*/ pidPath, "utf-8").trim();
      const pid = parseInt(pidStr, 10);
      if (!isNaN(pid) && pid > 0) {
        process.kill(pid, 0); // Throws exception if process does not exist

        let log = "";
        if (fs.existsSync(/*turbopackIgnore: true*/ logPath)) {
          try {
            const full = fs.readFileSync(/*turbopackIgnore: true*/ logPath, "utf-8");
            const lines = full.trim().split("\n");
            log = lines.slice(-12).join("\n");
          } catch {}
        }

        return {
          status: "running",
          playUrl: null,
          log,
        };
      }
    } catch {
      // Process is dead, remove stale PID file
      try {
        fs.unlinkSync(/*turbopackIgnore: true*/ pidPath);
      } catch {}
    }
  }

  // If not running, check log file for final outcome
  if (fs.existsSync(/*turbopackIgnore: true*/ logPath)) {
    try {
      const full = fs.readFileSync(/*turbopackIgnore: true*/ logPath, "utf-8");
      if (full.includes("SUCCESS: Recompilation complete!")) {
        return {
          status: "completed",
          playUrl: `/roms/api/ps2-play/${slug}/index.html`,
        };
      }
      if (full.includes("Error:") || full.includes("failed")) {
        return {
          status: "failed",
          playUrl: null,
          log: full.trim().split("\n").slice(-8).join("\n"),
        };
      }
    } catch {}
  }

  return {
    status: "idle",
    playUrl: null,
  };
}

export function startRecompileJob(gameIdOrName: string): {
  started: boolean;
  message?: string;
} {
  const status = getRecompileStatus(gameIdOrName);
  if (status.status === "completed") {
    return { started: false, message: "Game is already recompiled." };
  }
  if (status.status === "running") {
    return { started: true, message: "Recompilation is already in progress." };
  }

  ensureLogsDir();
  const slug = getJobSlug(gameIdOrName);
  const logPath = getJobLogPath(slug);
  const pidPath = getJobPidPath(slug);

  const cleanName = safeDecode(
    gameIdOrName.includes("__")
      ? gameIdOrName.split("__")[1] || gameIdOrName
      : gameIdOrName
  );

  const scriptPath = path.resolve(process.cwd(), "scripts/recompile-ps2.sh");

  // Open log file synchronously so fd is immediately valid
  const outFd = fs.openSync(logPath, "w");

  try {
    const child = spawn("bash", [scriptPath, cleanName], {
      detached: true,
      stdio: ["ignore", outFd, outFd],
      cwd: process.cwd(),
      env: {
        ...process.env,
        PATH: `${process.env.PATH}:/usr/bin:/usr/local/bin`,
      },
    });

    // Close parent's descriptor handle; the spawned child holds its own duplicate handle
    fs.closeSync(outFd);
    child.unref();

    if (child.pid) {
      try {
        fs.writeFileSync(/*turbopackIgnore: true*/ pidPath, child.pid.toString());
      } catch {}

      child.on("close", () => {
        try {
          if (fs.existsSync(/*turbopackIgnore: true*/ pidPath)) {
            fs.unlinkSync(/*turbopackIgnore: true*/ pidPath);
          }
        } catch {}
      });

      child.on("error", () => {
        try {
          if (fs.existsSync(/*turbopackIgnore: true*/ pidPath)) {
            fs.unlinkSync(/*turbopackIgnore: true*/ pidPath);
          }
        } catch {}
      });

      return { started: true };
    }
  } catch (err) {
    try {
      fs.closeSync(outFd);
    } catch {}
    console.error("[ps2Jobs] Failed to spawn child process:", err);
    return { started: false, message: String(err) };
  }

  return { started: false, message: "Failed to spawn recompile process" };
}
