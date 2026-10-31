import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { getCurrentSession } from "@/lib/auth/session";
import { syncUserMemoryCard } from "@/lib/memory-cards";

interface RouteContext {
  params: Promise<{
    id: string;
  }>;
}

const SAVES_ROOT = "/mnt/storage/roms/saves";

export async function PUT(req: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const arrayBuffer = await req.arrayBuffer();

    if (!arrayBuffer || arrayBuffer.byteLength === 0) {
      return NextResponse.json({ error: "Empty memory card save data." }, { status: 400 });
    }

    const buffer = Buffer.from(arrayBuffer);
    const session = await getCurrentSession();

    // 1. Authenticated User Flow: Write to user's assigned card
    if (session?.user?.id) {
      try {
        const ifMatch = req.headers.get("if-match")?.replace(/"/g, "") || undefined;
        const expectedChecksum = req.headers.get("x-expected-checksum") || ifMatch;

        const updatedCard = await syncUserMemoryCard(
          session.user.id,
          id,
          buffer,
          expectedChecksum
        );

        return NextResponse.json({
          success: true,
          type: "user_card",
          card: updatedCard,
          version: updatedCard.version,
          checksum: updatedCard.checksum,
          updatedAt: updatedCard.updated_at,
        });
      } catch (userCardErr) {
        console.warn("[CardSync] User card sync failed, writing to fallback:", userCardErr);
      }
    }

    // 2. Unauthenticated / Iframe Fallback: Write directly to global system .srm file
    const system = req.nextUrl.searchParams.get("system") || "psx";
    const gameId = req.nextUrl.searchParams.get("gameId") || "Final Fantasy VII (USA)";
    const cleanName = decodeURIComponent(gameId)
      .replace(/[\/\\?%*:|"<>]/g, "_")
      .trim();

    const saveDir = path.join(SAVES_ROOT, system);
    fs.mkdirSync(saveDir, { recursive: true });

    const targetFile = path.join(saveDir, `${cleanName}.srm`);
    const tmpFile = `${targetFile}.${Date.now()}.tmp`;

    fs.writeFileSync(tmpFile, buffer);
    fs.renameSync(tmpFile, targetFile);

    try {
      fs.copyFileSync(targetFile, `${targetFile}.bak`);
    } catch {}

    const checksum = crypto.createHash("sha256").update(buffer).digest("hex");

    return NextResponse.json({
      success: true,
      type: "fallback_srm",
      file: targetFile,
      checksum,
    });
  } catch (error: any) {
    console.error("[api/users/me/cards/:id/sync PUT] Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to synchronize memory card." },
      { status: 500 }
    );
  }
}