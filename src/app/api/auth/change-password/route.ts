import { NextRequest, NextResponse } from "next/server";
import { POST as changePassword } from "@/app/api/users/me/password/route";

export async function POST(req: NextRequest): Promise<NextResponse> {
  return changePassword(req);
}
