import { NextRequest, NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth/session";
import { syncUserMemoryCard } from "@/lib/memory-cards";

interface RouteContext {
  params: Promise<{
    id: string;
  }>;
}

export async function PUT(req: NextRequest, context: RouteContext) {
  try {
    const session = await getCurrentSession();
    if (!session) {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }

    const { id } = await context.params;
    const arrayBuffer = await req.arrayBuffer();

    if (!arrayBuffer || arrayBuffer.byteLength === 0) {
      return NextResponse.json({ error: "Empty memory card save data." }, { status: 400 });
    }

    const ifMatch = req.headers.get("if-match")?.replace(/"/g, "") || undefined;
    const expectedChecksum = req.headers.get("x-expected-checksum") || ifMatch;

    const updatedCard = await syncUserMemoryCard(
      session.user.id,
      id,
      Buffer.from(arrayBuffer),
      expectedChecksum
    );

    return NextResponse.json({
      success: true,
      card: updatedCard,
      version: updatedCard.version,
      checksum: updatedCard.checksum,
      updatedAt: updatedCard.updated_at,
    });
  } catch (error: any) {
    console.error("[api/users/me/cards/:id/sync PUT] Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to synchronize memory card." },
      { status: error.message?.includes("not found") ? 404 : 500 }
    );
  }
}
