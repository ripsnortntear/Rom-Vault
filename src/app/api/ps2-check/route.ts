import { NextRequest, NextResponse } from "next/server";
import { findPs2WebBuild, toPs2Slug } from "@/lib/ps2Recomp";
import { safeDecode } from "@/lib/ps2Jobs";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const id = request.nextUrl.searchParams.get("id") || "";
  if (!id) {
    return NextResponse.json({ compiled: false, error: "Missing id parameter" }, { status: 400 });
  }

  const build = findPs2WebBuild(id);
  if (build && build.hasHtml) {
    const clean = safeDecode(id.includes("__") ? id.split("__")[1] || id : id);
    const slug = toPs2Slug(clean.replace(/\.[a-z0-9]+$/i, ""));
    return NextResponse.json({
      compiled: true,
      playUrl: `/roms/api/ps2-play/${slug}/index.html`,
    });
  }

  return NextResponse.json({
    compiled: false,
    playUrl: null,
  });
}
