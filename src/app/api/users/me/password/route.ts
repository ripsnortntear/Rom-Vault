import { NextRequest, NextResponse } from "next/server";
import { getCurrentSession, clearSessionCookie } from "@/lib/auth/session";
import { revokeAllUserSessions } from "@/lib/auth/session-db";
import { checkRateLimit, recordRateLimitEvent, getTrustedClientIp } from "@/lib/auth/rate-limit";
import { query, execute } from "@/lib/db";
import {
  verifyPassword,
  validatePasswordComplexity,
  hashPassword,
} from "@/lib/auth/crypto";
import { syncJellyfinUser } from "@/lib/jellyfin";
import { syncFilebotUser } from "@/lib/filebot";

export async function POST(req: NextRequest) {
  try {
    const session = await getCurrentSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const ip = getTrustedClientIp(req);

    // Rate limiting: max 5 password change attempts per 15 minutes per user/IP
    const rateCheck = await checkRateLimit({
      action: "change_password",
      identifier: `${session.user.id}:${ip}`,
      maxAttempts: 5,
      windowSeconds: 900,
    });

    if (!rateCheck.allowed) {
      return NextResponse.json(
        { error: `Too many password change attempts. Please try again in ${Math.ceil(rateCheck.retryAfterSeconds / 60)} minutes.` },
        { status: 429 }
      );
    }

    const body = await req.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ error: "Invalid request payload." }, { status: 400 });
    }

    const { currentPassword, newPassword } = body;

    if (!currentPassword || !newPassword) {
      return NextResponse.json(
        { error: "Current password and new password are required." },
        { status: 400 }
      );
    }

    // Validate new password complexity
    const passVal = validatePasswordComplexity(newPassword);
    if (!passVal.valid) {
      return NextResponse.json({ error: passVal.error }, { status: 400 });
    }

    // Lookup current password hash
    const users = await query<{ id: string; password_hash: string }>(
      "SELECT id, password_hash FROM users WHERE id = ? LIMIT 1",
      [session.user.id]
    );

    const user = users[0];
    if (!user) {
      return NextResponse.json({ error: "User not found." }, { status: 404 });
    }

    const isMatch = await verifyPassword(currentPassword, user.password_hash);
    if (!isMatch) {
      await recordRateLimitEvent("change_password", `${session.user.id}:${ip}`);
      return NextResponse.json({ error: "Current password does not match." }, { status: 400 });
    }

    // Hash new password and update
    const newHash = await hashPassword(newPassword);
    await execute(
      "UPDATE users SET password_hash = ?, updated_at = NOW() WHERE id = ?",
      [newHash, session.user.id]
    );

    // Invalidate all active sessions across all devices for this user
    await revokeAllUserSessions(session.user.id);
    await clearSessionCookie();

    // Synchronize changed password to Jellyfin
    syncJellyfinUser(session.user.username, newPassword, session.user.role).catch((syncErr) => {
      console.error("[ChangePassword] Background Jellyfin sync error:", syncErr);
    });

    // Synchronize changed password to FileBot
    syncFilebotUser(session.user.username, newPassword).catch((syncErr) => {
      console.error("[ChangePassword] Background FileBot sync error:", syncErr);
    });

    return NextResponse.json({
      success: true,
      message: "Password changed successfully. Please log in with your new password.",
    });
  } catch (error: any) {
    console.error("[api/users/me/password POST] Error:", error);
    return NextResponse.json({ error: "Failed to change password." }, { status: 500 });
  }
}
