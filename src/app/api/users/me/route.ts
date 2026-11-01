import { NextRequest, NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth/session";
import { query, execute } from "@/lib/db";
import { avatarUrlSchema } from "@/lib/security";
import type { UserProfile } from "@/types/auth";

export async function GET(req: NextRequest) {
  try {
    const session = await getCurrentSession();
    if (!session) {
      return NextResponse.json({ authenticated: false, user: null }, { status: 401 });
    }

    const profiles = await query<UserProfile>(
      "SELECT * FROM user_profiles WHERE user_id = ? LIMIT 1",
      [session.user.id]
    );

    const profile = profiles[0];

    return NextResponse.json({
      authenticated: true,
      user: session.user,
      profile: profile
        ? {
            displayName: profile.display_name,
            avatarUrl: profile.avatar_url,
            preferences:
              typeof profile.preferences === "string"
                ? JSON.parse(profile.preferences)
                : profile.preferences,
            favorites:
              typeof profile.favorites === "string"
                ? JSON.parse(profile.favorites)
                : profile.favorites || [],
            quotaDaily: session.user.role === "admin" ? null : profile.download_quota_daily,
            quotaUsedToday: session.user.role === "admin" ? 0 : profile.download_count_today,
          }
        : null,
    });
  } catch (error: any) {
    console.error("[api/users/me GET] Error:", error);
    return NextResponse.json({ error: "Failed to fetch user profile." }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const session = await getCurrentSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const body = await req.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
    }

    const { displayName, avatarUrl, preferences, favorites } = body;

    const updates: string[] = [];
    const params: any[] = [];

    if (displayName !== undefined) {
      const cleanName = displayName ? String(displayName).trim().slice(0, 100) : null;
      updates.push("display_name = ?");
      params.push(cleanName);
    }

    if (avatarUrl !== undefined) {
      if (avatarUrl === null || avatarUrl === "") {
        updates.push("avatar_url = ?");
        params.push(null);
      } else {
        const parseResult = avatarUrlSchema.safeParse(avatarUrl);
        if (!parseResult.success) {
          return NextResponse.json(
            { error: parseResult.error.issues[0]?.message || "Avatar must be a valid local path or secure HTTPS URL." },
            { status: 400 }
          );
        }
        const cleanAvatar = parseResult.data ? String(parseResult.data).trim() : null;
        updates.push("avatar_url = ?");
        params.push(cleanAvatar);
      }
    }

    if (preferences !== undefined) {
      updates.push("preferences = ?");
      params.push(JSON.stringify(preferences));
    }

    if (favorites !== undefined && Array.isArray(favorites)) {
      updates.push("favorites = ?");
      params.push(JSON.stringify(favorites));
    }

    if (updates.length === 0) {
      return NextResponse.json({ error: "No fields provided to update." }, { status: 400 });
    }

    params.push(session.user.id);
    await execute(
      `UPDATE user_profiles SET ${updates.join(", ")}, updated_at = NOW() WHERE user_id = ?`,
      params
    );

    return NextResponse.json({
      success: true,
      message: "Profile updated successfully.",
    });
  } catch (error: any) {
    console.error("[api/users/me PUT] Error:", error);
    return NextResponse.json({ error: "Failed to update profile." }, { status: 500 });
  }
}
