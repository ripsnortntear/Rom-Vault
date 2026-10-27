import { NextRequest, NextResponse } from "next/server";
import { GET as getMe, PUT as updateMe } from "../route";

export async function GET(req: NextRequest): Promise<NextResponse> {
  return getMe(req);
}

export async function PUT(req: NextRequest): Promise<NextResponse> {
  return updateMe(req);
}
