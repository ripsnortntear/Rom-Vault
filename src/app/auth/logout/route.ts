import { NextRequest, NextResponse } from "next/server";
import { GET as apiLogoutGet } from "@/app/api/auth/logout/route";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<NextResponse> {
  return apiLogoutGet(req);
}
