import { NextRequest, NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth/session";
import { getGameModeration, updateGameModeration, wipeGameScores } from "@/lib/moderation";
import { updateCachedGameModeration, getGameById } from "@/lib/scanner";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getCurrentSession();
    if (!session || session.user?.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const { id } = await params;
    const decodedId = decodeURIComponent(id);
    const record = await getGameModeration(decodedId);

    return NextResponse.json({ ok: true, record: record ?? null });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed" }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getCurrentSession();
    if (!session || session.user?.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const { id } = await params;
    const decodedId = decodeURIComponent(id);
    const body = await req.json();

    const game = await getGameById(decodedId);
    const system = body.system || game?.system || "nes";

    if (body.action === "wipe_scores") {
      const wiped = await wipeGameScores(decodedId, session.user.id);
      return NextResponse.json({ ok: wiped });
    }

    const updates = {
      isDisabled: typeof body.isDisabled === "boolean" ? body.isDisabled : undefined,
      preferredCover: body.preferredCover !== undefined ? body.preferredCover : undefined,
      customCoverUrl: body.customCoverUrl !== undefined ? body.customCoverUrl : undefined,
      customTitle: body.customTitle !== undefined ? body.customTitle : undefined,
      customStory: body.customStory !== undefined ? body.customStory : undefined,
    };

    const success = await updateGameModeration(decodedId, system, updates, {
      id: session.user.id,
      username: session.user.username,
    });

    if (success) {
      updateCachedGameModeration(decodedId, updates);
    }

    return NextResponse.json({ ok: success, updates });
  } catch (err: any) {
    console.error("[api/admin/games/moderate] Error:", err);
    return NextResponse.json({ error: err.message || "Failed" }, { status: 500 });
  }
}
