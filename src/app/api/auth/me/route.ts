import { NextRequest, NextResponse } from "next/server";
import { GET as getMe } from "@/app/api/users/me/route";

export async function GET(req: NextRequest): Promise<NextResponse> {
  return getMe(req);
}
