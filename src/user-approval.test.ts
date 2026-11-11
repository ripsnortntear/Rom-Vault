import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock database query & execute
vi.mock("@/lib/db", () => ({
  query: vi.fn(),
  execute: vi.fn(),
}));

// Mock mailer
vi.mock("@/lib/mail/mailer", () => ({
  sendVerificationEmail: vi.fn().mockResolvedValue({ success: true }),
  sendAccountApprovedEmail: vi.fn().mockResolvedValue({ success: true }),
  sendAccountDeniedEmail: vi.fn().mockResolvedValue({ success: true }),
}));

// Mock Jellyfin & FileBot sync
vi.mock("@/lib/jellyfin", () => ({
  syncJellyfinUser: vi.fn().mockResolvedValue({ success: true }),
}));
vi.mock("@/lib/filebot", () => ({
  syncFilebotUser: vi.fn().mockResolvedValue({ success: true }),
}));

// Mock rate limiting
vi.mock("@/lib/auth/rate-limit", () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, remaining: 5, retryAfterSeconds: 0 }),
  recordRateLimitEvent: vi.fn().mockResolvedValue(undefined),
  resetRateLimitEvents: vi.fn().mockResolvedValue(undefined),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
}));

// Mock crypto tokens
vi.mock("@/lib/auth/crypto", async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    validateUsername: vi.fn().mockReturnValue({ valid: true }),
    validateEmail: vi.fn().mockReturnValue({ valid: true }),
    validatePasswordComplexity: vi.fn().mockReturnValue({ valid: true }),
    hashPassword: vi.fn().mockResolvedValue("mock_hashed_pass"),
    generateSecureToken: vi.fn().mockReturnValue("mock_token_123"),
    hashToken: vi.fn().mockReturnValue("mock_token_hash_abc"),
    generateUUID: vi.fn().mockReturnValue("uuid-1234-test"),
  };
});

import { query, execute } from "@/lib/db";
import { sendAccountApprovedEmail, sendAccountDeniedEmail } from "@/lib/mail/mailer";
import { approveUser, denyUser, getPendingUsersCount } from "@/lib/community";

describe("User Account Approval & Administrator Gate Suite", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getPendingUsersCount", () => {
    it("returns the exact number of users with account_status = 'pending_approval'", async () => {
      (query as any).mockResolvedValueOnce([{ count: 3 }]);
      const count = await getPendingUsersCount();
      expect(count).toBe(3);
      expect(query).toHaveBeenCalledWith(
        expect.stringContaining("WHERE account_status = 'pending_approval'")
      );
    });

    it("returns 0 if no pending users exist", async () => {
      (query as any).mockResolvedValueOnce([{ count: 0 }]);
      const count = await getPendingUsersCount();
      expect(count).toBe(0);
    });
  });

  describe("approveUser", () => {
    it("transitions user from pending_approval to active and dispatches automated approval email", async () => {
      const mockUserId = "user-pending-123";
      const mockAdminId = "admin-super-id";

      (query as any).mockResolvedValueOnce([
        {
          id: mockUserId,
          username: "new_challenger",
          email: "challenger@example.com",
          account_status: "pending_approval",
        },
      ]);

      (execute as any).mockResolvedValueOnce({ affectedRows: 1 }); // UPDATE users
      (execute as any).mockResolvedValueOnce({ affectedRows: 1 }); // INSERT admin_audit_logs

      const res = await approveUser(mockUserId, mockAdminId);

      expect(res.success).toBe(true);
      expect(res.username).toBe("new_challenger");
      expect(res.email).toBe("challenger@example.com");

      // Verify DB update
      expect(execute).toHaveBeenCalledWith(
        "UPDATE users SET account_status = 'active', updated_at = NOW() WHERE id = ?",
        [mockUserId]
      );

      // Verify email dispatch
      expect(sendAccountApprovedEmail).toHaveBeenCalledWith(
        "challenger@example.com",
        "new_challenger"
      );
    });

    it("throws an error if user is not found in database", async () => {
      (query as any).mockResolvedValueOnce([]);

      await expect(approveUser("nonexistent-user", "admin-1")).rejects.toThrow(
        "User not found."
      );
    });
  });

  describe("denyUser", () => {
    it("transitions user to denied status and dispatches automated denial email with optional reason", async () => {
      const mockUserId = "user-spam-456";
      const mockAdminId = "admin-super-id";
      const denyReason = "Registrations are currently restricted.";

      (query as any).mockResolvedValueOnce([
        {
          id: mockUserId,
          username: "spambot9000",
          email: "spam@example.com",
          account_status: "pending_approval",
        },
      ]);

      (execute as any).mockResolvedValueOnce({ affectedRows: 1 }); // UPDATE users
      (execute as any).mockResolvedValueOnce({ affectedRows: 1 }); // INSERT admin_audit_logs

      const res = await denyUser(mockUserId, mockAdminId, denyReason);

      expect(res.success).toBe(true);
      expect(res.username).toBe("spambot9000");
      expect(res.email).toBe("spam@example.com");

      // Verify DB update
      expect(execute).toHaveBeenCalledWith(
        "UPDATE users SET account_status = 'denied', updated_at = NOW() WHERE id = ?",
        [mockUserId]
      );

      // Verify email dispatch with reason
      expect(sendAccountDeniedEmail).toHaveBeenCalledWith(
        "spam@example.com",
        "spambot9000",
        denyReason
      );
    });
  });
});
