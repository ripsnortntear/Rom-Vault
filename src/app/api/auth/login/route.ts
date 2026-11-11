import { NextRequest, NextResponse } from "next/server";
import { query, execute } from "@/lib/db";
import { verifyPassword } from "@/lib/auth/crypto";
import { checkRateLimit, recordRateLimitEvent, resetRateLimitEvents, getClientIp } from "@/lib/auth/rate-limit";
import { createSession } from "@/lib/auth/session-db";
import { signSessionToken, setSessionCookie } from "@/lib/auth/session";
import { syncJellyfinUser } from "@/lib/jellyfin";
import { syncFilebotUser } from "@/lib/filebot";
import type { User } from "@/types/auth";

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    const userAgent = req.headers.get("user-agent") || undefined;

    const body = await req.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ error: "Invalid request payload." }, { status: 400 });
    }

    const { identifier, password } = body;
    if (!identifier || !password) {
      return NextResponse.json({ error: "Username/email and password are required." }, { status: 400 });
    }

    const rawIdentifier = String(identifier).trim();
    // Support mobile keyboard auto-spacing (e.g. "CFW 34683" -> "cfw34683")
    const collapsedIdentifier = rawIdentifier.replace(/\s+/g, "");

    // 1. IP and Account rate limit check
    const rateCheck = await checkRateLimit({
      action: "login",
      identifier: ip,
      maxAttempts: 10,
      windowSeconds: 900, // 15 minutes
    });

    if (!rateCheck.allowed) {
      return NextResponse.json(
        { error: `Too many login attempts. Please try again in ${Math.ceil(rateCheck.retryAfterSeconds / 60)} minutes.` },
        { status: 429 }
      );
    }

    // 2. Lookup user (exact, case-insensitive, or collapsed whitespace)
    const users = await query<User>(
      `SELECT * FROM users WHERE username = ? OR email = ? OR username = ? OR email = ? LIMIT 1`,
      [rawIdentifier, rawIdentifier.toLowerCase(), collapsedIdentifier, collapsedIdentifier.toLowerCase()]
    );

    const user = users[0];

    // Mitigate timing attacks if user does not exist by computing a dummy hash verification
    if (!user) {
      await verifyPassword(
        password,
        "$2a$12$e8Y3y6BknQ15UqZ0QhT8qOpWzQ9W6qF0E9g2I2e4P3r5X1g7J9l6S"
      );
      await recordRateLimitEvent("login", ip);
      return NextResponse.json({ error: "Invalid credentials." }, { status: 401 });
    }

    // 3. Check account lock status
    if (user.locked_until && new Date(user.locked_until) > new Date()) {
      const waitMinutes = Math.ceil((new Date(user.locked_until).getTime() - Date.now()) / 60000);
      return NextResponse.json(
        { error: `Account is temporarily locked due to multiple failed login attempts. Try again in ${waitMinutes} minutes.` },
        { status: 423 }
      );
    }

    // 4. Verify password
    const isPasswordValid = await verifyPassword(password, user.password_hash);
    if (!isPasswordValid) {
      const failedCount = (user.failed_login_attempts || 0) + 1;
      let lockSql = "UPDATE users SET failed_login_attempts = ? WHERE id = ?";
      let lockParams: any[] = [failedCount, user.id];

      if (failedCount >= 5) {
        const lockUntil = new Date(Date.now() + 15 * 60 * 1000); // Lock for 15 minutes
        lockSql = "UPDATE users SET failed_login_attempts = ?, locked_until = ? WHERE id = ?";
        lockParams = [failedCount, lockUntil, user.id];
      }

      await execute(lockSql, lockParams);
      await recordRateLimitEvent("login", ip);

      return NextResponse.json(
        {
          error: failedCount >= 5
            ? "Too many failed attempts. Your account has been locked for 15 minutes."
            : "Invalid credentials.",
        },
        { status: 401 }
      );
    }

    // 5. Check account verification / suspension status
    if (user.account_status === "pending") {
      return NextResponse.json(
        { error: "Your account has not been activated. Please check your email for the verification link." },
        { status: 403 }
      );
    }

    if (user.account_status === "suspended") {
      return NextResponse.json(
        { error: "This account has been suspended. Please contact an administrator for assistance." },
        { status: 403 }
      );
    }

    // 6. Reset failed attempts on successful login
    await execute(
      "UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE id = ?",
      [user.id]
    );
    await resetRateLimitEvents("login", ip);

    // 7. Create Session
    const { token, expiresAt } = await createSession(user.id, ip, userAgent);
    const signedToken = await signSessionToken({
      userId: user.id,
      username: user.username,
      role: user.role,
      sessionId: token,
    });
    await setSessionCookie(signedToken, expiresAt, { userId: user.id, role: user.role, username: user.username });

    // Fetch user profile display details
    const profileRows = await query<{ display_name: string | null; avatar_url: string | null }>(
      "SELECT display_name, avatar_url FROM user_profiles WHERE user_id = ?",
      [user.id]
    );

    // Auto-provision or sync password with Jellyfin in the background
    syncJellyfinUser(user.username, password, user.role).catch((syncErr) => {
      console.error("[Login] Background Jellyfin sync error:", syncErr);
    });

    // Auto-provision or sync password with FileBot in the background
    syncFilebotUser(user.username, password).catch((filebotErr) => {
      console.error("[Login] Background FileBot sync error:", filebotErr);
    });

    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        displayName: profileRows[0]?.display_name || user.username,
        avatarUrl: profileRows[0]?.avatar_url || null,
      },
    });
  } catch (error: any) {
    console.error("[Login Error]", error);
    return NextResponse.json(
      { error: "Internal server error during authentication." },
      { status: 500 }
    );
  }
}
