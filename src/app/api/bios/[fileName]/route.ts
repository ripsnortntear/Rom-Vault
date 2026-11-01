import fs from "fs";
import { Readable } from "stream";
import { NextRequest, NextResponse } from "next/server";
import { findSystemBios } from "@/lib/bios";
import { normalizeSystem } from "@/lib/paths";
import { getCorsHeaders, handleCorsPreflight } from "@/lib/cors";

interface BiosRouteContext {
  params: Promise<{
    fileName: string;
  }>;
}

function getBiosCorsHeaders(request?: Request | NextRequest | null): Record<string, string> {
  return {
    ...getCorsHeaders(request, "GET, HEAD, OPTIONS", "*"),
    "Cross-Origin-Resource-Policy": "same-site",
  };
}

export async function OPTIONS(request: NextRequest): Promise<NextResponse> {
  return handleCorsPreflight(request, "GET, HEAD, OPTIONS", "*");
}

export async function HEAD(
  request: NextRequest,
  context: BiosRouteContext
): Promise<NextResponse> {
  const corsHeaders = getBiosCorsHeaders(request);
  const resolvedParams = await context.params;
  const system = normalizeSystem(request.nextUrl.searchParams.get("system"));
  const biosInfo = findSystemBios(system, resolvedParams.fileName);

  if (!biosInfo || !fs.existsSync(biosInfo.biosPath)) {
    return new NextResponse(null, { status: 404, headers: corsHeaders });
  }

  const stat = fs.statSync(biosInfo.biosPath);
  return new NextResponse(null, {
    status: 200,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/octet-stream",
      "Content-Length": stat.size.toString(),
      "Content-Disposition": `inline; filename="${resolvedParams.fileName || biosInfo.expectedFileName}"`,
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}

export async function GET(
  request: NextRequest,
  context: BiosRouteContext
): Promise<NextResponse> {
  const corsHeaders = getBiosCorsHeaders(request);
  try {
    const resolvedParams = await context.params;
    const system = normalizeSystem(request.nextUrl.searchParams.get("system"));
    const biosInfo = findSystemBios(system, resolvedParams.fileName);

    if (!biosInfo || !fs.existsSync(biosInfo.biosPath)) {
      return NextResponse.json(
        { error: "BIOS not found for system" },
        { status: 404, headers: corsHeaders }
      );
    }

    const stat = fs.statSync(biosInfo.biosPath);
    const nodeStream = fs.createReadStream(biosInfo.biosPath);
    const webStream = Readable.toWeb(nodeStream) as ReadableStream<Uint8Array>;

    return new NextResponse(webStream, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/octet-stream",
        "Content-Length": stat.size.toString(),
        "Content-Disposition": `inline; filename="${resolvedParams.fileName || biosInfo.expectedFileName}"`,
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch (error) {
    console.error("[api/bios] Failed to serve BIOS:", error);
    return NextResponse.json(
      { error: "Failed to read BIOS file" },
      { status: 500, headers: corsHeaders }
    );
  }
}
