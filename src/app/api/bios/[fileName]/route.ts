import fs from "fs";
import { Readable } from "stream";
import { NextRequest, NextResponse } from "next/server";
import { findSystemBios } from "@/lib/bios";
import { normalizeSystem } from "@/lib/paths";

interface BiosRouteContext {
  params: Promise<{
    fileName: string;
  }>;
}

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
  "Access-Control-Allow-Headers": "*",
  "Cross-Origin-Resource-Policy": "cross-origin",
};

export async function OPTIONS(): Promise<NextResponse> {
  return new NextResponse(null, {
    status: 204,
    headers: CORS_HEADERS,
  });
}

export async function HEAD(
  request: NextRequest,
  context: BiosRouteContext
): Promise<NextResponse> {
  const resolvedParams = await context.params;
  const system = normalizeSystem(request.nextUrl.searchParams.get("system"));
  const biosInfo = findSystemBios(system, resolvedParams.fileName);

  if (!biosInfo || !fs.existsSync(biosInfo.biosPath)) {
    return new NextResponse(null, { status: 404, headers: CORS_HEADERS });
  }

  const stat = fs.statSync(biosInfo.biosPath);
  return new NextResponse(null, {
    status: 200,
    headers: {
      ...CORS_HEADERS,
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
  try {
    const resolvedParams = await context.params;
    const system = normalizeSystem(request.nextUrl.searchParams.get("system"));
    const biosInfo = findSystemBios(system, resolvedParams.fileName);

    if (!biosInfo || !fs.existsSync(biosInfo.biosPath)) {
      return NextResponse.json(
        { error: "BIOS not found for system" },
        { status: 404, headers: CORS_HEADERS }
      );
    }

    const stat = fs.statSync(biosInfo.biosPath);
    const nodeStream = fs.createReadStream(biosInfo.biosPath);
    const webStream = Readable.toWeb(nodeStream) as ReadableStream<Uint8Array>;

    return new NextResponse(webStream, {
      status: 200,
      headers: {
        ...CORS_HEADERS,
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
      { status: 500, headers: CORS_HEADERS }
    );
  }
}
