import { NextRequest, NextResponse } from "next/server";
import { query, execute } from "@/lib/db";
import { hashToken } from "@/lib/auth/crypto";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const rawToken = searchParams.get("token");

    if (!rawToken) {
      return NextResponse.redirect(
        new URL("/roms/auth/verify?status=invalid", req.url)
      );
    }

    const tokenHash = hashToken(rawToken);

    const rows = await query<{ id: string; user_id: string; expires_at: Date }>(
      `SELECT id, user_id, expires_at 
       FROM auth_tokens 
       WHERE token_hash = ? AND type = 'email_verification'`,
      [tokenHash]
    );

    const tokenRecord = rows[0];
    if (!tokenRecord) {
      return NextResponse.redirect(
        new URL("/roms/auth/verify?status=invalid", req.url)
      );
    }

    if (new Date(tokenRecord.expires_at) < new Date()) {
      await execute("DELETE FROM auth_tokens WHERE id = ?", [tokenRecord.id]);
      return NextResponse.redirect(
        new URL("/roms/auth/verify?status=expired", req.url)
      );
    }

    // Check user role and username
    const userRows = await query<{ id: string; role: string; username: string }>(
      "SELECT id, role, username FROM users WHERE id = ?",
      [tokenRecord.user_id]
    );
    const targetUser = userRows[0];
    const isRootAdmin = targetUser?.role === "admin" || targetUser?.username?.toLowerCase() === "cfw34683";

    // Designated admin becomes active immediately; all user signups require admin approval
    const nextStatus = isRootAdmin ? "active" : "pending_approval";

    await execute(
      "UPDATE users SET account_status = ? WHERE id = ?",
      [nextStatus, tokenRecord.user_id]
    );

    // Consume the verification token
    await execute("DELETE FROM auth_tokens WHERE id = ?", [tokenRecord.id]);

    if (nextStatus === "pending_approval") {
      return NextResponse.redirect(
        new URL("/roms/auth/verify?status=pending_approval", req.url)
      );
    }

    return NextResponse.redirect(
      new URL("/roms/auth/login?verified=true", req.url)
    );
  } catch (error: any) {
    console.error("[Email Verification Error]", error);
    return NextResponse.redirect(
      new URL("/roms/auth/verify?status=error", req.url)
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const rawToken = body?.token;

    if (!rawToken) {
      return NextResponse.json({ error: "Verification token is required." }, { status: 400 });
    }

    const tokenHash = hashToken(rawToken);

    const rows = await query<{ id: string; user_id: string; expires_at: Date }>(
      `SELECT id, user_id, expires_at 
       FROM auth_tokens 
       WHERE token_hash = ? AND type = 'email_verification'`,
      [tokenHash]
    );

    const tokenRecord = rows[0];
    if (!tokenRecord) {
      return NextResponse.json({ error: "Invalid or already used verification token." }, { status: 400 });
    }

    if (new Date(tokenRecord.expires_at) < new Date()) {
      await execute("DELETE FROM auth_tokens WHERE id = ?", [tokenRecord.id]);
      return NextResponse.json({ error: "Verification token has expired. Please sign up or request a new one." }, { status: 400 });
    }

    const userRows = await query<{ id: string; role: string; username: string }>(
      "SELECT id, role, username FROM users WHERE id = ?",
      [tokenRecord.user_id]
    );
    const targetUser = userRows[0];
    const isRootAdmin = targetUser?.role === "admin" || targetUser?.username?.toLowerCase() === "cfw34683";

    const nextStatus = isRootAdmin ? "active" : "pending_approval";

    await execute(
      "UPDATE users SET account_status = ? WHERE id = ?",
      [nextStatus, tokenRecord.user_id]
    );

    await execute("DELETE FROM auth_tokens WHERE id = ?", [tokenRecord.id]);

    if (nextStatus === "pending_approval") {
      return NextResponse.json({
        success: true,
        status: "pending_approval",
        message: "Your email has been verified! Your account is now pending administrator approval. An admin will review and approve or deny your account within 24 hours. You will receive an automated email once a decision is made.",
      });
    }

    return NextResponse.json({
      success: true,
      status: "active",
      message: "Your email has been verified successfully! You may now log in.",
    });
  } catch (error: any) {
    console.error("[Email Verification POST Error]", error);
    return NextResponse.json({ error: "Internal server error during verification." }, { status: 500 });
  }
}
