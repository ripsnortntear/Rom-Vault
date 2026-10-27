"use server";

import { z } from "zod";
import { revalidateTag, updateTag } from "next/cache";
import { requireAdmin } from "@/lib/auth/guards";
import {
  updateUserRole,
  updateUserQuota,
  updateUserStatus,
  adminResetPassword,
  adminPurgeUser,
  deleteComment,
  deleteHighScore,
} from "@/lib/community";
import { generateSecureToken } from "@/lib/auth/crypto";

export async function updateUserRoleAction(userId: string, role: "user" | "admin") {
  try {
    const admin = await requireAdmin();

    if (userId === admin.id && role !== "admin") {
      return { ok: false, error: "You cannot demote your own administrator account." };
    }

    const success = await updateUserRole(userId, role, admin.id);
    if (!success) {
      return { ok: false, error: "Failed to update user role." };
    }

    return { ok: true, message: `User role updated to ${role}.` };
  } catch (error: any) {
    console.error("[updateUserRoleAction] Error:", error);
    return { ok: false, error: error.message || "Failed to update user role." };
  }
}

export async function updateUserQuotaAction(userId: string, quota: number) {
  try {
    const admin = await requireAdmin();
    const cleanQuota = z.number().int().min(0).max(10000).parse(quota);

    const success = await updateUserQuota(userId, cleanQuota, admin.id);
    if (!success) {
      return { ok: false, error: "Failed to update download quota." };
    }

    return { ok: true, message: `Daily download quota updated to ${cleanQuota}.` };
  } catch (error: any) {
    console.error("[updateUserQuotaAction] Error:", error);
    return { ok: false, error: error.message || "Failed to update download quota." };
  }
}

export async function updateUserStatusAction(userId: string, status: "active" | "suspended") {
  try {
    const admin = await requireAdmin();

    if (userId === admin.id && status === "suspended") {
      return { ok: false, error: "You cannot suspend your own administrator account." };
    }

    const success = await updateUserStatus(userId, status, admin.id);
    if (!success) {
      return { ok: false, error: "Failed to update account status." };
    }

    return { ok: true, message: `Account status updated to ${status}.` };
  } catch (error: any) {
    console.error("[updateUserStatusAction] Error:", error);
    return { ok: false, error: error.message || "Failed to update account status." };
  }
}

export async function resetUserPasswordAction(userId: string, customPassword?: string) {
  try {
    const admin = await requireAdmin();
    const newPassword = customPassword && customPassword.length >= 8
      ? customPassword
      : `Vault-${generateSecureToken().slice(0, 8)}!`;

    const success = await adminResetPassword(userId, newPassword, admin.id);
    if (!success) {
      return { ok: false, error: "Failed to reset user password." };
    }

    return {
      ok: true,
      message: "Password reset successfully.",
      temporaryPassword: newPassword,
    };
  } catch (error: any) {
    console.error("[resetUserPasswordAction] Error:", error);
    return { ok: false, error: error.message || "Failed to reset password." };
  }
}

export async function purgeUserAction(userId: string) {
  try {
    const admin = await requireAdmin();

    if (userId === admin.id) {
      return { ok: false, error: "You cannot purge your own administrator account." };
    }

    const success = await adminPurgeUser(userId, admin.id);
    if (!success) {
      return { ok: false, error: "Failed to purge user." };
    }

    return { ok: true, message: "User account and associated data purged successfully." };
  } catch (error: any) {
    console.error("[purgeUserAction] Error:", error);
    return { ok: false, error: error.message || "Failed to purge user." };
  }
}

export async function moderateDeleteCommentAction(commentId: number, gameId?: string) {
  try {
    const admin = await requireAdmin();
    const success = await deleteComment(commentId, admin.id, true);

    if (!success) {
      return { ok: false, error: "Failed to delete comment." };
    }

    if (gameId) {
      try {
        updateTag(`game-social-${gameId}`);
        revalidateTag(`game-social-${gameId}`, "max");
      } catch {}
    }

    return { ok: true, message: "Offending comment removed." };
  } catch (error: any) {
    console.error("[moderateDeleteCommentAction] Error:", error);
    return { ok: false, error: error.message || "Failed to remove comment." };
  }
}

export async function moderateDeleteScoreAction(scoreId: number, gameId?: string) {
  try {
    await requireAdmin();
    const success = await deleteHighScore(scoreId);

    if (!success) {
      return { ok: false, error: "Failed to delete high score." };
    }

    try {
      updateTag("leaderboards");
      revalidateTag("leaderboards", "max");
      if (gameId) {
        updateTag(`game-social-${gameId}`);
        revalidateTag(`game-social-${gameId}`, "max");
      }
    } catch {}

    return { ok: true, message: "Falsified high score purged from leaderboards." };
  } catch (error: any) {
    console.error("[moderateDeleteScoreAction] Error:", error);
    return { ok: false, error: error.message || "Failed to remove high score." };
  }
}
