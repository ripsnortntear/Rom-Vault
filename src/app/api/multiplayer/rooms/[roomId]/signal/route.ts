import { NextRequest, NextResponse } from "next/server";
import { sendMultiplayerSignal, pollMultiplayerSignals } from "@/lib/multiplayer";
import type { SignalMessageType } from "@/types/multiplayer";

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ roomId: string }> }
): Promise<NextResponse> {
  try {
    const { roomId } = await context.params;
    const url = new URL(req.url);
    const targetRole = url.searchParams.get("role");
    const afterId = parseInt(url.searchParams.get("afterId") || "0", 10) || 0;

    if (targetRole !== "host" && targetRole !== "guest") {
      return NextResponse.json(
        { success: false, error: "Valid role (host | guest) required." },
        { status: 400 }
      );
    }

    const signals = await pollMultiplayerSignals({
      roomId,
      targetRole,
      afterId,
    });

    return NextResponse.json(
      { success: true, signals },
      { headers: { "Cache-Control": "no-store, no-cache, must-revalidate" } }
    );
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || "Failed to poll signals." },
      { status: 500 }
    );
  }
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ roomId: string }> }
): Promise<NextResponse> {
  try {
    const { roomId } = await context.params;
    const body = await req.json().catch(() => ({}));

    const senderId = typeof body.senderId === "string" ? body.senderId : "unknown";
    const targetRole = body.targetRole === "host" ? "host" : "guest";
    const type = (typeof body.type === "string" ? body.type : "p2-input") as SignalMessageType;
    const payload =
      typeof body.payload === "string" ? body.payload : JSON.stringify(body.payload ?? {});

    const id = await sendMultiplayerSignal({
      roomId,
      senderId,
      targetRole,
      type,
      payload,
    });

    return NextResponse.json({ success: true, signalId: id });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || "Failed to send signal." },
      { status: 500 }
    );
  }
}
