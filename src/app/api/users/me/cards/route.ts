import { NextRequest, NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth/session";
import { listUserMemoryCards, createUserMemoryCard, MAX_CARDS_PER_USER } from "@/lib/memory-cards";

export async function GET() {
  try {
    const session = await getCurrentSession();
    if (!session) {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }

    const cards = await listUserMemoryCards(session.user.id);
    return NextResponse.json({
      success: true,
      cards,
      count: cards.length,
      maxLimit: MAX_CARDS_PER_USER,
      activeSlot1Id: cards.find((c) => c.slot_index === 1)?.id || cards[0]?.id,
    });
  } catch (error: any) {
    console.error("[api/users/me/cards GET] Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to list memory cards." },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getCurrentSession();
    if (!session) {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const cardName = typeof body?.cardName === "string" ? body.cardName : undefined;

    const card = await createUserMemoryCard(session.user.id, cardName);
    return NextResponse.json(
      { success: true, card, message: "Virtual memory card initialized successfully." },
      { status: 201 }
    );
  } catch (error: any) {
    console.error("[api/users/me/cards POST] Error:", error);
    const status = error.message?.includes("Maximum limit") ? 409 : 500;
    return NextResponse.json(
      { error: error.message || "Failed to create virtual memory card." },
      { status }
    );
  }
}
