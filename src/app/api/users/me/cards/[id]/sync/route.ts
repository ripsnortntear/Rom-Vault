import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { getCurrentSession } from "@/lib/auth/session";
import { syncUserMemoryCard, normalizeCardSystem } from "@/lib/memory-cards";
import { validateSaveFormatForPlatform } from "@/lib/security";
import { getStorageRoot } from "@/lib/paths";

interface RouteContext {
  params: Promise<{
    id: string;
  }>;
}

export async function PUT(req: NextRequest, context: RouteContext) {
  try {
    const savesBaseDir = path.resolve(path.join(getStorageRoot(), "saves"));

    const { id: rawId } = await context.params;
    const cardId = decodeURIComponent(rawId).trim();

    // Prevent path traversal on ID parameter
    if (!cardId || cardId.includes("..") || cardId.includes("/") || cardId.includes("\\") || cardId.includes("\0")) {
      return NextResponse.json({ error: "Invalid memory card identifier." }, { status: 400 });
    }

    const rawSystem = req.nextUrl.searchParams.get("system") || "psx";
    const system = normalizeCardSystem(rawSystem);

    if (!/^[a-zA-Z0-9_-]+$/.test(system)) {
      return NextResponse.json({ error: "Invalid system identifier." }, { status: 400 });
    }

    const arrayBuffer = await req.arrayBuffer();
    if (!arrayBuffer || arrayBuffer.byteLength === 0) {
      return NextResponse.json({ error: "Empty memory card save data." }, { status: 400 });
    }

    const buffer = Buffer.from(arrayBuffer);

    // Validate platform format and bounds
    const formatError = validateSaveFormatForPlatform(system, buffer);
    if (formatError) {
      return NextResponse.json({ error: formatError }, { status: 400 });
    }

    const session = await getCurrentSession();

    // Rule 7: Graceful Guest Fallback when unauthenticated
    if (!session?.user?.id) {
      const isPs2 = system === "ps2";
      const saveDir = path.join(savesBaseDir, system);
      if (!fs.existsSync(saveDir)) {
        fs.mkdirSync(saveDir, { recursive: true });
      }
      const fallbackFile = path.join(
        saveDir,
        isPs2 ? "ps2_memory_card.ps2" : "ps1_memory_card.mcr"
      );
      fs.writeFileSync(fallbackFile, buffer);

      return NextResponse.json({
        success: true,
        type: "guest_card",
        system,
        message: "Guest memory card saved successfully.",
      });
    }

    // Sync memory card scoped strictly to authenticated user
    const ifMatch = req.headers.get("if-match")?.replace(/"/g, "") || undefined;
    const expectedChecksum = req.headers.get("x-expected-checksum") || ifMatch;

    const updatedCard = await syncUserMemoryCard(
      session.user.id,
      cardId,
      buffer,
      system,
      expectedChecksum
    );

    // Verify card's destination on disk is strictly contained within savesBaseDir
    if (updatedCard.file_path) {
      const targetPath = path.resolve(updatedCard.file_path);
      if (!targetPath.startsWith(savesBaseDir + path.sep)) {
        return NextResponse.json({ error: "Invalid save file destination." }, { status: 400 });
      }
    }

    return NextResponse.json({
      success: true,
      type: "user_card",
      system: updatedCard.system,
      card: updatedCard,
      version: updatedCard.version,
      checksum: updatedCard.checksum,
      updatedAt: updatedCard.updated_at,
    });
  } catch (error: any) {
    console.error("[api/users/me/cards/:id/sync PUT] Error:", error);
    const msg = error?.message || "";
    if (msg.includes("not found")) {
      return NextResponse.json({ error: "Memory card not found." }, { status: 404 });
    }
    if (msg.includes("Conflict") || msg.includes("checksum mismatch")) {
      return NextResponse.json({ error: msg }, { status: 409 });
    }
    return NextResponse.json(
      { error: "An unexpected error occurred while synchronizing the memory card." },
      { status: 500 }
    );
  }
}
