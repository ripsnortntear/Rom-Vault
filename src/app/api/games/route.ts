import { NextRequest, NextResponse } from "next/server";
import { scanGameLibrary } from "@/lib/scanner";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const refresh = request.nextUrl.searchParams.get("refresh") === "true";
    const library = await scanGameLibrary(refresh);
    return NextResponse.json(library, {
      status: 200,
      headers: {
        "Cache-Control": "public, max-age=60, stale-while-revalidate=300",
      },
    });
  } catch (error) {
    console.error("[api/games] Failed to load game library:", error);
    return NextResponse.json(
      { error: "Failed to scan ROM library" },
      { status: 500 }
    );
  }
}
