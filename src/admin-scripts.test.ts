import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { adminTaskManager } from "@/lib/admin-tasks";

// Hoisted mocks for CI unit testing
const { mockGetCurrentSession } = vi.hoisted(() => ({
  mockGetCurrentSession: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({
  getCurrentSession: mockGetCurrentSession,
}));

vi.mock("@/lib/db", () => ({
  db: { query: vi.fn(), execute: vi.fn() },
  query: vi.fn(),
  execute: vi.fn(),
}));

import { GET, POST, DELETE } from "@/app/api/admin/scripts/route";

describe("Admin Script Management & Automation Suite", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("AdminTaskManager (Process Execution)", () => {
    it("starts a task and captures stdout", async () => {
      const res = adminTaskManager.startTask(
        "test_task",
        "Echo Test",
        "node",
        ["-e", 'console.log("Hello from admin automation!");']
      );

      expect(res.ok).toBe(true);
      expect(res.taskId).toBeDefined();

      const taskId = res.taskId!;
      let task = adminTaskManager.getTask(taskId);
      expect(task).toBeDefined();

      // Wait a moment for node process to exit
      await new Promise((r) => setTimeout(r, 200));

      task = adminTaskManager.getTask(taskId);
      expect(task?.status).toBe("completed");
      expect(task?.exitCode).toBe(0);
      expect(task?.logs.some((l) => l.includes("Hello from admin automation!"))).toBe(true);
    });

    it("prevents starting concurrent tasks while another is running", async () => {
      // Start a 1-second task
      const first = adminTaskManager.startTask(
        "sleep_task",
        "Sleep Test",
        "node",
        ["-e", "setTimeout(() => {}, 800)"]
      );

      expect(first.ok).toBe(true);

      // Attempt to start a second task
      const second = adminTaskManager.startTask(
        "second_task",
        "Second Test",
        "node",
        ["-e", 'console.log("Should be rejected");']
      );

      expect(second.ok).toBe(false);
      expect(second.error).toContain("currently running");

      // Cancel the first task
      if (first.taskId) {
        adminTaskManager.cancelTask(first.taskId);
      }
    });

    it("allows cancelling a running task", async () => {
      const task = adminTaskManager.startTask(
        "cancel_test",
        "Cancelable Process",
        "node",
        ["-e", "setInterval(() => {}, 1000)"]
      );

      expect(task.ok).toBe(true);
      const taskId = task.taskId!;

      const cancelResult = adminTaskManager.cancelTask(taskId);
      expect(cancelResult).toBe(true);

      const status = adminTaskManager.getTask(taskId);
      expect(status?.status).toBe("cancelled");
      expect(status?.logs.some((l) => l.includes("cancelled by administrator"))).toBe(true);
    });
  });

  describe("API Route Handlers (/api/admin/scripts)", () => {
    it("rejects unauthenticated requests with 403", async () => {
      mockGetCurrentSession.mockResolvedValueOnce(null);

      const req = new NextRequest("http://localhost:39254/api/admin/scripts", {
        method: "GET",
      });
      const res = await GET(req);

      expect(res.status).toBe(403);
    });

    it("rejects non-admin users with 403", async () => {
      mockGetCurrentSession.mockResolvedValueOnce({
        user: { id: "user_1", username: "regular_user", role: "user" },
      });

      const req = new NextRequest("http://localhost:39254/api/admin/scripts", {
        method: "POST",
        body: JSON.stringify({ type: "library_scan" }),
      });
      const res = await POST(req);

      expect(res.status).toBe(403);
    });

    it("allows admin to launch metadata download with sanitized parameters", async () => {
      mockGetCurrentSession.mockResolvedValueOnce({
        user: { id: "admin_1", username: "superadmin", role: "admin" },
      });

      const req = new NextRequest("http://localhost:39254/api/admin/scripts", {
        method: "POST",
        body: JSON.stringify({
          type: "metadata",
          assets: ["boxart", "logos"],
          system: "ps2",
          filter: "Spider-Man",
          force: true,
        }),
      });

      const res = await POST(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.ok).toBe(true);
      expect(data.title).toContain("Metadata & Artwork Downloader");

      // Cancel to clean up
      if (data.taskId) {
        adminTaskManager.cancelTask(data.taskId);
      }
    });

    it("allows admin to trigger TabStationToo contract verification", async () => {
      mockGetCurrentSession.mockResolvedValueOnce({
        user: { id: "admin_1", username: "superadmin", role: "admin" },
      });

      const req = new NextRequest("http://localhost:39254/api/admin/scripts", {
        method: "POST",
        body: JSON.stringify({
          type: "tabstationtoo",
          action: "verify",
        }),
      });

      const res = await POST(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.ok).toBe(true);
      expect(data.title).toContain("Verify Integration Contracts");

      if (data.taskId) {
        adminTaskManager.cancelTask(data.taskId);
      }
    });

    it("rejects invalid/unknown action types with 400", async () => {
      mockGetCurrentSession.mockResolvedValueOnce({
        user: { id: "admin_1", username: "superadmin", role: "admin" },
      });

      const req = new NextRequest("http://localhost:39254/api/admin/scripts", {
        method: "POST",
        body: JSON.stringify({
          type: "malicious_unrecognized_action",
        }),
      });

      const res = await POST(req);
      expect(res.status).toBe(400);
    });

    it("returns task logs with offset pagination in GET", async () => {
      mockGetCurrentSession.mockResolvedValueOnce({
        user: { id: "admin_1", username: "superadmin", role: "admin" },
      });

      const task = adminTaskManager.startTask(
        "pagination_test",
        "Pagination",
        "node",
        ["-e", 'console.log("Line 1"); console.log("Line 2");']
      );

      await new Promise((r) => setTimeout(r, 150));

      const req = new NextRequest(
        `http://localhost:39254/api/admin/scripts?taskId=${task.taskId}&offset=0`
      );
      const res = await GET(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.ok).toBe(true);
      expect(data.task.logs.length).toBeGreaterThan(0);
    });
  });
});
