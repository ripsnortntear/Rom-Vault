import { NextRequest, NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth/session";
import { listActiveRooms, createRoom } from "@/lib/multiplayer";

export async function GET(): Promise<NextResponse> {
  try {
    const rooms = await listActiveRooms();
    return NextResponse.json(
      { success: true, rooms, serverTime: new Date().toISOString() },
      { headers: { "Cache-Control": "no-store, no-cache, must-revalidate" } }
    );
  } catch (error: any) {
    console.error("[api/multiplayer/rooms GET] Error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to list multiplayer rooms." },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const session = await getCurrentSession();
    const body = await req.json().catch(() => ({}));

    const clientPlayerId =
      typeof body.playerId === "string" && body.playerId.trim()
        ? body.playerId.trim().slice(0, 64)
        : null;

    const hostId = clientPlayerId || session?.user?.id || `guest_${Date.now()}`;
    const hostUsername =
      session?.user?.username ||
      (typeof body.playerName === "string" && body.playerName.trim()
        ? body.playerName.trim().slice(0, 40)
        : "Player1");
    const hostDisplayName =
      (typeof body.playerName === "string" && body.playerName.trim()
        ? body.playerName.trim().slice(0, 60)
        : null) ||
      session?.user?.displayName ||
      hostUsername;

    const room = await createRoom({
      name: typeof body.name === "string" ? body.name : "",
      hostId,
      hostUsername,
      hostDisplayName,
      systemId: typeof body.systemId === "string" ? body.systemId : "snes",
      gameId: typeof body.gameId === "string" ? body.gameId : null,
      gameTitle: typeof body.gameTitle === "string" ? body.gameTitle : null,
      gameFileName: typeof body.gameFileName === "string" ? body.gameFileName : null,
      gameCoverUrl: typeof body.gameCoverUrl === "string" ? body.gameCoverUrl : null,
    });

    return NextResponse.json({
      success: true,
      room,
      role: "host",
      playerId: hostId,
    });
  } catch (error: any) {
    console.error("[api/multiplayer/rooms POST] Error:", error);
    return NextResponse.json(
      { success: false, error: error?.message || "Failed to create room." },
      { status: 500 }
    );
  }
}
