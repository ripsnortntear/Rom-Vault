import "server-only";

import { spawn, ChildProcess } from "child_process";
import path from "path";

export interface AdminTask {
  id: string;
  type: string;
  title: string;
  command: string;
  args: string[];
  status: "running" | "completed" | "failed" | "cancelled";
  exitCode: number | null;
  startedAt: string;
  completedAt: string | null;
  logs: string[];
}

interface InternalTaskState extends AdminTask {
  process?: ChildProcess;
}

class AdminTaskManager {
  private tasks = new Map<string, InternalTaskState>();
  private activeTaskId: string | null = null;
  private readonly MAX_LOG_LINES = 2500;
  private readonly MAX_HISTORY = 25;

  public getActiveTask(): AdminTask | null {
    if (!this.activeTaskId) return null;
    return this.getTask(this.activeTaskId);
  }

  public getTask(id: string): AdminTask | null {
    const task = this.tasks.get(id);
    if (!task) return null;
    const { process: _, ...clientTask } = task;
    return clientTask;
  }

  public listTasks(): AdminTask[] {
    const list = Array.from(this.tasks.values()).map(({ process: _, ...t }) => t);
    return list.sort(
      (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
    );
  }

  public cancelTask(id: string): boolean {
    const task = this.tasks.get(id);
    if (!task || task.status !== "running" || !task.process) {
      return false;
    }

    try {
      task.process.kill("SIGTERM");
      setTimeout(() => {
        if (task.status === "running" && task.process) {
          try {
            task.process.kill("SIGKILL");
          } catch {}
        }
      }, 3000);

      task.status = "cancelled";
      task.completedAt = new Date().toISOString();
      task.logs.push(`\n[!] Task cancelled by administrator at ${task.completedAt}`);
      if (this.activeTaskId === id) {
        this.activeTaskId = null;
      }
      return true;
    } catch {
      return false;
    }
  }

  public startTask(
    type: string,
    title: string,
    cmd: string,
    args: string[],
    cwd: string = process.cwd()
  ): { ok: boolean; taskId?: string; error?: string } {
    // If a task is currently running, disallow launching a second heavy task
    if (this.activeTaskId) {
      const active = this.tasks.get(this.activeTaskId);
      if (active && active.status === "running") {
        return {
          ok: false,
          error: `Another task (${active.title}) is currently running. Please wait for it to complete or cancel it first.`,
        };
      }
    }

    const taskId = `task_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const task: InternalTaskState = {
      id: taskId,
      type,
      title,
      command: cmd,
      args,
      status: "running",
      exitCode: null,
      startedAt: new Date().toISOString(),
      completedAt: null,
      logs: [
        `================================================================================`,
        ` [START] ${title}`,
        ` Command: ${cmd} ${args.join(" ")}`,
        ` Started: ${new Date().toLocaleString()}`,
        `================================================================================\n`,
      ],
    };

    try {
      const proc = spawn(cmd, args, {
        cwd,
        env: {
          ...process.env,
          FORCE_COLOR: "1",
          NODE_ENV: "production",
        },
      });

      task.process = proc;
      this.tasks.set(taskId, task);
      this.activeTaskId = taskId;

      // Handle output streams
      const appendOutput = (data: Buffer | string) => {
        const text = data.toString("utf8");
        const lines = text.split("\n");
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          if (i === lines.length - 1 && line === "") continue;
          task.logs.push(line);
          if (task.logs.length > this.MAX_LOG_LINES) {
            task.logs.shift();
          }
        }
      };

      proc.stdout?.on("data", appendOutput);
      proc.stderr?.on("data", appendOutput);

      proc.on("error", (err) => {
        task.status = "failed";
        task.completedAt = new Date().toISOString();
        task.logs.push(`\n[ERROR] Process spawn failure: ${err.message}`);
        if (this.activeTaskId === taskId) {
          this.activeTaskId = null;
        }
      });

      proc.on("close", (code) => {
        task.exitCode = code;
        task.completedAt = new Date().toISOString();
        if (task.status === "running") {
          task.status = code === 0 ? "completed" : "failed";
        }
        task.logs.push(
          `\n================================================================================`,
          ` [${task.status.toUpperCase()}] Finished with exit code: ${code}`,
          ` Completed: ${new Date().toLocaleString()}`,
          `================================================================================`
        );
        if (this.activeTaskId === taskId) {
          this.activeTaskId = null;
        }
      });

      // Maintain max history
      if (this.tasks.size > this.MAX_HISTORY) {
        const oldestKey = this.tasks.keys().next().value;
        if (oldestKey && oldestKey !== taskId && oldestKey !== this.activeTaskId) {
          this.tasks.delete(oldestKey);
        }
      }

      return { ok: true, taskId };
    } catch (err: any) {
      return { ok: false, error: err.message || "Failed to spawn process." };
    }
  }
}

// Global singleton instance preserved in Node global scope across hot reloads
const globalForTasks = globalThis as unknown as {
  adminTaskManager?: AdminTaskManager;
};

export const adminTaskManager =
  globalForTasks.adminTaskManager ?? new AdminTaskManager();

if (process.env.NODE_ENV !== "production") {
  globalForTasks.adminTaskManager = adminTaskManager;
}
