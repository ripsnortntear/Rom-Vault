import { NextRequest, NextResponse } from "next/server";
import { getGameSocialStats } from "@/lib/community";
import { getCurrentSession } from "@/lib/auth/session";

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const session = await getCurrentSession();
    const stats = await getGameSocialStats(id, session?.user?.id);

    return NextResponse.json({
      ok: true,
      stats,
      currentUser: session?.user || null,
    });
  } catch (error: any) {
    console.error("[api/games/[id]/social GET] Error:", error);
    return NextResponse.json(
      { ok: false, error: "Failed to fetch community data" },
      { status: 500 }
    );
  }
}
