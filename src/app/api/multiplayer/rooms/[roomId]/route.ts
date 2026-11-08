import { NextRequest, NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth/session";
import {
  getRoomById,
  getRoomChat,
  joinRoom,
  selectRoomGame,
  selectGuestRoomGame,
  togglePlayerReady,
  startMultiplayerSession,
  returnRoomToLobby,
  leaveRoom,
  addRoomChatMessage,
  pollMultiplayerSignals,
} from "@/lib/multiplayer";

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ roomId: string }> }
): Promise<NextResponse> {
  try {
    const { roomId } = await context.params;
    const room = await getRoomById(roomId);

    if (!room) {
      return NextResponse.json(
        { success: false, error: "Room not found or has closed." },
        { status: 404 }
      );
    }

    const url = new URL(req.url);
    const roleParam = url.searchParams.get("role");
    const afterSignalId = parseInt(url.searchParams.get("afterSignalId") || "0", 10) || 0;

    const chat = await getRoomChat(roomId, 80);
    const signals =
      roleParam === "host" || roleParam === "guest"
        ? await pollMultiplayerSignals({
            roomId,
            targetRole: roleParam,
            afterId: afterSignalId,
          })
        : [];

    return NextResponse.json(
      {
        success: true,
        room,
        chat,
        signals,
        serverTime: new Date().toISOString(),
      },
      { headers: { "Cache-Control": "no-store, no-cache, must-revalidate" } }
    );
  } catch (error: any) {
    console.error("[api/multiplayer/rooms/[roomId] GET] Error:", error);
    return NextResponse.json(
      { success: false, error: error?.message || "Failed to load room." },
      { status: 500 }
    );
  }
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ roomId: string }> }
): Promise<NextResponse> {
  try {
    const { roomId } = await context.params;
    const session = await getCurrentSession();
    const body = await req.json().catch(() => ({}));

    const action = typeof body.action === "string" ? body.action : "";
    const playerId =
      (typeof body.playerId === "string" && body.playerId.trim()
        ? body.playerId.trim().slice(0, 64)
        : null) ||
      session?.user?.id ||
      "guest";

    const playerName =
      (typeof body.playerName === "string" && body.playerName.trim()
        ? body.playerName.trim().slice(0, 60)
        : null) ||
      session?.user?.displayName ||
      session?.user?.username ||
      "Player";

    if (action === "join") {
      const result = await joinRoom({
        roomId,
        playerId,
        username: session?.user?.username || playerName,
        displayName: playerName,
      });
      const chat = await getRoomChat(roomId, 80);
      return NextResponse.json({
        success: true,
        room: result.room,
        role: result.role,
        chat,
      });
    }

    if (action === "select_game") {
      const room = await selectRoomGame({
        roomId,
        hostId: playerId,
        systemId: typeof body.systemId === "string" ? body.systemId : "snes",
        gameId: typeof body.gameId === "string" ? body.gameId : null,
        gameTitle: typeof body.gameTitle === "string" ? body.gameTitle : null,
        gameFileName: typeof body.gameFileName === "string" ? body.gameFileName : null,
        gameCoverUrl: typeof body.gameCoverUrl === "string" ? body.gameCoverUrl : null,
      });
      const chat = await getRoomChat(roomId, 80);
      return NextResponse.json({ success: true, room, chat });
    }

    if (action === "select_guest_game") {
      const room = await selectGuestRoomGame({
        roomId,
        guestId: playerId,
        systemId: typeof body.systemId === "string" ? body.systemId : undefined,
        gameId: typeof body.gameId === "string" ? body.gameId : "",
        gameTitle: typeof body.gameTitle === "string" ? body.gameTitle : "",
        gameFileName: typeof body.gameFileName === "string" ? body.gameFileName : null,
        gameCoverUrl: typeof body.gameCoverUrl === "string" ? body.gameCoverUrl : null,
      });
      const chat = await getRoomChat(roomId, 80);
      return NextResponse.json({ success: true, room, chat });
    }

    if (action === "toggle_ready") {
      const room = await togglePlayerReady({
        roomId,
        playerId,
        isReady: typeof body.isReady === "boolean" ? body.isReady : undefined,
      });
      const chat = await getRoomChat(roomId, 80);
      return NextResponse.json({ success: true, room, chat });
    }

    if (action === "start_session") {
      const room = await startMultiplayerSession({
        roomId,
        hostId: playerId,
      });
      const chat = await getRoomChat(roomId, 80);
      return NextResponse.json({ success: true, room, chat });
    }

    if (action === "return_lobby") {
      const room = await returnRoomToLobby({
        roomId,
        playerId,
      });
      const chat = await getRoomChat(roomId, 80);
      return NextResponse.json({ success: true, room, chat });
    }

    if (action === "leave") {
      const result = await leaveRoom({
        roomId,
        playerId,
      });
      return NextResponse.json({
        success: true,
        closed: result.closed,
        room: result.room,
      });
    }

    if (action === "chat") {
      const existing = await getRoomById(roomId);
      if (!existing) {
        return NextResponse.json({ success: false, error: "Room not found." }, { status: 404 });
      }
      const senderRole: "host" | "guest" =
        existing.host.id === playerId ? "host" : "guest";
      const senderDisplay =
        existing.host.id === playerId
          ? existing.host.displayName
          : existing.guest && existing.guest.id === playerId
          ? existing.guest.displayName
          : playerName;

      const msg = await addRoomChatMessage({
        roomId,
        senderId: playerId,
        senderName: senderDisplay,
        senderRole,
        message: typeof body.message === "string" ? body.message : "",
      });
      const chat = await getRoomChat(roomId, 80);
      return NextResponse.json({ success: true, message: msg, chat });
    }

    return NextResponse.json(
      { success: false, error: `Unknown room action: ${action}` },
      { status: 400 }
    );
  } catch (error: any) {
    console.error("[api/multiplayer/rooms/[roomId] PATCH] Error:", error);
    return NextResponse.json(
      { success: false, error: error?.message || "Room action failed." },
      { status: 400 }
    );
  }
}
