import { NextRequest, NextResponse } from "next/server";
import { GET as streamGET, HEAD as streamHEAD, OPTIONS as streamOPTIONS } from "../route";

interface RouteContext {
  params: Promise<{
    id: string;
    fileName: string;
  }>;
}

export async function OPTIONS() {
  return streamOPTIONS();
}

export async function HEAD(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  const { id, fileName } = await context.params;
  const url = new URL(request.url);
  if (!url.searchParams.has("file")) {
    url.searchParams.set("file", fileName);
  }
  const nextReq = new NextRequest(url, request);
  return streamHEAD(nextReq, { params: Promise.resolve({ id }) });
}

export async function GET(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  const { id, fileName } = await context.params;
  const url = new URL(request.url);
  if (!url.searchParams.has("file")) {
    url.searchParams.set("file", fileName);
  }
  const nextReq = new NextRequest(url, request);
  return streamGET(nextReq, { params: Promise.resolve({ id }) });
}
