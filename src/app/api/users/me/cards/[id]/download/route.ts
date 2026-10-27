import { NextRequest, NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth/session";
import { getUserMemoryCardBinary } from "@/lib/memory-cards";

interface RouteContext {
  params: Promise<{
    id: string;
  }>;
}

export async function GET(req: NextRequest, context: RouteContext) {
  try {
    const session = await getCurrentSession();
    if (!session) {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }

    const { id } = await context.params;
    const { card, buffer } = await getUserMemoryCardBinary(session.user.id, id);

    const isDownload = req.nextUrl.searchParams.get("download") === "1";
    const filename = `${card.card_name.replace(/[^a-zA-Z0-9_-]/g, "_")}_Slot${card.slot_index}.mcr`;

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Length": String(buffer.byteLength),
        "Content-Disposition": isDownload ? `attachment; filename="${filename}"` : "inline",
        "ETag": `"${card.checksum}"`,
        "X-Card-Id": card.id,
        "X-Card-Slot": String(card.slot_index),
        "X-Card-Version": String(card.version),
        "X-Card-Name": encodeURIComponent(card.card_name),
        "Cache-Control": "no-cache, no-store, must-revalidate",
        "Last-Modified": new Date(card.updated_at).toUTCString(),
      },
    });
  } catch (error: any) {
    console.error("[api/users/me/cards/:id/download GET] Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to download memory card." },
      { status: error.message?.includes("not found") ? 404 : 500 }
    );
  }
}
