import { NextRequest, NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth/session";
import { getRecentShouts, postShout } from "@/lib/shoutbox";
import { checkRateLimit, recordRateLimitEvent, getTrustedClientIp } from "@/lib/auth/rate-limit";
import { query } from "@/lib/db";
import type { UserProfile } from "@/types/auth";

export async function GET(): Promise<NextResponse> {
  try {
    const shouts = await getRecentShouts(60);
    return NextResponse.json(
      { success: true, shouts },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate",
        },
      }
    );
  } catch (error: any) {
    console.error("[api/shoutbox GET] Error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch shoutbox messages" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const clientIp = getTrustedClientIp(req);
    const session = await getCurrentSession();

    // Rate limiting: max 8 messages per 60 seconds per user or IP
    const rateIdentifier = session?.user ? `user:${session.user.id}` : `guest:${clientIp}`;
    const rateCheck = await checkRateLimit({
      action: "shoutbox_post",
      identifier: rateIdentifier,
      maxAttempts: 8,
      windowSeconds: 60,
    });

    if (!rateCheck.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: `Please slow down. You can shout again in ${rateCheck.retryAfterSeconds} second(s).`,
        },
        { status: 429 }
      );
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body.message !== "string") {
      return NextResponse.json(
        { success: false, error: "Message content is required." },
        { status: 400 }
      );
    }

    const trimmed = body.message.trim();
    if (!trimmed) {
      return NextResponse.json(
        { success: false, error: "Message cannot be empty." },
        { status: 400 }
      );
    }

    if (trimmed.length > 280) {
      return NextResponse.json(
        { success: false, error: "Message exceeds maximum length of 280 characters." },
        { status: 400 }
      );
    }

    let userId: string | null = null;
    let username = "Guest";
    let displayName: string | null = null;
    let avatarUrl: string | null = null;
    let role = "guest";

    if (session?.user) {
      userId = session.user.id;
      username = session.user.username;
      role = session.user.role || "user";

      // Check profile for custom avatar or display name
      const profiles = await query<UserProfile>(
        "SELECT display_name, avatar_url FROM user_profiles WHERE user_id = ? LIMIT 1",
        [session.user.id]
      );
      if (profiles[0]) {
        displayName = profiles[0].display_name || session.user.displayName || username;
        avatarUrl = profiles[0].avatar_url || session.user.avatarUrl || null;
      } else {
        displayName = session.user.displayName || username;
        avatarUrl = session.user.avatarUrl || null;
      }
    } else {
      // Guest poster
      const customGuest = typeof body.guestName === "string" ? body.guestName.trim() : "";
      if (customGuest) {
        // Sanitize guest name
        username = customGuest.replace(/[^a-zA-Z0-9_\-\s]/g, "").slice(0, 24) || "Guest";
      } else {
        const shortIp = clientIp.replace(/[^0-9]/g, "").slice(-4) || "77";
        username = `Guest_${shortIp}`;
      }
      displayName = username;
    }

    const shout = await postShout({
      userId,
      username,
      displayName,
      avatarUrl,
      role,
      type: "user",
      message: trimmed,
    });

    await recordRateLimitEvent("shoutbox_post", rateIdentifier);

    return NextResponse.json({ success: true, shout }, { status: 201 });
  } catch (error: any) {
    console.error("[api/shoutbox POST] Error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to post shout." },
      { status: 500 }
    );
  }
}
