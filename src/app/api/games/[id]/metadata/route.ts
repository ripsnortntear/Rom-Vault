import { NextRequest, NextResponse } from "next/server";
import { resolveGameMetadata } from "@/lib/igdb";
import { updateCachedGameMetadata } from "@/lib/scanner";

interface RouteContext {
  params: Promise<{
    id: string;
  }>;
}

export async function GET(
  request: NextRequest,
  context: RouteContext
): Promise<NextResponse> {
  try {
    const { id: rawId } = await context.params;
    const id = decodeURIComponent(rawId);

    // Extract system and clean title
    // ID format is: `${system}__${encodeURIComponent(baseName)}`
    const parts = id.split("__");
    const system = parts[0] || "psx";
    const baseName = parts.length > 1 ? decodeURIComponent(parts.slice(1).join("__")) : "";

    const titleParam = request.nextUrl.searchParams.get("title");
    const displayTitle = titleParam || baseName;

    const metadata = await resolveGameMetadata(id, system, displayTitle);

    if (metadata && metadata.year) {
      updateCachedGameMetadata(id, {
        year: metadata.year,
        developer: metadata.developer,
        publisher: metadata.publisher,
        genres: metadata.genres,
        story: metadata.summary || undefined,
      });
    }

    return NextResponse.json({
      success: true,
      found: Boolean(metadata && metadata.year),
      metadata,
    });
  } catch (error) {
    console.error("[api/games/[id]/metadata] Error resolving metadata:", error);
    return NextResponse.json(
      { error: "Failed to resolve metadata" },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  context: RouteContext
): Promise<NextResponse> {
  return GET(request, context);
}
