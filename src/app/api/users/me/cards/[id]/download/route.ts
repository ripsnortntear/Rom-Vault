import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { getCurrentSession } from "@/lib/auth/session";
import {
  getUserMemoryCardBinary,
  normalizeCardSystem,
  createFormattedPs1MemoryCard,
  createFormattedPs2MemoryCard,
} from "@/lib/memory-cards";
import { getStorageRoot } from "@/lib/paths";

interface RouteContext {
  params: Promise<{
    id: string;
  }>;
}

const getSavesRoot = () => path.join(getStorageRoot(), "saves");

export async function GET(req: NextRequest, context: RouteContext) {
  try {
    const session = await getCurrentSession();
    const { id } = await context.params;
    const system = normalizeCardSystem(req.nextUrl.searchParams.get("system"));
    const isDownload = req.nextUrl.searchParams.get("download") === "1";
    const isPs2 = system === "ps2";
    const ext = isPs2 ? "ps2" : "mcr";

    if (!session) {
      // Unauthenticated / guest fallback
      const saveDir = path.join(getSavesRoot(), system);
      const fallbackFile = path.join(
        saveDir,
        isPs2 ? "ps2_memory_card.ps2" : "ps1_memory_card.mcr"
      );
      let buf: Buffer;
      if (fs.existsSync(fallbackFile)) {
        buf = fs.readFileSync(fallbackFile);
      } else {
        buf = isPs2 ? createFormattedPs2MemoryCard() : createFormattedPs1MemoryCard();
      }

      const filename = `Guest_${system.toUpperCase()}_MemoryCard.${ext}`;
      return new NextResponse(new Uint8Array(buf), {
        status: 200,
        headers: {
          "Content-Type": "application/octet-stream",
          "Content-Length": String(buf.byteLength),
          "Content-Disposition": isDownload ? `attachment; filename="${filename}"` : "inline",
          "X-Card-System": system,
          "X-Card-Slot": "1",
          "X-Card-Name": "Guest Memory Card",
          "Cache-Control": "no-cache, no-store, must-revalidate",
        },
      });
    }

    const { card, buffer } = await getUserMemoryCardBinary(session.user.id, id, system);

    const cardIsPs2 = normalizeCardSystem(card.system) === "ps2" || system === "ps2";
    const cardExt = cardIsPs2 ? "ps2" : "mcr";
    const filename = `${card.card_name.replace(/[^a-zA-Z0-9_-]/g, "_")}_Slot${card.slot_index}.${cardExt}`;

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Length": String(buffer.byteLength),
        "Content-Disposition": isDownload ? `attachment; filename="${filename}"` : "inline",
        "ETag": `"${card.checksum}"`,
        "X-Card-Id": card.id,
        "X-Card-System": card.system || system,
        "X-Card-Slot": String(card.slot_index),
        "X-Card-Version": String(card.version),
        "X-Card-Name": encodeURIComponent(card.card_name),
        "Cache-Control": "no-cache, no-store, must-revalidate",
        "Last-Modified": new Date(card.updated_at).toUTCString(),
      },
    });
  } catch (error: any) {
    console.error("[api/users/me/cards/:id/download GET] Error:", error);
    const msg = error?.message || "";
    if (msg.includes("not found")) {
      return NextResponse.json({ error: "Memory card not found." }, { status: 404 });
    }
    return NextResponse.json(
      { error: "An unexpected error occurred while downloading the memory card." },
      { status: 500 }
    );
  }
}
