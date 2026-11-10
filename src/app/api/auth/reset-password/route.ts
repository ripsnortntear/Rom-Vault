import { NextRequest, NextResponse } from "next/server";
import { query, execute } from "@/lib/db";
import {
  hashToken,
  validatePasswordComplexity,
  hashPassword,
} from "@/lib/auth/crypto";
import { checkRateLimit, recordRateLimitEvent, getTrustedClientIp } from "@/lib/auth/rate-limit";
import { revokeAllUserSessions } from "@/lib/auth/session-db";
import { syncJellyfinUser } from "@/lib/jellyfin";

export async function POST(req: NextRequest) {
  try {
    const ip = getTrustedClientIp(req);

    // Rate limiting: max 5 reset submissions per IP per 15 minutes
    const rateCheck = await checkRateLimit({
      action: "reset_password",
      identifier: ip,
      maxAttempts: 5,
      windowSeconds: 900,
    });

    if (!rateCheck.allowed) {
      return NextResponse.json(
        { error: `Too many password reset attempts. Please try again in ${Math.ceil(rateCheck.retryAfterSeconds / 60)} minutes.` },
        { status: 429 }
      );
    }

    const body = await req.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ error: "Invalid request payload." }, { status: 400 });
    }

    const { token, password } = body;

    if (!token || typeof token !== "string") {
      return NextResponse.json({ error: "Reset token is required." }, { status: 400 });
    }

    const passVal = validatePasswordComplexity(password);
    if (!passVal.valid) {
      return NextResponse.json({ error: passVal.error }, { status: 400 });
    }

    const tokenHash = hashToken(token.trim());

    // Find valid token
    const rows = await query<{ id: string; user_id: string; expires_at: Date }>(
      `SELECT id, user_id, expires_at 
       FROM auth_tokens 
       WHERE token_hash = ? AND type = 'password_reset' AND expires_at > NOW()`,
      [tokenHash]
    );

    const tokenRecord = rows[0];
    if (!tokenRecord) {
      await recordRateLimitEvent("reset_password", ip);
      return NextResponse.json(
        { error: "This password reset link is invalid or has expired. Please request a new one." },
        { status: 400 }
      );
    }

    // Hash new password (cost 12)
    const newPasswordHash = await hashPassword(password);

    // Update user password & unlock if was locked
    await execute(
      `UPDATE users 
       SET password_hash = ?, failed_login_attempts = 0, locked_until = NULL, updated_at = NOW() 
       WHERE id = ?`,
      [newPasswordHash, tokenRecord.user_id]
    );

    // Invalidate all tokens & sessions for this user (force re-login everywhere)
    await revokeAllUserSessions(tokenRecord.user_id);

    // Synchronize newly reset password to Jellyfin
    try {
      const resetUserRows = await query<{ username: string; role: string }>(
        "SELECT username, role FROM users WHERE id = ? LIMIT 1",
        [tokenRecord.user_id]
      );
      if (resetUserRows[0]) {
        syncJellyfinUser(resetUserRows[0].username, password, resetUserRows[0].role).catch((err) => {
          console.error("[ResetPassword] Jellyfin sync error:", err);
        });
      }
    } catch (lookupErr) {
      console.error("[ResetPassword] Jellyfin user lookup error:", lookupErr);
    }

    return NextResponse.json({
      success: true,
      message: "Password reset successful! You can now log in with your new password.",
    });
  } catch (error: any) {
    console.error("[ResetPassword Error]", error);
    return NextResponse.json(
      { error: "Internal server error occurred." },
      { status: 500 }
    );
  }
}
