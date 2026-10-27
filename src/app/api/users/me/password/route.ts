import { NextRequest, NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth/session";
import { query, execute } from "@/lib/db";
import {
  verifyPassword,
  validatePasswordComplexity,
  hashPassword,
} from "@/lib/auth/crypto";

export async function POST(req: NextRequest) {
  try {
    const session = await getCurrentSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
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
      return NextResponse.json({ error: "Current password does not match." }, { status: 400 });
    }

    // Hash new password and update
    const newHash = await hashPassword(newPassword);
    await execute(
      "UPDATE users SET password_hash = ?, updated_at = NOW() WHERE id = ?",
      [newHash, session.user.id]
    );

    return NextResponse.json({
      success: true,
      message: "Password changed successfully.",
    });
  } catch (error: any) {
    console.error("[api/users/me/password POST] Error:", error);
    return NextResponse.json({ error: "Failed to change password." }, { status: 500 });
  }
}
