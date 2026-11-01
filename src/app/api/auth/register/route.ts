import { NextRequest, NextResponse } from "next/server";
import { query, execute } from "@/lib/db";
import {
  validateUsername,
  validateEmail,
  validatePasswordComplexity,
  hashPassword,
  generateSecureToken,
  hashToken,
  generateUUID,
} from "@/lib/auth/crypto";
import { checkRateLimit, recordRateLimitEvent, getClientIp } from "@/lib/auth/rate-limit";
import { sendVerificationEmail } from "@/lib/mail/mailer";
import { ensureDefaultCard } from "@/lib/memory-cards";

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req);

    // Rate limit registration: max 5 signups per IP per hour
    const rateCheck = await checkRateLimit({
      action: "register",
      identifier: ip,
      maxAttempts: 5,
      windowSeconds: 3600,
    });

    if (!rateCheck.allowed) {
      return NextResponse.json(
        { error: `Too many registration attempts. Please try again in ${Math.ceil(rateCheck.retryAfterSeconds / 60)} minutes.` },
        { status: 429 }
      );
    }

    const body = await req.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ error: "Invalid request payload." }, { status: 400 });
    }

    const { username, email, password } = body;

    // 1. Validation
    const userVal = validateUsername(username);
    if (!userVal.valid) {
      return NextResponse.json({ error: userVal.error }, { status: 400 });
    }

    const emailVal = validateEmail(email);
    if (!emailVal.valid) {
      return NextResponse.json({ error: emailVal.error }, { status: 400 });
    }

    const passVal = validatePasswordComplexity(password);
    if (!passVal.valid) {
      return NextResponse.json({ error: passVal.error }, { status: 400 });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const cleanUsername = username.trim();

    // 2. Uniqueness check
    const existing = await query<{ id: string; username: string; email: string }>(
      "SELECT id, username, email FROM users WHERE username = ? OR email = ?",
      [cleanUsername, normalizedEmail]
    );

    if (existing.length > 0) {
      if (existing[0].username.toLowerCase() === cleanUsername.toLowerCase()) {
        return NextResponse.json({ error: "Username is already taken." }, { status: 409 });
      }
      return NextResponse.json({ error: "An account with this email address already exists." }, { status: 409 });
    }

    // 3. Password Hashing (Bcrypt cost 12)
    const passwordHash = await hashPassword(password);

    // 4. Create User & Profile
    const userId = generateUUID();
    const profileId = generateUUID();

    // Determine user role:
    // 1. Explicit admin check via ADMIN_USERNAMES / ADMIN_EMAILS / INITIAL_ADMIN_USERNAME
    // 2. Fallback: If no admin currently exists in the database, automatically grant admin
    const adminUsernames = (process.env.ADMIN_USERNAMES || process.env.INITIAL_ADMIN_USERNAME || "")
      .split(",")
      .map((u) => u.trim().toLowerCase())
      .filter(Boolean);

    const adminEmails = (process.env.ADMIN_EMAILS || "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);

    const isDesignatedAdmin =
      adminUsernames.includes(cleanUsername.toLowerCase()) ||
      adminEmails.includes(normalizedEmail);

    const existingAdminRows = await query<{ count: number }>(
      "SELECT COUNT(*) AS count FROM users WHERE role = 'admin'"
    );
    const hasAnyAdmin = (existingAdminRows[0]?.count || 0) > 0;

    const role = isDesignatedAdmin || !hasAnyAdmin ? "admin" : "user";

    await execute(
      `INSERT INTO users (id, username, email, password_hash, role, account_status)
       VALUES (?, ?, ?, ?, ?, 'pending')`,
      [userId, cleanUsername, normalizedEmail, passwordHash, role]
    );

    const initialQuota = role === "admin" ? 0 : 50;
    await execute(
      `INSERT INTO user_profiles (id, user_id, display_name, preferences, favorites, download_quota_daily)
       VALUES (?, ?, ?, ?, '[]', ?)`,
      [profileId, userId, cleanUsername, JSON.stringify({ theme: "dark" }), initialQuota]
    );

    // Initialize Slot 1 Default Virtual PS1 Memory Card
    try {
      await ensureDefaultCard(userId);
    } catch (cardErr) {
      console.error("[Register] Failed initializing default memory card:", cardErr);
    }

    // 5. Generate Verification Token (24 hours)
    const rawVerificationToken = generateSecureToken();
    const tokenHash = hashToken(rawVerificationToken);
    const tokenId = generateUUID();

    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24);

    await execute(
      `INSERT INTO auth_tokens (id, user_id, token_hash, type, ip_address, expires_at)
       VALUES (?, ?, ?, 'email_verification', ?, ?)`,
      [tokenId, userId, tokenHash, ip, expiresAt]
    );

    // Record registration event for IP rate limiting
    await recordRateLimitEvent("register", ip);

    // 6. Send verification email via Zoho Mail
    try {
      await sendVerificationEmail(normalizedEmail, cleanUsername, rawVerificationToken);
    } catch (mailErr) {
      console.error("[Register] Failed to send verification email:", mailErr);
      return NextResponse.json(
        {
          success: true,
          message: "Account created, but verification email failed to dispatch. Please check your SMTP settings or contact an administrator.",
          warning: "SMTP dispatch failed.",
        },
        { status: 201 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        message: "Account created successfully! Please check your email to activate your account before logging in.",
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error("[Register Error]", error);
    return NextResponse.json(
      { error: "Internal server error occurred while creating account." },
      { status: 500 }
    );
  }
}
