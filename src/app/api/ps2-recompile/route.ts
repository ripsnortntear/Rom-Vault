import { NextRequest, NextResponse } from "next/server";
import { getRecompileStatus, startRecompileJob } from "@/lib/ps2Jobs";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const id = request.nextUrl.searchParams.get("id") || "";
  if (!id) {
    return NextResponse.json({ error: "Missing id parameter" }, { status: 400 });
  }

  const result = getRecompileStatus(id);
  return NextResponse.json(result);
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json();
    const id = body.id;
    if (!id) {
      return NextResponse.json({ error: "Missing id parameter in body" }, { status: 400 });
    }

    const res = startRecompileJob(id);
    return NextResponse.json(res);
  } catch (error) {
    console.error("[api/ps2-recompile] Error starting job:", error);
    return NextResponse.json({ error: "Failed to process request" }, { status: 500 });
  }
}
