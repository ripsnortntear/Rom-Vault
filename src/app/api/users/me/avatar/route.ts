import { NextRequest, NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth/session";
import { execute, query } from "@/lib/db";
import { avatarUrlSchema } from "@/lib/security";

export async function GET(): Promise<NextResponse> {
  try {
    const session = await getCurrentSession();
    if (!session || !session.user) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const profiles = await query<{ avatar_url: string | null }>(
      "SELECT avatar_url FROM user_profiles WHERE user_id = ? LIMIT 1",
      [session.user.id]
    );

    return NextResponse.json({
      avatarUrl: profiles[0]?.avatar_url || null,
    });
  } catch (err: any) {
    return NextResponse.json({ error: "Failed to retrieve avatar." }, { status: 500 });
  }
}

export async function PUT(req: NextRequest): Promise<NextResponse> {
  try {
    const session = await getCurrentSession();
    if (!session || !session.user) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const body = await req.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
    }

    const rawUrl = body.avatarUrl !== undefined ? body.avatarUrl : body.avatar;
    const parseResult = avatarUrlSchema.safeParse(rawUrl);
    if (!parseResult.success) {
      return NextResponse.json(
        { error: parseResult.error.issues[0]?.message || "Avatar must be a valid local path or secure HTTPS URL." },
        { status: 400 }
      );
    }

    const cleanAvatar = parseResult.data ? String(parseResult.data).trim() : null;

    await execute(
      "UPDATE user_profiles SET avatar_url = ?, updated_at = NOW() WHERE user_id = ?",
      [cleanAvatar, session.user.id]
    );

    return NextResponse.json({
      success: true,
      avatarUrl: cleanAvatar,
      message: "Avatar updated successfully.",
    });
  } catch (err: any) {
    return NextResponse.json({ error: "Failed to update avatar." }, { status: 500 });
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  return PUT(req);
}
