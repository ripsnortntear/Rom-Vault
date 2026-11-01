import { NextRequest, NextResponse } from "next/server";
import { query, execute } from "@/lib/db";
import { generateSecureToken, hashToken, generateUUID, validateEmail } from "@/lib/auth/crypto";
import { checkRateLimit, recordRateLimitEvent, getClientIp } from "@/lib/auth/rate-limit";
import { sendPasswordResetEmail } from "@/lib/mail/mailer";

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req);

    const body = await req.json().catch(() => null);
    const email = body?.email;

    const emailVal = validateEmail(email);
    if (!emailVal.valid) {
      return NextResponse.json({ error: emailVal.error }, { status: 400 });
    }

    const cleanEmail = String(email).trim().toLowerCase();

    // Rate limiting: 3 reset requests per IP/email per hour
    const rateCheck = await checkRateLimit({
      action: "password_reset",
      identifier: `${ip}:${cleanEmail}`,
      maxAttempts: 3,
      windowSeconds: 3600,
    });

    if (!rateCheck.allowed) {
      return NextResponse.json(
        { error: `Too many password reset requests. Please wait ${Math.ceil(rateCheck.retryAfterSeconds / 60)} minutes.` },
        { status: 429 }
      );
    }

    await recordRateLimitEvent("password_reset", `${ip}:${cleanEmail}`);

    // Lookup user
    const users = await query<{ id: string; username: string; email: string; account_status: string }>(
      "SELECT id, username, email, account_status FROM users WHERE email = ? LIMIT 1",
      [cleanEmail]
    );

    const user = users[0];

    // Generic safe response to prevent email discovery
    const genericResponse = {
      success: true,
      message: "If an account exists with that email address, password reset instructions have been sent.",
    };

    if (!user || user.account_status === "suspended") {
      return NextResponse.json(genericResponse);
    }

    // Clean existing unused reset tokens for this user
    await execute(
      "DELETE FROM auth_tokens WHERE user_id = ? AND type = 'password_reset'",
      [user.id]
    );

    // Generate cryptographic reset token (1 hour expiry)
    const rawResetToken = generateSecureToken();
    const tokenHash = hashToken(rawResetToken);
    const tokenId = generateUUID();

    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 1);

    await execute(
      `INSERT INTO auth_tokens (id, user_id, token_hash, type, ip_address, expires_at)
       VALUES (?, ?, ?, 'password_reset', ?, ?)`,
      [tokenId, user.id, tokenHash, ip, expiresAt]
    );

    // Send email via Zoho Mail
    try {
      await sendPasswordResetEmail(user.email, user.username, rawResetToken);
    } catch (mailErr) {
      console.error("[ForgotPassword] Failed sending reset email:", mailErr);
    }

    return NextResponse.json(genericResponse);
  } catch (error: any) {
    console.error("[ForgotPassword Error]", error);
    return NextResponse.json(
      { error: "Internal server error occurred." },
      { status: 500 }
    );
  }
}
