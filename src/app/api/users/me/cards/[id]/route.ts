import { NextRequest, NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth/session";
import { updateUserMemoryCard, deleteUserMemoryCard } from "@/lib/memory-cards";

interface RouteContext {
  params: Promise<{
    id: string;
  }>;
}

export async function PATCH(req: NextRequest, context: RouteContext) {
  try {
    const session = await getCurrentSession();
    if (!session) {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }

    const { id } = await context.params;
    const body = await req.json().catch(() => ({}));

    let targetSlot = typeof body?.slotIndex === "number" ? body.slotIndex : undefined;
    if (body?.moveSlot1 === true) {
      targetSlot = 1;
    }

    const cardName = typeof body?.cardName === "string" ? body.cardName : undefined;

    const updated = await updateUserMemoryCard(session.user.id, id, {
      cardName,
      targetSlot,
    });

    return NextResponse.json({
      success: true,
      card: updated,
      message: "Memory card updated successfully.",
    });
  } catch (error: any) {
    console.error("[api/users/me/cards/:id PATCH] Error:", error);
    const msg = error?.message || "";
    if (msg.includes("not found")) {
      return NextResponse.json({ error: "Memory card not found." }, { status: 404 });
    }
    return NextResponse.json(
      { error: "An unexpected error occurred while updating the memory card." },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest, context: RouteContext) {
  try {
    const session = await getCurrentSession();
    if (!session) {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }

    const { id } = await context.params;
    await deleteUserMemoryCard(session.user.id, id);

    return NextResponse.json({
      success: true,
      message: "Virtual memory card removed successfully.",
    });
  } catch (error: any) {
    console.error("[api/users/me/cards/:id DELETE] Error:", error);
    const msg = error?.message || "";
    if (msg.includes("only")) {
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    if (msg.includes("not found")) {
      return NextResponse.json({ error: "Memory card not found." }, { status: 404 });
    }
    return NextResponse.json(
      { error: "An unexpected error occurred while deleting the memory card." },
      { status: 500 }
    );
  }
}
